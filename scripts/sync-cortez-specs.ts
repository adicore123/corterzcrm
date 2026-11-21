import { writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultCatalogModels } from "../src/lib/json-db/cortez-catalog";
import { catalogModelSchema, type CatalogModel, type Device, type ModelSpec } from "../src/lib/validation/models";

type StoreProduct = {
  id: number;
  name: string;
  permalink: string;
  short_description?: string;
  description?: string;
  prices?: {
    price?: string;
    currency_minor_unit?: number;
  };
  categories?: Array<{ name?: string }>;
  images?: Array<{ src?: string }>;
};

const namedEntities: Record<string, string> = {
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  Prime: "″",
  prime: "׳",
};

function decodeHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => namedEntities[name] ?? full)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    return encodeURI(trimmed);
  }
}

function extractSpecs(description: string): ModelSpec[] {
  const specs: ModelSpec[] = [];
  const seen = new Set<string>();
  for (const match of description.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const label = decodeHtml(match[1]).slice(0, 80);
    const value = decodeHtml(match[2]).slice(0, 240);
    if (!label || !value || seen.has(label)) continue;
    seen.add(label);
    specs.push({ label, value });
    if (specs.length >= 40) break;
  }
  return specs;
}

function detectDevice(product: StoreProduct, existingDevice?: Device): Device {
  const cats = (product.categories ?? []).map((cat) => cat.name ?? "").join(" ");
  if (cats.includes("קורקינט")) return "קורקינט חשמלי";
  if (cats.includes("אופניים")) return "אופניים חשמליים";
  return existingDevice ?? "אופניים חשמליים";
}

async function fetchAllProducts(): Promise<StoreProduct[]> {
  const all: StoreProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`https://cortez.co.il/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    if (!response.ok) throw new Error(`Failed to fetch cortez.co.il products (status ${response.status})`);
    const batch = (await response.json()) as StoreProduct[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function main() {
  const products = await fetchAllProducts();
  if (products.length === 0) throw new Error("No products returned from cortez.co.il");

  const productByName = new Map(products.map((item) => [decodeHtml(item.name).toLocaleLowerCase("he"), item]));

  let maxIndex = defaultCatalogModels.length;
  const seedTimestamp = "2026-01-01T08:00:00.000Z";
  const result: CatalogModel[] = [];
  const usedNames = new Set<string>();

  function buildEntry(indexId: string, name: string, device: Device, product?: StoreProduct, fallbackImage?: string): CatalogModel {
    const gallery = Array.from(new Set((product?.images ?? []).map((img) => normalizeUrl(img.src)).filter((u) => u && u.length <= 500))).slice(0, 8);
    const imageUrl = gallery[0] || normalizeUrl(fallbackImage) || undefined;
    const summary = product?.short_description ? decodeHtml(product.short_description).slice(0, 600) : undefined;
    const minorUnit = Number(product?.prices?.currency_minor_unit ?? 0);
    const rawPrice = Number(product?.prices?.price ?? "");
    const msrp = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice / 10 ** minorUnit) : null;
    const productUrl = product?.permalink ? normalizeUrl(product.permalink).slice(0, 500) : undefined;
    const specs = product?.description ? extractSpecs(product.description) : [];

    return catalogModelSchema.parse({
      id: indexId,
      device,
      name,
      imageUrl,
      notes: "דגם רשמי מתוך קטלוג קורטז (cortez.co.il)",
      summary: summary || undefined,
      msrp,
      productUrl: productUrl || undefined,
      galleryUrls: gallery.length > 0 ? gallery : undefined,
      specs: specs.length > 0 ? specs : undefined,
      photos: [],
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp,
    });
  }

  for (const existing of defaultCatalogModels) {
    const key = existing.name.trim().toLocaleLowerCase("he");
    usedNames.add(key);
    const product = productByName.get(key);
    result.push(buildEntry(
      existing.id,
      existing.name,
      product ? detectDevice(product, existing.device) : existing.device,
      product,
      existing.imageUrl,
    ));
  }

  for (const product of products) {
    const cleanName = decodeHtml(product.name).slice(0, 120);
    const key = cleanName.toLocaleLowerCase("he");
    if (!cleanName || usedNames.has(key)) continue;
    usedNames.add(key);
    maxIndex += 1;
    const id = `00000000-0000-4000-8000-${String(maxIndex).padStart(12, "0")}`;
    result.push(buildEntry(id, cleanName, detectDevice(product), product));
  }

  const output = `import type { CatalogModel } from "../validation/models";

// Generated by scripts/sync-cortez-specs.ts from cortez.co.il Store API
export const defaultCatalogModels: CatalogModel[] = ${JSON.stringify(result, null, 2)};
`;
  const targetPath = path.resolve("src/lib/json-db/cortez-catalog.ts");
  await writeFile(targetPath, output, "utf8");
  const withSpecs = result.filter((item) => (item.specs?.length ?? 0) > 0).length;
  console.log(`Synced ${result.length} Cortez catalog models (${withSpecs} with full specs) to ${targetPath}`);
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exitCode = 1;
});

import type { CatalogModel } from "@/lib/validation/models";

export function toWebglTextureUrl(url: string): string {
  if (url.startsWith("https://cortez.co.il/wp-content/uploads/")) {
    return "/api/catalog-image?url=" + encodeURIComponent(url);
  }
  return url;
}

export function getModelImages(model: CatalogModel): string[] {
  const uploaded = model.photos.map((photo) => "/api/images/models/" + model.id + "/" + photo.id);
  const external = [model.imageUrl, ...(model.galleryUrls ?? [])].filter((item): item is string => Boolean(item));
  return Array.from(new Set([...uploaded, ...external]));
}

export function is2027Model(model: CatalogModel): boolean {
  return model.name.includes("2027");
}

export function isPremiumModel(model: CatalogModel): boolean {
  const upper = model.name.toUpperCase();
  return upper.includes("PREMIUM") || upper.includes("MASTER") || upper.includes("RS") || (model.msrp ?? 0) >= 5500;
}

export type KeySpecs = {
  battery?: string;
  range?: string;
  speed?: string;
  highlight?: { label: string; value: string };
};

export function extractKeySpecs(model: CatalogModel): KeySpecs {
  const specs = model.specs ?? [];
  const find = (terms: string[]) =>
    specs.find((spec) => terms.some((term) => spec.label.includes(term)));

  const battery = find(["סוללה"])?.value;
  const range = find(["טווח"])?.value;
  const speed = find(["מהירות"])?.value;
  const motor = find(["מנוע", "בקר"]);
  const suspension = find(["שיכוך", "בלמים", "צמיגים", "גלגל"]);
  const highlight = motor ?? suspension;

  return {
    battery,
    range,
    speed,
    highlight: highlight ? { label: highlight.label, value: highlight.value } : undefined,
  };
}

export function formatPrice(msrp?: number | null): string {
  if (!msrp || msrp <= 0) return "";
  return "₪" + msrp.toLocaleString("he-IL");
}

export function buildWhatsappSpecText(model: CatalogModel, showPrice: boolean, shareUrl?: string): string {
  const lines: string[] = [
    `*CORTEZ | ${model.name}*`,
    `קטגוריה: ${model.device}`,
  ];
  if (showPrice && model.msrp) {
    lines.push(`מחיר מומלץ לצרכן: ${formatPrice(model.msrp)}`);
  }
  if (model.summary) {
    lines.push("", model.summary);
  }
  if (model.specs && model.specs.length > 0) {
    lines.push("", "*מפרט טכני:*");
    for (const spec of model.specs) {
      lines.push(`• ${spec.label}: ${spec.value}`);
    }
  }
  if (shareUrl) {
    lines.push("", `לצפייה בתצוגת 3D ובגלריה המלאה: ${shareUrl}`);
  }
  return lines.join("\n");
}

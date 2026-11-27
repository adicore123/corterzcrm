import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getClientIp } from "@/lib/api-guard";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { usesBlobStorage } from "@/lib/json-db/blob-store";
import { usesMongoStorage } from "@/lib/json-db/mongo-client";
import { catalogModels } from "@/lib/json-db/queries";
import { quoteByToken } from "@/lib/quotes/service";
import { readBlobPhoto } from "@/lib/uploads/blob-images";
import { isHeicBuffer, normalizePhoto, readPhoto } from "@/lib/uploads/images";
import { readMongoPhoto } from "@/lib/uploads/mongo-images";
import type { CatalogModel } from "@/lib/validation/models";

export const dynamic = "force-dynamic";

type CachedOgEntry = {
  bytes: Uint8Array;
  expiresAt: number;
};

const OG_CACHE_MAX = 40;
const OG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const ogGlobal = globalThis as typeof globalThis & {
  cortezOgPngCache?: Map<string, CachedOgEntry>;
};
const ogPngCache = (ogGlobal.cortezOgPngCache ??= new Map());

function modelOgCacheKey(model: CatalogModel): string {
  return `${model.id}|${model.updatedAt}|${model.photos[0]?.id ?? ""}|${model.imageUrl ?? ""}`;
}

async function loadOriginalCatalogImageBytes(model: CatalogModel): Promise<Buffer | null> {
  // 1. Prefer custom CRM-uploaded model photo if present
  if (model.photos.length > 0) {
    const firstPhoto = model.photos[0];
    try {
      const data = usesMongoStorage()
        ? await readMongoPhoto("models", firstPhoto.id)
        : usesBlobStorage()
          ? await readBlobPhoto("models", firstPhoto.id)
          : new Uint8Array(await readPhoto("models", firstPhoto.id));
      const arrayBuf = await new Response(data).arrayBuffer();
      if (arrayBuf.byteLength > 0) {
        return Buffer.from(arrayBuf);
      }
    } catch {
      // Fall through to official catalog imageUrl
    }
  }

  // 2. Original catalog image (model.imageUrl from cortez.co.il or local path)
  const primaryUrl = model.imageUrl?.trim() || model.galleryUrls?.[0]?.trim();
  if (primaryUrl) {
    if (primaryUrl.startsWith("https://") || primaryUrl.startsWith("http://")) {
      try {
        const res = await fetch(primaryUrl, {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: "image/*" },
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0) {
            return buf;
          }
        }
      } catch {
        // Fall through to local catalog exhibit
      }
    } else if (primaryUrl.startsWith("/")) {
      try {
        const diskPath = path.join(process.cwd(), "public", primaryUrl.replace(/^\//, ""));
        return await readFile(diskPath);
      } catch {
        // Fall through to local catalog exhibit
      }
    }
  }

  // 3. Offline / fallback to local catalog studio exhibit image
  const exhibitPath = getProposalHeroCutoutUrl(model);
  if (exhibitPath && exhibitPath.startsWith("/")) {
    try {
      const diskPath = path.join(process.cwd(), "public", exhibitPath.replace(/^\//, ""));
      return await readFile(diskPath);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Serves the authentic original catalog image of the quoted model as a high-resolution PNG
 * for direct WhatsApp sharing, with bounded LRU memory caching so repeat quotes for the same
 * model return in <1ms without re-fetching or re-encoding via sharp.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    await consumeRateLimit(`quote-og:${getClientIp(request)}`, 60, 60_000);
  } catch (err) {
    if (err instanceof AppError) {
      return new NextResponse(err.message, { status: err.status });
    }
  }
  const { token } = await context.params;
  const quote = await quoteByToken(token);
  if (!quote) {
    return new NextResponse("Not found", { status: 404 });
  }

  const models = await catalogModels();
  const model =
    models.find((m) => m.id === quote.modelId)
    ?? models.find(
      (m) => m.name.toLocaleLowerCase("he") === quote.modelName.toLocaleLowerCase("he"),
    );

  if (!model) {
    return new NextResponse("Model not found", { status: 404 });
  }

  const cacheKey = modelOgCacheKey(model);
  const hit = ogPngCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    // Refresh LRU order
    ogPngCache.delete(cacheKey);
    ogPngCache.set(cacheKey, hit);
    return new NextResponse(Buffer.from(hit.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  try {
    const rawBytes = await loadOriginalCatalogImageBytes(model);
    if (!rawBytes) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const decodedInput = isHeicBuffer(rawBytes)
      ? await normalizePhoto(rawBytes, "image/heic", true)
      : rawBytes;

    const pngBuffer = await sharp(decodedInput, { failOn: "none" })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#FFFFFF" })
      .png({ quality: 95, compressionLevel: 4 })
      .toBuffer();

    const bytes = new Uint8Array(pngBuffer);
    if (ogPngCache.size >= OG_CACHE_MAX) {
      const oldestKey = ogPngCache.keys().next().value;
      if (oldestKey) ogPngCache.delete(oldestKey);
    }
    ogPngCache.set(cacheKey, {
      bytes,
      expiresAt: Date.now() + OG_CACHE_TTL_MS,
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Error generating image", { status: 500 });
  }
}

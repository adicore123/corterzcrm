import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../errors";
import { atomicWrite, storageRoot } from "../json-db/store";
import { uuid, type Photo, type PhotoModule } from "../validation/models";

export const maxPhotos = 10;
export const maxImageBytes = 20 * 1024 * 1024;
export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const MAX_SAFE_INPUT_PIXELS = 100_000_000;
const supportedSharpFormats = new Set(["jpeg", "png", "webp", "heif", "avif", "gif", "tiff"]);
const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif", "heim", "heis", "hevm", "hevs"]);

// Bound libvips worker threads & internal memory cache to prevent serverless OOM spikes
sharp.concurrency(2);
sharp.cache({ memory: 50, files: 0, items: 50 });

export function isHeicBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false; // "ftyp"
  const major = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  if (major === "avif" || major === "avis") return false;
  if (heicBrands.has(major)) return true;
  const boxSize = Math.min(bytes.length, ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0 || 64, 128);
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    const brand = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]).toLowerCase();
    if (brand === "avif" || brand === "avis") return false;
    if (heicBrands.has(brand)) return true;
  }
  return false;
}

async function decodeHeicToWebp(bytes: Buffer, fitFunctionResponse: boolean) {
  const { default: decodeHeic } = await import("heic-decode");
  const decoded = await decodeHeic({ buffer: bytes });
  if (!decoded.width || !decoded.height || !decoded.data?.length) {
    throw new Error("Empty HEIC decode result");
  }
  const rawBuffer = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
  const rawOptions = {
    raw: { width: decoded.width, height: decoded.height, channels: 4 as const },
    limitInputPixels: MAX_SAFE_INPUT_PIXELS,
  };
  const result = await sharp(rawBuffer, rawOptions)
    .resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  if (!fitFunctionResponse || result.length <= 4_000_000) return result;
  return await sharp(rawBuffer, rawOptions)
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();
}

function imagePath(module: PhotoModule, id: string) {
  return path.join(storageRoot(), "uploads", module, uuid.parse(id) + ".webp");
}

export async function readPhoto(module: PhotoModule, id: string) {
  try {
    return await readFile(imagePath(module, id));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new AppError(404, "התמונה לא נמצאה.");
    }
    throw error;
  }
}

export async function removePhotos(module: PhotoModule, photos: Photo[]) {
  await Promise.all(photos.map((photo) => rm(imagePath(module, photo.id), { force: true }).catch((error) => {
    console.warn("[cortez] Upload cleanup failed", photo.id, error);
  })));
}

export async function normalizePhoto(bytes: Buffer, type: string, fitFunctionResponse = false) {
  const normalizedType = type.split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  const allowedIncoming = !normalizedType || normalizedType === "application/octet-stream" || normalizedType.startsWith("image/");
  if (!allowedIncoming || !bytes.length || bytes.length > maxImageBytes) {
    throw new AppError(400, "יש לבחור תמונות בגודל של עד 20 מ״ב לתמונה.");
  }
  try {
    if (isHeicBuffer(bytes)) {
      return await decodeHeicToWebp(bytes, fitFunctionResponse);
    }
    // Allow high-MP mobile cameras (108MP/200MP) and ignore trailing vendor metadata (Samsung Motion Photo / XMP warnings).
    const image = sharp(bytes, { limitInputPixels: MAX_SAFE_INPUT_PIXELS, failOn: "none" });
    const info = await image.metadata();
    if (!info.format || !supportedSharpFormats.has(info.format) || !info.width || !info.height) {
      throw new Error("Unsupported image format: " + String(info.format));
    }
    // Validate strictly by actual decoded image format, never rejecting valid files whose filename/MIME differs (e.g. WhatsApp/Android).
    try {
      const result = await image.clone().rotate().resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 }).toBuffer();
      if (!fitFunctionResponse || result.length <= 4_000_000) return result;
      return await image.rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 76 }).toBuffer();
    } catch (sharpError) {
      if (info.format === "heif") {
        return await decodeHeicToWebp(bytes, fitFunctionResponse);
      }
      throw sharpError;
    }
  } catch (error) {
    console.warn("[cortez] normalizePhoto failed", {
      type: normalizedType,
      bytes: bytes.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(400, "אחת התמונות פגומה, גדולה מדי או שהפורמט שלה אינו נתמך.");
  }
}

export async function savePhotos(module: PhotoModule, files: File[]) {
  const saved: Photo[] = [];
  try {
    for (const file of files) {
      if (file.size > maxImageBytes) {
        throw new AppError(400, "יש לבחור תמונות בגודל של עד 20 מ״ב לתמונה.");
      }
      const buffer = await normalizePhoto(Buffer.from(await file.arrayBuffer()), file.type);
      const photo = { id: randomUUID(), name: file.name.slice(0, 255), type: "image/webp" as const, bytes: buffer.length };
      await atomicWrite(imagePath(module, photo.id), buffer);
      saved.push(photo);
    }
    return saved;
  } catch (error) {
    await removePhotos(module, saved);
    throw error;
  }
}

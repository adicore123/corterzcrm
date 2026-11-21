import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../errors";
import { atomicWrite, storageRoot } from "../json-db/store";
import { uuid, type Photo, type PhotoModule } from "../validation/models";

export const maxPhotos = 10;
export const maxImageBytes = 8 * 1024 * 1024;
export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];

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
  if (!acceptedImageTypes.includes(type) || !bytes.length || bytes.length > maxImageBytes) {
    throw new AppError(400, "יש לבחור תמונות JPG, PNG או WebP בגודל של עד 8 מ״ב לתמונה.");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 50_000_000, failOn: "warning" });
    const info = await image.metadata();
    if ("image/" + info.format !== type) throw new Error("Incorrect image type");
    const result = await image.clone().rotate().resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 }).toBuffer();
    if (!fitFunctionResponse || result.length <= 4_000_000) return result;
    return await image.rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 }).toBuffer();
  } catch {
    throw new AppError(400, "אחת התמונות פגומה, גדולה מדי או שהפורמט שלה אינו נתמך.");
  }
}

export async function savePhotos(module: PhotoModule, files: File[]) {
  const saved: Photo[] = [];
  try {
    for (const file of files) {
      if (file.size > maxImageBytes) {
        throw new AppError(400, "יש לבחור תמונות JPG, PNG או WebP בגודל של עד 8 מ״ב לתמונה.");
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

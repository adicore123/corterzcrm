import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { z } from "zod";
import { AppError } from "../errors";
import { cloudPrefix } from "../json-db/blob-store";
import { mapConcurrent } from "../utils";
import { uuid, type Photo, type PhotoModule } from "../validation/models";
import { acceptedImageTypes, maxImageBytes, maxPhotos, normalizePhoto } from "./images";

export const uploadList = z
  .array(z.object({ id: uuid, name: z.string().max(255) }))
  .max(maxPhotos)
  .refine(
    (photos) => new Set(photos.map((photo) => photo.id)).size === photos.length,
    "כל תמונה יכולה להופיע פעם אחת.",
  );

const stagingPath = (kind: PhotoModule, user: string, id: string) =>
  cloudPrefix + "incoming/" + kind + "/" + uuid.parse(user) + "/" + uuid.parse(id);
const photoPath = (kind: PhotoModule, id: string) =>
  cloudPrefix + "photos/" + kind + "/" + uuid.parse(id) + ".webp";
const privateAccess = { access: "private" as const };

export async function authorizeUpload(kind: PhotoModule, user: string, id: string) {
  const pathname = stagingPath(kind, user, id);
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    maximumSizeInBytes: maxImageBytes,
    allowedContentTypes: [
      ...acceptedImageTypes,
      "image/heic",
      "image/heif",
      "image/avif",
      "image/gif",
      "image/bmp",
      "image/tiff",
      "image/x-png",
      "application/octet-stream",
    ],
    validUntil: Date.now() + 20 * 60 * 1000,
    addRandomSuffix: false,
    allowOverwrite: false,
    ttlDays: 1,
  });
  return { id, pathname, token };
}

export async function authorizeUploads(kind: PhotoModule, user: string, ids: string[]) {
  return Promise.all(ids.map((id) => authorizeUpload(kind, user, id)));
}

export async function readStagedPhoto(kind: PhotoModule, user: string, id: string) {
  const path = stagingPath(kind, user, id);
  const blob = await get(path, { ...privateAccess, useCache: false });
  if (!blob || blob.statusCode !== 200 || !blob.blob.size || blob.blob.size > maxImageBytes) {
    if (blob?.statusCode === 200) await blob.stream.cancel();
    throw new AppError(400, "אחת התמונות לא הועלתה בהצלחה. יש להעלות אותה שוב.");
  }
  const input = Buffer.from(await new Response(blob.stream).arrayBuffer());
  const normalized = await normalizePhoto(input, blob.blob.contentType, true);
  // Non-blocking cleanup of staging blob (TTL=1 day also cleans up on crash)
  void del(path).catch(() => undefined);
  return normalized;
}

export async function prepareBlobPhotos(
  kind: PhotoModule,
  user: string,
  staged: z.infer<typeof uploadList>,
) {
  if (!staged.length) return [];
  const saved: Photo[] = [];
  try {
    return await mapConcurrent(staged, 3, async (item) => {
      const bytes = await readStagedPhoto(kind, user, item.id);
      const photo: Photo = {
        id: randomUUID(),
        name: item.name,
        type: "image/webp",
        bytes: bytes.length,
      };
      await put(photoPath(kind, photo.id), bytes, { ...privateAccess, contentType: photo.type });
      saved.push(photo);
      return photo;
    });
  } catch (error) {
    await removeBlobPhotos(kind, saved);
    throw error;
  }
}

export async function removeBlobPhotos(kind: PhotoModule, photos: Photo[]) {
  if (!photos.length) return;
  await del(photos.map((photo) => photoPath(kind, photo.id))).catch((error) => {
    console.warn("[cortez] Blob photo cleanup failed", error);
  });
}

export async function readBlobPhoto(kind: PhotoModule, id: string) {
  const blob = await get(photoPath(kind, id), privateAccess);
  if (!blob || blob.statusCode !== 200) throw new AppError(404, "התמונה לא נמצאה.");
  return blob.stream;
}

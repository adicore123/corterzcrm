import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { z } from "zod";
import { AppError } from "../errors";
import { cloudPrefix } from "../json-db/blob-store";
import { uuid, type Photo, type PhotoModule } from "../validation/models";
import { acceptedImageTypes, maxImageBytes, maxPhotos, normalizePhoto } from "./images";

export const uploadList = z.array(z.object({ id: uuid, name: z.string().max(255) })).max(maxPhotos)
  .refine((photos) => new Set(photos.map((photo) => photo.id)).size === photos.length, "כל תמונה יכולה להופיע פעם אחת.");

const stagingPath = (kind: PhotoModule, user: string, id: string) => cloudPrefix + "incoming/" + kind + "/" + uuid.parse(user) + "/" + uuid.parse(id);
const photoPath = (kind: PhotoModule, id: string) => cloudPrefix + "photos/" + kind + "/" + uuid.parse(id) + ".webp";
const privateAccess = { access: "private" as const };

export async function authorizeUpload(kind: PhotoModule, user: string, id: string) {
  const pathname = stagingPath(kind, user, id);
  const token = await generateClientTokenFromReadWriteToken({
    pathname, maximumSizeInBytes: maxImageBytes, allowedContentTypes: acceptedImageTypes, validUntil: Date.now() + 20 * 60 * 1000,
    addRandomSuffix: false, allowOverwrite: false, ttlDays: 1,
  });
  return { pathname, token };
}

export async function prepareBlobPhotos(kind: PhotoModule, user: string, staged: z.infer<typeof uploadList>) {
  const photos: Photo[] = [];
  for (const item of staged) {
    const blob = await get(stagingPath(kind, user, item.id), { ...privateAccess, useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.blob.size || blob.blob.size > maxImageBytes) {
      if (blob?.statusCode === 200) await blob.stream.cancel();
      throw new AppError(400, "אחת התמונות לא הועלתה בהצלחה. יש להעלות אותה שוב.");
    }
    const input = Buffer.from(await new Response(blob.stream).arrayBuffer());
    const bytes = await normalizePhoto(input, blob.blob.contentType, true);
    const photo = { id: randomUUID(), name: item.name, type: "image/webp" as const, bytes: bytes.length };
    await put(photoPath(kind, photo.id), bytes, { ...privateAccess, contentType: photo.type });
    photos.push(photo);
  }
  return photos;
}

export async function readBlobPhoto(kind: PhotoModule, id: string) {
  const blob = await get(photoPath(kind, id), privateAccess);
  if (!blob || blob.statusCode !== 200) throw new AppError(404, "התמונה לא נמצאה.");
  return blob.stream;
}

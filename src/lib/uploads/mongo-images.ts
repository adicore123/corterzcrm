import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { z } from "zod";
import { AppError } from "../errors";
import { mongoDatabase } from "../json-db/mongo-client";
import { uuid, type Photo, type PhotoModule } from "../validation/models";
import { readStagedPhoto, uploadList } from "./blob-images";
import { maxImageBytes, normalizePhoto } from "./images";

type StoredPhoto = { _id: string; data: Binary; bytes: number; type: "image/webp" };
const key = (kind: PhotoModule, id: string) => kind + ":" + uuid.parse(id);

export async function putMongoPhoto(kind: PhotoModule, photo: Photo, bytes: Buffer) {
  if (photo.bytes !== bytes.length) throw new Error("Photo size differs from its record.");
  const db = await mongoDatabase();
  await db.collection<StoredPhoto>("photos").updateOne(
    { _id: key(kind, photo.id) },
    { $setOnInsert: { data: new Binary(bytes), bytes: bytes.length, type: "image/webp" } },
    { upsert: true },
  );
}

export async function prepareMongoPhotos(
  kind: PhotoModule,
  user: string,
  staged: z.infer<typeof uploadList>,
) {
  const photos: Photo[] = [];
  for (const item of staged) {
    const bytes = await readStagedPhoto(kind, user, item.id);
    const photo: Photo = {
      id: randomUUID(),
      name: item.name,
      type: "image/webp",
      bytes: bytes.length,
    };
    await putMongoPhoto(kind, photo, bytes);
    photos.push(photo);
  }
  return photos;
}

/**
 * Saves multipart File uploads directly into MongoDB without requiring Vercel Blob staging
 * (used when CORTEZ_STORAGE_BACKEND === "mongo" and BLOB_READ_WRITE_TOKEN is not configured).
 */
export async function saveDirectMongoPhotos(kind: PhotoModule, files: File[]): Promise<Photo[]> {
  const saved: Photo[] = [];
  try {
    for (const file of files) {
      if (file.size > maxImageBytes) {
        throw new AppError(400, "יש לבחור תמונות בגודל של עד 20 מ״ב לתמונה.");
      }
      const buffer = await normalizePhoto(Buffer.from(await file.arrayBuffer()), file.type, true);
      const photo: Photo = {
        id: randomUUID(),
        name: file.name.slice(0, 255),
        type: "image/webp",
        bytes: buffer.length,
      };
      await putMongoPhoto(kind, photo, buffer);
      saved.push(photo);
    }
    return saved;
  } catch (error) {
    await removeMongoPhotos(kind, saved);
    throw error;
  }
}

export async function removeMongoPhotos(kind: PhotoModule, photos: Photo[]) {
  if (!photos.length) return;
  try {
    const db = await mongoDatabase();
    await db.collection<StoredPhoto>("photos").deleteMany({
      _id: { $in: photos.map((photo) => key(kind, photo.id)) },
    });
  } catch (error) {
    console.warn("[cortez] Mongo photo cleanup failed", error);
  }
}

export async function readMongoPhoto(kind: PhotoModule, id: string) {
  const db = await mongoDatabase();
  const photo = await db.collection<StoredPhoto>("photos").findOne({ _id: key(kind, id) });
  if (!photo) throw new AppError(404, "התמונה לא נמצאה.");
  return new Uint8Array(photo.data.value());
}

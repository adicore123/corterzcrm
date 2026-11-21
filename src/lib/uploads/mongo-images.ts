import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { AppError } from "../errors";
import { mongoDatabase } from "../json-db/mongo-client";
import { uuid, type Photo, type PhotoModule } from "../validation/models";
import { readStagedPhoto, uploadList } from "./blob-images";
import { z } from "zod";

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

export async function prepareMongoPhotos(kind: PhotoModule, user: string, staged: z.infer<typeof uploadList>) {
  const photos: Photo[] = [];
  for (const item of staged) {
    const bytes = await readStagedPhoto(kind, user, item.id);
    const photo: Photo = { id: randomUUID(), name: item.name, type: "image/webp", bytes: bytes.length };
    await putMongoPhoto(kind, photo, bytes);
    photos.push(photo);
  }
  return photos;
}

export async function readMongoPhoto(kind: PhotoModule, id: string) {
  const db = await mongoDatabase();
  const photo = await db.collection<StoredPhoto>("photos").findOne({ _id: key(kind, id) });
  if (!photo) throw new AppError(404, "התמונה לא נמצאה.");
  return new Uint8Array(photo.data.value());
}

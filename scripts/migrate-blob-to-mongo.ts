import { get } from "@vercel/blob";
import { stateKey, stateSchema, type State } from "../src/lib/json-db/blob-store";
import { closeMongoConnection, mongoDatabase } from "../src/lib/json-db/mongo-client";
import { readBlobPhoto } from "../src/lib/uploads/blob-images";
import { putMongoPhoto } from "../src/lib/uploads/mongo-images";
import type { PhotoModule } from "../src/lib/validation/models";

async function snapshot() {
  const result = await get(stateKey, { access: "private", useCache: false, headers: { "Accept-Encoding": "identity" } });
  if (!result || result.statusCode !== 200 || !result.blob.etag || result.blob.etag.startsWith("W/")) {
    throw new Error("The production Blob snapshot is missing or has no strong version.");
  }
  return { state: stateSchema.parse(await new Response(result.stream).json()), etag: result.blob.etag };
}

async function migratePhotos(kind: PhotoModule, records: State["standards"] | State["repairs"]) {
  for (const record of records) {
    for (const photo of record.photos) {
      const stream = await readBlobPhoto(kind, photo.id);
      const bytes = Buffer.from(await new Response(stream).arrayBuffer());
      await putMongoPhoto(kind, photo, bytes);
    }
  }
}

async function main() {
  const db = await mongoDatabase();
  const before = await snapshot();
  const collection = db.collection<State & { _id: string; version: number; sourceEtag: string }>("app_state");
  const existing = await collection.findOne({ _id: "state" }, { projection: { version: 1 } });
  if (existing && existing.version !== 1) throw new Error("MongoDB already contains live edits; refusing to overwrite them.");
  await migratePhotos("standards", before.state.standards);
  await migratePhotos("repairs", before.state.repairs);
  const after = await snapshot();
  if (after.etag !== before.etag) throw new Error("The Blob snapshot changed during migration. Rerun before enabling MongoDB.");
  if (existing) {
    const result = await collection.replaceOne({ _id: "state", version: 1 }, { version: 1, sourceEtag: before.etag, ...before.state });
    if (result.matchedCount !== 1) throw new Error("MongoDB state changed during migration.");
  } else {
    await collection.replaceOne({ _id: "state" }, { version: 1, sourceEtag: before.etag, ...before.state }, { upsert: true });
  }
  console.log(JSON.stringify({ migrated: true, standards: before.state.standards.length,
    repairs: before.state.repairs.length, customers: before.state.customers.length,
    users: before.state.users.length,
    photos: [...before.state.standards, ...before.state.repairs].reduce((total, record) => total + record.photos.length, 0) }));
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
}).finally(closeMongoConnection);

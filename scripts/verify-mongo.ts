import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Document } from "mongodb";
import { closeMongoConnection, mongoDatabase } from "../src/lib/json-db/mongo-client";
import { readCollection, serialized, writeCollection } from "../src/lib/json-db/store";
import { putMongoPhoto, readMongoPhoto } from "../src/lib/uploads/mongo-images";

const database = "cortez_ver_" + randomUUID().replaceAll("-", "").slice(0, 16);
process.env.MONGODB_DB = database;
process.env.CORTEZ_STORAGE_BACKEND = "mongo";

async function main() {
  const db = await mongoDatabase();
  try {
    await db.collection<Document & { _id: string }>("app_state").replaceOne({ _id: "state" }, { version: 1, format: 1,
      standards: [], repairs: [], customers: [], users: [], counters: { standards: 0, repairs: 0 },
      activity: [], sessions: [] }, { upsert: true });
    await Promise.all(Array.from({ length: 8 }, () => serialized(async () => {
      const counters = await readCollection("counters");
      await writeCollection("counters", { ...counters, repairs: counters.repairs + 1 });
    })));
    assert.equal((await readCollection("counters")).repairs, 8);

    const photo = { id: randomUUID(), name: "test.webp", type: "image/webp" as const, bytes: 4 };
    const bytes = Buffer.from([1, 2, 3, 4]);
    await putMongoPhoto("standards", photo, bytes);
    assert.deepEqual(Buffer.from(await readMongoPhoto("standards", photo.id)), bytes);
    console.log("MongoDB transactions and photo storage passed.");
  } finally {
    await db.dropDatabase();
  }
}

main().catch((error) => {
  console.error("MongoDB verification failed:", error instanceof Error ? error.name + ": " + error.message : "Unknown error");
  process.exitCode = 1;
}).finally(closeMongoConnection);

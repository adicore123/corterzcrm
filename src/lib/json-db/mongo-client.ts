import { MongoClient } from "mongodb";

const globalClient = globalThis as typeof globalThis & { cortezMongo?: Promise<MongoClient> };

export function usesMongoStorage() {
  return process.env.CORTEZ_STORAGE_BACKEND === "mongo";
}

export async function mongoDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for MongoDB storage.");
  globalClient.cortezMongo ??= new MongoClient(uri, {
    ignoreUndefined: true,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 120_000,
    serverSelectionTimeoutMS: 10_000,
    compressors: ["zlib"],
  })
    .connect()
    .catch((error) => {
      globalClient.cortezMongo = undefined;
      throw error;
    });
  const client = await globalClient.cortezMongo;
  return client.db(process.env.MONGODB_DB || "cortezcrm");
}

export async function closeMongoConnection() {
  if (globalClient.cortezMongo) {
    await (await globalClient.cortezMongo).close();
    globalClient.cortezMongo = undefined;
  }
}

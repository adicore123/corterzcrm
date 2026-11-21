import { cache } from "react";
import { AppError } from "../errors";
import { stateSchema, type State } from "./blob-store";
import { collections, type Collection, type Data } from "./collections";
import { mongoDatabase } from "./mongo-client";
import { createVersionedStore } from "./versioned";

type StoredState = State & { _id: "state"; version: number; sourceEtag?: string };

async function readVersion() {
  const db = await mongoDatabase();
  const stored = await db.collection<StoredState>("app_state").findOne({ _id: "state" });
  if (!stored) throw new AppError(503, "מסד הנתונים טרם הועבר. יש לפנות למנהל המערכת.");
  try {
    return { value: stateSchema.parse(stored), version: String(stored.version) };
  } catch {
    throw new AppError(503, "נתוני המערכת במסד הנתונים אינם תקינים. יש לפנות למנהל המערכת.");
  }
}

const readForRender = cache(readVersion);
const store = createVersionedStore<State>({
  read: readVersion,
  async commit(value, version) {
    if (version === null) throw new Error("MongoDB state must be migrated before use.");
    const db = await mongoDatabase();
    const result = await db.collection<StoredState>("app_state").updateOne(
      { _id: "state", version: Number(version) },
      { $set: { ...stateSchema.parse(value), version: Number(version) + 1 } },
    );
    return result.modifiedCount === 1;
  },
});

export const mongoTransaction = store.transaction;

export async function readMongoCollection<K extends Collection>(key: K): Promise<Data<K>> {
  const value = store.current() ?? (await readForRender()).value;
  return collections[key].schema.parse(value[key]) as Data<K>;
}

export async function writeMongoCollection<K extends Collection>(key: K, value: Data<K>) {
  const current = store.current();
  if (!current) throw new Error("A storage transaction is required.");
  store.replace({ ...current, [key]: value });
}

export async function listMongoBackups() {
  const db = await mongoDatabase();
  const backups = await db.collection<{ _id: string }>("backups").find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).toArray();
  return backups.map((backup) => backup._id);
}

export async function writeMongoBackup(id: string, timestamp: string) {
  const { value } = await readVersion();
  const db = await mongoDatabase();
  await db.collection<{ _id: string; timestamp: string; state: State }>("backups")
    .insertOne({ _id: id, timestamp, state: { ...value, sessions: [] } });
}

export async function readMongoBackup(id: string) {
  const db = await mongoDatabase();
  const backup = await db.collection<{ _id: string; timestamp: string; state: State }>("backups").findOne({ _id: id });
  if (!backup) throw new AppError(404, "הגיבוי לא נמצא.");
  return { id: backup._id, timestamp: backup.timestamp, state: backup.state };
}

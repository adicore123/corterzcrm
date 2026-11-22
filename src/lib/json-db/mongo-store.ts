import { cache } from "react";
import { z } from "zod";
import { AppError } from "../errors";
import { stateSchema, type State } from "./blob-store";
import { collections, initialCounters, type Collection, type Data } from "./collections";
import { defaultCatalogModels } from "./cortez-catalog";
import { mongoDatabase } from "./mongo-client";
import { createVersionedStore } from "./versioned";

type StoredState = State & { _id: "state"; version: number; sourceEtag?: string };

/** Strip explicit `undefined` keys recursively so MongoDB BSON never coerces them to `null`. */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const nonNullableOptionalModelKeys = [
  "imageUrl", "summary", "productUrl", "galleryUrls", "specs", "published",
  "model3dUrl", "videoUrl", "publicDescription", "dimensions", "foldedDimensions",
  "metrics", "features", "studio",
] as const;

function stripNullsRecursive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullsRecursive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = stripNullsRecursive(v);
    }
    return out;
  }
  return value;
}

function sanitizeLegacyMongoState(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(doc.models)) {
    doc.models = doc.models.map((item) => {
      if (!item || typeof item !== "object") return item;
      const copy = { ...(item as Record<string, unknown>) };
      for (const key of nonNullableOptionalModelKeys) {
        if (copy[key] === null) delete copy[key];
      }
      if (copy.studio && typeof copy.studio === "object") {
        copy.studio = stripNullsRecursive(copy.studio);
      }
      return copy;
    });
  }
  if (doc.settings && typeof doc.settings === "object") {
    doc.settings = stripNullsRecursive(doc.settings);
  } else if (doc.settings === null) {
    delete doc.settings;
  }
  return doc;
}

export function parseMongoState(stored: unknown): State {
  const direct = stateSchema.safeParse(stored);
  if (direct.success) return direct.data;
  const recovered = stateSchema.safeParse(sanitizeLegacyMongoState(stored));
  if (recovered.success) {
    console.warn("[cortez] Recovered legacy null fields in MongoDB state", direct.error.issues.map((issue) => issue.path.join(".")));
    return recovered.data;
  }
  console.error("[cortez] MongoDB state validation failed", direct.error instanceof z.ZodError ? direct.error.issues : direct.error);
  throw new AppError(503, "נתוני המערכת במסד הנתונים אינם תקינים. יש לפנות למנהל המערכת.");
}

function initialMongoState(): State {
  return stripUndefined({
    format: 1,
    standards: [],
    repairs: [],
    customers: [],
    models: [...defaultCatalogModels],
    faults: [],
    users: [],
    activity: [],
    sessions: [],
    counters: { ...initialCounters },
    settings: {},
  });
}

async function readVersion() {
  const db = await mongoDatabase();
  const collection = db.collection<StoredState>("app_state");
  let stored = await collection.findOne({ _id: "state" });
  if (!stored) {
    await collection.updateOne(
      { _id: "state" },
      { $setOnInsert: { _id: "state", version: 1, ...initialMongoState() } },
      { upsert: true },
    );
    stored = await collection.findOne({ _id: "state" });
  }
  if (!stored) throw new AppError(503, "מסד הנתונים אינו זמין כעת. יש לפנות למנהל המערכת.");
  return { value: parseMongoState(stored), version: String(stored.version) };
}

const readForRender = cache(readVersion);
const store = createVersionedStore<State>({
  read: readVersion,
  async commit(value, version) {
    if (version === null) throw new Error("MongoDB state must be migrated before use.");
    const db = await mongoDatabase();
    const cleaned = stripUndefined(stateSchema.parse(value));
    const result = await db.collection<StoredState>("app_state").updateOne(
      { _id: "state", version: Number(version) },
      { $set: { ...cleaned, version: Number(version) + 1 } },
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
    .insertOne({ _id: id, timestamp, state: stripUndefined({ ...value, sessions: [] }) });
}

export async function readMongoBackup(id: string) {
  const db = await mongoDatabase();
  const backup = await db.collection<{ _id: string; timestamp: string; state: State }>("backups").findOne({ _id: id });
  if (!backup) throw new AppError(404, "הגיבוי לא נמצא.");
  return { id: backup._id, timestamp: backup.timestamp, state: backup.state };
}

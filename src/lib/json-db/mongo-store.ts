import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { cache } from "react";
import { z } from "zod";
import { AppError } from "../errors";
import { stateSchema, type State } from "./blob-store";
import { collections, initialCounters, initialSettings, type Collection, type Data } from "./collections";
import { defaultCatalogModels } from "./cortez-catalog";
import { mongoDatabase } from "./mongo-client";

type LegacyStoredState = State & { _id: "state"; version?: number; sourceEtag?: string };
type ArrayCollectionKey = Exclude<Collection, "counters" | "settings">;

const ARRAY_COLLECTION_NAMES: Record<ArrayCollectionKey, string> = {
  standards: "crm_standards",
  repairs: "crm_repairs",
  quotes: "crm_quotes",
  orders: "crm_orders",
  customers: "crm_customers",
  models: "crm_models",
  faults: "crm_faults",
  users: "crm_users",
  sessions: "crm_sessions",
  activity: "crm_activity",
};

const BACKUP_CHUNK_SIZE = 250;

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

function sanitizeModelDoc(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const copy = { ...(item as Record<string, unknown>) };
  delete copy._id;
  for (const key of nonNullableOptionalModelKeys) {
    if (copy[key] === null) delete copy[key];
  }
  if (copy.studio && typeof copy.studio === "object") {
    copy.studio = stripNullsRecursive(copy.studio);
  }
  return copy;
}

function sanitizeLegacyMongoState(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(doc.models)) {
    doc.models = doc.models.map(sanitizeModelDoc);
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
    console.warn(
      "[cortez] Recovered legacy null fields in MongoDB state",
      direct.error.issues.map((issue) => issue.path.join(".")),
    );
    return recovered.data;
  }
  console.error(
    "[cortez] MongoDB state validation failed",
    direct.error instanceof z.ZodError ? direct.error.issues : direct.error,
  );
  throw new AppError(503, "נתוני המערכת במסד הנתונים אינם תקינים. יש לפנות למנהל המערכת.");
}

function getItemDocId(key: ArrayCollectionKey, item: Record<string, unknown>): string {
  if (key === "sessions") return String(item.hash);
  return String(item.id);
}

function stripMongoId(doc: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...doc };
  delete copy._id;
  return copy;
}

const mongoInitGlobal = globalThis as typeof globalThis & {
  cortezMongoInitByDb?: Map<string, Promise<void>>;
};
const initByDb = (mongoInitGlobal.cortezMongoInitByDb ??= new Map());

async function acquireNamedLock(db: Db, lockId: string, ttlMs = 15_000): Promise<string> {
  const owner = randomUUID();
  const locks = db.collection<{ _id: string; owner: string; expiresAt: Date }>("crm_locks");
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await locks.deleteOne({ _id: lockId, expiresAt: { $lte: now } }).catch(() => undefined);
    try {
      const res = await locks.updateOne(
        { _id: lockId },
        { $setOnInsert: { _id: lockId, owner, expiresAt } },
        { upsert: true },
      );
      if (res.upsertedCount === 1) return owner;
      const existing = await locks.findOne({ _id: lockId });
      if (existing?.owner === owner) return owner;
    } catch {
      // Duplicate key under contention — retry after short jitter
    }
    await delay(Math.min(250, 8 * 1.45 ** attempt) * (0.6 + Math.random() * 0.6));
  }
  throw new AppError(503, "יש עומס שמירות במערכת. יש לנסות שוב.");
}

async function releaseNamedLock(db: Db, lockId: string, owner: string) {
  await db
    .collection<{ _id: string; owner: string }>("crm_locks")
    .deleteOne({ _id: lockId, owner })
    .catch(() => undefined);
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("crm_standards").createIndex({ number: 1 }),
    db.collection("crm_standards").createIndex({ updatedAt: -1 }),
    db.collection("crm_repairs").createIndex({ number: 1 }),
    db.collection("crm_repairs").createIndex({ customerId: 1 }),
    db.collection("crm_repairs").createIndex({ serial: 1 }),
    db.collection("crm_repairs").createIndex({ updatedAt: -1 }),
    db.collection("crm_quotes").createIndex({ tokenHash: 1 }),
    db.collection("crm_quotes").createIndex({ createdBy: 1, createdAt: -1 }),
    db.collection("crm_orders").createIndex({ number: 1 }),
    db.collection("crm_orders").createIndex({ createdBy: 1, createdAt: -1 }),
    db.collection("crm_orders").createIndex({ status: 1 }),
    db.collection("crm_customers").createIndex({ phone: 1 }),
    db.collection("crm_models").createIndex({ name: 1 }),
    db.collection("crm_faults").createIndex({ model: 1 }),
    db.collection("crm_users").createIndex({ username: 1 }, { unique: true }),
    db.collection("crm_sessions").createIndex({ userId: 1 }),
    db.collection("crm_sessions").createIndex({ expires: 1 }),
    db.collection("crm_activity").createIndex({ at: -1 }),
    db.collection("crm_backup_chunks").createIndex({ backupId: 1, collection: 1, chunkIndex: 1 }),
    db.collection("crm_locks").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

async function seedArrayCollectionIfMissing<K extends ArrayCollectionKey>(
  db: Db,
  key: K,
  items: Data<K>,
) {
  const arr = items as unknown as Array<Record<string, unknown>>;
  if (!arr.length) return;
  const col = db.collection<Document & { _id: string }>(ARRAY_COLLECTION_NAMES[key]);
  const ops: AnyBulkWriteOperation<Document & { _id: string }>[] = arr.map((rawItem) => {
    const cleaned = stripUndefined(rawItem);
    const id = getItemDocId(key, cleaned);
    return {
      updateOne: {
        filter: { _id: id },
        update: { $setOnInsert: { _id: id, ...cleaned } },
        upsert: true,
      },
    };
  });
  await col.bulkWrite(ops, { ordered: false });
}

/**
 * Ensures the MongoDB database is initialized with dedicated indexed collections,
 * automatically migrating any legacy single-document `app_state` (`_id: "state"`) without data loss.
 */
async function ensureMongoCollectionsReady(db: Db): Promise<void> {
  const dbName = db.databaseName;
  let pending = initByDb.get(dbName);
  if (!pending) {
    pending = (async () => {
      await ensureIndexes(db);
      const metaCol = db.collection<Document & { _id: string }>("crm_meta");
      const marker = await metaCol.findOne({ _id: "migration_v2" });
      if (marker) return;

      const lockOwner = await acquireNamedLock(db, "migration_lock", 30_000);
      try {
        const recheck = await metaCol.findOne({ _id: "migration_v2" });
        if (recheck) return;

        const legacyDoc = await db
          .collection<LegacyStoredState>("app_state")
          .findOne({ _id: "state" });

        if (legacyDoc) {
          const parsed = parseMongoState(legacyDoc);
          const arrayKeys = Object.keys(ARRAY_COLLECTION_NAMES) as ArrayCollectionKey[];
          for (const key of arrayKeys) {
            await seedArrayCollectionIfMissing(db, key, parsed[key]);
          }
          await metaCol.updateOne(
            { _id: "counters" },
            { $setOnInsert: { _id: "counters", ...stripUndefined(parsed.counters) } },
            { upsert: true },
          );
          await metaCol.updateOne(
            { _id: "settings" },
            { $setOnInsert: { _id: "settings", ...stripUndefined(parsed.settings) } },
            { upsert: true },
          );
          await metaCol.updateOne(
            { _id: "migration_v2" },
            {
              $set: {
                _id: "migration_v2",
                migratedAt: new Date().toISOString(),
                fromLegacyVersion: legacyDoc.version ?? 1,
              },
            },
            { upsert: true },
          );
        } else {
          await seedArrayCollectionIfMissing(db, "models", defaultCatalogModels);
          await metaCol.updateOne(
            { _id: "counters" },
            { $setOnInsert: { _id: "counters", ...initialCounters } },
            { upsert: true },
          );
          await metaCol.updateOne(
            { _id: "settings" },
            { $setOnInsert: { _id: "settings", ...initialSettings } },
            { upsert: true },
          );
          await metaCol.updateOne(
            { _id: "migration_v2" },
            { $set: { _id: "migration_v2", migratedAt: new Date().toISOString(), fresh: true } },
            { upsert: true },
          );
        }
      } finally {
        await releaseNamedLock(db, "migration_lock", lockOwner);
      }
    })().catch((err) => {
      initByDb.delete(dbName);
      throw err;
    });
    initByDb.set(dbName, pending);
  }
  return pending;
}

async function readSingleCollectionFromDb<K extends Collection>(db: Db, key: K): Promise<Data<K>> {
  await ensureMongoCollectionsReady(db);

  if (key === "counters") {
    const doc = await db.collection<Document & { _id: string }>("crm_meta").findOne({ _id: "counters" });
    const raw = doc ? stripMongoId(doc) : { ...initialCounters };
    return collections.counters.schema.parse(raw) as Data<K>;
  }

  if (key === "settings") {
    const doc = await db.collection<Document & { _id: string }>("crm_meta").findOne({ _id: "settings" });
    const raw = doc ? stripNullsRecursive(stripMongoId(doc)) : { ...initialSettings };
    return collections.settings.schema.parse(raw) as Data<K>;
  }

  const colName = ARRAY_COLLECTION_NAMES[key as ArrayCollectionKey];
  const col = db.collection<Document & { _id: string }>(colName);
  const rawDocs =
    key === "activity"
      ? await col.find({}).sort({ at: 1 }).limit(2000).toArray()
      : await col.find({}).toArray();

  const cleanedDocs = rawDocs.map((doc) =>
    key === "models" ? sanitizeModelDoc(doc) : stripMongoId(doc),
  );
  return collections[key].schema.parse(cleanedDocs) as Data<K>;
}

async function persistCollectionDiff<K extends Collection>(
  db: Db,
  key: K,
  prevValue: Data<K> | undefined,
  nextValue: Data<K>,
) {
  const validated = stripUndefined(collections[key].schema.parse(nextValue)) as Data<K>;

  if (key === "counters" || key === "settings") {
    await db
      .collection<Document & { _id: string }>("crm_meta")
      .replaceOne({ _id: key }, { _id: key, ...(validated as Record<string, unknown>) }, { upsert: true });
    return;
  }

  const arrKey = key as ArrayCollectionKey;
  const col = db.collection<Document & { _id: string }>(ARRAY_COLLECTION_NAMES[arrKey]);
  const nextItems = validated as unknown as Array<Record<string, unknown>>;
  const nextById = new Map<string, Record<string, unknown>>();
  for (const item of nextItems) {
    nextById.set(getItemDocId(arrKey, item), item);
  }

  let prevSerializedById: Map<string, string>;
  if (prevValue !== undefined) {
    prevSerializedById = new Map();
    for (const item of prevValue as unknown as Array<Record<string, unknown>>) {
      const cleaned = stripUndefined(item);
      prevSerializedById.set(getItemDocId(arrKey, cleaned), JSON.stringify(cleaned));
    }
  } else {
    const existingIds = await col.find({}, { projection: { _id: 1 } }).toArray();
    prevSerializedById = new Map(existingIds.map((doc) => [String(doc._id), ""]));
  }

  const ops: AnyBulkWriteOperation<Document & { _id: string }>[] = [];
  for (const [docId, item] of nextById) {
    const prevJson = prevSerializedById.get(docId);
    if (prevJson === undefined || prevJson !== JSON.stringify(item)) {
      ops.push({
        replaceOne: {
          filter: { _id: docId },
          replacement: { _id: docId, ...item },
          upsert: true,
        },
      });
    }
  }

  const deletedIds: string[] = [];
  for (const oldId of prevSerializedById.keys()) {
    if (!nextById.has(oldId)) deletedIds.push(oldId);
  }
  if (deletedIds.length > 0) {
    ops.push({
      deleteMany: {
        filter: { _id: { $in: deletedIds } },
      },
    });
  }

  if (ops.length > 0) {
    await col.bulkWrite(ops, { ordered: false });
  }
}

type TxContext = {
  db: Db;
  initial: Map<Collection, unknown>;
  working: Map<Collection, unknown>;
  dirty: Set<Collection>;
};

const txScope = new AsyncLocalStorage<TxContext>();

const readCollectionCachedForRender = cache(async (key: Collection) => {
  const db = await mongoDatabase();
  return readSingleCollectionFromDb(db, key);
});

export async function mongoTransaction<R>(work: () => Promise<R>): Promise<R> {
  if (txScope.getStore()) throw new Error("Nested storage transaction.");
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);

  const lockOwner = await acquireNamedLock(db, "tx_write_lock", 20_000);
  try {
    const ctx: TxContext = {
      db,
      initial: new Map(),
      working: new Map(),
      dirty: new Set(),
    };
    const result = await txScope.run(ctx, work);
    for (const key of ctx.dirty) {
      const prevVal = ctx.initial.get(key) as Data<typeof key> | undefined;
      const nextVal = ctx.working.get(key) as Data<typeof key>;
      await persistCollectionDiff(db, key, prevVal, nextVal);
    }
    return result;
  } finally {
    await releaseNamedLock(db, "tx_write_lock", lockOwner);
  }
}

export async function readMongoCollection<K extends Collection>(key: K): Promise<Data<K>> {
  const ctx = txScope.getStore();
  if (ctx) {
    if (!ctx.working.has(key)) {
      const loaded = await readSingleCollectionFromDb(ctx.db, key);
      ctx.initial.set(key, structuredClone(loaded));
      ctx.working.set(key, loaded);
    }
    return collections[key].schema.parse(structuredClone(ctx.working.get(key))) as Data<K>;
  }
  return (await readCollectionCachedForRender(key)) as Data<K>;
}

export async function writeMongoCollection<K extends Collection>(key: K, value: Data<K>) {
  const ctx = txScope.getStore();
  if (!ctx) throw new Error("A storage transaction is required.");
  const validated = collections[key].schema.parse(value) as Data<K>;
  ctx.working.set(key, structuredClone(validated));
  ctx.dirty.add(key);
}

export async function listMongoBackups() {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const backups = await db
    .collection<{ _id: string }>("backups")
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .toArray();
  return backups.map((backup) => backup._id);
}

/**
 * Writes a chunked multi-document backup in MongoDB so backups never hit the 16MB BSON limit,
 * while remaining 100% compatible with reading legacy single-document backups.
 */
export async function writeMongoBackup(id: string, timestamp: string) {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);

  const arrayKeys = (Object.keys(ARRAY_COLLECTION_NAMES) as ArrayCollectionKey[]).filter(
    (k) => k !== "sessions",
  );
  const chunkCol = db.collection<{
    _id: string;
    backupId: string;
    collection: string;
    chunkIndex: number;
    items: unknown[];
  }>("crm_backup_chunks");

  for (const key of arrayKeys) {
    const items = (await readSingleCollectionFromDb(db, key)) as unknown[];
    for (let i = 0; i < items.length; i += BACKUP_CHUNK_SIZE) {
      const chunkIndex = Math.floor(i / BACKUP_CHUNK_SIZE);
      const slice = stripUndefined(items.slice(i, i + BACKUP_CHUNK_SIZE));
      await chunkCol.insertOne({
        _id: `${id}:${key}:${chunkIndex}`,
        backupId: id,
        collection: key,
        chunkIndex,
        items: slice,
      });
    }
  }

  const [counters, settings] = await Promise.all([
    readSingleCollectionFromDb(db, "counters"),
    readSingleCollectionFromDb(db, "settings"),
  ]);

  await db
    .collection<{
      _id: string;
      timestamp: string;
      format: 2;
      counters: Data<"counters">;
      settings: Data<"settings">;
    }>("backups")
    .insertOne({
      _id: id,
      timestamp,
      format: 2,
      counters: stripUndefined(counters),
      settings: stripUndefined(settings),
    });
}

export async function readMongoBackup(id: string) {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const backup = await db
    .collection<{
      _id: string;
      timestamp: string;
      format?: number;
      state?: State;
      counters?: Data<"counters">;
      settings?: Data<"settings">;
    }>("backups")
    .findOne({ _id: id });

  if (!backup) throw new AppError(404, "הגיבוי לא נמצא.");

  // Backward compatibility with legacy v1 single-document backups
  if (backup.state) {
    return { id: backup._id, timestamp: backup.timestamp, state: backup.state };
  }

  const chunks = await db
    .collection<{ backupId: string; collection: string; chunkIndex: number; items: unknown[] }>(
      "crm_backup_chunks",
    )
    .find({ backupId: id })
    .sort({ collection: 1, chunkIndex: 1 })
    .toArray();

  const grouped: Record<string, unknown[]> = {};
  for (const key of Object.keys(ARRAY_COLLECTION_NAMES)) {
    grouped[key] = [];
  }
  for (const chunk of chunks) {
    grouped[chunk.collection] ??= [];
    grouped[chunk.collection].push(...chunk.items);
  }

  const state = parseMongoState({
    format: 1,
    standards: grouped.standards,
    repairs: grouped.repairs,
    quotes: grouped.quotes,
    orders: grouped.orders,
    customers: grouped.customers,
    models: grouped.models,
    faults: grouped.faults,
    users: grouped.users,
    activity: grouped.activity,
    sessions: [],
    counters: backup.counters ?? initialCounters,
    settings: backup.settings ?? initialSettings,
  });

  return { id: backup._id, timestamp: backup.timestamp, state };
}

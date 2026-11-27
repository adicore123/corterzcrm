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

/** Strip explicit `undefined` keys recursively in-memory so MongoDB BSON never coerces them to `null`. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
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
    // Fast single-RTT path when uncontended (99.9% of writes)
    try {
      await locks.insertOne({ _id: lockId, owner, expiresAt });
      return owner;
    } catch {
      // Lock exists: evict if expired and retry with jitter
      await locks.deleteOne({ _id: lockId, expiresAt: { $lte: now } }).catch(() => undefined);
      try {
        const res = await locks.updateOne(
          { _id: lockId },
          { $setOnInsert: { _id: lockId, owner, expiresAt } },
          { upsert: true },
        );
        if (res.upsertedCount === 1) return owner;
      } catch {
        // Still held by active transaction
      }
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
      const metaCol = db.collection<Document & { _id: string }>("crm_meta");
      // Fast Cold-Start path: 1 lightweight query instead of 20 createIndex round-trips
      const markers = await metaCol
        .find({ _id: { $in: ["migration_v2", "indexes_v2"] } }, { projection: { _id: 1 } })
        .toArray();
      const hasMigration = markers.some((m) => m._id === "migration_v2");
      const hasIndexes = markers.some((m) => m._id === "indexes_v2");
      if (hasMigration && hasIndexes) return;

      if (!hasIndexes) {
        await ensureIndexes(db);
        await metaCol.updateOne(
          { _id: "indexes_v2" },
          { $set: { _id: "indexes_v2", createdAt: new Date().toISOString() } },
          { upsert: true },
        );
      }
      if (hasMigration) return;

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
  if (key === "counters" || key === "settings") {
    const validated = stripUndefined(nextValue) as Record<string, unknown>;
    await db
      .collection<Document & { _id: string }>("crm_meta")
      .replaceOne({ _id: key }, { _id: key, ...validated }, { upsert: true });
    return;
  }

  const arrKey = key as ArrayCollectionKey;
  const col = db.collection<Document & { _id: string }>(ARRAY_COLLECTION_NAMES[arrKey]);
  const nextItems = nextValue as unknown as Array<Record<string, unknown>>;
  const nextById = new Map<string, Record<string, unknown>>();
  for (const item of nextItems) {
    nextById.set(getItemDocId(arrKey, item), item);
  }

  let prevItemById: Map<string, Record<string, unknown>> | null = null;
  let existingIdSet: Set<string>;
  if (prevValue !== undefined) {
    prevItemById = new Map();
    for (const item of prevValue as unknown as Array<Record<string, unknown>>) {
      prevItemById.set(getItemDocId(arrKey, item), item);
    }
    existingIdSet = new Set(prevItemById.keys());
  } else {
    const existingIds = await col.find({}, { projection: { _id: 1 } }).toArray();
    existingIdSet = new Set(existingIds.map((doc) => String(doc._id)));
  }

  const ops: AnyBulkWriteOperation<Document & { _id: string }>[] = [];
  for (const [docId, rawItem] of nextById) {
    const prevItem = prevItemById?.get(docId);
    // Fast-path: identical JS object reference means untouched record (skips O(N) stringify!)
    if (prevItem === rawItem) continue;

    const cleanedNext = stripUndefined(rawItem);
    const changed =
      prevItem === undefined
      || JSON.stringify(stripUndefined(prevItem)) !== JSON.stringify(cleanedNext);
    if (changed) {
      ops.push({
        replaceOne: {
          filter: { _id: docId },
          replacement: { _id: docId, ...cleanedNext },
          upsert: true,
        },
      });
    }
  }

  const deletedIds: string[] = [];
  for (const oldId of existingIdSet) {
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

export type LockScope =
  | "orders"
  | "quotes"
  | "repairs"
  | "standards"
  | "customers"
  | "faults"
  | "models"
  | "auth";

const ALL_LOCK_IDS = [
  "tx_lock:auth",
  "tx_lock:customers",
  "tx_lock:faults",
  "tx_lock:models",
  "tx_lock:orders",
  "tx_lock:quotes",
  "tx_lock:repairs",
  "tx_lock:standards",
] as const;

async function acquireScopedLocks(
  db: Db,
  scopes?: LockScope | readonly LockScope[],
  ttlMs = 20_000,
): Promise<{ owner: string; lockIds: string[] }> {
  const lockIds = scopes
    ? Array.from(
        new Set(
          (Array.isArray(scopes) ? scopes : [scopes]).map((s) => `tx_lock:${s}`),
        ),
      ).sort()
    : [...ALL_LOCK_IDS];

  if (lockIds.length === 1) {
    const owner = await acquireNamedLock(db, lockIds[0], ttlMs);
    return { owner, lockIds };
  }

  const owner = randomUUID();
  const locks = db.collection<{ _id: string; owner: string; expiresAt: Date }>("crm_locks");
  const expiresAt = new Date(Date.now() + ttlMs);

  // Fast 1-RTT batch lock acquisition when uncontended
  try {
    await locks.insertMany(
      lockIds.map((id) => ({ _id: id, owner, expiresAt })),
      { ordered: true },
    );
    return { owner, lockIds };
  } catch {
    await locks.deleteMany({ owner }).catch(() => undefined);
  }

  // Contended fallback: acquire in strict alphabetical order (deadlock-free)
  const acquired: string[] = [];
  try {
    for (const id of lockIds) {
      const singleOwner = await acquireNamedLock(db, id, ttlMs);
      // Re-tag under unified owner for single deleteMany release
      if (singleOwner !== owner) {
        await locks.updateOne({ _id: id, owner: singleOwner }, { $set: { owner } });
      }
      acquired.push(id);
    }
    return { owner, lockIds };
  } catch (err) {
    if (acquired.length > 0) {
      await locks.deleteMany({ _id: { $in: acquired }, owner }).catch(() => undefined);
    }
    throw err;
  }
}

async function releaseScopedLocks(db: Db, lockIds: string[], owner: string) {
  const locks = db.collection<{ _id: string; owner: string }>("crm_locks");
  if (lockIds.length === 1) {
    await locks.deleteOne({ _id: lockIds[0], owner }).catch(() => undefined);
    return;
  }
  await locks.deleteMany({ _id: { $in: lockIds }, owner }).catch(() => undefined);
}

export function isInsideMongoTransaction(): boolean {
  return Boolean(txScope.getStore());
}

export async function mongoTransaction<R>(
  work: () => Promise<R>,
  scopes?: LockScope | readonly LockScope[],
): Promise<R> {
  if (txScope.getStore()) throw new Error("Nested storage transaction.");
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);

  const { owner, lockIds } = await acquireScopedLocks(db, scopes, 20_000);
  try {
    const ctx: TxContext = {
      db,
      initial: new Map(),
      working: new Map(),
      dirty: new Set(),
    };
    const result = await txScope.run(ctx, work);
    if (ctx.dirty.size > 0) {
      await Promise.all(
        [...ctx.dirty].map((key) => {
          const prevVal = ctx.initial.get(key) as Data<typeof key> | undefined;
          const nextVal = ctx.working.get(key) as Data<typeof key>;
          return persistCollectionDiff(db, key, prevVal, nextVal);
        }),
      );
    }
    return result;
  } finally {
    await releaseScopedLocks(db, lockIds, owner);
  }
}

function shallowCopyCollection<K extends Collection>(val: Data<K>): Data<K> {
  return (Array.isArray(val) ? val.slice() : { ...(val as Record<string, unknown>) }) as Data<K>;
}

export async function readMongoCollection<K extends Collection>(key: K): Promise<Data<K>> {
  const ctx = txScope.getStore();
  if (ctx) {
    if (!ctx.working.has(key)) {
      const loaded = await readSingleCollectionFromDb(ctx.db, key);
      ctx.initial.set(key, shallowCopyCollection(loaded));
      ctx.working.set(key, shallowCopyCollection(loaded));
    }
    return shallowCopyCollection(ctx.working.get(key) as Data<K>);
  }
  return shallowCopyCollection((await readCollectionCachedForRender(key)) as Data<K>);
}

export async function writeMongoCollection<K extends Collection>(key: K, value: Data<K>) {
  const ctx = txScope.getStore();
  if (!ctx) throw new Error("A storage transaction is required.");
  // Note: `store.writeCollection` already parses `value` against `collections[key].schema`.
  ctx.working.set(key, shallowCopyCollection(value));
  ctx.dirty.add(key);
}

let auditInsertCounter = 0;

async function trimMongoActivity(db: Db) {
  const col = db.collection<{ _id: string }>("crm_activity");
  const stale = await col
    .find({}, { projection: { _id: 1 } })
    .sort({ at: -1 })
    .skip(2000)
    .limit(500)
    .toArray();
  if (stale.length > 0) {
    await col.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
  }
}

/**
 * Appends a single audit log entry in O(1) (`insertOne`) without reading or rewriting
 * the previous 2,000 activity events on every save.
 */
export async function appendMongoAudit(event: Data<"activity">[number]) {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const cleaned = stripUndefined(event);
  await db
    .collection<Document & { _id: string }>("crm_activity")
    .insertOne({ _id: cleaned.id, ...cleaned });

  const ctx = txScope.getStore();
  if (ctx && ctx.working.has("activity")) {
    const current = (ctx.working.get("activity") as Data<"activity">).slice();
    current.push(cleaned);
    ctx.working.set("activity", current.slice(-2000));
  }

  if (++auditInsertCounter % 50 === 0) {
    void trimMongoActivity(db).catch(() => undefined);
  }
}

/**
 * Fetches a single document by primary key (`_id`) in O(1) from MongoDB without scanning
 * or parsing the entire collection.
 */
export async function readMongoDocById<K extends ArrayCollectionKey>(
  key: K,
  docId: string,
): Promise<Data<K>[number] | null> {
  const ctx = txScope.getStore();
  if (ctx && ctx.working.has(key)) {
    const arr = ctx.working.get(key) as Array<Record<string, unknown>>;
    const hit = arr.find((item) => getItemDocId(key, item) === docId);
    return (hit ? (hit as Data<K>[number]) : null);
  }

  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const col = db.collection<Document & { _id: string }>(ARRAY_COLLECTION_NAMES[key]);
  const rawDoc = await col.findOne({ _id: docId });
  if (!rawDoc) return null;

  const cleaned = key === "models" ? sanitizeModelDoc(rawDoc) : stripMongoId(rawDoc);
  const parsed = collections[key].schema.parse([cleaned]) as Data<K>;
  return parsed[0] ?? null;
}

/**
 * Fetches distinct model names across standards, repairs, and faults using lightweight
 * indexed `distinct("model")` queries instead of downloading full historical documents.
 */
export async function readMongoDistinctModelNames(): Promise<string[]> {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const [stdNames, repNames, faultNames] = await Promise.all([
    db.collection("crm_standards").distinct("model"),
    db.collection("crm_repairs").distinct("model"),
    db.collection("crm_faults").distinct("model"),
  ]);
  const out: string[] = [];
  for (const list of [stdNames, repNames, faultNames]) {
    for (const v of list) {
      if (typeof v === "string" && v.trim()) out.push(v);
    }
  }
  return out;
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

/**
 * Atomically increments a sequential counter in MongoDB (`$inc`) in a single round-trip.
 */
export async function reserveMongoCounter(
  key: "standards" | "repairs" | "orders",
): Promise<number> {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const doc = await db
    .collection<Document & { _id: string }>("crm_meta")
    .findOneAndUpdate(
      { _id: "counters" },
      { $inc: { [key]: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  const next = Number((doc as Record<string, unknown> | null)?.[key] ?? 1);
  const ctx = txScope.getStore();
  if (ctx && ctx.working.has("counters")) {
    const current = ctx.working.get("counters") as Data<"counters">;
    ctx.working.set("counters", { ...current, [key]: next });
  }
  return next;
}

/**
 * Fetches dashboard counts and top-5 recent items directly via indexed MongoDB queries
 * instead of loading the entire standards, repairs, and customers collections into RAM.
 */
export async function readMongoDashboardSummary() {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);

  const stdCol = db.collection<Document & { _id: string }>("crm_standards");
  const repCol = db.collection<Document & { _id: string }>("crm_repairs");
  const custCol = db.collection<Document & { _id: string }>("crm_customers");

  const [
    activeStandards,
    delayedCount,
    completedCount,
    activeRepairs,
    rawRecentStandards,
    rawDelayedStandards,
    rawRecentRepairs,
  ] = await Promise.all([
    stdCol.countDocuments({ status: { $ne: "הסתיים" } }),
    stdCol.countDocuments({ delay: "מתעכב" }),
    stdCol.countDocuments({ status: "הסתיים" }),
    repCol.countDocuments({ status: { $ne: "הסתיים" } }),
    stdCol.find({}).sort({ updatedAt: -1 }).limit(5).toArray(),
    stdCol.find({ delay: "מתעכב" }).sort({ updatedAt: -1 }).limit(5).toArray(),
    repCol.find({}).sort({ updatedAt: -1 }).limit(5).toArray(),
  ]);

  const standards = collections.standards.schema.parse(rawRecentStandards.map(stripMongoId));
  const delayed = collections.standards.schema.parse(rawDelayedStandards.map(stripMongoId));
  const repairs = collections.repairs.schema.parse(rawRecentRepairs.map(stripMongoId));

  const neededCustomerIds = Array.from(new Set(repairs.map((r) => r.customerId)));
  const rawCustomers =
    neededCustomerIds.length > 0
      ? await custCol.find({ _id: { $in: neededCustomerIds } }).toArray()
      : [];
  const customers = collections.customers.schema.parse(rawCustomers.map(stripMongoId));

  return {
    counts: {
      activeStandards,
      delayed: delayedCount,
      completed: completedCount,
      activeRepairs,
    },
    standards,
    delayed,
    repairs,
    customers,
  };
}

export async function readMongoOrdersForActor(
  actorId: string,
  role: string,
): Promise<Data<"orders">> {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const filter = role === "agent" ? { createdBy: actorId } : {};
  const docs = await db
    .collection<Document & { _id: string }>("crm_orders")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  return collections.orders.schema.parse(docs.map(stripMongoId));
}

export async function readMongoQuotesForActor(
  actorId: string,
  role: string,
): Promise<Data<"quotes">> {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const filter = role === "agent" ? { createdBy: actorId } : {};
  const docs = await db
    .collection<Document & { _id: string }>("crm_quotes")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  return collections.quotes.schema.parse(docs.map(stripMongoId));
}

export async function readMongoQuoteByTokenHash(
  targetHash: string,
): Promise<Data<"quotes">[number] | null> {
  const db = await mongoDatabase();
  await ensureMongoCollectionsReady(db);
  const doc = await db
    .collection<Document & { _id: string }>("crm_quotes")
    .findOne({ tokenHash: targetHash, status: { $ne: "cancelled" } });
  if (!doc) return null;
  return collections.quotes.schema.parse([stripMongoId(doc)])[0] ?? null;
}

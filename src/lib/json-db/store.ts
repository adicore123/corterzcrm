import { randomUUID } from "node:crypto";
import { cp, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors";
import { blobTransaction, listBlobBackups, readBlobBackup, readBlobCollection, usesBlobStorage, writeBlobBackup, writeBlobCollection } from "./blob-store";
import { usesMongoStorage } from "./mongo-client";
import { listMongoBackups, mongoTransaction, readMongoBackup, readMongoCollection, writeMongoBackup, writeMongoCollection } from "./mongo-store";
import { collections, initialCounters, type Collection, type Data } from "./collections";
import { defaultCatalogModels } from "./cortez-catalog";
const roots = globalThis as typeof globalThis & {
  cortezStore?: { queue: Promise<unknown>; initializations: Map<string, Promise<void>> };
};
const state = roots.cortezStore ??= { queue: Promise.resolve(), initializations: new Map() };

export function storageRoot() {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.CORTEZ_STORAGE_DIR || "storage");
  const publicPath = path.relative(path.resolve("public"), root);
  if (!publicPath || (!publicPath.startsWith(".." + path.sep) && publicPath !== ".." && !path.isAbsolute(publicPath))) {
    throw new Error("CORTEZ_STORAGE_DIR cannot point inside public.");
  }
  return root;
}

const collectionPath = (key: Collection) => path.join(storageRoot(), "data", collections[key].file);

export async function atomicWrite(file: string, content: string | Uint8Array) {
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    if (process.platform !== "win32") {
      // Flush the renamed directory entry on filesystems that support it.
      try {
        const directory = await open(path.dirname(file), "r");
        try { await directory.sync(); } finally { await directory.close(); }
      } catch (error) {
        console.warn("[cortez] Could not sync storage directory", path.dirname(file), error);
      }
    }
  } finally {
    await rm(temporary, { force: true }).catch((error) => console.warn("[cortez] Temporary file cleanup failed", error));
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function initialize(root: string) {
  await Promise.all(["data", "uploads/standards", "uploads/repairs", "uploads/models", "backups"]
    .map((directory) => mkdir(path.join(/* turbopackIgnore: true */ root, directory), { recursive: true, mode: 0o700 })));
  const keys = Object.keys(collections) as Collection[];
  const marker = path.join(root, "data", ".initialized");
  let alreadyInitialized = false;
  try {
    await readFile(marker);
    alreadyInitialized = true;
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  for (const key of keys) {
    const file = path.join(root, "data", collections[key].file);
    try {
      await readFile(file);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      if (alreadyInitialized && key === "counters") {
        console.error("[cortez] Counter file missing from initialized storage", file);
        throw new AppError(503, "קובץ המספור חסר. יש לשחזר אותו מגיבוי לפני המשך עבודה.");
      }
      const initialValue = key === "counters" ? initialCounters : key === "models" ? defaultCatalogModels : [];
      await atomicWrite(file, JSON.stringify(initialValue, null, 2) + "\n");
    }
  }
  if (!alreadyInitialized) await atomicWrite(marker, "1\n");
}

export function ensureStorage() {
  const root = storageRoot();
  let initializing = state.initializations.get(root);
  if (!initializing) {
    initializing = initialize(root).catch((error) => {
      state.initializations.delete(root);
      throw error;
    });
    state.initializations.set(root, initializing);
  }
  return initializing;
}

export function serialized<T>(work: () => Promise<T>): Promise<T> {
  if (usesMongoStorage()) return mongoTransaction(work);
  if (usesBlobStorage()) return blobTransaction(work);
  const next = state.queue.then(work);
  state.queue = next.catch(() => undefined);
  return next;
}

export async function readCollection<K extends Collection>(key: K): Promise<Data<K>> {
  if (usesMongoStorage()) return readMongoCollection(key);
  if (usesBlobStorage()) return readBlobCollection(key);
  await ensureStorage();
  try {
    const value: unknown = JSON.parse(await readFile(collectionPath(key), "utf8"));
    return collections[key].schema.parse(value) as Data<K>;
  } catch (error) {
    // Preserve the file for investigation. A read failure must never become an empty write.
    console.error("[cortez] Storage read failed", collections[key].file, error instanceof Error ? error.name : "UnknownError");
    throw new AppError(503, "לא ניתן לקרוא את נתוני המערכת. יש לבדוק את האחסון או לשחזר מגיבוי.");
  }
}

// Mutation callers retain the serialized lock throughout each read and write.
export async function writeCollection<K extends Collection>(key: K, value: Data<K>) {
  const validated = collections[key].schema.parse(value) as Data<K>;
  if (usesMongoStorage()) return writeMongoCollection(key, validated);
  if (usesBlobStorage()) return writeBlobCollection(key, validated);
  await ensureStorage();
  await atomicWrite(collectionPath(key), JSON.stringify(validated, null, 2) + "\n");
}

export async function reserveNumber(key: "standards" | "repairs") {
  const counters = await readCollection("counters");
  counters[key] += 1;
  await writeCollection("counters", counters);
  const sequence = String(counters[key]).padStart(4, "0");
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Jerusalem" }).format();
  return key === "standards" ? "CT-" + year + "-" + sequence : "REP-" + sequence;
}

export async function audit(actor: string, action: string, entity: string, entityId: string) {
  try {
    const events = await readCollection("activity");
    events.push({ id: randomUUID(), at: new Date().toISOString(), actor, action, entity, entityId });
    await writeCollection("activity", events.slice(-2000));
  } catch (error) {
    console.error("[cortez] Audit event failed", { actor, action, entity, entityId }, error);
  }
}

const backupName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;

export async function readBackup(id: string) {
  if (!backupName.test(id)) throw new AppError(404, "הגיבוי לא נמצא.");
  if (usesMongoStorage()) return readMongoBackup(id);
  if (usesBlobStorage()) return readBlobBackup(id);
  await ensureStorage();
  const directory = path.join(storageRoot(), "backups", id);
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as { id: string; timestamp: string };
    const keys = (Object.keys(collections) as Collection[]).filter((key) => key !== "sessions");
    const entries = await Promise.all(keys.map(async (key) => [
      key,
      collections[key].schema.parse(JSON.parse(await readFile(path.join(directory, "data", collections[key].file), "utf8"))),
    ] as const));
    return { id: manifest.id, timestamp: manifest.timestamp, state: { format: 1, ...Object.fromEntries(entries), sessions: [] } };
  } catch (error) {
    if (hasCode(error, "ENOENT")) throw new AppError(404, "הגיבוי לא נמצא.");
    throw error;
  }
}

export async function listBackups() {
  if (usesMongoStorage()) return listMongoBackups();
  if (usesBlobStorage()) return listBlobBackups();
  await ensureStorage();
  const entries = await readdir(path.join(storageRoot(), "backups"), { withFileTypes: true });
  return entries.filter((item) => item.isDirectory() && backupName.test(item.name))
    .map((item) => item.name).sort().reverse();
}

export async function createBackup() {
  const timestamp = new Date().toISOString();
  const id = timestamp.replace(/[.:]/g, "-") + "-" + randomUUID().slice(0, 8);
  if (usesMongoStorage()) {
    await writeMongoBackup(id, timestamp);
    return { id, timestamp };
  }
  if (usesBlobStorage()) {
    await writeBlobBackup(id, timestamp);
    return { id, timestamp };
  }
  await ensureStorage();
  const temporary = path.join(storageRoot(), "backups", "." + id);
  const keys = (Object.keys(collections) as Collection[]).filter((key) => key !== "sessions");
  try {
    await mkdir(path.join(temporary, "data"), { recursive: true, mode: 0o700 });
    for (const key of keys) {
      const value = await readCollection(key);
      await atomicWrite(path.join(temporary, "data", collections[key].file), JSON.stringify(value, null, 2) + "\n");
    }
    await atomicWrite(path.join(temporary, "data", ".initialized"), "1\n");
    await cp(path.join(storageRoot(), "uploads"), path.join(temporary, "uploads"), { recursive: true });
    await atomicWrite(path.join(temporary, "manifest.json"), JSON.stringify({ id, timestamp, version: 1 }) + "\n");
    await rename(temporary, path.join(storageRoot(), "backups", id));
    return { id, timestamp };
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch((error) => console.warn("[cortez] Backup cleanup failed", error));
  }
}

import { BlobError, BlobPreconditionFailedError, get, list, put } from "@vercel/blob";
import { cache } from "react";
import { z } from "zod";
import { AppError } from "../errors";
import { collections, initialCounters, type Collection, type Data } from "./collections";
import { defaultCatalogModels } from "./cortez-catalog";
import { createVersionedStore } from "./versioned";

export const stateSchema = z.object({
  format: z.literal(1),
  standards: collections.standards.schema,
  repairs: collections.repairs.schema,
  customers: collections.customers.schema,
  models: collections.models.schema.default(() => [...defaultCatalogModels]),
  faults: collections.faults.schema.default(() => []),
  users: collections.users.schema,
  counters: collections.counters.schema,
  activity: collections.activity.schema,
  sessions: collections.sessions.schema,
  settings: collections.settings.schema.default(() => ({})),
});
export type State = z.infer<typeof stateSchema>;

export const cloudPrefix = "cortez/v1/";
export const stateKey = cloudPrefix + "state.json";
const backupPrefix = cloudPrefix + "backups/";
const privateAccess = { access: "private" as const };
const jsonOptions = { ...privateAccess, contentType: "application/json", cacheControlMaxAge: 60 };

export function usesBlobStorage() {
  return process.env.VERCEL === "1" || ["blob", "mongo"].includes(process.env.CORTEZ_STORAGE_BACKEND || "");
}

function emptyState(): State {
  return {
    format: 1, standards: [], repairs: [], customers: [], models: [...defaultCatalogModels], faults: [], users: [], activity: [], sessions: [],
    counters: { ...initialCounters }, settings: {},
  };
}

async function readVersion() {
  // Blob returns a weak ETag for gzip responses, which cannot be used with If-Match.
  const stored = await get(stateKey, { ...privateAccess, useCache: false, headers: { "Accept-Encoding": "identity" } });
  if (!stored) return { value: emptyState(), version: null };
  if (stored.statusCode !== 200 || !stored.blob.etag || stored.blob.etag.startsWith("W/")) {
    throw new Error("Missing strong version on the private JSON snapshot.");
  }
  try {
    const value = stateSchema.parse(await new Response(stored.stream).json());
    return { value, version: stored.blob.etag };
  } catch (error) {
    console.error("[cortez] Could not validate the private JSON snapshot", error instanceof Error ? error.name : "UnknownError");
    throw new AppError(503, "לא ניתן לקרוא את נתוני המערכת. יש לפנות למנהל המערכת.");
  }
}

const readForRender = cache(readVersion);
const store = createVersionedStore({
  read: readVersion,
  async commit(value, version) {
    try {
      await put(stateKey, JSON.stringify(stateSchema.parse(value)), version
        ? { ...jsonOptions, allowOverwrite: true, ifMatch: version }
        : jsonOptions);
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      // A different request may have created the initial object with overwrites disabled.
      if (!version && error instanceof BlobError && (await readVersion()).version) return false;
      throw error;
    }
  },
});

export const blobTransaction = store.transaction;

export async function readBlobCollection<K extends Collection>(key: K): Promise<Data<K>> {
  const value = store.current() ?? (await readForRender()).value;
  return collections[key].schema.parse(value[key]) as Data<K>;
}

export async function writeBlobCollection<K extends Collection>(key: K, value: Data<K>) {
  const current = store.current();
  if (!current) throw new Error("A storage transaction is required.");
  store.replace({ ...current, [key]: value });
}

export async function listBlobBackups() {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: backupPrefix, cursor });
    ids.push(...page.blobs.map((blob) => blob.pathname.slice(backupPrefix.length, -5)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return ids.sort().reverse();
}

export async function writeBlobBackup(id: string, timestamp: string) {
  const { value } = await readVersion();
  await put(backupPrefix + id + ".json", JSON.stringify({ id, timestamp, state: { ...value, sessions: [] } }), jsonOptions);
}

export async function readBlobBackup(id: string) {
  const stored = await get(backupPrefix + id + ".json", { ...privateAccess, useCache: false });
  if (!stored || stored.statusCode !== 200) throw new AppError(404, "הגיבוי לא נמצא.");
  return await new Response(stored.stream).json() as unknown;
}

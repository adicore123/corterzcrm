import { AppError } from "../errors";
import { mongoDatabase, usesMongoStorage } from "../json-db/mongo-client";

type RateLimitDoc = {
  _id: string;
  count: number;
  expiresAt: Date;
};

type MemoryBucket = {
  count: number;
  until: number;
};

const rateGlobal = globalThis as typeof globalThis & {
  cortezRateBuckets?: Map<string, MemoryBucket>;
  cortezRateIndexPromise?: Promise<void>;
};

const memoryBuckets = (rateGlobal.cortezRateBuckets ??= new Map());

async function ensureMongoRateIndex() {
  if (!rateGlobal.cortezRateIndexPromise) {
    rateGlobal.cortezRateIndexPromise = (async () => {
      const db = await mongoDatabase();
      await db
        .collection<RateLimitDoc>("rate_limits")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    })().catch((err) => {
      rateGlobal.cortezRateIndexPromise = undefined;
      throw err;
    });
  }
  return rateGlobal.cortezRateIndexPromise;
}

function pruneMemory(now: number) {
  if (memoryBuckets.size < 500) return;
  for (const [k, v] of memoryBuckets) {
    if (v.until <= now) memoryBuckets.delete(k);
  }
}

export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowMs: number,
  message = "בוצעו יותר מדי ניסיונות. יש להמתין מספר דקות ולנסות שוב.",
): Promise<void> {
  const now = Date.now();
  if (usesMongoStorage()) {
    try {
      await ensureMongoRateIndex();
      const db = await mongoDatabase();
      const col = db.collection<RateLimitDoc>("rate_limits");
      const doc = await col.findOne({ _id: bucketKey });
      if (doc && doc.expiresAt.getTime() > now && doc.count >= maxAttempts) {
        throw new AppError(429, message);
      }
      return;
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Fall back to memory check if DB is momentarily unreachable
    }
  }

  pruneMemory(now);
  const entry = memoryBuckets.get(bucketKey);
  if (entry && entry.until > now && entry.count >= maxAttempts) {
    throw new AppError(429, message);
  }
}

export async function recordRateAttempt(bucketKey: string, windowMs: number): Promise<number> {
  const now = Date.now();
  if (usesMongoStorage()) {
    try {
      await ensureMongoRateIndex();
      const db = await mongoDatabase();
      const col = db.collection<RateLimitDoc>("rate_limits");
      const nowDate = new Date(now);
      const nextExpiry = new Date(now + windowMs);

      await col.deleteOne({ _id: bucketKey, expiresAt: { $lte: nowDate } });
      const res = await col.findOneAndUpdate(
        { _id: bucketKey },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: nextExpiry },
        },
        { upsert: true, returnDocument: "after" },
      );
      return res?.count ?? 1;
    } catch {
      // Fall through to memory counter
    }
  }

  pruneMemory(now);
  const existing = memoryBuckets.get(bucketKey);
  if (!existing || existing.until <= now) {
    memoryBuckets.set(bucketKey, { count: 1, until: now + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export async function consumeRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowMs: number,
  message = "בוצעו יותר מדי פניות בזמן קצר. יש להמתין ולנסות שוב.",
): Promise<void> {
  await checkRateLimit(bucketKey, maxAttempts, windowMs, message);
  const count = await recordRateAttempt(bucketKey, windowMs);
  if (count > maxAttempts) {
    throw new AppError(429, message);
  }
}

export async function clearRateLimit(bucketKey: string): Promise<void> {
  memoryBuckets.delete(bucketKey);
  if (usesMongoStorage()) {
    try {
      const db = await mongoDatabase();
      await db.collection<RateLimitDoc>("rate_limits").deleteOne({ _id: bucketKey });
    } catch {
      // Ignore cleanup errors
    }
  }
}

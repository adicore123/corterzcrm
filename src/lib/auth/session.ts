import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { AppError } from "../errors";
import { usesMongoStorage } from "../json-db/mongo-client";
import {
  hasMongoUsers,
  insertMongoSession,
  readMongoDocById,
  readMongoUserByUsername,
} from "../json-db/mongo-store";
import { audit, readCollection, serialized, writeCollection } from "../json-db/store";
import {
  deletePasswordSchema,
  ordersPhoneSchema,
  passwordSchema,
  pickupAddressSchema,
  userInput,
  usernameSchema,
  type PublicUser,
  type User,
} from "../validation/models";
import { checkRateLimit, clearRateLimit, recordRateAttempt } from "./rate-limit";

const derive = promisify(scrypt);
const ttl = 12 * 60 * 60 * 1000;
const slidingThresholdMs = 6 * 60 * 60 * 1000;
export const sessionCookie = "cortez_session";
export const DEFAULT_DELETE_PASSWORD = process.env.CORTEZ_DEFAULT_DELETE_PASSWORD?.trim() || "5522";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const dummyHash = "0".repeat(32) + ":" + "0".repeat(128);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + ((await derive(password, salt, 64)) as Buffer).toString("hex");
}

async function checkPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  const actual = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function verifyDeletePassword(candidate: string): Promise<boolean> {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const settings = await readCollection("settings");
  if (settings.deletePasswordHash) {
    return checkPassword(trimmed, settings.deletePasswordHash);
  }
  return timingSafeEqual(sha256(trimmed), sha256(DEFAULT_DELETE_PASSWORD));
}

export async function requireDeletePassword(candidate: unknown, rateScope = "default"): Promise<void> {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new AppError(400, "יש להזין סיסמת מחיקה.");
  }
  const bucketKey = `delpwd:${rateScope}`;
  await checkRateLimit(
    bucketKey,
    8,
    15 * 60_000,
    "בוצעו יותר מדי ניסיונות שגויים להזנת סיסמת מחיקה. יש להמתין מספר דקות.",
  );
  if (!(await verifyDeletePassword(candidate))) {
    await recordRateAttempt(bucketKey, 15 * 60_000);
    throw new AppError(403, "סיסמת המחיקה שגויה.");
  }
  await clearRateLimit(bucketKey);
}

export async function changeDeletePassword(
  currentPassword: string,
  newPassword: string,
  actor: PublicUser,
  clientIp = "local",
) {
  requireAdmin(actor);
  if (typeof currentPassword !== "string" || !currentPassword.trim()) {
    throw new AppError(400, "יש להזין את סיסמת המחיקה הנוכחית.");
  }
  const bucketKey = `delpwd:${actor.id}:${clientIp}`;
  await checkRateLimit(
    bucketKey,
    8,
    15 * 60_000,
    "בוצעו יותר מדי ניסיונות שגויים להזנת סיסמת מחיקה. יש להמתין מספר דקות.",
  );
  const validNew = deletePasswordSchema.parse(newPassword);
  const validCurrent = await verifyDeletePassword(currentPassword);
  if (!validCurrent) {
    await recordRateAttempt(bucketKey, 15 * 60_000);
    throw new AppError(400, "סיסמת המחיקה הנוכחית שגויה.");
  }
  await clearRateLimit(bucketKey);
  const deletePasswordHash = await hashPassword(validNew);
  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled && item.role === "admin",
    );
    if (!active) throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");
    const settings = await readCollection("settings");
    await writeCollection("settings", {
      ...settings,
      deletePasswordHash,
      updatedAt: new Date().toISOString(),
    });
    await audit(actor.id, "delete-password-change", "settings", "delete-password");
    return { ok: true };
  });
}

export async function updateBusinessSettings(
  pickupAddress: string,
  actor: PublicUser,
  ordersWhatsappPhone?: string,
) {
  requireAdmin(actor);
  const validPickupAddress = pickupAddressSchema.parse(pickupAddress);
  const validOrdersPhone =
    ordersWhatsappPhone !== undefined && ordersWhatsappPhone.trim()
      ? ordersPhoneSchema.parse(ordersWhatsappPhone)
      : undefined;
  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled && item.role === "admin",
    );
    if (!active) throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");
    const settings = await readCollection("settings");
    await writeCollection("settings", {
      ...settings,
      pickupAddress: validPickupAddress,
      ...(ordersWhatsappPhone !== undefined
        ? { ordersWhatsappPhone: validOrdersPhone }
        : {}),
      updatedAt: new Date().toISOString(),
    });
    await audit(actor.id, "business-settings-change", "settings", "business");
    return { ok: true };
  });
}

/**
 * Ensures a unique cryptographic agent invite token exists in settings (never falling back to
 * a public hardcoded repository constant).
 */
export async function ensureAgentInviteToken(): Promise<string> {
  const existing = await readCollection("settings");
  if (existing.agentInviteToken) return existing.agentInviteToken;
  const envSeed = process.env.CORTEZ_AGENT_INVITE_CODE?.trim();
  const generated =
    envSeed && /^[a-zA-Z0-9_-]{6,64}$/.test(envSeed)
      ? envSeed
      : randomBytes(12).toString("base64url");
  return serialized(async () => {
    const current = await readCollection("settings");
    if (current.agentInviteToken) return current.agentInviteToken;
    await writeCollection("settings", {
      ...current,
      agentInviteToken: generated,
      updatedAt: new Date().toISOString(),
    });
    return generated;
  });
}

export async function rotateAgentInviteToken(actor: PublicUser) {
  requireAdmin(actor);
  const nextToken = randomBytes(12).toString("base64url");
  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled && item.role === "admin",
    );
    if (!active) throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");
    const settings = await readCollection("settings");
    await writeCollection("settings", {
      ...settings,
      agentInviteToken: nextToken,
      updatedAt: new Date().toISOString(),
    });
    await audit(actor.id, "agent-invite-rotate", "settings", "agent-invite");
    return { token: nextToken };
  });
}

const agentRegistrationSchema = z.object({
  name: userInput.shape.name,
  username: usernameSchema,
  password: passwordSchema,
  code: z.string().trim().min(1, "קוד ההרשמה חסר.").max(64),
});

export async function registerAgent(value: unknown, clientIp = "local") {
  const input = agentRegistrationSchema.parse(value);
  await checkLoginLimit(input.username, clientIp);
  await checkRateLimit(
    `register:ip:${clientIp}`,
    10,
    15 * 60_000,
    "בוצעו יותר מדי ניסיונות הרשמה. יש להמתין מספר דקות.",
  );

  const settings = await readCollection("settings");
  const expectedCode = settings.agentInviteToken ?? process.env.CORTEZ_AGENT_INVITE_CODE?.trim();
  const codeMatches =
    Boolean(expectedCode) && timingSafeEqual(sha256(input.code), sha256(expectedCode!));

  if (!codeMatches) {
    await recordFailedLogin(input.username, clientIp);
    await recordRateAttempt(`register:ip:${clientIp}`, 15 * 60_000);
    throw new AppError(
      403,
      "קישור ההרשמה לסוכן אינו תקף או שהוחלף. בקשו קישור עדכני ממנהל המערכת.",
    );
  }
  await createUser({
    name: input.name,
    username: input.username,
    password: input.password,
    role: "agent",
  });
  return login(input.username, input.password, clientIp);
}

export function publicUser(user: User): PublicUser {
  const { id, name, username, role, disabled, createdAt, updatedAt } = user;
  return { id, name, username, role, disabled, createdAt, updatedAt };
}

async function checkLoginLimit(username: string, clientIp = "local") {
  const msg = "בוצעו יותר מדי ניסיונות כניסה. יש לנסות שוב מאוחר יותר.";
  await Promise.all([
    checkRateLimit("login:global", 90, 60_000, msg),
    checkRateLimit(`login:ip:${clientIp}`, 30, 5 * 60_000, msg),
    checkRateLimit(`login:account:${username}`, 10, 10 * 60_000, msg),
  ]);
}

async function recordFailedLogin(username: string, clientIp = "local") {
  await Promise.all([
    recordRateAttempt("login:global", 60_000),
    recordRateAttempt(`login:ip:${clientIp}`, 5 * 60_000),
    recordRateAttempt(`login:account:${username}`, 10 * 60_000),
  ]);
}

export async function hasAnyUsers(): Promise<boolean> {
  const scopeKey = storageScopeKey();
  if (hasUsersScopes.has(scopeKey)) return true;
  const exists = usesMongoStorage()
    ? await hasMongoUsers()
    : (await readCollection("users")).length > 0;
  if (exists) hasUsersScopes.add(scopeKey);
  return exists;
}

export async function login(username: string, password: string, clientIp = "local") {
  await checkLoginLimit(username, clientIp);
  const user = usesMongoStorage()
    ? await readMongoUserByUsername(username)
    : (await readCollection("users")).find((item) => item.username === username);
  const valid = await checkPassword(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user || user.disabled) {
    await recordFailedLogin(username, clientIp);
    if (user && !valid) {
      await serialized(() => audit(user.id, "login-failed", "users", user.id), "auth").catch(
        () => undefined,
      );
    }
    throw new AppError(401, "שם המשתמש או הסיסמה שגויים.");
  }

  if (usesMongoStorage()) {
    const token = randomBytes(32).toString("hex");
    const hash = tokenHash(token);
    const expires = Date.now() + ttl;
    await insertMongoSession({ hash, userId: user.id, expires });
    await Promise.all([
      clearRateLimit(`login:account:${username}`),
      audit(user.id, "login", "users", user.id),
    ]);
    const pub = publicUser(user);
    const scopeKey = storageScopeKey();
    hasUsersScopes.add(scopeKey);
    sessionCache.set(hash, {
      user: pub,
      userId: pub.id,
      sessionExpires: expires,
      cachedUntil: Date.now() + SESSION_CACHE_TTL_MS,
      storageKey: scopeKey,
    });
    return { token, expires };
  }

  return serialized(async () => {
    const current = (await readCollection("users")).find((item) => item.id === user.id);
    if (!current || current.disabled || current.passwordHash !== user.passwordHash) {
      throw new AppError(401, "שם המשתמש או הסיסמה שגויים.");
    }
    const token = randomBytes(32).toString("hex");
    const hash = tokenHash(token);
    const expires = Date.now() + ttl;
    const sessions = (await readCollection("sessions")).filter((item) => item.expires > Date.now());
    await writeCollection("sessions", [
      ...sessions,
      { hash, userId: user.id, expires },
    ]);
    await clearRateLimit(`login:account:${username}`);
    await audit(user.id, "login", "users", user.id);
    const pub = publicUser(current);
    const scopeKey = storageScopeKey();
    hasUsersScopes.add(scopeKey);
    sessionCache.set(hash, {
      user: pub,
      userId: pub.id,
      sessionExpires: expires,
      cachedUntil: Date.now() + SESSION_CACHE_TTL_MS,
      storageKey: scopeKey,
    });
    return { token, expires };
  }, "auth");
}

const SESSION_CACHE_TTL_MS = 10_000;
const SESSION_CACHE_MAX = 500;

type CachedSessionEntry = {
  user: PublicUser;
  userId: string;
  sessionExpires: number;
  cachedUntil: number;
  storageKey: string;
};

const sessionCacheGlobal = globalThis as typeof globalThis & {
  cortezSessionCache?: Map<string, CachedSessionEntry>;
  cortezHasUsersScopes?: Set<string>;
};
const sessionCache = (sessionCacheGlobal.cortezSessionCache ??= new Map());
const hasUsersScopes = (sessionCacheGlobal.cortezHasUsersScopes ??= new Set());

function storageScopeKey(): string {
  return `${process.env.CORTEZ_STORAGE_BACKEND ?? ""}|${process.env.CORTEZ_STORAGE_DIR ?? ""}|${process.env.MONGODB_DB ?? ""}|${process.env.VERCEL_BLOB_API_URL ?? ""}`;
}

export function invalidateSessionCache(opts?: { tokenHash?: string; userId?: string; clearAll?: boolean }) {
  if (!opts || opts.clearAll) {
    sessionCache.clear();
    return;
  }
  if (opts.tokenHash) {
    sessionCache.delete(opts.tokenHash);
  }
  if (opts.userId) {
    for (const [k, entry] of sessionCache) {
      if (entry.userId === opts.userId) {
        sessionCache.delete(k);
      }
    }
  }
}

export async function getUser(token?: string): Promise<PublicUser | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenHash(token);
  const now = Date.now();
  const scopeKey = storageScopeKey();

  const cached = sessionCache.get(hash);
  if (cached && cached.storageKey === scopeKey && cached.cachedUntil > now && cached.sessionExpires > now) {
    return cached.user;
  }

  let session: { hash: string; userId: string; expires: number } | undefined;
  let user: User | undefined;

  if (usesMongoStorage()) {
    const sDoc = await readMongoDocById("sessions", hash);
    if (!sDoc || sDoc.expires <= now) {
      sessionCache.delete(hash);
      return null;
    }
    session = sDoc;
    const uDoc = await readMongoDocById("users", session.userId);
    if (!uDoc || uDoc.disabled) {
      sessionCache.delete(hash);
      return null;
    }
    user = uDoc;
  } else {
    const [sessions, users] = await Promise.all([
      readCollection("sessions"),
      readCollection("users"),
    ]);
    session = sessions.find((item) => item.hash === hash && item.expires > now);
    if (!session) {
      sessionCache.delete(hash);
      return null;
    }
    user = users.find((item) => item.id === session!.userId && !item.disabled);
    if (!user) {
      sessionCache.delete(hash);
      return null;
    }
  }

  // Sliding session renewal when less than half of session TTL remains
  if (session.expires - now < slidingThresholdMs) {
    const nextExpires = now + ttl;
    void serialized(async () => {
      const currentSessions = await readCollection("sessions");
      const target = currentSessions.find((s) => s.hash === hash && s.expires > Date.now());
      if (!target || target.expires - Date.now() >= slidingThresholdMs) return;
      await writeCollection(
        "sessions",
        currentSessions
          .filter((s) => s.expires > Date.now())
          .map((s) => (s.hash === hash ? { ...s, expires: nextExpires } : s)),
      );
    }).catch(() => undefined);
  }

  const pub = publicUser(user);
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldestKey = sessionCache.keys().next().value;
    if (oldestKey) sessionCache.delete(oldestKey);
  }
  sessionCache.set(hash, {
    user: pub,
    userId: pub.id,
    sessionExpires: session.expires,
    cachedUntil: now + SESSION_CACHE_TTL_MS,
    storageKey: scopeKey,
  });
  return pub;
}

export async function logout(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const hash = tokenHash(token);
  invalidateSessionCache({ tokenHash: hash });
  return serialized(async () => {
    const sessions = await readCollection("sessions");
    const session = sessions.find((item) => item.hash === hash);
    if (!session) return;
    await writeCollection(
      "sessions",
      sessions.filter((item) => item.hash !== hash),
    );
    await audit(session.userId, "logout", "users", session.userId);
  });
}

export function requireAdmin(user: PublicUser) {
  if (user.role !== "admin") throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");
}

export async function createUser(value: unknown, actor?: PublicUser) {
  if (actor) requireAdmin(actor);
  const { password, ...input } = userInput.parse(value);
  const passwordHash = await hashPassword(password);
  return serialized(async () => {
    const users = await readCollection("users");
    if (users.some((user) => user.username === input.username)) {
      throw new AppError(409, "שם המשתמש כבר קיים.");
    }
    const now = new Date().toISOString();
    const user = {
      ...input,
      id: randomUUID(),
      passwordHash,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await writeCollection("users", [...users, user]);
    hasUsersScopes.add(storageScopeKey());
    await audit(actor?.id ?? user.id, "create", "users", user.id);
    return publicUser(user);
  }, "auth");
}

export async function setUserDisabled(id: string, disabled: boolean, actor: PublicUser) {
  requireAdmin(actor);
  if (id === actor.id) throw new AppError(400, "אין אפשרות להשבית את החשבון שלך.");
  return serialized(async () => {
    const users = await readCollection("users");
    const user = users.find((item) => item.id === id);
    if (!user) throw new AppError(404, "המשתמש לא נמצא.");
    if (disabled) {
      const sessions = await readCollection("sessions");
      await writeCollection(
        "sessions",
        sessions.filter((item) => item.userId !== id),
      );
    }
    const updated = { ...user, disabled, updatedAt: new Date().toISOString() };
    await writeCollection(
      "users",
      users.map((item) => (item.id === id ? updated : item)),
    );
    invalidateSessionCache({ userId: id });
    await audit(actor.id, disabled ? "disable" : "enable", "users", id);
    return publicUser(updated);
  });
}

export async function resetUserPassword(id: string, password: string, actor: PublicUser) {
  requireAdmin(actor);
  const validPassword = passwordSchema.parse(password);
  const passwordHash = await hashPassword(validPassword);
  return serialized(async () => {
    const users = await readCollection("users");
    const user = users.find((item) => item.id === id);
    if (!user) throw new AppError(404, "המשתמש לא נמצא.");
    if (id !== actor.id) {
      const sessions = await readCollection("sessions");
      await writeCollection(
        "sessions",
        sessions.filter((item) => item.userId !== id),
      );
    }
    await clearRateLimit(`login:account:${user.username}`);
    const updated = { ...user, passwordHash, updatedAt: new Date().toISOString() };
    await writeCollection(
      "users",
      users.map((item) => (item.id === id ? updated : item)),
    );
    if (id !== actor.id) {
      invalidateSessionCache({ userId: id });
    }
    await audit(actor.id, "password-reset", "users", id);
    return publicUser(updated);
  });
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentToken?: string,
) {
  const validNew = passwordSchema.parse(newPassword);
  const user = (await readCollection("users")).find((item) => item.id === userId && !item.disabled);
  const validCurrent = await checkPassword(currentPassword, user?.passwordHash ?? dummyHash);
  if (!validCurrent || !user) {
    throw new AppError(400, "הסיסמה הנוכחית שגויה.");
  }
  const passwordHash = await hashPassword(validNew);
  const keepHash =
    currentToken && /^[a-f0-9]{64}$/.test(currentToken) ? tokenHash(currentToken) : null;
  return serialized(async () => {
    const users = await readCollection("users");
    const current = users.find((item) => item.id === userId && !item.disabled);
    if (!current) throw new AppError(401, "יש להיכנס למערכת.");
    const sessions = await readCollection("sessions");
    await writeCollection(
      "sessions",
      sessions.filter((item) => item.userId !== userId || item.hash === keepHash),
    );
    const updated = { ...current, passwordHash, updatedAt: new Date().toISOString() };
    await writeCollection(
      "users",
      users.map((item) => (item.id === userId ? updated : item)),
    );
    invalidateSessionCache({ userId });
    await audit(userId, "password-change", "users", userId);
    return publicUser(updated);
  });
}

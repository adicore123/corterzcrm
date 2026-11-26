import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { AppError } from "../errors";
import { audit, readCollection, serialized, writeCollection } from "../json-db/store";
import {
  deletePasswordSchema,
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

export async function updateBusinessSettings(pickupAddress: string, actor: PublicUser) {
  requireAdmin(actor);
  const validPickupAddress = pickupAddressSchema.parse(pickupAddress);
  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled && item.role === "admin",
    );
    if (!active) throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");
    const settings = await readCollection("settings");
    await writeCollection("settings", {
      ...settings,
      pickupAddress: validPickupAddress,
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

export async function login(username: string, password: string, clientIp = "local") {
  await checkLoginLimit(username, clientIp);
  const user = (await readCollection("users")).find((item) => item.username === username);
  const valid = await checkPassword(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user || user.disabled) {
    await recordFailedLogin(username, clientIp);
    if (user && !valid) {
      await serialized(() => audit(user.id, "login-failed", "users", user.id)).catch(
        () => undefined,
      );
    }
    throw new AppError(401, "שם המשתמש או הסיסמה שגויים.");
  }
  return serialized(async () => {
    const current = (await readCollection("users")).find((item) => item.id === user.id);
    if (!current || current.disabled || current.passwordHash !== user.passwordHash) {
      throw new AppError(401, "שם המשתמש או הסיסמה שגויים.");
    }
    const token = randomBytes(32).toString("hex");
    const expires = Date.now() + ttl;
    const sessions = (await readCollection("sessions")).filter((item) => item.expires > Date.now());
    await writeCollection("sessions", [
      ...sessions,
      { hash: tokenHash(token), userId: user.id, expires },
    ]);
    await clearRateLimit(`login:account:${username}`);
    await audit(user.id, "login", "users", user.id);
    return { token, expires };
  });
}

export async function getUser(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenHash(token);
  const now = Date.now();
  const sessions = await readCollection("sessions");
  const session = sessions.find((item) => item.hash === hash && item.expires > now);
  if (!session) return null;
  const user = (await readCollection("users")).find(
    (item) => item.id === session.userId && !item.disabled,
  );
  if (!user) return null;

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

  return publicUser(user);
}

export async function logout(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return serialized(async () => {
    const sessions = await readCollection("sessions");
    const hash = tokenHash(token);
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
    await audit(actor?.id ?? user.id, "create", "users", user.id);
    return publicUser(user);
  });
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
    await audit(userId, "password-change", "users", userId);
    return publicUser(updated);
  });
}

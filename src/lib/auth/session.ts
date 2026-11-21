import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { audit, readCollection, serialized, writeCollection } from "../json-db/store";
import { AppError } from "../errors";
import { passwordSchema, userInput, type PublicUser, type User } from "../validation/models";

const derive = promisify(scrypt);
const ttl = 12 * 60 * 60 * 1000;
export const sessionCookie = "cortez_session";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const dummyHash = "0".repeat(32) + ":" + "0".repeat(128);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(password, salt, 64) as Buffer).toString("hex");
}

async function checkPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  const actual = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export function publicUser(user: User): PublicUser {
  const { id, name, username, role, disabled, createdAt, updatedAt } = user;
  return { id, name, username, role, disabled, createdAt, updatedAt };
}

const authGlobal = globalThis as typeof globalThis & {
  cortezAttempts?: Map<string, { count: number; until: number }>;
};
const attempts = authGlobal.cortezAttempts ??= new Map();

function checkLoginLimit(username: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const globalEntry = attempts.get("global");
  const accountEntry = attempts.get("account:" + username);
  if ((globalEntry && globalEntry.count >= 90) || (accountEntry && accountEntry.count >= 10)) {
    throw new AppError(429, "בוצעו יותר מדי ניסיונות כניסה. יש לנסות שוב מאוחר יותר.");
  }
}

function recordFailedLogin(username: string) {
  const now = Date.now();
  function bump(key: string, window: number) {
    const entry = attempts.get(key) ?? { count: 0, until: now + window };
    entry.count += 1;
    attempts.set(key, entry);
  }
  bump("global", 60_000);
  bump("account:" + username, 10 * 60_000);
}

export async function login(username: string, password: string) {
  checkLoginLimit(username);
  const user = (await readCollection("users")).find((item) => item.username === username);
  const valid = await checkPassword(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user || user.disabled) {
    recordFailedLogin(username);
    if (user && !valid) {
      await serialized(() => audit(user.id, "login-failed", "users", user.id)).catch(() => undefined);
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
    await writeCollection("sessions", [...sessions, { hash: tokenHash(token), userId: user.id, expires }]);
    attempts.delete("account:" + username);
    await audit(user.id, "login", "users", user.id);
    return { token, expires };
  });
}

export async function getUser(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenHash(token);
  const sessions = await readCollection("sessions");
  const session = sessions.find((item) => item.hash === hash && item.expires > Date.now());
  if (!session) return null;
  const user = (await readCollection("users")).find((item) => item.id === session.userId && !item.disabled);
  return user ? publicUser(user) : null;
}

export async function logout(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return serialized(async () => {
    const sessions = await readCollection("sessions");
    const hash = tokenHash(token);
    const session = sessions.find((item) => item.hash === hash);
    if (!session) return;
    await writeCollection("sessions", sessions.filter((item) => item.hash !== hash));
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
    const user = { ...input, id: randomUUID(), passwordHash, disabled: false, createdAt: now, updatedAt: now };
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
    // Revoke tokens before a later reactivation can make them usable again.
    if (disabled) {
      const sessions = await readCollection("sessions");
      await writeCollection("sessions", sessions.filter((item) => item.userId !== id));
    }
    const updated = { ...user, disabled, updatedAt: new Date().toISOString() };
    await writeCollection("users", users.map((item) => item.id === id ? updated : item));
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
      await writeCollection("sessions", sessions.filter((item) => item.userId !== id));
    }
    attempts.delete("account:" + user.username);
    const updated = { ...user, passwordHash, updatedAt: new Date().toISOString() };
    await writeCollection("users", users.map((item) => item.id === id ? updated : item));
    await audit(actor.id, "password-reset", "users", id);
    return publicUser(updated);
  });
}

export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string, currentToken?: string) {
  const validNew = passwordSchema.parse(newPassword);
  const user = (await readCollection("users")).find((item) => item.id === userId && !item.disabled);
  const validCurrent = await checkPassword(currentPassword, user?.passwordHash ?? dummyHash);
  if (!validCurrent || !user) {
    throw new AppError(400, "הסיסמה הנוכחית שגויה.");
  }
  const passwordHash = await hashPassword(validNew);
  const keepHash = currentToken && /^[a-f0-9]{64}$/.test(currentToken) ? tokenHash(currentToken) : null;
  return serialized(async () => {
    const users = await readCollection("users");
    const current = users.find((item) => item.id === userId && !item.disabled);
    if (!current) throw new AppError(401, "יש להיכנס למערכת.");
    const sessions = await readCollection("sessions");
    await writeCollection("sessions", sessions.filter((item) => item.userId !== userId || item.hash === keepHash));
    const updated = { ...current, passwordHash, updatedAt: new Date().toISOString() };
    await writeCollection("users", users.map((item) => item.id === userId ? updated : item));
    await audit(userId, "password-change", "users", userId);
    return publicUser(updated);
  });
}

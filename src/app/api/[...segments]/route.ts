import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changeOwnPassword, createUser, getUser, login, logout, requireAdmin, resetUserPassword, sessionCookie, setUserDisabled } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { usesBlobStorage } from "@/lib/json-db/blob-store";
import { usesMongoStorage } from "@/lib/json-db/mongo-client";
import { deleteRecord, getRecord, saveRecord } from "@/lib/json-db/records";
import { audit, createBackup, readBackup, serialized } from "@/lib/json-db/store";
import { maxImageBytes, maxPhotos, readPhoto } from "@/lib/uploads/images";
import { authorizeUpload, readBlobPhoto } from "@/lib/uploads/blob-images";
import { readMongoPhoto } from "@/lib/uploads/mongo-images";
import { modules, passwordSchema, usernameSchema, uuid } from "@/lib/validation/models";

export const runtime = "nodejs";
export const maxDuration = 60;
type Route = { params: Promise<{ segments: string[] }> };
const privateHeaders = { "Cache-Control": "private, no-store" };
const validModule = z.enum(modules);
const photoModule = z.enum(["standards", "repairs", "models"]);

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: privateHeaders });
}

function errorResponse(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const message = issue?.code === "invalid_value" || issue?.code === "invalid_type"
      ? "אחד השדות חסר או מכיל ערך לא תקין." : issue?.message;
    return json({ error: message ?? "הנתונים שנשלחו אינם תקינים." }, 400);
  }
  console.error("[cortez] API request failed", error);
  return json({ error: "אירעה שגיאה בשרת. יש לנסות שוב או לפנות למנהל המערכת." }, 500);
}

function verifyOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol;
  const expected = new URL(process.env.CORTEZ_ORIGIN || protocol + "//" + host).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError(403, "מקור הבקשה אינו מורשה.");
  }
  return expected;
}

async function requireUser(request: NextRequest) {
  const user = await getUser(request.cookies.get(sessionCookie)?.value);
  if (!user) throw new AppError(401, "יש להיכנס למערכת.");
  return user;
}

async function limitedBody(request: NextRequest, limit: number) {
  const fail = () => new AppError(413, "הבקשה גדולה מדי. יש להקטין את התמונות ולנסות שוב.");
  if (Number(request.headers.get("content-length")) > limit) throw fail();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw fail();
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function parseBody(request: NextRequest, allowFiles = false) {
  const type = request.headers.get("content-type") ?? "";
  const multipart = allowFiles && type.toLowerCase().startsWith("multipart/form-data;");
  if (!multipart && !/^application\/json(?:;|$)/i.test(type)) {
    throw new AppError(415, "פורמט הבקשה אינו נתמך.");
  }
  const bytes = await limitedBody(request, multipart ? maxPhotos * maxImageBytes + 256 * 1024 : 256 * 1024);
  try {
    if (multipart) {
      const data = await new Response(bytes, { headers: { "Content-Type": type } }).formData();
      const payload = data.get("payload");
      const photos = data.getAll("photos");
      if (typeof payload !== "string" || payload.length > 256 * 1024 || photos.length > maxPhotos
        || photos.some((entry) => typeof entry === "string")) throw new Error("Invalid payload");
      return { value: JSON.parse(payload) as unknown, files: photos as File[] };
    }
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown, files: [] as File[] };
  } catch {
    throw new AppError(400, "לא ניתן לקרוא את הנתונים שנשלחו.");
  }
}

async function fetchCatalogImage(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, "כתובת התמונה אינה מורשית.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "cortez.co.il" || !parsed.pathname.startsWith("/wp-content/uploads/")) {
    throw new AppError(400, "כתובת התמונה אינה מורשית.");
  }
  let response = await fetch(parsed.toString(), { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new AppError(404, "התמונה לא נמצאה.");
    const redirected = new URL(location, parsed);
    if (redirected.protocol !== "https:" || redirected.hostname !== "cortez.co.il" || !redirected.pathname.startsWith("/wp-content/uploads/")) {
      throw new AppError(400, "כתובת התמונה אינה מורשית.");
    }
    response = await fetch(redirected.toString(), { redirect: "manual" });
  }
  if (!response.ok) throw new AppError(404, "התמונה לא נמצאה.");
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new AppError(400, "הקובץ אינו תמונה תקינה.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new AppError(400, "גודל התמונה אינו תקין.");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest, { params }: Route) {
  try {
    const [resource, module, id, photo, ...extra] = (await params).segments;
    if (resource === "catalog-image" && !module) {
      const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
      return await fetchCatalogImage(rawUrl);
    }
    if (resource === "settings" && module === "backups" && id && !photo && !extra.length) {
      const user = await requireUser(request);
      requireAdmin(user);
      const backup = await readBackup(id);
      return new NextResponse(JSON.stringify(backup, null, 2) + "\n", {
        headers: {
          ...privateHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="cortez-backup-${id}.json"`,
        },
      });
    }
    if (resource !== "images" || !photo || extra.length) throw new AppError(404, "הנתיב לא נמצא.");
    const kind = photoModule.parse(module);
    if (kind !== "models") {
      await requireUser(request);
    }
    const record = await getRecord(kind, uuid.parse(id));
    if (kind === "models" && "published" in record && record.published === false) await requireUser(request);
    const image = record.photos.find((item) => item.id === uuid.parse(photo));
    if (!image) throw new AppError(404, "התמונה לא נמצאה.");
    const body = usesMongoStorage() ? await readMongoPhoto(kind, image.id)
      : usesBlobStorage() ? await readBlobPhoto(kind, image.id) : new Uint8Array(await readPhoto(kind, image.id));
    const cacheHeader = kind === "models" ? "no-store" : "private, max-age=31536000, immutable";
    return new NextResponse(body, { headers: { "Cache-Control": cacheHeader, "Content-Type": image.type } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function mutate(request: NextRequest, { params }: Route) {
  try {
    const origin = verifyOrigin(request);
    const { method } = request;
    const [resource, sub, id, ...extra] = (await params).segments;
    if (extra.length) throw new AppError(404, "הנתיב לא נמצא.");
    if (method === "POST" && resource === "auth" && !id) {
      if (sub === "login") {
        const { value } = await parseBody(request);
        const input = z.object({ username: usernameSchema, password: z.string().min(1, "יש להזין סיסמה.").max(128, "הסיסמה ארוכה מדי.") }).parse(value);
        const session = await login(input.username, input.password);
        const response = json({ ok: true });
        response.cookies.set(sessionCookie, session.token, {
          path: "/", httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", expires: new Date(session.expires),
        });
        return response;
      }
      if (sub === "logout") {
        await logout(request.cookies.get(sessionCookie)?.value);
        const response = json({ ok: true });
        response.cookies.delete(sessionCookie);
        return response;
      }
    }

    const user = await requireUser(request);
    if (method === "POST" && resource === "auth" && sub === "password" && !id) {
      const { value } = await parseBody(request);
      const input = z.object({
        currentPassword: z.string().min(1, "יש להזין את הסיסמה הנוכחית.").max(128),
        newPassword: passwordSchema,
      }).parse(value);
      return json(await changeOwnPassword(user.id, input.currentPassword, input.newPassword, request.cookies.get(sessionCookie)?.value));
    }
    if (resource === "uploads" && !id && method === "POST" && usesBlobStorage()) {
      const kind = photoModule.parse(sub);
      const { value } = await parseBody(request);
      const input = z.object({ id: uuid }).parse(value);
      return json(await authorizeUpload(kind, user.id, input.id), 201);
    }
    if (resource === "records" && sub) {
      const kind = validModule.parse(sub);
      const key = id ? uuid.parse(id) : undefined;
      if ((method === "POST" && !key) || (method === "PUT" && key)) {
        const { value, files } = await parseBody(request, kind !== "customers");
        return json(await saveRecord(kind, key, value, files, user), key ? 200 : 201);
      }
      if (method === "DELETE" && key) {
        requireAdmin(user);
        const { value } = await parseBody(request);
        const { version } = z.object({ version: z.iso.datetime() }).parse(value);
        await deleteRecord(kind, key, version, user);
        return json({ ok: true });
      }
    }
    if (resource === "settings" && !id) {
      requireAdmin(user);
      if (sub === "users" && method === "POST") return json(await createUser((await parseBody(request)).value, user), 201);
      if (sub === "users" && method === "PATCH") {
        const { value } = await parseBody(request);
        const input = z.union([
          z.object({ id: uuid, disabled: z.boolean() }),
          z.object({ id: uuid, password: passwordSchema }),
        ]).parse(value);
        if ("password" in input) return json(await resetUserPassword(input.id, input.password, user));
        return json(await setUserDisabled(input.id, input.disabled, user));
      }
      if (sub === "backups" && method === "POST") {
        if (usesBlobStorage()) {
          const backup = await createBackup();
          await serialized(() => audit(user.id, "backup", "storage", backup.id));
          return json(backup, 201);
        }
        return json(await serialized(async () => {
          const backup = await createBackup();
          await audit(user.id, "backup", "storage", backup.id);
          return backup;
        }), 201);
      }
    }
    throw new AppError(404, "הנתיב לא נמצא.");
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = mutate;
export const PUT = mutate;
export const PATCH = mutate;
export const DELETE = mutate;

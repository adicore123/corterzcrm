import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "../errors";
import { cloudPrefix, usesBlobStorage } from "../json-db/blob-store";
import { atomicWrite, ensureStorage, storageRoot } from "../json-db/store";
import { mapConcurrent } from "../utils";
import { uuid, type Attachment } from "../validation/models";

export const maxAttachments = 15;
export const maxFileBytes = 25 * 1024 * 1024;
export const maxVideoBytes = 100 * 1024 * 1024;

export const allowedFileMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
] as const;

export const allowedVideoMimeTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "application/octet-stream",
] as const;

const extToMime: Record<string, { type: string; kind: "file" | "video" }> = {
  ".pdf": { type: "application/pdf", kind: "file" },
  ".doc": { type: "application/msword", kind: "file" },
  ".docx": { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "file" },
  ".xls": { type: "application/vnd.ms-excel", kind: "file" },
  ".xlsx": { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  ".csv": { type: "text/csv", kind: "file" },
  ".txt": { type: "text/plain", kind: "file" },
  ".jpg": { type: "image/jpeg", kind: "file" },
  ".jpeg": { type: "image/jpeg", kind: "file" },
  ".png": { type: "image/png", kind: "file" },
  ".webp": { type: "image/webp", kind: "file" },
  ".heic": { type: "image/heic", kind: "file" },
  ".heif": { type: "image/heif", kind: "file" },
  ".mp4": { type: "video/mp4", kind: "video" },
  ".mov": { type: "video/quicktime", kind: "video" },
  ".webm": { type: "video/webm", kind: "video" },
  ".m4v": { type: "video/x-m4v", kind: "video" },
  ".3gp": { type: "video/3gpp", kind: "video" },
};

export const stagedAttachmentList = z.array(z.object({
  id: uuid,
  name: z.string().trim().min(1).max(255),
  kind: z.enum(["file", "video"]),
  type: z.string().trim().max(120).optional(),
})).max(maxAttachments)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "כל קובץ יכול להופיע פעם אחת.");

export type StagedAttachment = z.infer<typeof stagedAttachmentList>[number];

export function resolveAttachmentMime(name: string, rawType: string | undefined, kind: "file" | "video"): string {
  const clean = (rawType ?? "").split(";")[0].trim().toLowerCase();
  const allowed: readonly string[] = kind === "video" ? allowedVideoMimeTypes : allowedFileMimeTypes;
  if (clean && clean !== "application/octet-stream" && allowed.includes(clean)) {
    return clean;
  }
  const ext = path.extname(name.trim().toLowerCase());
  const mapped = extToMime[ext];
  if (mapped && mapped.kind === kind) return mapped.type;
  if (clean && allowed.includes(clean)) {
    return kind === "video" ? "video/mp4" : "application/octet-stream";
  }
  throw new AppError(400, kind === "video"
    ? "סוג הסרטון אינו נתמך. יש לבחור MP4, MOV או WebM (עד 100 מ״ב)."
    : "סוג הקובץ אינו נתמך. יש לבחור PDF, Word, Excel, CSV, TXT או תמונה (עד 25 מ״ב).");
}

function localAttachmentPath(id: string) {
  return path.join(storageRoot(), "uploads", "faults-files", uuid.parse(id));
}

function blobAttachmentPath(id: string) {
  return cloudPrefix + "attachments/faults/" + uuid.parse(id);
}

export async function authorizeAttachmentUpload(id: string, kind: "file" | "video") {
  const pathname = blobAttachmentPath(id);
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    maximumSizeInBytes: kind === "video" ? maxVideoBytes : maxFileBytes,
    allowedContentTypes: [...(kind === "video" ? allowedVideoMimeTypes : allowedFileMimeTypes)],
    validUntil: Date.now() + 30 * 60 * 1000,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return { id, pathname, token };
}

export async function authorizeAttachmentUploads(items: Array<{ id: string; kind: "file" | "video" }>) {
  return Promise.all(items.map((item) => authorizeAttachmentUpload(item.id, item.kind)));
}

export async function saveLocalAttachmentFile(id: string, file: File, kind: "file" | "video"): Promise<Attachment> {
  const limit = kind === "video" ? maxVideoBytes : maxFileBytes;
  if (!file.size || file.size > limit) {
    throw new AppError(400, kind === "video"
      ? "גודל הסרטון חורג מהמותר (עד 100 מ״ב)."
      : "גודל הקובץ חורג מהמותר (עד 25 מ״ב).");
  }
  const safeId = uuid.parse(id);
  const safeName = (file.name || (kind === "video" ? "video.mp4" : "file.pdf")).trim().slice(0, 255);
  const resolvedType = resolveAttachmentMime(safeName, file.type, kind);
  await ensureStorage();
  const bytes = Buffer.from(await file.arrayBuffer());
  await atomicWrite(localAttachmentPath(safeId), bytes);
  return { id: safeId, name: safeName, type: resolvedType, bytes: bytes.length, kind };
}

export async function verifyStagedAttachments(staged: StagedAttachment[]): Promise<Attachment[]> {
  if (!staged.length) return [];
  return mapConcurrent(staged, 4, async (item): Promise<Attachment> => {
    const limit = item.kind === "video" ? maxVideoBytes : maxFileBytes;
    if (usesBlobStorage()) {
      let meta;
      try {
        meta = await head(blobAttachmentPath(item.id));
      } catch {
        throw new AppError(400, "אחד הקבצים או הסרטונים לא הועלה בהצלחה. יש לנסות שוב.");
      }
      if (!meta || !meta.size || meta.size > limit) {
        throw new AppError(400, item.kind === "video"
          ? "גודל הסרטון חורג מהמותר (עד 100 מ״ב)."
          : "גודל הקובץ חורג מהמותר (עד 25 מ״ב).");
      }
      const resolvedType = resolveAttachmentMime(item.name, item.type || meta.contentType, item.kind);
      return { id: item.id, name: item.name, type: resolvedType, bytes: meta.size, kind: item.kind };
    }
    let info;
    try {
      info = await stat(localAttachmentPath(item.id));
    } catch {
      throw new AppError(400, "אחד הקבצים או הסרטונים לא הועלה בהצלחה. יש לנסות שוב.");
    }
    if (!info.size || info.size > limit) {
      throw new AppError(400, item.kind === "video"
        ? "גודל הסרטון חורג מהמותר (עד 100 מ״ב)."
        : "גודל הקובץ חורג מהמותר (עד 25 מ״ב).");
    }
    const resolvedType = resolveAttachmentMime(item.name, item.type, item.kind);
    return { id: item.id, name: item.name, type: resolvedType, bytes: info.size, kind: item.kind };
  });
}

export async function removeAttachments(attachments: Attachment[]) {
  if (!attachments.length) return;
  if (usesBlobStorage()) {
    await del(attachments.map((item) => blobAttachmentPath(item.id))).catch((error) => {
      console.warn("[cortez] Blob attachment cleanup failed", error);
    });
    return;
  }
  await Promise.all(attachments.map((item) => rm(localAttachmentPath(item.id), { force: true }).catch((error) => {
    console.warn("[cortez] Local attachment cleanup failed", item.id, error);
  })));
}

function contentDisposition(name: string, inline: boolean) {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(name);
  return `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function serveAttachmentResponse(attachment: Attachment, request: NextRequest, forceDownload: boolean) {
  const inline = !forceDownload && (
    attachment.kind === "video"
    || attachment.type === "application/pdf"
    || attachment.type.startsWith("image/")
    || attachment.type === "text/plain"
  );

  if (usesBlobStorage()) {
    const pathname = blobAttachmentPath(attachment.id);
    // For videos and large files on Vercel Blob, issue a short-lived private presigned URL so the browser streams
    // directly from CDN with full HTTP 206 Range scrubbing and no 4.5MB serverless response cap.
    if (attachment.kind === "video" || attachment.bytes > 3_500_000) {
      try {
        const validUntil = Date.now() + 10 * 60 * 1000;
        const signedToken = await issueSignedToken({
          pathname,
          operations: ["get"],
          validUntil,
        });
        const presigned = await presignUrl(signedToken, {
          operation: "get",
          pathname,
          access: "private",
          validUntil,
        });
        return NextResponse.redirect(presigned.presignedUrl, {
          status: 307,
          headers: { "Cache-Control": "private, no-store" },
        });
      } catch (error) {
        console.warn("[cortez] Presigned attachment URL failed, falling back to stream", error);
      }
    }
    const blob = await get(pathname, { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200) throw new AppError(404, "הקובץ לא נמצא.");
    return new NextResponse(blob.stream, {
      headers: {
        "Content-Type": attachment.type,
        "Content-Disposition": contentDisposition(attachment.name, inline),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const filePath = localAttachmentPath(attachment.id);
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new AppError(404, "הקובץ לא נמצא.");
  }
  const size = info.size;
  const baseHeaders: Record<string, string> = {
    "Content-Type": attachment.type,
    "Content-Disposition": contentDisposition(attachment.name, inline),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start <= end && end < size) {
        const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
        return new NextResponse(stream, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
  }
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

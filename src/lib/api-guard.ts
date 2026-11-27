import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";

export function getClientIp(request: NextRequest | Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "local";
}

export function verifySameOrigin(request: NextRequest): string {
  const originHeader = request.headers.get("origin");
  if (!originHeader || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError(403, "מקור הבקשה אינו מורשה.");
  }

  let actualOrigin: string;
  try {
    actualOrigin = new URL(originHeader).origin;
  } catch {
    throw new AppError(403, "מקור הבקשה אינו מורשה.");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    process.env.VERCEL === "1"
      ? "https:"
      : forwardedProto
        ? `${forwardedProto.replace(/:$/, "")}:`
        : request.nextUrl.protocol;

  const allowedOrigins = new Set<string>();
  if (process.env.CORTEZ_ORIGIN) {
    try {
      allowedOrigins.add(new URL(process.env.CORTEZ_ORIGIN).origin);
    } catch {
      // Ignore malformed env value
    }
  }

  const candidates = [
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    request.headers.get("host")?.trim(),
    request.nextUrl.host,
  ];
  for (const host of candidates) {
    if (!host) continue;
    try {
      allowedOrigins.add(new URL(`${protocol}//${host}`).origin);
    } catch {
      // Ignore malformed host header
    }
  }

  if (!allowedOrigins.has(actualOrigin)) {
    throw new AppError(403, "מקור הבקשה אינו מורשה.");
  }
  return actualOrigin;
}

export function safeApiErrorResponse(
  error: unknown,
  routeLabel: string,
  headers: Record<string, string> = { "Cache-Control": "private, no-store" },
) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const message =
      issue?.code === "invalid_value" || issue?.code === "invalid_type"
        ? "אחד השדות חסר או מכיל ערך לא תקין."
        : issue?.message;
    return NextResponse.json(
      { error: message ?? "הנתונים שנשלחו אינם תקינים." },
      { status: 400, headers },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "מבנה הבקשה (JSON) אינו תקין." }, { status: 400, headers });
  }

  const errorId = randomUUID().slice(0, 8);
  console.error(`[cortez][${routeLabel}][err:${errorId}] Unhandled API error`, {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "אירעה שגיאה בשרת. יש לנסות שוב או לפנות למנהל המערכת.", errorId },
    { status: 500, headers },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { createQuote } from "@/lib/quotes/service";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.CORTEZ_ORIGIN || `${process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "מקור הבקשה אינו תקין." }, { status: 403 });
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) return NextResponse.json({ error: "יש להיכנס למערכת." }, { status: 401 });
    const quote = await createQuote(await request.json(), user);
    return NextResponse.json(quote, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה בשמירת ההצעה" }, { status: error instanceof AppError ? error.status : 400 }); }
}

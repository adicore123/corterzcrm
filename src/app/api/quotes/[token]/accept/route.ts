import { NextRequest, NextResponse } from "next/server";
import { acceptQuote } from "@/lib/quotes/service";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.CORTEZ_ORIGIN || `${process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "מקור הבקשה אינו תקין." }, { status: 403 });
    return NextResponse.json(await acceptQuote((await params).token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה באישור ההצעה" }, { status: error instanceof AppError ? error.status : 400 }); }
}

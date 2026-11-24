import { NextRequest, NextResponse } from "next/server";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { cancelQuote } from "@/lib/quotes/service";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.CORTEZ_ORIGIN || `${process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`).origin;
    if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "מקור הבקשה אינו תקין.");
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    return NextResponse.json(await cancelQuote((await params).token, user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה בביטול ההצעה" }, { status: error instanceof AppError ? error.status : 400 }); }
}

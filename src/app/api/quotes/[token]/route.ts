import { NextRequest, NextResponse } from "next/server";
import { safeApiErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { cancelQuote } from "@/lib/quotes/service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    verifySameOrigin(request);
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    return NextResponse.json(await cancelQuote((await params).token, user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "quotes:cancel");
  }
}

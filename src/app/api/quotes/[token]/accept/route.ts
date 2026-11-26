import { NextRequest, NextResponse } from "next/server";
import { getClientIp, safeApiErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { acceptQuote } from "@/lib/quotes/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    verifySameOrigin(request);
    await consumeRateLimit(`quote-accept:${getClientIp(request)}`, 20, 5 * 60_000);
    return NextResponse.json(await acceptQuote((await params).token), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "quotes:accept", { "Cache-Control": "no-store" });
  }
}

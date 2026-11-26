import { NextRequest, NextResponse } from "next/server";
import { getClientIp, safeApiErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { createOrder } from "@/lib/orders/service";

export async function POST(request: NextRequest) {
  try {
    verifySameOrigin(request);
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    await consumeRateLimit(`order-create:${user.id}:${getClientIp(request)}`, 40, 5 * 60_000);
    const order = await createOrder(await request.json(), user);
    return NextResponse.json(order, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "orders:create");
  }
}

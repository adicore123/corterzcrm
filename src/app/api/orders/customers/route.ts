import { NextRequest, NextResponse } from "next/server";
import { getClientIp, safeApiErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { createCustomerFromOrderForm, listOrderCustomers } from "@/lib/orders/service";

export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    const customers = await listOrderCustomers();
    const options = customers.map((c) => {
      const inferredType =
        c.customerType
        ?? (c.store && c.store.trim() && c.store.trim() !== "פרטי" ? "store" : "private");
      return {
        id: c.id,
        name: c.name,
        store: inferredType === "store" ? c.store : "",
        phone: c.phone,
        customerType: inferredType,
      };
    });
    return NextResponse.json(options, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "orders:list-customers");
  }
}

export async function POST(request: NextRequest) {
  try {
    verifySameOrigin(request);
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    await consumeRateLimit(`order-customer:${user.id}:${getClientIp(request)}`, 40, 5 * 60_000);
    const customer = await createCustomerFromOrderForm(await request.json(), user);
    return NextResponse.json(customer, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "orders:create-customer");
  }
}

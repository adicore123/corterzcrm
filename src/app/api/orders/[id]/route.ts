import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, safeApiErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { deleteOrder, updateOrder } from "@/lib/orders/service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    verifySameOrigin(request);
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    const { id } = await params;
    const updated = await updateOrder(id, await request.json(), user);
    return NextResponse.json(updated, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "orders:update");
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    verifySameOrigin(request);
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    const { id } = await params;
    const body = z
      .object({
        deletePassword: z
          .string()
          .trim()
          .min(1, "יש להזין סיסמת מחיקה.")
          .max(64, "סיסמת המחיקה ארוכה מדי."),
      })
      .parse(await request.json());
    const result = await deleteOrder(
      id,
      body.deletePassword,
      user,
      `${user.id}:${getClientIp(request)}`,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeApiErrorResponse(error, "orders:delete");
  }
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin, requireDeletePassword } from "../auth/session";
import { AppError } from "../errors";
import { stripUndefined } from "../json-db/mongo-store";
import { catalogModels } from "../json-db/queries";
import {
  audit,
  readCollection,
  reserveNumber,
  serialized,
  writeCollection,
} from "../json-db/store";
import { uuid, type PublicUser } from "../validation/models";
import {
  orderCreateInputSchema,
  orderSchema,
  orderStatuses,
  type Order,
  type OrderItem,
} from "./schema";

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

export async function listOrdersForUser(actor: PublicUser): Promise<Order[]> {
  const all = await readCollection("orders");
  const visible =
    actor.role === "agent" ? all.filter((order) => order.createdBy === actor.id) : all;
  return [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createOrder(raw: unknown, actor: PublicUser): Promise<Order> {
  const input = orderCreateInputSchema.parse(raw);

  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (user) => user.id === actor.id && !user.disabled,
    );
    if (!active) throw new AppError(401, "יש להיכנס למערכת.");

    const models = await catalogModels();
    const modelsById = new Map(models.map((m) => [m.id, m]));

    const resolvedItems: OrderItem[] = input.items.map((rawItem) => {
      const model = modelsById.get(rawItem.modelId);
      if (!model) {
        throw new AppError(400, "אחד הדגמים שנבחרו להזמנה לא נמצא במאגר.");
      }
      const catalogMsrpAgorot =
        typeof model.msrp === "number" && model.msrp > 0
          ? Math.round(model.msrp * 100)
          : undefined;

      return stripUndefined({
        id: randomUUID(),
        modelId: model.id,
        modelName: model.name,
        device: model.device,
        color: rawItem.color?.trim() || undefined,
        quantity: rawItem.quantity,
        catalogMsrpAgorot,
        agreedUnitPriceAgorot: rawItem.agreedUnitPriceAgorot,
      });
    });

    const targetDigits = normalizePhoneDigits(input.customerPhone);
    const customers = await readCollection("customers");
    const matchedCustomer = targetDigits
      ? customers.find((c) => normalizePhoneDigits(c.phone) === targetDigits)
      : undefined;

    const now = new Date().toISOString();
    const number = await reserveNumber("orders");

    const order: Order = stripUndefined(
      orderSchema.parse({
        id: randomUUID(),
        number,
        createdBy: active.id,
        createdByName: active.name,
        customerId: matchedCustomer?.id,
        customerType: input.customerType,
        customerName: input.customerName,
        storeName: input.customerType === "store" ? input.storeName?.trim() : undefined,
        customerPhone: input.customerPhone,
        fulfillmentType: input.fulfillmentType,
        deliveryAddress:
          input.fulfillmentType === "delivery" ? input.deliveryAddress?.trim() : undefined,
        priority: input.priority,
        items: resolvedItems,
        notes: input.notes ?? "",
        sourceQuoteId: input.sourceQuoteId,
        status: "חדשה",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const existingOrders = await readCollection("orders");
    await writeCollection("orders", [...existingOrders, order]);
    await audit(active.id, "create", "orders", order.id);
    return order;
  });
}

const orderPatchSchema = z.object({
  status: z.enum(orderStatuses).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
});

export async function updateOrder(
  id: string,
  rawPatch: unknown,
  actor: PublicUser,
): Promise<Order> {
  const validId = uuid.parse(id);
  const patch = orderPatchSchema.parse(rawPatch);

  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (user) => user.id === actor.id && !user.disabled,
    );
    if (!active) throw new AppError(401, "יש להיכנס למערכת.");

    const orders = await readCollection("orders");
    const existing = orders.find((item) => item.id === validId);
    if (!existing) throw new AppError(404, "ההזמנה לא נמצאה.");

    if (active.role === "agent") {
      if (existing.createdBy !== active.id) {
        throw new AppError(403, "אין לך הרשאה לעדכן הזמנה זו.");
      }
      if (patch.internalNotes !== undefined || patch.status !== "בוטלה") {
        throw new AppError(403, "עדכון סטטוס הזמנה זמין לצוות המשרד בלבד.");
      }
      if (existing.status !== "חדשה") {
        throw new AppError(
          409,
          "ההזמנה כבר נמצאת בטיפול במשרד. לביטול או שינוי צרו קשר עם מורן.",
        );
      }
    }

    const now = new Date().toISOString();
    const updated: Order = stripUndefined({
      ...existing,
      status: patch.status ?? existing.status,
      internalNotes:
        active.role !== "agent" && patch.internalNotes !== undefined
          ? patch.internalNotes || undefined
          : existing.internalNotes,
      updatedAt: now,
    });

    await writeCollection(
      "orders",
      orders.map((item) => (item.id === validId ? updated : item)),
    );
    await audit(
      active.id,
      patch.status === "בוטלה" ? "cancel" : "update",
      "orders",
      validId,
    );
    return updated;
  });
}

export async function deleteOrder(
  id: string,
  deletePassword: unknown,
  actor: PublicUser,
  rateScope = "default",
): Promise<{ ok: true }> {
  requireAdmin(actor);
  const validId = uuid.parse(id);
  await requireDeletePassword(deletePassword, rateScope);

  return serialized(async () => {
    const active = (await readCollection("users")).find(
      (user) => user.id === actor.id && !user.disabled && user.role === "admin",
    );
    if (!active) throw new AppError(403, "פעולה זו זמינה למנהלי מערכת בלבד.");

    const orders = await readCollection("orders");
    const target = orders.find((item) => item.id === validId);
    if (!target) throw new AppError(404, "ההזמנה לא נמצאה.");

    await writeCollection(
      "orders",
      orders.filter((item) => item.id !== validId),
    );
    await audit(active.id, "delete", "orders", validId);
    return { ok: true };
  });
}

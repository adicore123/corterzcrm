import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin, requireDeletePassword } from "../auth/session";
import { AppError } from "../errors";
import { usesMongoStorage } from "../json-db/mongo-client";
import { readMongoDocById, readMongoOrdersForActor, stripUndefined } from "../json-db/mongo-store";
import { catalogModels } from "../json-db/queries";
import {
  audit,
  peekHotCollection,
  readCollection,
  reserveNumber,
  serialized,
  writeCollection,
} from "../json-db/store";
import { toCanonicalCustomerDigits } from "../phone";
import { customerSchema, uuid, type Customer, type PublicUser } from "../validation/models";
import {
  orderCreateInputSchema,
  orderInlineCustomerInputSchema,
  orderSchema,
  orderStatuses,
  type Order,
  type OrderItem,
} from "./schema";

export async function listOrdersForUser(actor: PublicUser): Promise<Order[]> {
  if (usesMongoStorage()) {
    const hot = peekHotCollection("orders");
    if (hot) {
      const visible =
        actor.role === "agent" ? hot.filter((order) => order.createdBy === actor.id) : hot;
      return [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (actor.role === "agent") {
      return readMongoOrdersForActor(actor.id, actor.role);
    }
  }
  const all = await readCollection("orders");
  const visible =
    actor.role === "agent" ? all.filter((order) => order.createdBy === actor.id) : all;
  return [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listOrderCustomers(): Promise<Customer[]> {
  const all = await readCollection("customers");
  return [...all].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

async function readActiveActor(userId: string) {
  if (usesMongoStorage()) {
    const doc = await readMongoDocById("users", userId);
    return doc && !doc.disabled ? doc : undefined;
  }
  return (await readCollection("users")).find((user) => user.id === userId && !user.disabled);
}

/**
 * Creates a new customer directly from the Orders module (permitted for agents, employees, and admins),
 * deduplicating cleanly if a customer with the same canonical phone already exists.
 */
export async function createCustomerFromOrderForm(
  raw: unknown,
  actor: PublicUser,
): Promise<Customer> {
  const input = orderInlineCustomerInputSchema.parse(raw);

  return serialized(async () => {
    const active = await readActiveActor(actor.id);
    if (!active) throw new AppError(401, "יש להיכנס למערכת.");

    const customers = await readCollection("customers");
    if (input.requestId) {
      const idempotent = customers.find((c) => c.id === input.requestId);
      if (idempotent) return idempotent;
    }

    const phoneKey = toCanonicalCustomerDigits(input.phone);
    if (phoneKey) {
      const existingByPhone = customers.find(
        (c) => toCanonicalCustomerDigits(c.phone) === phoneKey,
      );
      if (existingByPhone) {
        return existingByPhone;
      }
    }

    const now = new Date().toISOString();
    const record: Customer = stripUndefined(
      customerSchema.parse({
        id: input.requestId ?? randomUUID(),
        customerType: input.customerType,
        name: input.name.trim(),
        store: input.customerType === "store" ? input.store.trim() : "",
        phone: input.phone,
        createdBy: active.id,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await writeCollection("customers", [...customers, record]);
    await audit(active.id, "create", "customers", record.id);
    return record;
  }, "customers");
}

export async function createOrder(raw: unknown, actor: PublicUser): Promise<Order> {
  const input = orderCreateInputSchema.parse(raw);

  return serialized(async () => {
    const active = await readActiveActor(actor.id);
    if (!active) throw new AppError(401, "יש להיכנס למערכת.");

    const [models, directCustomer, allCustomers, existingOrders] = await Promise.all([
      catalogModels(),
      input.customerId && usesMongoStorage()
        ? readMongoDocById("customers", input.customerId)
        : Promise.resolve(null),
      input.customerId && usesMongoStorage()
        ? Promise.resolve([] as Customer[])
        : readCollection("customers"),
      readCollection("orders"),
    ]);
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

    let resolvedCustomerId: string | undefined;
    let resolvedCustomerType: "private" | "store";
    let resolvedCustomerName: string;
    let resolvedStoreName: string | undefined;
    let resolvedCustomerPhone: string;

    if (input.customerId) {
      const customerRecord =
        directCustomer ?? allCustomers.find((c) => c.id === input.customerId);
      if (!customerRecord) {
        throw new AppError(404, "הלקוח שנבחר לא נמצא במאגר הלקוחות.");
      }
      resolvedCustomerId = customerRecord.id;
      const inferredType =
        customerRecord.customerType
        ?? (customerRecord.store && customerRecord.store.trim() && customerRecord.store.trim() !== "פרטי"
          ? "store"
          : "private");
      resolvedCustomerType = inferredType;
      resolvedCustomerName = customerRecord.name;
      resolvedStoreName = inferredType === "store" ? customerRecord.store || undefined : undefined;
      resolvedCustomerPhone = customerRecord.phone;
    } else {
      const targetDigits = toCanonicalCustomerDigits(input.customerPhone);
      const matchedCustomer = targetDigits
        ? allCustomers.find((c) => toCanonicalCustomerDigits(c.phone) === targetDigits)
        : undefined;
      resolvedCustomerId = matchedCustomer?.id;
      resolvedCustomerType = input.customerType ?? "private";
      resolvedCustomerName = input.customerName!.trim();
      resolvedStoreName =
        resolvedCustomerType === "store" ? input.storeName?.trim() : undefined;
      resolvedCustomerPhone = input.customerPhone!;
    }

    const now = new Date().toISOString();
    const number = await reserveNumber("orders");

    const order: Order = stripUndefined(
      orderSchema.parse({
        id: randomUUID(),
        number,
        createdBy: active.id,
        createdByName: active.name,
        customerId: resolvedCustomerId,
        customerType: resolvedCustomerType,
        customerName: resolvedCustomerName,
        storeName: resolvedStoreName,
        customerPhone: resolvedCustomerPhone,
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

    await writeCollection("orders", [...existingOrders, order]);
    await audit(active.id, "create", "orders", order.id);
    return order;
  }, "orders");
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
    const active = await readActiveActor(actor.id);
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
  }, "orders");
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
  }, "orders");
}

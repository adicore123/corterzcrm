import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors";
import { readCollection, serialized, writeCollection, audit } from "../json-db/store";
import type { PublicUser } from "../validation/models";
import { quoteTotal } from "./pricing";
import { quoteSchema } from "./schema";

const inputSchema = quoteSchema.pick({ customerName: true, customerType: true, customerPhone: true, storeName: true, modelId: true,
  quantity: true, unitPriceAgorot: true, totalPriceAgorot: true, discount: true, vatMode: true, vatBasisPoints: true });
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createQuote(raw: unknown, actor: PublicUser) {
  const input = inputSchema.parse(raw);
  if (input.customerType === "store" && !input.storeName) throw new AppError(400, "יש להזין שם חנות.");
  try { quoteTotal(input); } catch (error) { throw new AppError(400, (error as Error).message); }
  return serialized(async () => {
    const active = (await readCollection("users")).find((user) => user.id === actor.id && !user.disabled);
    if (!active) throw new AppError(403, "אין הרשאה ליצור הצעה.");
    const model = (await readCollection("models")).find((item) => item.id === input.modelId);
    if (!model) throw new AppError(400, "הדגם לא נמצא במאגר.");
    const now = new Date().toISOString();
    const shareToken = randomBytes(24).toString("hex");
    const quote = quoteSchema.parse({ ...input, storeName: input.customerType === "store" ? input.storeName : undefined,
      id: randomUUID(), tokenHash: hash(shareToken), shareToken, modelName: model.name, createdBy: actor.id,
      status: "sent", createdAt: now, updatedAt: now });
    await writeCollection("quotes", [...await readCollection("quotes"), quote]);
    await audit(actor.id, "create", "quotes", quote.id);
    return quote;
  });
}

export async function quoteByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return (await readCollection("quotes")).find((quote) => quote.tokenHash === hash(token) && quote.status !== "cancelled") ?? null;
}

export async function acceptQuote(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new AppError(404, "ההצעה לא נמצאה.");
  return serialized(async () => {
    const quotes = await readCollection("quotes");
    const quote = quotes.find((item) => item.tokenHash === hash(token));
    if (!quote || quote.status === "cancelled") throw new AppError(404, "ההצעה לא נמצאה.");
    if (quote.status === "accepted") return { ok: true };
    const now = new Date().toISOString();
    await writeCollection("quotes", quotes.map((item) => item.id === quote.id ? { ...item, status: "accepted" as const, acceptedAt: now, updatedAt: now } : item));
    await audit(quote.createdBy, "accept", "quotes", quote.id);
    return { ok: true };
  });
}

export async function cancelQuote(id: string, actor: PublicUser) {
  const validId = z.uuid().parse(id);
  return serialized(async () => {
    const quotes = await readCollection("quotes");
    const quote = quotes.find((item) => item.id === validId);
    if (!quote) throw new AppError(404, "ההצעה לא נמצאה.");
    if (actor.role !== "admin" && actor.id !== quote.createdBy) throw new AppError(403, "אין הרשאה לבטל הצעה זו.");
    if (quote.status === "accepted") throw new AppError(409, "הצעה שאושרה אינה ניתנת לביטול.");
    await writeCollection("quotes", quotes.map((item) => item.id === validId ? { ...item, status: "cancelled" as const, updatedAt: new Date().toISOString() } : item));
    await audit(actor.id, "cancel", "quotes", validId);
    return { ok: true };
  });
}

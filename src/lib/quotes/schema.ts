import { z } from "zod";

const money = z.number().int().nonnegative().max(100_000_000_000);
const discount = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("amount"), agorot: money }),
  z.object({ type: z.literal("percent"), basisPoints: z.number().int().min(0).max(10000) }),
]);

export const quoteSchema = z.object({
  id: z.uuid(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  shareToken: z.string().regex(/^[a-f0-9]{48}$/),
  createdBy: z.uuid(),
  customerName: z.string().trim().min(1).max(120),
  storeName: z.string().trim().max(120).optional(),
  customerType: z.enum(["private", "store"]),
  customerPhone: z.string().trim().min(7).max(32),
  modelId: z.uuid(),
  modelName: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(100000),
  unitPriceAgorot: money,
  totalPriceAgorot: money.optional(),
  discount,
  vatMode: z.enum(["included", "excluded"]),
  vatBasisPoints: z.number().int().min(0).max(10000),
  status: z.enum(["draft", "sent", "accepted", "cancelled"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().optional(),
});

export type Quote = z.infer<typeof quoteSchema>;

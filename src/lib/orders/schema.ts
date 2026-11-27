import { z } from "zod";
import { isValidPhoneInput, sanitizePhoneInput } from "../phone";
import { devices, uuid } from "../validation/models";

export const orderStatuses = [
  "חדשה",
  "בטיפול",
  "מוכנה לאיסוף/משלוח",
  "סופקה",
  "בוטלה",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const DEFAULT_MORAN_WHATSAPP_DISPLAY = "+972 52-611-1443";
export const DEFAULT_MORAN_WHATSAPP_NUMBER = "972526111443";

const moneyAgorot = z.number().int().nonnegative().max(100_000_000_000);

export const orderItemSchema = z.object({
  id: uuid,
  modelId: uuid,
  modelName: z.string().trim().min(1).max(120),
  device: z.enum(devices),
  color: z.string().trim().max(60).optional(),
  quantity: z.number().int().min(1, "הכמות חייבת להיות לפחות 1.").max(10_000),
  catalogMsrpAgorot: moneyAgorot.optional(),
  agreedUnitPriceAgorot: moneyAgorot.optional(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderInlineCustomerInputSchema = z
  .object({
    requestId: uuid.optional(),
    customerType: z.enum(["private", "store"]),
    name: z.string().trim().min(1, "יש להזין שם לקוח או איש קשר.").max(120),
    store: z.string().trim().max(120).optional().default(""),
    phone: z
      .string()
      .transform(sanitizePhoneInput)
      .refine((v) => v.length <= 32, "מספר הטלפון ארוך מדי.")
      .refine(isValidPhoneInput, "יש להזין מספר טלפון תקין."),
  })
  .superRefine((val, ctx) => {
    if (val.customerType === "store" && !val.store.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["store"],
        message: "יש להזין את שם החנות.",
      });
    }
  });

export type OrderInlineCustomerInput = z.infer<typeof orderInlineCustomerInputSchema>;

export const orderCreateInputSchema = z
  .object({
    customerId: uuid.optional(),
    customerType: z.enum(["private", "store"]).optional(),
    customerName: z.string().trim().max(120).optional(),
    storeName: z.string().trim().max(120).optional(),
    customerPhone: z
      .string()
      .transform(sanitizePhoneInput)
      .refine((val) => !val || (val.length <= 32 && isValidPhoneInput(val)), {
        message: "יש להזין מספר טלפון תקין.",
      })
      .optional(),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    deliveryAddress: z.string().trim().max(300).optional(),
    priority: z.enum(["normal", "urgent"]).default("normal"),
    items: z
      .array(
        z.object({
          modelId: uuid,
          color: z.string().trim().max(60).optional(),
          quantity: z.number().int().min(1).max(10_000),
          agreedUnitPriceAgorot: moneyAgorot.optional(),
        }),
      )
      .min(1, "יש לבחור לפחות דגם אחד להזמנה.")
      .max(20, "ניתן להוסיף עד 20 שורות דגמים להזמנה אחת."),
    notes: z.string().trim().max(2000).default(""),
    sourceQuoteId: uuid.optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.customerId) {
      if (!val.customerName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["customerName"],
          message: "יש לבחור לקוח מהמאגר או להזין שם לקוח.",
        });
      }
      if (!val.customerPhone?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["customerPhone"],
          message: "יש לבחור לקוח מהמאגר או להזין טלפון לקוח.",
        });
      }
      if (val.customerType === "store" && !val.storeName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["storeName"],
          message: "יש להזין את שם החנות.",
        });
      }
    }
    if (val.fulfillmentType === "delivery" && !val.deliveryAddress?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryAddress"],
        message: "יש להזין עיר וכתובת למשלוח.",
      });
    }
  });

export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;

export const orderSchema = z.object({
  id: uuid,
  number: z.string().regex(/^ORD-\d{4}-\d{4,}$/),
  createdBy: uuid,
  createdByName: z.string().trim().min(1).max(120),
  customerId: uuid.optional(),
  customerType: z.enum(["private", "store"]),
  customerName: z.string().trim().min(1).max(120),
  storeName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().min(7).max(32),
  fulfillmentType: z.enum(["pickup", "delivery"]),
  deliveryAddress: z.string().trim().max(300).optional(),
  priority: z.enum(["normal", "urgent"]),
  items: z.array(orderItemSchema).min(1).max(20),
  notes: z.string().trim().max(2000),
  internalNotes: z.string().trim().max(2000).optional(),
  sourceQuoteId: uuid.optional(),
  status: z.enum(orderStatuses),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Order = z.infer<typeof orderSchema>;

import { z } from "zod";

export const devices = ["קורקינט חשמלי", "אופניים חשמליים"] as const;
export const standardStatuses = ["חדש", "בטיפול", "הסתיים"] as const;
export const repairStatuses = ["התקבל", "בטיפול", "הסתיים"] as const;
export const delayStatuses = ["ללא עיכוב", "מתעכב"] as const;
export const faultSeverities = ["נפוצה", "קריטית", "תחזוקה"] as const;
export const roles = ["admin", "employee", "agent"] as const;
export const modules = ["standards", "repairs", "customers", "models", "faults"] as const;
export type Module = (typeof modules)[number];
export type PhotoModule = Exclude<Module, "customers">;
export type Device = (typeof devices)[number];
export type FaultSeverity = (typeof faultSeverities)[number];
export type Role = (typeof roles)[number];

export function canEditModule(role: Role, module: Module): boolean {
  return role === "admin" || role === "employee" || (role === "agent" && module === "faults");
}

export function canDeleteItems(role: Role): boolean {
  return role === "admin" || role === "employee";
}

export const uuid = z.uuid({ error: "המזהה אינו תקין." });
const date = z.iso.datetime();
const required = (label: string, max = 120) => z.string().trim().min(1, { error: "יש להזין " + label + "." }).max(max, { error: "הטקסט ארוך מדי." });
const optional = (max: number) => z.string().trim().max(max, { error: "הטקסט ארוך מדי." });
export const taskSchema = z.object({ id: uuid, title: required("שם משימה", 240), done: z.boolean() });
export const specSchema = z.object({ label: required("שם מאפיין", 80), value: required("ערך", 240) });

export const standardsInput = z.object({
  number: required("מספר תיק", 120),
  device: z.enum(devices),
  model: required("שם דגם"),
  modelId: uuid.optional(),
  status: z.enum(standardStatuses),
  tasks: z.array(taskSchema).max(100, { error: "ניתן להוסיף עד 100 משימות." })
    .refine((tasks) => new Set(tasks.map((task) => task.id)).size === tasks.length, "כל משימה צריכה להיות ייחודית."),
  delay: z.enum(delayStatuses),
  delayReason: optional(1000),
  notes: optional(4000),
}).superRefine((value, context) => {
  if (value.delay === "מתעכב" && !value.delayReason) {
    context.addIssue({ code: "custom", path: ["delayReason"], message: "יש להזין סיבת עיכוב." });
  }
});

export const repairInput = z.object({
  device: z.enum(devices),
  model: required("שם דגם"),
  modelId: uuid.optional(),
  serial: required("מספר סידורי"),
  customerId: uuid,
  fault: required("תיאור תקלה", 4000),
  work: optional(4000),
  status: z.enum(repairStatuses),
});

const customerFieldsSchema = z.object({
  customerType: z.enum(["private", "store"]).optional(),
  name: required("שם לקוח"),
  store: optional(120),
  phone: z.string().trim().max(32, { error: "מספר הטלפון ארוך מדי." })
    .refine((value) => /^\+?[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15,
      "יש להזין מספר טלפון תקין."),
});
type CustomerFields = z.infer<typeof customerFieldsSchema>;
type NormalizedCustomer<T extends CustomerFields> = Omit<T, "customerType"> & { customerType?: "private" | "store" };
const normalizeCustomerType = <T extends CustomerFields>(customer: T): NormalizedCustomer<T> => {
  const customerType = customer.customerType ?? (customer.store.trim() === "פרטי" ? "private" as const : undefined);
  if (customerType === "private") return { ...customer, customerType, store: "" };
  if (customerType === "store") return { ...customer, customerType };
  const legacyCustomer: NormalizedCustomer<T> = { ...customer };
  delete legacyCustomer.customerType;
  return legacyCustomer;
};
export const customerInput = customerFieldsSchema.transform(normalizeCustomerType);

const mediaUrl = z.string().trim().max(1000).refine((value) => !value || /^https?:\/\//i.test(value), "יש להזין קישור http/https תקין.");
const point3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const studioId = z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/, "מזהה יכול להכיל אותיות לטיניות, ספרות ומקף.");
const dimensionsSchema = z.object({ length: z.number().positive().max(100), width: z.number().positive().max(100), height: z.number().positive().max(100) });
export const studioSchema = z.object({
  assetVerified: z.boolean().optional(),
  scaleVerified: z.boolean().optional(),
  verifiedModel3dUrl: mediaUrl.optional(),
  verifiedDimensions: dimensionsSchema.optional(),
  source: optional(500).optional(),
  usdzUrl: mediaUrl.optional(),
  arEnabled: z.boolean().optional(),
  dimensions: dimensionsSchema.optional(),
  cameras: z.array(z.object({ id: studioId, title: required("שם מבט", 80), position: point3, target: point3 })).max(16).optional(),
  features: z.array(z.object({ title: required("שם רכיב", 120), description: required("הסבר", 1000), nodePath: z.string().regex(/^(\d+(\/\d+)*)?$/).optional(), point: point3.optional(), imageUrl: mediaUrl.optional(), view: studioId.optional() })).max(12).optional(),
  tour: z.array(z.object({ title: required("כותרת תחנה", 120), description: required("תיאור תחנה", 1000), view: studioId.optional(), featureIndex: z.number().int().min(0).max(11).optional(), imageIndex: z.number().int().min(0).max(21).optional(), durationMs: z.number().int().min(3000).max(15000).optional() })).max(10).optional(),
  actions: z.array(z.object({ id: studioId, title: required("שם פעולה", 80), clip: required("שם אנימציה", 160) })).max(8).optional(),
  variants: z.array(z.object({ id: studioId, title: required("שם גרסה", 80), sku: optional(120).optional(), color: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), imageUrl: mediaUrl.optional(), model3dUrl: mediaUrl.optional(), materialVariant: optional(120).optional(), price: z.number().nonnegative().max(1000000).optional(), availability: z.enum(["available", "unavailable", "unknown"]).optional(), materials: z.array(z.object({ name: required("שם חומר", 160), color: z.string().regex(/^#[a-fA-F0-9]{6}$/) })).max(20).optional() })).max(16).optional(),
});
export type StudioConfig = z.infer<typeof studioSchema>;
export type StudioFeature = NonNullable<StudioConfig["features"]>[number];
export type StudioVariant = NonNullable<StudioConfig["variants"]>[number];
export type StudioCamera = NonNullable<StudioConfig["cameras"]>[number];

export const modelInput = z.object({
  studio: studioSchema.optional(),
  published: z.boolean().optional(),
  model3dUrl: z.string().trim().max(500).refine((value) => !value || /^https?:\/\/.+/i.test(value), "יש להזין קישור http/https לקובץ GLB.").optional(),
  videoUrl: z.string().trim().max(500).refine((value) => !value || /^https?:\/\/.+/i.test(value), "יש להזין קישור http/https לווידאו.").optional(),
  publicDescription: optional(4000).optional(),
  dimensions: optional(500).optional(),
  foldedDimensions: optional(500).optional(),
  metrics: z.object({
    rangeKm: z.number().positive().max(1000).nullable().optional(),
    speedKmh: z.number().positive().max(200).nullable().optional(),
    batteryWh: z.number().positive().max(20000).nullable().optional(),
    weightKg: z.number().positive().max(500).nullable().optional(),
  }).optional(),
  features: z.array(z.object({ title: required("כותרת", 120), description: required("הסבר", 1000) })).max(12).optional(),
  device: z.enum(devices),
  name: required("שם דגם"),
  imageUrl: z.string().trim().max(500, { error: "כתובת התמונה ארוכה מדי." })
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), "יש להזין כתובת תמונה תקינה (http/https).")
    .optional(),
  notes: optional(4000),
  summary: optional(600).optional(),
  msrp: z.number().nonnegative().max(1_000_000).nullable().optional(),
  productUrl: z.string().trim().max(500, { error: "הקישור ארוך מדי." })
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), "יש להזין קישור תקין.")
    .optional(),
  galleryUrls: z.array(
    z.string().trim().max(500, { error: "כתובת התמונה ארוכה מדי." })
      .refine((value) => !value || /^https?:\/\/.+/i.test(value), "כתובת תמונה אינה תקינה."),
  ).max(12).transform((urls) => urls.filter(Boolean)).optional(),
  specs: z.array(specSchema).max(40).optional(),
});

export const photoSchema = z.object({
  id: uuid,
  name: z.string().max(255),
  type: z.literal("image/webp"),
  bytes: z.number().int().positive(),
});

export const attachmentSchema = z.object({
  id: uuid,
  name: z.string().max(255),
  type: z.string().max(120),
  bytes: z.number().int().positive(),
  kind: z.enum(["file", "video"]),
});

export const commonFaultSchema = z.object({
  id: uuid,
  code: optional(32),
  title: required("כותרת תקלה", 160),
  symptoms: optional(1000),
  solution: optional(2000),
  severity: z.enum(faultSeverities),
});

export const unlockVideoLinkSchema = z.object({
  id: uuid,
  title: required("כותרת סרטון", 120),
  url: z.string().trim().min(1, { error: "יש להזין קישור לסרטון." }).max(1000, { error: "הקישור ארוך מדי." })
    .refine((value) => /^https?:\/\/.+/i.test(value), "יש להזין קישור http/https תקין."),
});

export const faultGuideInput = z.object({
  device: z.enum(devices),
  model: required("שם דגם"),
  modelId: uuid.optional(),
  summary: optional(1000),
  unlockInstructions: optional(4000),
  commonFaults: z.array(commonFaultSchema).max(50, { error: "ניתן להוסיף עד 50 תקלות נפוצות לדגם." }),
  videoLinks: z.array(unlockVideoLinkSchema).max(10, { error: "ניתן להוסיף עד 10 קישורי סרטון." }),
  notes: optional(4000),
});

const record = { id: uuid, createdAt: date, updatedAt: date };
export const standardSchema = standardsInput.safeExtend({
  ...record, photos: z.array(photoSchema).max(10),
});
export const repairSchema = repairInput.extend({
  ...record, number: z.string().regex(/^REP-\d{4,}$/), photos: z.array(photoSchema).max(10),
});
export const customerSchema = customerFieldsSchema.extend(record).transform(normalizeCustomerType);
export const catalogModelSchema = modelInput.extend({
  ...record, photos: z.array(photoSchema).max(10),
});
export const faultGuideSchema = faultGuideInput.extend({
  ...record,
  commonFaults: z.array(commonFaultSchema).max(50).default([]),
  videoLinks: z.array(unlockVideoLinkSchema).max(10).default([]),
  photos: z.array(photoSchema).max(10),
  attachments: z.array(attachmentSchema).max(15).default([]),
});
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._@+-]{2,79}$/, "יש להזין שם משתמש באותיות לטיניות או בספרות (3–80 תווים).");
export const passwordSchema = z.string().min(5, "הסיסמה חייבת לכלול לפחות 5 תווים.").max(128, "הסיסמה ארוכה מדי.");
export const deletePasswordSchema = z.string().trim().min(4, "סיסמת המחיקה חייבת לכלול לפחות 4 תווים.").max(64, "סיסמת המחיקה ארוכה מדי.");
export const DEFAULT_PICKUP_ADDRESS = "לישנסקי 27, ראשון לציון";
export const DEFAULT_AGENT_INVITE_CODE = "cortez-agent";
export const pickupAddressSchema = z.string().trim().min(3, "יש להזין כתובת איסוף.").max(240, "כתובת האיסוף ארוכה מדי.");
export const ordersPhoneSchema = z.string().trim().max(32, "מספר הטלפון ארוך מדי.")
  .refine((value) => /^\+?[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15,
    "יש להזין מספר טלפון תקין לקבלת הזמנות.");
export const agentInviteTokenSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]{6,64}$/, "קוד קישור ההרשמה אינו תקין.");
export const systemSettingsSchema = z.object({
  deletePasswordHash: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/).optional(),
  pickupAddress: pickupAddressSchema.optional(),
  ordersWhatsappPhone: ordersPhoneSchema.optional(),
  agentInviteToken: agentInviteTokenSchema.optional(),
  updatedAt: date.optional(),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export const userInput = z.object({
  username: usernameSchema,
  name: required("שם מלא"),
  password: passwordSchema,
  role: z.enum(roles),
});
export const userSchema = userInput.omit({ password: true }).extend({
  ...record, passwordHash: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/), disabled: z.boolean(),
});
export const sessionSchema = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), userId: uuid, expires: z.number().int().positive() });
export const counterSchema = z.object({
  standards: z.number().int().nonnegative(),
  repairs: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative().optional(),
});
export const activitySchema = z.object({
  id: uuid, at: date, actor: uuid, action: z.string(), entity: z.string(), entityId: z.string(),
});

export type StandardInput = z.infer<typeof standardsInput>;
export type RepairInput = z.infer<typeof repairInput>;
export type CustomerInput = z.infer<typeof customerInput>;
export type ModelInput = z.infer<typeof modelInput>;
export type FaultGuideInput = z.infer<typeof faultGuideInput>;
export type CommonFault = z.infer<typeof commonFaultSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type UnlockVideoLink = z.infer<typeof unlockVideoLinkSchema>;
export type ModelSpec = z.infer<typeof specSchema>;
export type Standard = z.infer<typeof standardSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CatalogModel = z.infer<typeof catalogModelSchema>;
export type FaultGuide = z.infer<typeof faultGuideSchema>;
export type User = z.infer<typeof userSchema>;
export type PublicUser = Omit<User, "passwordHash">;
export type Photo = z.infer<typeof photoSchema>;
export type Activity = z.infer<typeof activitySchema>;

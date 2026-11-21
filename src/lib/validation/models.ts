import { z } from "zod";

export const devices = ["קורקינט חשמלי", "אופניים חשמליים"] as const;
export const standardStatuses = ["חדש", "בטיפול", "הסתיים"] as const;
export const repairStatuses = ["התקבל", "בטיפול", "הסתיים"] as const;
export const delayStatuses = ["ללא עיכוב", "מתעכב"] as const;
export const roles = ["admin", "employee"] as const;
export const modules = ["standards", "repairs", "customers"] as const;
export type Module = (typeof modules)[number];
export type PhotoModule = Exclude<Module, "customers">;

export const uuid = z.uuid({ error: "המזהה אינו תקין." });
const date = z.iso.datetime();
const required = (label: string, max = 120) => z.string().trim().min(1, { error: "יש להזין " + label + "." }).max(max, { error: "הטקסט ארוך מדי." });
const optional = (max: number) => z.string().trim().max(max, { error: "הטקסט ארוך מדי." });
export const taskSchema = z.object({ id: uuid, title: required("שם משימה", 240), done: z.boolean() });

export const standardsInput = z.object({
  number: required("מספר תיק", 120),
  device: z.enum(devices),
  model: required("שם דגם"),
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
  serial: required("מספר סידורי"),
  customerId: uuid,
  fault: required("תיאור תקלה", 4000),
  work: optional(4000),
  status: z.enum(repairStatuses),
});

export const customerInput = z.object({
  name: required("שם לקוח"),
  store: optional(120),
  phone: z.string().trim().max(32, { error: "מספר הטלפון ארוך מדי." })
    .refine((value) => /^\+?[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15,
      "יש להזין מספר טלפון תקין."),
});

export const photoSchema = z.object({
  id: uuid,
  name: z.string().max(255),
  type: z.literal("image/webp"),
  bytes: z.number().int().positive(),
});

const record = { id: uuid, createdAt: date, updatedAt: date };
export const standardSchema = standardsInput.safeExtend({
  ...record, photos: z.array(photoSchema).max(10),
});
export const repairSchema = repairInput.extend({
  ...record, number: z.string().regex(/^REP-\d{4,}$/), photos: z.array(photoSchema).max(10),
});
export const customerSchema = customerInput.extend(record);
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._@+-]{2,79}$/, "יש להזין שם משתמש באותיות לטיניות או בספרות (3–80 תווים).");
export const passwordSchema = z.string().min(12, "הסיסמה חייבת לכלול לפחות 12 תווים.").max(128, "הסיסמה ארוכה מדי.");
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
export const counterSchema = z.object({ standards: z.number().int().nonnegative(), repairs: z.number().int().nonnegative() });
export const activitySchema = z.object({
  id: uuid, at: date, actor: uuid, action: z.string(), entity: z.string(), entityId: z.string(),
});

export type StandardInput = z.infer<typeof standardsInput>;
export type RepairInput = z.infer<typeof repairInput>;
export type CustomerInput = z.infer<typeof customerInput>;
export type Standard = z.infer<typeof standardSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type User = z.infer<typeof userSchema>;
export type PublicUser = Omit<User, "passwordHash">;
export type Photo = z.infer<typeof photoSchema>;
export type Activity = z.infer<typeof activitySchema>;

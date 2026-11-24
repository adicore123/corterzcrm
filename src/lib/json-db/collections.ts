import { z } from "zod";
import { activitySchema, catalogModelSchema, counterSchema, customerSchema, faultGuideSchema, repairSchema, sessionSchema, standardSchema, systemSettingsSchema, userSchema, type SystemSettings } from "../validation/models";
import { quoteSchema } from "../quotes/schema";

export const collections = {
  standards: { file: "standard-cases.json", schema: z.array(standardSchema) },
  repairs: { file: "repairs.json", schema: z.array(repairSchema) },
  quotes: { file: "quotes.json", schema: z.array(quoteSchema) },
  customers: { file: "customers.json", schema: z.array(customerSchema) },
  models: { file: "models.json", schema: z.array(catalogModelSchema) },
  faults: { file: "fault-guides.json", schema: z.array(faultGuideSchema) },
  users: { file: "users.json", schema: z.array(userSchema) },
  counters: { file: "counters.json", schema: counterSchema },
  activity: { file: "activity-logs.json", schema: z.array(activitySchema) },
  sessions: { file: "sessions.json", schema: z.array(sessionSchema) },
  settings: { file: "settings.json", schema: systemSettingsSchema },
} as const;

export type Collection = keyof typeof collections;
export type Data<K extends Collection> = z.infer<(typeof collections)[K]["schema"]>;
export const initialCounters = { standards: 0, repairs: 0 };
export const initialSettings: SystemSettings = {};

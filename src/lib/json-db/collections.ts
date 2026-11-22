import { z } from "zod";
import { activitySchema, catalogModelSchema, counterSchema, customerSchema, faultGuideSchema, repairSchema, sessionSchema, standardSchema, userSchema } from "../validation/models";

export const collections = {
  standards: { file: "standard-cases.json", schema: z.array(standardSchema) },
  repairs: { file: "repairs.json", schema: z.array(repairSchema) },
  customers: { file: "customers.json", schema: z.array(customerSchema) },
  models: { file: "models.json", schema: z.array(catalogModelSchema) },
  faults: { file: "fault-guides.json", schema: z.array(faultGuideSchema) },
  users: { file: "users.json", schema: z.array(userSchema) },
  counters: { file: "counters.json", schema: counterSchema },
  activity: { file: "activity-logs.json", schema: z.array(activitySchema) },
  sessions: { file: "sessions.json", schema: z.array(sessionSchema) },
} as const;

export type Collection = keyof typeof collections;
export type Data<K extends Collection> = z.infer<(typeof collections)[K]["schema"]>;
export const initialCounters = { standards: 0, repairs: 0 };

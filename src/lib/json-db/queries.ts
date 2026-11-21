import { readCollection } from "./store";
import { defaultCatalogModels } from "./cortez-catalog";
import type { CatalogModel, Customer, Module, Repair, Standard } from "../validation/models";

export type RecordFilters = { q?: string; status?: string; delay?: string; sort?: string };
const matches = (value: string, query: string) => value.toLocaleLowerCase("he").includes(query);
const newest = <T extends { updatedAt: string }>(items: T[]) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export async function dashboard() {
  const [standards, repairs, customers] = await Promise.all([
    readCollection("standards"), readCollection("repairs"), readCollection("customers"),
  ]);
  const delayed = standards.filter((item) => item.delay === "מתעכב");
  return {
    counts: {
      activeStandards: standards.filter((item) => item.status !== "הסתיים").length,
      delayed: delayed.length,
      completed: standards.filter((item) => item.status === "הסתיים").length,
      activeRepairs: repairs.filter((item) => item.status !== "הסתיים").length,
    },
    standards: newest(standards).slice(0, 5),
    delayed: newest(delayed).slice(0, 5),
    repairs: newest(repairs).slice(0, 5),
    customers,
  };
}

export async function searchRecords(module: Module, filters: RecordFilters) {
  const q = (filters.q ?? "").trim().slice(0, 120).toLocaleLowerCase("he");
  const digits = q.replace(/\D/g, "");
  const phoneQuery = Boolean(digits) && /^\+?[\d\s()-]+$/.test(q);
  const [rawAll, customers] = await Promise.all([
    module === "models" ? catalogModels() : readCollection(module),
    module === "repairs" && q ? readCollection("customers") : Promise.resolve([] as Customer[]),
  ]);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const matchesCustomer = (customer: Customer) =>
    [customer.name, customer.store, customer.phone].some((value) => matches(value, q))
    || (phoneQuery && customer.phone.replace(/\D/g, "").includes(digits));

  const filtered = (rawAll as Array<Standard | Repair | Customer | CatalogModel>).filter((item) => {
    if ("number" in item) {
      if (filters.status === "active" ? item.status === "הסתיים" : filters.status && filters.status !== item.status) return false;
      if ("delay" in item && filters.delay && filters.delay !== item.delay) return false;
      if ([item.number, item.model, "serial" in item ? item.serial : ""].some((value) => matches(value, q))) return true;
      if ("customerId" in item && q) {
        const customer = customerMap.get(item.customerId);
        if (customer && matchesCustomer(customer)) return true;
      }
      return false;
    }
    if ("phone" in item) return matchesCustomer(item);
    if (filters.status && filters.status !== item.device) return false;
    return [item.name, item.device, item.notes].some((value) => matches(value, q));
  });
  if (filters.sort === "oldest") return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filters.sort === "created") return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (module === "models" && !filters.sort) return filtered.sort((a, b) => ("name" in a && "name" in b ? a.name.localeCompare(b.name, "he") : 0));
  return newest(filtered);
}

export async function catalogModels(): Promise<CatalogModel[]> {
  const stored = await readCollection("models");
  const list = stored.length > 0 ? stored : defaultCatalogModels;
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function knownModels() {
  const [models, standards, repairs] = await Promise.all([catalogModels(), readCollection("standards"), readCollection("repairs")]);
  return Array.from(new Set([...models.map((item) => item.name), ...standards.map((item) => item.model), ...repairs.map((item) => item.model)]))
    .sort((a, b) => a.localeCompare(b, "he"));
}

import { usesMongoStorage } from "./mongo-client";
import { readMongoDistinctModelNames } from "./mongo-store";
import { readCollection } from "./store";
import { defaultCatalogModels } from "./cortez-catalog";
import type { CatalogModel, Customer, FaultGuide, Module, Repair, Standard } from "../validation/models";

export type RecordFilters = { q?: string; status?: string; delay?: string; sort?: string };
const matches = (value: string, query: string) => value.toLocaleLowerCase("he").includes(query);
const newest = <T extends { updatedAt: string }>(items: T[]) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export async function dashboard() {
  const [standards, repairs, customers, models] = await Promise.all([
    readCollection("standards"), readCollection("repairs"), readCollection("customers"), catalogModels(),
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
    models,
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

  const filtered = (rawAll as Array<Standard | Repair | Customer | CatalogModel | FaultGuide>).filter((item) => {
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
    if ("commonFaults" in item) {
      if (filters.status === "has-video") {
        const hasVideo = item.attachments.some((att) => att.kind === "video") || item.videoLinks.length > 0;
        if (!hasVideo) return false;
      } else if (filters.status === "has-files") {
        if (!item.attachments.some((att) => att.kind === "file")) return false;
      } else if (filters.status && filters.status !== item.device) {
        return false;
      }
      if (!q) return true;
      return [
        item.model, item.device, item.summary, item.unlockInstructions, item.notes,
        ...item.commonFaults.flatMap((fault) => [fault.code, fault.title, fault.symptoms, fault.solution, fault.severity]),
        ...item.videoLinks.map((link) => link.title),
        ...item.attachments.map((att) => att.name),
      ].some((value) => matches(value, q));
    }
    if (filters.status && filters.status !== item.device) return false;
    return [item.name, item.device, item.notes ?? "", item.summary ?? ""].some((value) => matches(value, q))
      || (item.specs ?? []).some((spec) => matches(spec.label, q) || matches(spec.value, q));
  });
  if (filters.sort === "oldest") return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filters.sort === "created") return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (module === "models" && !filters.sort) return filtered.sort((a, b) => ("name" in a && "name" in b ? a.name.localeCompare(b.name, "he") : 0));
  return newest(filtered);
}

export function mergeWithDefaultCatalog(stored: CatalogModel[]): CatalogModel[] {
  // Storage initialization owns seeding. Reads must never resurrect deleted records.
  const seedById = new Map(defaultCatalogModels.map((seed) => [seed.id, seed]));
  const seedByName = new Map(defaultCatalogModels.map((seed) => [seed.name.toLocaleLowerCase("he"), seed]));
  const enrichedStored = stored.map((storedItem) => {
    const seed = seedById.get(storedItem.id) ?? seedByName.get(storedItem.name.toLocaleLowerCase("he"));
    if (!seed) return storedItem;
    return {
      ...storedItem,
      imageUrl: storedItem.imageUrl ?? seed.imageUrl,
      summary: storedItem.summary ?? seed.summary,
      msrp: storedItem.msrp !== undefined ? storedItem.msrp : seed.msrp,
      productUrl: storedItem.productUrl ?? seed.productUrl,
      galleryUrls: storedItem.galleryUrls ?? seed.galleryUrls,
      specs: storedItem.specs ?? seed.specs,
    };
  });
  return enrichedStored;
}

export async function catalogModels(): Promise<CatalogModel[]> {
  const stored = await readCollection("models");
  const list = mergeWithDefaultCatalog(stored);
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function knownModels() {
  if (usesMongoStorage()) {
    const [models, distinctUsed] = await Promise.all([
      catalogModels(),
      readMongoDistinctModelNames(),
    ]);
    return Array.from(new Set([...models.map((item) => item.name), ...distinctUsed])).sort((a, b) =>
      a.localeCompare(b, "he"),
    );
  }
  const [models, standards, repairs, faults] = await Promise.all([
    catalogModels(), readCollection("standards"), readCollection("repairs"), readCollection("faults"),
  ]);
  return Array.from(new Set([
    ...models.map((item) => item.name),
    ...standards.map((item) => item.model),
    ...repairs.map((item) => item.model),
    ...faults.map((item) => item.model),
  ])).sort((a, b) => a.localeCompare(b, "he"));
}

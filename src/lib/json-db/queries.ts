import { readCollection } from "./store";
import type { Customer, Module, Repair, Standard } from "../validation/models";

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
  const all = await readCollection(module);
  const filtered = all.filter((item: Standard | Repair | Customer) => {
    if ("number" in item) {
      if (filters.status === "active" ? item.status === "הסתיים" : filters.status && filters.status !== item.status) return false;
      if ("delay" in item && filters.delay && filters.delay !== item.delay) return false;
      return [item.number, item.model, "serial" in item ? item.serial : ""].some((value) => matches(value, q));
    }
    const digits = q.replace(/\D/g, "");
    return [item.name, item.store, item.phone].some((value) => matches(value, q))
      || (Boolean(digits) && /^\+?[\d\s()-]+$/.test(q) && item.phone.replace(/\D/g, "").includes(digits));
  });
  if (filters.sort === "oldest") return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filters.sort === "created") return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return newest(filtered);
}

export async function knownModels() {
  const [standards, repairs] = await Promise.all([readCollection("standards"), readCollection("repairs")]);
  return Array.from(new Set([...standards, ...repairs].map((item) => item.model))).sort((a, b) => a.localeCompare(b, "he"));
}

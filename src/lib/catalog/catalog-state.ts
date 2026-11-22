import type { CatalogFilterState, FitFilter } from "../../components/catalog/catalog-utils";

export type CatalogState = CatalogFilterState & { sort?: string; compareIds?: string[] };
export function readCatalogState(params: URLSearchParams): CatalogState {
  const categories = ["all", "2027", "קורקינט חשמלי", "אופניים חשמליים"];
  const sorts = ["featured", "name", "range-desc", "price-asc", "price-desc"];
  const price = Number(params.get("budget"));
  return {
    category: categories.includes(params.get("category") ?? "") ? params.get("category")! : "all",
    search: (params.get("q") ?? "").slice(0, 120),
    fits: params.getAll("fit").filter((fit): fit is FitFilter => ["long-range", "full-susp", "hydraulic"].includes(fit)),
    maxPrice: Number.isFinite(price) && price > 0 && price <= 1_000_000 ? price : 0,
    sort: sorts.includes(params.get("sort") ?? "") ? params.get("sort")! : "featured",
    compareIds: (params.get("compare") ?? "").split(",").filter((id) => /^[\da-f-]{36}$/.test(id)).slice(0, 3),
  };
}
export function writeCatalogState(params: URLSearchParams, state: CatalogState): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ["category", "q", "fit", "budget", "sort", "compare"]) next.delete(key);
  if (state.category && state.category !== "all") next.set("category", state.category);
  if (state.search) next.set("q", state.search);
  for (const fit of state.fits ?? []) next.append("fit", fit);
  if (state.maxPrice) next.set("budget", String(state.maxPrice));
  if (state.sort && state.sort !== "featured") next.set("sort", state.sort);
  if (state.compareIds?.length) next.set("compare", state.compareIds.join(","));
  return next;
}

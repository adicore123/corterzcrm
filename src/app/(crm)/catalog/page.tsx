import { readStudioSelection } from "@/lib/catalog/studio-selection";
import { readCatalogState } from "@/lib/catalog/catalog-state";
import type { Metadata } from "next";
import { authorizedUser } from "@/lib/auth/page";
import { catalogModels } from "@/lib/json-db/queries";
import { AgentCatalog } from "@/components/catalog/agent-catalog";

export const metadata: Metadata = { title: "קטלוג סוכנים" };

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await authorizedUser();
  const [models, query] = await Promise.all([catalogModels(), searchParams]);
  const initialModelId = typeof query.model === "string" ? query.model : undefined;
  const stateParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) stateParams.append(key, entry);
  }
  const initialState = readCatalogState(stateParams);
  return <AgentCatalog models={models} initialModelId={initialModelId} initialState={initialState} initialStudioState={readStudioSelection(query)} />;
}

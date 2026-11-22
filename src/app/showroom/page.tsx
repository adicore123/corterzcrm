import { readStudioSelection } from "@/lib/catalog/studio-selection";
import { readCatalogState } from "@/lib/catalog/catalog-state";
import type { Metadata } from "next";
import { catalogModels } from "@/lib/json-db/queries";
import { AgentCatalog } from "@/components/catalog/agent-catalog";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "קטלוג הדגמים",
  description: "גלריות המוצרים והמפרטים הטכניים של דגמי קורטז",
};

export default async function PublicShowroomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [models, query] = await Promise.all([catalogModels(), searchParams]);
  const initialModelId = typeof query.model === "string" ? query.model : undefined;
  const publicModels = publicCatalogModels(models);
  if (initialModelId && !publicModels.some((model) => model.id === initialModelId)) notFound();
  const stateParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) stateParams.append(key, entry);
  }
  const initialState = readCatalogState(stateParams);
  return <main className="public-showroom-shell">
    <AgentCatalog models={publicModels} publicMode initialModelId={initialModelId} initialState={initialState} initialStudioState={readStudioSelection(query)} />
  </main>;
}

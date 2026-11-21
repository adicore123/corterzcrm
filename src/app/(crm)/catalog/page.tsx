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
  return <AgentCatalog models={models} initialModelId={initialModelId} />;
}

import type { Metadata } from "next";
import { catalogModels } from "@/lib/json-db/queries";
import { AgentCatalog } from "@/components/catalog/agent-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "קטלוג כלים 3D",
  description: "אולם התצוגה התלת־ממדי והמפרטים הטכניים של דגמי קורטז",
};

export default async function PublicShowroomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [models, query] = await Promise.all([catalogModels(), searchParams]);
  const initialModelId = typeof query.model === "string" ? query.model : undefined;
  return <main className="public-showroom-shell">
    <AgentCatalog models={models} publicMode initialModelId={initialModelId} />
  </main>;
}

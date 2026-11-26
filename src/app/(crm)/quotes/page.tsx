import { authorizedUser } from "@/lib/auth/page";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { readCollection } from "@/lib/json-db/store";
import { catalogModels } from "@/lib/json-db/queries";
import { QuoteWorkspace } from "./quote-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "הצעות מחיר" };

export default async function QuotesPage() {
  await authorizedUser();
  const [models, quotes] = await Promise.all([catalogModels(), readCollection("quotes")]);
  return (
    <QuoteWorkspace
      models={models.map((model) => ({
        id: model.id,
        name: model.name,
        device: model.device,
        summary: model.summary,
        specs: model.specs,
        msrp: model.msrp ?? null,
        imageUrl: model.imageUrl,
        exhibitUrl: getProposalHeroCutoutUrl(model),
      }))}
      quotes={[...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
    />
  );
}

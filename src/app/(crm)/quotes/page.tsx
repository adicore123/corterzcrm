import { modelThumbUrl } from "@/components/record-cells";
import { authorizedUser } from "@/lib/auth/page";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { catalogModels } from "@/lib/json-db/queries";
import { listQuotesForUser } from "@/lib/quotes/service";
import { QuoteWorkspace } from "./quote-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "הצעות מחיר" };

export default async function QuotesPage() {
  const user = await authorizedUser();
  const [models, quotes] = await Promise.all([catalogModels(), listQuotesForUser(user)]);
  return (
    <QuoteWorkspace
      models={models.map((model) => ({
        id: model.id,
        name: model.name,
        device: model.device,
        summary: model.summary,
        specs: model.specs,
        msrp: model.msrp ?? null,
        imageUrl: modelThumbUrl(model) || model.imageUrl,
        exhibitUrl: getProposalHeroCutoutUrl(model),
      }))}
      quotes={quotes}
    />
  );
}

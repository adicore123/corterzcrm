import { modelThumbUrl } from "@/components/record-cells";
import { authorizedUser } from "@/lib/auth/page";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { catalogModels } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { listQuotesForUser } from "@/lib/quotes/service";
import { QuoteWorkspace } from "./quote-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "הצעות מחיר" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await authorizedUser();
  const [models, quotes, customers, query] = await Promise.all([
    catalogModels(),
    listQuotesForUser(user),
    readCollection("customers"),
    searchParams,
  ]);
  const customerIdParam = typeof query.customer === "string" ? query.customer : undefined;
  const prefillCustomer = customerIdParam
    ? customers.find((c) => c.id === customerIdParam)
    : undefined;

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
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        store: c.store,
        phone: c.phone,
        customerType: c.customerType === "store" ? "store" : "private",
      }))}
      initialCustomer={
        prefillCustomer
          ? {
              id: prefillCustomer.id,
              name: prefillCustomer.name,
              store: prefillCustomer.store,
              phone: prefillCustomer.phone,
              customerType: prefillCustomer.customerType === "store" ? "store" : "private",
            }
          : undefined
      }
      quotes={quotes}
    />
  );
}

import { modelThumbUrl } from "@/components/record-cells";
import { authorizedUser } from "@/lib/auth/page";
import { getCoastalAsset } from "@/lib/catalog/coastal-assets";
import { catalogModels } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { DEFAULT_MORAN_WHATSAPP_DISPLAY } from "@/lib/orders/schema";
import { listOrderCustomers, listOrdersForUser } from "@/lib/orders/service";
import { toCanonicalCustomerDigits } from "@/lib/phone";
import { listQuotesForUser } from "@/lib/quotes/service";
import { DEFAULT_PICKUP_ADDRESS } from "@/lib/validation/models";
import {
  OrdersWorkspace,
  type OrderCatalogModelOption,
  type OrderCustomerOption,
  type OrderQuotePrefill,
} from "./orders-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "הזמנות" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await authorizedUser();
  const query = await searchParams;
  const openNew = query.new === "1";
  const quoteId = typeof query.quoteId === "string" ? query.quoteId : undefined;

  const [models, orders, customers, settings, visibleQuotes] = await Promise.all([
    catalogModels(),
    listOrdersForUser(user),
    listOrderCustomers(),
    readCollection("settings"),
    quoteId ? listQuotesForUser(user) : Promise.resolve([]),
  ]);

  const modelOptions: OrderCatalogModelOption[] = models.map((model) => {
    const asset = getCoastalAsset(model);
    const batterySpec = (model.specs ?? []).find((s) => s.label.includes("סוללה"))?.value;
    return {
      id: model.id,
      name: model.name,
      device: model.device,
      msrp: model.msrp ?? null,
      imageUrl: modelThumbUrl(model) || model.imageUrl || asset?.exhibitUrl,
      battery:
        asset?.batteryVoltage && asset?.batteryCapacityAh
          ? `${asset.batteryVoltage}V / ${asset.batteryCapacityAh}Ah`
          : batterySpec,
      colors: asset?.availableColors ?? [],
      comingSoon: asset?.availabilityStatus === "coming-soon",
    };
  });

  const customerOptions: OrderCustomerOption[] = customers.map((c) => {
    const inferredType =
      c.customerType
      ?? (c.store && c.store.trim() && c.store.trim() !== "פרטי" ? "store" : "private");
    return {
      id: c.id,
      name: c.name,
      store: inferredType === "store" ? c.store : "",
      phone: c.phone,
      customerType: inferredType,
    };
  });

  let prefill: OrderQuotePrefill | undefined;
  if (quoteId) {
    const matchedQuote = visibleQuotes.find((q) => q.id === quoteId);
    if (matchedQuote) {
      const qDigits = toCanonicalCustomerDigits(matchedQuote.customerPhone);
      const matchedCustomer =
        (matchedQuote.customerId
          ? customerOptions.find((c) => c.id === matchedQuote.customerId)
          : undefined)
        ?? (qDigits
          ? customerOptions.find((c) => toCanonicalCustomerDigits(c.phone) === qDigits)
          : undefined);

      prefill = {
        quoteId: matchedQuote.id,
        modelId: matchedQuote.modelId,
        quantity: matchedQuote.quantity,
        agreedUnitPriceShekels: Number((matchedQuote.unitPriceAgorot / 100).toFixed(2)),
        customerId: matchedCustomer?.id,
        customerType: matchedQuote.customerType,
        customerName: matchedQuote.customerName,
        storeName: matchedQuote.storeName,
        customerPhone: matchedQuote.customerPhone,
      };
    }
  }

  return (
    <OrdersWorkspace
      models={modelOptions}
      initialCustomers={customerOptions}
      orders={orders}
      userRole={user.role}
      moranPhone={settings.ordersWhatsappPhone ?? DEFAULT_MORAN_WHATSAPP_DISPLAY}
      pickupAddress={settings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS}
      initialOpenNew={openNew || Boolean(prefill)}
      initialPrefill={prefill}
    />
  );
}

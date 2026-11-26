import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  extractBatteryCapacityAh,
  extractBatteryVoltage,
  extractKeySpecs,
  getModelImages,
} from "@/components/catalog/catalog-utils";
import { CinematicHero } from "@/components/proposal/CinematicHero";
import { ProductHighlights } from "@/components/proposal/ProductHighlights";
import { ProductStorytelling } from "@/components/proposal/ProductStorytelling";
import { ProposalWhatsappButton } from "@/components/proposal/ProposalWhatsappButton";
import { TechnicalSpecifications } from "@/components/proposal/TechnicalSpecifications";
import { getProposalHeroCutoutUrl } from "@/lib/catalog/coastal-assets";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { catalogModels } from "@/lib/json-db/queries";
import { quoteTotal } from "@/lib/quotes/pricing";
import { resolveProposalMedia } from "@/lib/quotes/proposal-media";
import { quoteByToken } from "@/lib/quotes/service";
import { AcceptQuote } from "./accept-quote";
import { ProposalShowroom } from "./proposal-showroom";

export const dynamic = "force-dynamic";

/** Formats prices cleanly: "4,200 ₪" on whole amounts (no .00), preserving exact agorot when fractional */
const shekels = (agorot: number) => {
  const isWhole = agorot % 100 === 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(agorot / 100);
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const quote = await quoteByToken(token);
  if (!quote) {
    return {
      title: "הצעת מחיר אישית",
      robots: { index: false, follow: false },
    };
  }
  const customer =
    quote.customerType === "store" ? quote.storeName || quote.customerName : quote.customerName;
  const price = quoteTotal(quote);

  const reqHeaders = await headers();
  const host = reqHeaders.get("x-forwarded-host") || reqHeaders.get("host") || "localhost:3000";
  const proto = reqHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const ogImageUrl = `${origin}/api/quotes/${token}/og-image`;

  return {
    // Root layout applies template "%s | קורטז" => renders as "הצעת מחיר אישית | קורטז" (no duplicate brand)
    title: "הצעת מחיר אישית",
    description: `הצעת מחיר אישית עבור ${customer} לדגם ${quote.modelName} (${shekels(price.payableAgorot)})`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `הצעת מחיר אישית עבור ${customer} — ${quote.modelName} | קורטז`,
      description: `הצעת מחיר מותאמת אישית לדגם ${quote.modelName} מאת קורטז (${shekels(price.payableAgorot)})`,
      type: "website",
      locale: "he_IL",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: `${quote.modelName} — CORTEZ`,
        },
      ],
    },
  };
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await quoteByToken(token);
  if (!quote) notFound();

  const storedModel = (await catalogModels()).find((item) => item.id === quote.modelId);
  const model = storedModel ? publicCatalogModels([{ ...storedModel, published: true }])[0] : undefined;
  const price = quoteTotal(quote);
  const customer =
    quote.customerType === "store" ? quote.storeName || quote.customerName : quote.customerName;

  const media = model ? resolveProposalMedia(model) : undefined;
  const primaryExhibitUrl = model
    ? getProposalHeroCutoutUrl(model) || media?.poster || getModelImages(model)[0]
    : undefined;

  const keySpecs = model ? extractKeySpecs(model) : null;
  const voltage = model ? extractBatteryVoltage(model) : null;
  const capacityAh = model ? extractBatteryCapacityAh(model) : null;
  const computedWh = voltage && capacityAh ? Math.round(voltage * capacityAh) : null;

  const keyBadges: Array<{ label: string; value: string }> = [];
  if (keySpecs?.battery) keyBadges.push({ label: "סוללה", value: keySpecs.battery });
  if (computedWh) keyBadges.push({ label: "אנרגיה", value: `${computedWh} Wh` });
  if (keySpecs?.range) keyBadges.push({ label: "טווח נסיעה", value: keySpecs.range });
  if (keySpecs?.highlight && keySpecs.highlight.value.trim() !== "מנוע עוצמתי") {
    keyBadges.push(keySpecs.highlight);
  }
  for (const spec of model?.specs ?? []) {
    if (keyBadges.length >= 4) break;
    if (spec.label.includes("מנוע") && spec.value.trim() === "מנוע עוצמתי") continue;
    if (!keyBadges.some((b) => b.label === spec.label)) {
      keyBadges.push({ label: spec.label, value: spec.value });
    }
  }

  const vatLabel = quote.vatMode === "included" ? "כולל מע״מ" : "בתוספת מע״מ";
  const quoteRefCode = quote.id.slice(0, 8).toUpperCase();
  const formattedIssueDate = quote.createdAt
    ? new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
        new Date(quote.createdAt),
      )
    : null;

  return (
    <main className="proposal-page" dir="rtl" lang="he">
      {/* SECTION 01 — FULL-BLEED CINEMATIC 3D MEDITERRANEAN HERO STAGE */}
      <CinematicHero
        customerDisplay={customer}
        customerType={quote.customerType}
        modelName={quote.modelName}
        deviceType={model?.device}
        summary={model?.summary || "הדגם וההצעה האישית שלך מחברת קורטז, מוכנים לאישור."}
        formattedPayable={shekels(price.payableAgorot)}
        quantity={quote.quantity}
        vatLabel={vatLabel}
        productMode={media?.kind === "3d" ? "3d" : "photo"}
        model3dUrl={media?.kind === "3d" ? media.url : undefined}
        productImageUrl={primaryExhibitUrl}
        keyBadges={keyBadges.slice(0, 4)}
      />

      <div className="proposal-shell">
        {/* SECTION 02 — KEY PRODUCT HIGHLIGHTS + STUDIO GALLERY / 3D INSPECTOR */}
        {model && <ProductHighlights model={model} />}

        <div className="proposal-showroom-section">
          {model && media ? (
            <ProposalShowroom model={model} media={media} />
          ) : (
            <section className="proposal-missing-model">
              <span>תצוגת מוצר</span>
              <h2>{quote.modelName}</h2>
              <p>תמונות ופרטי הדגם אינם זמינים כרגע. פרטי ההצעה מופיעים בהמשך הדף.</p>
            </section>
          )}
        </div>

        {/* SECTION 03 — PRODUCT STORYTELLING (DISTINCT VISUALS PER CHAPTER) */}
        {model && <ProductStorytelling model={model} />}

        {/* SECTION 04 — FULL TECHNICAL SPECIFICATIONS (GROUPED BY SYSTEM + COMPUTED WH) */}
        {model && <TechnicalSpecifications model={model} />}

        {/* SECTION 05 & 06 — PRIVATE TYPESET QUOTATION DOCUMENT & APPROVAL */}
        <section className="proposal-closing-section" aria-labelledby="offer-title">
          <aside className="proposal-offer" id="offer">
            <div className="proposal-offer-top">
              <span>05 / הצעת המחיר האישית שלך</span>
              <span dir="ltr">CORTEZ QUOTE · #{quoteRefCode}</span>
            </div>

            <div className="proposal-offer-doc-header">
              <div>
                <h2 id="offer-title">
                  {quote.customerType === "store"
                    ? `הצעה מסחרית עבור ${customer}`
                    : `הצעה אישית עבור ${customer}`}
                </h2>
                <p className="proposal-offer-description">
                  {quote.customerType === "store"
                    ? "מסמך הצעת מחיר רשמי לחנות מטעם קורטז."
                    : "סיכום תנאי העסקה והמחיר האישי שלך לפני אישור."}
                </p>
              </div>
              {formattedIssueDate && (
                <div className="proposal-offer-date-meta">
                  <small>תאריך הפקה</small>
                  <strong dir="ltr">{formattedIssueDate}</strong>
                </div>
              )}
            </div>

            <div className="proposal-offer-product-card">
              {primaryExhibitUrl && (
                <div className="proposal-offer-thumb" aria-hidden>
                  <Image
                    src={primaryExhibitUrl}
                    alt=""
                    fill
                    sizes="96px"
                    unoptimized
                  />
                </div>
              )}
              <div className="proposal-offer-product-meta">
                {model?.device && (
                  <small className="proposal-offer-device">{model.device}</small>
                )}
                <div className="proposal-offer-product">
                  <span dir="ltr">{quote.modelName}</span>
                  <strong>
                    {quote.quantity} {quote.quantity === 1 ? "יחידה" : "יחידות"}
                  </strong>
                </div>
              </div>
            </div>

            <dl className="proposal-price-list">
              {quote.totalPriceAgorot === undefined && (
                <div>
                  <dt>מחיר ליחידה</dt>
                  <dd dir="ltr">{shekels(quote.unitPriceAgorot)}</dd>
                </div>
              )}
              <div>
                <dt>מחיר לכמות ({quote.quantity})</dt>
                <dd dir="ltr">{shekels(price.subtotalAgorot)}</dd>
              </div>
              {price.discountAgorot > 0 && (
                <div className="proposal-discount">
                  <dt>הנחה מיוחדת</dt>
                  <dd dir="ltr">−{shekels(price.discountAgorot)}</dd>
                </div>
              )}
              <div>
                <dt>מע״מ</dt>
                <dd>{quote.vatMode === "included" ? "כלול במחיר" : shekels(price.vatAgorot)}</dd>
              </div>
              <div className="proposal-grand-total">
                <dt>סך ההצעה לתשלום</dt>
                <dd dir="ltr">{shekels(price.payableAgorot)}</dd>
              </div>
            </dl>

            <div id="proposal-accept" className="proposal-approval-zone">
              <div className="proposal-approval-badge">
                <span>06 / אישור ההצעה</span>
              </div>
              <AcceptQuote token={token} accepted={quote.status === "accepted"} />
            </div>

            <ProposalWhatsappButton
              quote={quote}
              model={
                model
                  ? {
                      id: model.id,
                      name: model.name,
                      device: model.device,
                      summary: model.summary,
                      specs: model.specs,
                      imageUrl: model.imageUrl,
                      exhibitUrl: primaryExhibitUrl,
                    }
                  : undefined
              }
            />

            <p className="proposal-note">
              {quote.customerType === "store"
                ? "אישור ההצעה מתעד את הזמנת החנות במערכת קורטז. לתיאום מועד אספקה ותנאי התחשבנות ניצור איתכם קשר."
                : "אישור ההצעה מתעד את הסכמתך במערכת. לתיאום זמינות, מסירה ותשלום ניצור איתך קשר."}
            </p>
          </aside>
        </section>
      </div>

      {/* MOBILE STICKY CTA BAR */}
      <div className="proposal-mobile-action">
        <span>
          <small>סך ההצעה</small>
          <strong dir="ltr">{shekels(price.payableAgorot)}</strong>
        </span>
        <a href="#proposal-accept">לאישור ההצעה</a>
      </div>
    </main>
  );
}

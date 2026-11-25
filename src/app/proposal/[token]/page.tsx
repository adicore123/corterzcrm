import Image from "next/image";
import { notFound } from "next/navigation";
import { extractKeySpecs, getModelImages } from "@/components/catalog/catalog-utils";
import { CinematicHero } from "@/components/proposal/CinematicHero";
import { ProductHighlights } from "@/components/proposal/ProductHighlights";
import { ProductStorytelling } from "@/components/proposal/ProductStorytelling";
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
export const metadata = {
  title: "הצעת מחיר אישית | קורטז",
  robots: { index: false, follow: false },
};

const shekels = (agorot: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(agorot / 100);

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
  const keyBadges: Array<{ label: string; value: string }> = [];
  if (keySpecs?.battery) keyBadges.push({ label: "סוללה", value: keySpecs.battery });
  if (keySpecs?.range) keyBadges.push({ label: "טווח נסיעה", value: keySpecs.range });
  if (keySpecs?.highlight) keyBadges.push(keySpecs.highlight);
  for (const spec of model?.specs ?? []) {
    if (keyBadges.length >= 4) break;
    if (!keyBadges.some((b) => b.label === spec.label)) {
      keyBadges.push({ label: spec.label, value: spec.value });
    }
  }

  const vatLabel = quote.vatMode === "included" ? "כולל מע״מ" : "בתוספת מע״מ";

  return (
    <main className="proposal-page" dir="rtl" lang="he">
      {/* HEADER + SECTION 01 — CINEMATIC 3D MEDITERRANEAN HERO */}
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
        {/* SECTION 02 (PRODUCT EXPERIENCE) + SECTION 06 & 07 (PERSONAL QUOTATION & APPROVAL) */}
        <div className="proposal-layout">
          {model && media ? (
            <ProposalShowroom model={model} media={media} />
          ) : (
            <section className="proposal-missing-model">
              <span>תצוגת מוצר</span>
              <h2>{quote.modelName}</h2>
              <p>תמונות ופרטי הדגם אינם זמינים כרגע. פרטי ההצעה נמצאים לצד התצוגה.</p>
            </section>
          )}

          <aside className="proposal-offer" id="offer" aria-labelledby="offer-title">
            <div className="proposal-offer-top">
              <span>06 / הצעת המחיר האישית שלך</span>
              <span>CORTEZ PRIVATE QUOTATION</span>
            </div>

            <h2 id="offer-title">
              {quote.customerType === "store"
                ? `הצעה עבור ${customer}`
                : `הצעה אישית עבור ${customer}`}
            </h2>
            <p className="proposal-offer-description">
              {quote.customerType === "store"
                ? "פרטי העסקה לחנות, בצורה ברורה ומרוכזת."
                : "כל פרטי העסקה שלך, לפני קבלת החלטה."}
            </p>

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
                <dt>מחיר לכמות</dt>
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
                <dt>סך ההצעה</dt>
                <dd dir="ltr">{shekels(price.payableAgorot)}</dd>
              </div>
            </dl>

            <div id="proposal-accept" className="proposal-approval-zone">
              <div className="proposal-approval-badge">
                <span>07 / אישור דיגיטלי מהיר</span>
              </div>
              <AcceptQuote token={token} accepted={quote.status === "accepted"} />
            </div>

            <p className="proposal-note">
              {quote.customerType === "store"
                ? "אישור ההצעה מתעד את הזמנת החנות במערכת קורטז. לתיאום מועד אספקה ותנאי התחשבנות ניצור איתכם קשר."
                : "אישור ההצעה מתעד את הסכמתך במערכת. לתיאום זמינות, מסירה ותשלום ניצור איתך קשר."}
            </p>
          </aside>
        </div>

        {/* SECTION 03 — KEY PRODUCT HIGHLIGHTS */}
        {model && <ProductHighlights model={model} />}

        {/* SECTION 04 — PRODUCT STORYTELLING */}
        {model && <ProductStorytelling model={model} />}

        {/* SECTION 05 — FULL TECHNICAL SPECIFICATIONS */}
        {model && <TechnicalSpecifications model={model} />}
      </div>

      {/* MOBILE STICKY CTA BAR */}
      <div className="proposal-mobile-action">
        <span>
          <small>סך ההצעה</small>
          <strong dir="ltr">{shekels(price.payableAgorot)}</strong>
        </span>
        <a href="#proposal-accept">לבדיקת ההצעה</a>
      </div>
    </main>
  );
}

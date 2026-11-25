import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { catalogModels } from "@/lib/json-db/queries";
import { quoteByToken } from "@/lib/quotes/service";
import { quoteTotal } from "@/lib/quotes/pricing";
import { resolveProposalMedia } from "@/lib/quotes/proposal-media";
import { AcceptQuote } from "./accept-quote";
import { ProposalShowroom } from "./proposal-showroom";

export const dynamic = "force-dynamic";
export const metadata = { title: "הצעת מחיר אישית | קורטז", robots: { index: false, follow: false } };
const shekels = (agorot: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(agorot / 100);

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await quoteByToken(token);
  if (!quote) notFound();
  const storedModel = (await catalogModels()).find((item) => item.id === quote.modelId);
  const model = storedModel ? publicCatalogModels([{ ...storedModel, published: true }])[0] : undefined;
  const price = quoteTotal(quote);
  const customer = quote.customerType === "store" ? quote.storeName || quote.customerName : quote.customerName;
  return <main className="proposal-page" dir="rtl">
    <header className="proposal-header"><Brand /><span>הצעה אישית עבור {customer}</span><a href="#offer">פרטי ההצעה <span aria-hidden>↙</span></a></header>
    <div className="proposal-shell">
      <section className="proposal-heading" aria-labelledby="proposal-title">
        <div><span className="proposal-kicker">CORTEZ · הצעה אישית</span><h1 id="proposal-title" dir="ltr">{quote.modelName}</h1><p>{model?.summary || "הדגם וההצעה שלך, במקום אחד."}</p></div>
        <div className="proposal-heading-total"><span>סך ההצעה</span><strong>{shekels(price.payableAgorot)}</strong><small>{quote.quantity} {quote.quantity === 1 ? "יחידה" : "יחידות"} · {quote.vatMode === "included" ? "כולל מע״מ" : "בתוספת מע״מ"}</small><a href="#proposal-accept">לבדיקת ההצעה ←</a></div>
      </section>
      <div className="proposal-layout">
        {model ? <ProposalShowroom model={model} media={resolveProposalMedia(model)} /> : <section className="proposal-missing-model"><span>תצוגת מוצר</span><h2>{quote.modelName}</h2><p>תמונות ופרטי הדגם אינם זמינים כרגע. פרטי ההצעה נמצאים לצד התצוגה.</p></section>}
        <aside className="proposal-offer" id="offer" aria-labelledby="offer-title">
          <div className="proposal-offer-top"><span>01 / ההצעה שלך</span><span>CORTEZ PRIVATE OFFER</span></div>
          <h2 id="offer-title">{quote.customerType === "store" ? `הצעה עבור ${customer}` : `הצעה אישית עבור ${customer}`}</h2>
          <p className="proposal-offer-description">{quote.customerType === "store" ? "פרטי העסקה לחנות, בצורה ברורה ומרוכזת." : "כל פרטי העסקה שלך, לפני קבלת החלטה."}</p>
          <div className="proposal-offer-product"><span dir="ltr">{quote.modelName}</span><strong>{quote.quantity} {quote.quantity === 1 ? "יחידה" : "יחידות"}</strong></div>
          <dl className="proposal-price-list">
            {quote.totalPriceAgorot === undefined && <div><dt>מחיר ליחידה</dt><dd>{shekels(quote.unitPriceAgorot)}</dd></div>}
            <div><dt>מחיר לכמות</dt><dd>{shekels(price.subtotalAgorot)}</dd></div>
            {price.discountAgorot > 0 && <div className="proposal-discount"><dt>הנחה</dt><dd>−{shekels(price.discountAgorot)}</dd></div>}
            <div><dt>מע״מ</dt><dd>{quote.vatMode === "included" ? "כלול במחיר" : shekels(price.vatAgorot)}</dd></div>
            <div className="proposal-grand-total"><dt>סך ההצעה</dt><dd>{shekels(price.payableAgorot)}</dd></div>
          </dl>
          <div id="proposal-accept"><AcceptQuote token={token} accepted={quote.status === "accepted"} /></div>
          <p className="proposal-note">
            {quote.customerType === "store"
              ? "אישור ההצעה מתעד את הזמנת החנות במערכת קורטז. לתיאום מועד אספקה ותנאי התחשבנות ניצור איתכם קשר."
              : "אישור ההצעה מתעד את הסכמתך במערכת. לתיאום זמינות, מסירה ותשלום ניצור איתך קשר."}
          </p>
        </aside>
      </div>
      {model && ((model.features?.length ?? 0) > 0 || (model.specs?.length ?? 0) > 0) && <section className="proposal-highlights" aria-labelledby="highlights-title">
        <div className="proposal-section-heading"><span>02 / מה בדגם</span><h2 id="highlights-title">לראות את הפרטים. להבין את הבחירה.</h2></div>
        <div className="proposal-highlight-grid">{model.features?.length ? model.features.slice(0, 3).map((feature, index) => <article key={`${feature.title}-${index}`}><span>0{index + 1}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>) : model.specs?.slice(0, 3).map((spec, index) => <article key={`${spec.label}-${index}`}><span>0{index + 1}</span><h3>{spec.label}</h3><p>{spec.value}</p></article>)}</div>
      </section>}
      {model && <section className="proposal-product-details" aria-labelledby="details-title"><div className="proposal-section-heading"><span>03 / המפרט המלא</span><h2 id="details-title">כל פרט, במקום אחד.</h2><p>מפרט, מידות ותכונות הדגם כפי שהם מופיעים בקטלוג קורטז.</p></div>
        {(model.studio?.dimensions || model.dimensions || model.foldedDimensions) && (
          <dl className="proposal-spec-grid" aria-label="מידות הדגם">
            {model.studio?.dimensions && (
              <div>
                <dt>מידות מאומתות (אורך × רוחב × גובה)</dt>
                <dd dir="ltr">{Math.round(model.studio.dimensions.length * 100)} × {Math.round(model.studio.dimensions.width * 100)} × {Math.round(model.studio.dimensions.height * 100)} ס״מ</dd>
              </div>
            )}
            {model.dimensions && (
              <div>
                <dt>מידות הכלי</dt>
                <dd>{model.dimensions}</dd>
              </div>
            )}
            {model.foldedDimensions && (
              <div>
                <dt>מידות במצב מקופל</dt>
                <dd>{model.foldedDimensions}</dd>
              </div>
            )}
          </dl>
        )}
        {model.specs?.length ? <dl className="proposal-spec-grid">{model.specs.slice(0, 12).map((spec) => <div key={`${spec.label}-${spec.value}`}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl> : <p className="proposal-no-specs">מפרט הדגם יימסר על ידי נציג קורטז.</p>}
      </section>}
    </div>
    <div className="proposal-mobile-action"><span><small>סך ההצעה</small><strong>{shekels(price.payableAgorot)}</strong></span><a href="#proposal-accept">לבדיקת ההצעה</a></div>
  </main>;
}

import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { ProductExperience } from "@/components/catalog/product-experience";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { catalogModels } from "@/lib/json-db/queries";
import { quoteByToken } from "@/lib/quotes/service";
import { quoteTotal } from "@/lib/quotes/pricing";
import { AcceptQuote } from "./accept-quote";

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
  return <main className="product-page proposal-page" dir="rtl">
    <header className="product-page-header"><Brand /><span>הצעת מחיר אישית עבור {quote.customerName}</span></header>
    <section className="proposal-intro"><div><span>קורטז · הצעה אישית</span><h1>{quote.modelName}</h1><p>הדגם שלכם. העסקה שלכם. כל הפרטים במקום אחד.</p></div><a href="#proposal-details">לפרטי ההצעה ↓</a></section>
    {model ? <ProductExperience model={model} standalone showPrice={false} proposalMode /> : <section className="proposal-model-fallback"><h2>{quote.modelName}</h2><p>פרטי הדגם אינם זמינים כרגע לתצוגה.</p></section>}
    <section className="proposal-details" id="proposal-details" aria-labelledby="proposal-title"><div className="proposal-details-head"><span>ההצעה שלך</span><h2 id="proposal-title">{quote.customerType === "store" ? quote.storeName || quote.customerName : quote.customerName}</h2><p>{quote.modelName} · {quote.quantity} {quote.quantity === 1 ? "יחידה" : "יחידות"}</p></div>
      <dl className="proposal-price-list">{quote.totalPriceAgorot === undefined && <div><dt>מחיר ליחידה</dt><dd>{shekels(quote.unitPriceAgorot)}</dd></div>}<div><dt>מחיר לכמות</dt><dd>{shekels(price.subtotalAgorot)}</dd></div>
      {price.discountAgorot > 0 && <div><dt>הנחה</dt><dd>−{shekels(price.discountAgorot)}</dd></div>}
      <div><dt>מע״מ</dt><dd>{quote.vatMode === "included" ? "כלול במחיר" : shekels(price.vatAgorot)}</dd></div>
      <div className="proposal-grand-total"><dt>סה״כ לתשלום</dt><dd>{shekels(price.payableAgorot)}</dd></div></dl>
      <AcceptQuote token={token} accepted={quote.status === "accepted"} />
      <p className="proposal-note">אישור ההצעה מתעד את הסכמתכם להצעה במערכת. לתיאום מסירה, זמינות ותשלום ניצור איתכם קשר.</p>
    </section>
  </main>;
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Plus } from "lucide-react";
import type { Quote } from "@/lib/quotes/schema";
import { quoteTotal } from "@/lib/quotes/pricing";

type ModelOption = { id: string; name: string; msrp: number | null; imageUrl?: string };
const shekels = (agorot: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(agorot / 100);

export function QuoteWorkspace({ models, quotes }: { models: ModelOption[]; quotes: Quote[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [type, setType] = useState<"private" | "store">("private");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(models[0]?.msrp ?? 0);
  const [priceMode, setPriceMode] = useState<"unit" | "total">("unit");
  const [totalPrice, setTotalPrice] = useState(0);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "amount">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [vatMode, setVatMode] = useState<"included" | "excluded">("included");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Quote | null>(null);
  const total = (() => { try { return quoteTotal({ quantity, unitPriceAgorot: Math.round(unitPrice * 100), totalPriceAgorot: priceMode === "total" ? Math.round(totalPrice * 100) : undefined,
    discount: discountType === "percent" ? { type: "percent", basisPoints: Math.round(discountValue * 100) } : discountType === "amount" ? { type: "amount", agorot: Math.round(discountValue * 100) } : { type: "none" },
    vatMode, vatBasisPoints: 1800 }); } catch { return null; } })();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = { customerName: String(form.get("customerName")), customerPhone: String(form.get("customerPhone")), customerType: type,
      storeName: type === "store" ? String(form.get("storeName")) : undefined, modelId, quantity, unitPriceAgorot: priceMode === "total" ? Math.round(totalPrice * 100 / quantity) : Math.round(unitPrice * 100), totalPriceAgorot: priceMode === "total" ? Math.round(totalPrice * 100) : undefined, vatMode, vatBasisPoints: 1800,
      discount: discountType === "percent" ? { type: "percent", basisPoints: Math.round(discountValue * 100) } : discountType === "amount" ? { type: "amount", agorot: Math.round(discountValue * 100) } : { type: "none" } };
    try {
      const response = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "לא ניתן לשמור את ההצעה");
      setCreated(data); setOpen(false); router.refresh();
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  const shareUrl = (quote: Quote) => typeof window === "undefined" ? `/proposal/${quote.shareToken}` : `${window.location.origin}/proposal/${quote.shareToken}`;
  const whatsappUrl = (quote: Quote) => {
    const digits = quote.customerPhone.replace(/\D/g, "");
    const phone = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
    return `https://wa.me/${phone}?text=${encodeURIComponent(`שלום ${quote.customerName}, הכנו עבורך הצעת מחיר אישית לדגם ${quote.modelName}. לצפייה בהצעה: ${shareUrl(quote)}`)}`;
  };
  async function cancel(id: string) {
    if (!window.confirm("לבטל את ההצעה? הקישור שנשלח ללקוח יפסיק לעבוד.")) return;
    const response = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
    else setError((await response.json()).error || "לא ניתן לבטל את ההצעה");
  }
  return <div className="page-stack quote-workspace">
    <div className="page-title title-with-action"><div><h1>הצעות מחיר</h1><p>הצעות אישיות עם תצוגת מוצר וחישוב עסקה שקוף</p></div>
      <button className="button" onClick={() => { setCreated(null); setOpen(true); }}><Plus size={18} /> הצעה חדשה</button></div>
    {created && <div className="card quote-created" role="status"><strong>ההצעה מוכנה לשיתוף</strong><a href={shareUrl(created)} target="_blank" rel="noopener noreferrer">פתיחת הצעה <ExternalLink size={16} /></a><a href={whatsappUrl(created)} target="_blank" rel="noopener noreferrer">שליחה בוואטסאפ</a>
      <button className="button" onClick={() => navigator.clipboard.writeText(shareUrl(created))}><Copy size={16} /> העתקת קישור</button></div>}
    {open && <section className="card quote-editor"><h2>פרטי ההצעה</h2><form onSubmit={submit} className="quote-form">
      <label>סוג לקוח<select value={type} onChange={(event) => setType(event.target.value as "private" | "store")}><option value="private">לקוח פרטי</option><option value="store">חנות</option></select></label>
      <label>שם איש קשר<input name="customerName" required maxLength={120} /></label>
      {type === "store" && <label>שם חנות<input name="storeName" required maxLength={120} /></label>}
      <label>טלפון<input name="customerPhone" type="tel" required minLength={7} maxLength={32} /></label>
      <label>דגם<select value={modelId} onChange={(event) => { const price = models.find((model) => model.id === event.target.value)?.msrp ?? 0; setModelId(event.target.value); setUnitPrice(price); setTotalPrice(Number((price * quantity).toFixed(2))); }}>{models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></label>
      <label>כמות<input type="number" min={1} max={100000} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></label>
      <label>שיטת תמחור<select aria-label="שיטת תמחור" value={priceMode} onChange={(event) => { const next = event.target.value as typeof priceMode; if (next === "total") setTotalPrice(Number((unitPrice * quantity).toFixed(2))); setPriceMode(next); }}><option value="unit">מחיר ליחידה</option><option value="total">מחיר כולל לכמות</option></select></label>
      {priceMode === "unit" ? <label>מחיר ליחידה ₪<input type="number" min={0} step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(Number(event.target.value))} required /></label>
        : <label>מחיר כולל לכמות ₪<input type="number" min={0} step="0.01" value={totalPrice} onChange={(event) => setTotalPrice(Number(event.target.value))} required /></label>}
      <label>הנחה<select value={discountType} onChange={(event) => { setDiscountType(event.target.value as typeof discountType); setDiscountValue(0); }}><option value="none">ללא הנחה</option><option value="percent">אחוז</option><option value="amount">סכום ₪</option></select></label>
      {discountType !== "none" && <label>{discountType === "percent" ? "אחוז הנחה" : "סכום הנחה ₪"}<input type="number" min={0} max={discountType === "percent" ? 100 : undefined} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} /></label>}
      <label>מע״מ<select value={vatMode} onChange={(event) => setVatMode(event.target.value as typeof vatMode)}><option value="included">כלול במחיר</option><option value="excluded">להוסיף 18%</option></select></label>
      <div className="quote-form-total">לתשלום <strong>{total ? shekels(total.payableAgorot) : "יש לתקן את המחיר או ההנחה"}</strong></div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="dialog-actions"><button type="submit" className="button" disabled={busy || !total || !modelId}>{busy ? "יוצר…" : "יצירת הצעה וקישור"}</button><button type="button" className="button" onClick={() => setOpen(false)}>ביטול</button></div>
    </form></section>}
    <section className="card detail-card"><h2>הצעות שנוצרו</h2>{error && !open && <p role="alert" className="error-message">{error}</p>}{quotes.length ? <div className="quote-list">{quotes.map((quote) => <article key={quote.id} className="quote-list-row"><div><strong>{quote.modelName}</strong><span>{quote.customerName}{quote.storeName ? ` · ${quote.storeName}` : ""} · {quote.quantity} יחידות</span></div><div><strong>{shekels(quoteTotal(quote).payableAgorot)}</strong><span>{quote.status === "accepted" ? "אושרה" : quote.status === "cancelled" ? "בוטלה" : "נשלחה"}</span></div><div className="quote-row-actions">{quote.status !== "cancelled" && <><a href={shareUrl(quote)} target="_blank" rel="noopener noreferrer">צפייה</a><a href={whatsappUrl(quote)} target="_blank" rel="noopener noreferrer">וואטסאפ</a><button onClick={() => navigator.clipboard.writeText(shareUrl(quote))}>העתקת קישור</button></>}{quote.status === "sent" && <button onClick={() => cancel(quote.id)}>ביטול הצעה</button>}</div></article>)}</div> : <p className="muted">עדיין אין הצעות. התחילו בהצעה הראשונה.</p>}</section>
  </div>;
}

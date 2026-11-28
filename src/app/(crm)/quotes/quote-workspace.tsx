"use client";

import { startTransition, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, MessageCircle, PackagePlus, Plus, Search, X } from "lucide-react";
import type { PublicQuote } from "@/lib/quotes/schema";
import { quoteTotal } from "@/lib/quotes/pricing";
import {
  shareQuoteImageAndTextOnWhatsapp,
  type QuoteWhatsappModelInfo,
} from "@/lib/quotes/whatsapp";

type ModelOption = QuoteWhatsappModelInfo & { msrp: number | null };

export type QuoteCustomerOption = {
  id: string;
  name: string;
  store: string;
  phone: string;
  customerType: "private" | "store";
};

const shekels = (agorot: number) => {
  const isWhole = agorot % 100 === 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(agorot / 100);
};

export function QuoteWorkspace({
  models,
  customers = [],
  initialCustomer,
  quotes,
}: {
  models: ModelOption[];
  customers?: QuoteCustomerOption[];
  initialCustomer?: QuoteCustomerOption;
  quotes: PublicQuote[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialCustomer));
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [type, setType] = useState<"private" | "store">(initialCustomer?.customerType ?? "private");
  const [customerName, setCustomerName] = useState(initialCustomer?.name ?? "");
  const [storeName, setStoreName] = useState(initialCustomer?.store ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone ?? "");
  const [custSearch, setCustSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(models[0]?.msrp ?? 0);
  const [priceMode, setPriceMode] = useState<"unit" | "total">("unit");
  const [totalPrice, setTotalPrice] = useState(0);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "amount">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [vatMode, setVatMode] = useState<"included" | "excluded">("included");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareHint, setShareHint] = useState("");
  const [created, setCreated] = useState<PublicQuote | null>(null);
  const [addedQuotes, setAddedQuotes] = useState<PublicQuote[]>([]);
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "accepted" | "cancelled">("all");
  const [listQuery, setListQuery] = useState("");

  const liveQuotes = useMemo(() => {
    const serverIds = new Set(quotes.map((q) => q.id));
    const fresh = addedQuotes.filter((q) => !serverIds.has(q.id));
    return [...fresh, ...quotes].map((q) =>
      cancelledIds.has(q.id) ? { ...q, status: "cancelled" as const } : q,
    );
  }, [quotes, addedQuotes, cancelledIds]);

  const filteredQuotes = useMemo(() => {
    const q = listQuery.trim().toLocaleLowerCase("he");
    return liveQuotes.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.customerName.toLocaleLowerCase("he").includes(q)
        || (item.storeName ?? "").toLocaleLowerCase("he").includes(q)
        || item.customerPhone.includes(q)
        || item.modelName.toLocaleLowerCase("he").includes(q)
      );
    });
  }, [liveQuotes, statusFilter, listQuery]);

  const statusCounts = useMemo(
    () => ({
      all: liveQuotes.length,
      sent: liveQuotes.filter((q) => q.status === "sent").length,
      accepted: liveQuotes.filter((q) => q.status === "accepted").length,
      cancelled: liveQuotes.filter((q) => q.status === "cancelled").length,
    }),
    [liveQuotes],
  );

  const modelsById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const customerMatches = useMemo(() => {
    const clean = custSearch.trim().toLocaleLowerCase("he");
    if (!clean) return [];
    const digits = clean.replace(/\D/g, "");
    return customers
      .filter((c) => {
        if (
          c.name.toLocaleLowerCase("he").includes(clean)
          || c.store.toLocaleLowerCase("he").includes(clean)
          || c.phone.includes(clean)
        ) {
          return true;
        }
        return digits.length >= 2 && c.phone.replace(/\D/g, "").includes(digits);
      })
      .slice(0, 6);
  }, [customers, custSearch]);

  const visualModels = useMemo(() => {
    const clean = modelSearch.trim().toLocaleLowerCase("he");
    if (!clean) return models.slice(0, 12);
    return models
      .filter(
        (m) =>
          m.name.toLocaleLowerCase("he").includes(clean)
          || (m.device ?? "").toLocaleLowerCase("he").includes(clean),
      )
      .slice(0, 12);
  }, [models, modelSearch]);

  function pickModel(id: string) {
    const price = models.find((m) => m.id === id)?.msrp ?? 0;
    setModelId(id);
    setUnitPrice(price);
    setTotalPrice(Number((price * quantity).toFixed(2)));
  }

  const total = (() => {
    try {
      return quoteTotal({
        quantity,
        unitPriceAgorot: Math.round(unitPrice * 100),
        totalPriceAgorot: priceMode === "total" ? Math.round(totalPrice * 100) : undefined,
        discount:
          discountType === "percent"
            ? { type: "percent", basisPoints: Math.round(discountValue * 100) }
            : discountType === "amount"
              ? { type: "amount", agorot: Math.round(discountValue * 100) }
              : { type: "none" },
        vatMode,
        vatBasisPoints: 1800,
      });
    } catch {
      return null;
    }
  })();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerType: type,
      storeName: type === "store" ? storeName.trim() : undefined,
      modelId,
      quantity,
      unitPriceAgorot:
        priceMode === "total"
          ? Math.round((totalPrice * 100) / quantity)
          : Math.round(unitPrice * 100),
      totalPriceAgorot: priceMode === "total" ? Math.round(totalPrice * 100) : undefined,
      vatMode,
      vatBasisPoints: 1800,
      discount:
        discountType === "percent"
          ? { type: "percent", basisPoints: Math.round(discountValue * 100) }
          : discountType === "amount"
            ? { type: "amount", agorot: Math.round(discountValue * 100) }
            : { type: "none" },
    };
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "לא ניתן לשמור את ההצעה");
      setCreated(data);
      setAddedQuotes((prev) => [data, ...prev.filter((q) => q.id !== data.id)]);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shareUrl = (quote: PublicQuote) =>
    typeof window === "undefined"
      ? `/proposal/${quote.shareToken}`
      : `${window.location.origin}/proposal/${quote.shareToken}`;

  async function handleSendWhatsappWithImage(quote: PublicQuote) {
    setShareHint("");
    const model = modelsById.get(quote.modelId);
    try {
      const result = await shareQuoteImageAndTextOnWhatsapp(quote, model);
      if (result.mode === "web-share") {
        setShareHint(
          `קובץ התמונה והמלל הועברו לוואטסאפ (מספר הלקוח ${result.phone} הועתק ללוח לחיפוש מהיר).`,
        );
      } else if (result.mode === "clipboard-wa") {
        setShareHint(
          `נפתח הצ׳אט עם ${result.phone} ותמונת המוצר הועתקה ללוח — לחצו Ctrl+V בצ׳אט כדי להדביק את התמונה.`,
        );
      }
    } catch {
      // User cancelled share sheet
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("לבטל את ההצעה? הקישור שנשלח ללקוח יפסיק לעבוד.")) return;
    const response = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    if (response.ok) {
      setCancelledIds((prev) => new Set(prev).add(id));
      startTransition(() => router.refresh());
    } else {
      setError((await response.json()).error || "לא ניתן לבטל את ההצעה");
    }
  }

  return (
    <div className="page-stack quote-workspace">
      <div className="page-title title-with-action">
        <div>
          <h1>הצעות מחיר</h1>
          <p>הצעות אישיות עם שליחת תמונת המוצר ומלל ההצעה המלא בוואטסאפ או קישור לאישור אונליין</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            setCreated(null);
            setOpen(true);
          }}
        >
          <Plus size={18} /> הצעה חדשה
        </button>
      </div>

      {shareHint && (
        <p className="success-message" role="status">
          {shareHint}
        </p>
      )}

      {created && (
        <div className="card quote-created" role="status">
          <strong>ההצעה מוכנה לשיתוף</strong>
          <button
            type="button"
            className="button button-whatsapp-quote"
            onClick={() => handleSendWhatsappWithImage(created)}
          >
            <MessageCircle size={16} /> שליחת תמונה + הצעה בוואטסאפ ({created.customerPhone})
          </button>
          <a href={shareUrl(created)} target="_blank" rel="noopener noreferrer">
            פתיחת הצעה <ExternalLink size={16} />
          </a>
          <button
            type="button"
            className="button button-outline"
            onClick={() => navigator.clipboard.writeText(shareUrl(created))}
          >
            <Copy size={16} /> העתקת קישור
          </button>
        </div>
      )}

      {open && (
        <section className="card quote-editor">
          <div className="section-heading">
            <h2>פרטי ההצעה</h2>
            <button type="button" className="button button-ghost button-sm" onClick={() => setOpen(false)}>
              <X size={16} /> סגירה
            </button>
          </div>

          {customers.length > 0 && (
            <div className="smart-customer-box mb-3">
              <div className="search-field">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  placeholder="מילוי מהיר מלקוח קיים (חפשו שם, חנות או טלפון)…"
                  aria-label="חיפוש לקוח קיים להצעת מחיר"
                />
                {custSearch && (
                  <button
                    type="button"
                    className="inline-clear-btn"
                    onClick={() => setCustSearch("")}
                    aria-label="ניקוי חיפוש לקוח"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {customerMatches.length > 0 && (
                <div className="smart-customer-pills">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="smart-customer-pill"
                      onClick={() => {
                        setType(c.customerType);
                        setCustomerName(c.name);
                        setStoreName(c.store);
                        setCustomerPhone(c.phone);
                        setCustSearch("");
                      }}
                    >
                      <Check size={14} aria-hidden />
                      <strong>{c.name}</strong>
                      {c.store && <span>· {c.store}</span>}
                      <bdi dir="ltr" className="muted">
                        {c.phone}
                      </bdi>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="quote-visual-models">
            <div className="quote-visual-head">
              <span>בחירה מהירה של דגם מהקטלוג:</span>
              <input
                type="search"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="סינון דגם…"
                aria-label="סינון דגמים בהצעת מחיר"
                className="quote-model-filter"
              />
            </div>
            <div className="quote-model-strip">
              {visualModels.map((m) => {
                const selected = m.id === modelId;
                const thumb = m.imageUrl || m.exhibitUrl;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={"quote-model-card" + (selected ? " is-selected" : "")}
                    onClick={() => pickModel(m.id)}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" aria-hidden loading="lazy" />
                    ) : null}
                    <strong>{m.name}</strong>
                    <small>{m.msrp ? `₪${m.msrp.toLocaleString("he-IL")}` : m.device}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={submit} className="quote-form">
            <label>
              סוג לקוח
              <select
                value={type}
                onChange={(event) => setType(event.target.value as "private" | "store")}
              >
                <option value="private">לקוח פרטי</option>
                <option value="store">חנות</option>
              </select>
            </label>
            <label>
              שם איש קשר
              <input
                name="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                maxLength={120}
              />
            </label>
            {type === "store" && (
              <label>
                שם חנות
                <input
                  name="storeName"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                  maxLength={120}
                />
              </label>
            )}
            <label>
              טלפון
              <input
                name="customerPhone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
                minLength={7}
                maxLength={32}
              />
            </label>
            <label>
              דגם
              <select value={modelId} onChange={(event) => pickModel(event.target.value)}>
                {models.map((model) => (
                  <option value={model.id} key={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              כמות
              <input
                type="number"
                min={1}
                max={100000}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                required
              />
            </label>
            <label>
              שיטת תמחור
              <select
                aria-label="שיטת תמחור"
                value={priceMode}
                onChange={(event) => {
                  const next = event.target.value as typeof priceMode;
                  if (next === "total") setTotalPrice(Number((unitPrice * quantity).toFixed(2)));
                  setPriceMode(next);
                }}
              >
                <option value="unit">מחיר ליחידה</option>
                <option value="total">מחיר כולל לכמות</option>
              </select>
            </label>
            {priceMode === "unit" ? (
              <label>
                מחיר ליחידה ₪
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(Number(event.target.value))}
                  required
                />
              </label>
            ) : (
              <label>
                מחיר כולל לכמות ₪
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalPrice}
                  onChange={(event) => setTotalPrice(Number(event.target.value))}
                  required
                />
              </label>
            )}
            <label>
              הנחה
              <select
                value={discountType}
                onChange={(event) => {
                  setDiscountType(event.target.value as typeof discountType);
                  setDiscountValue(0);
                }}
              >
                <option value="none">ללא הנחה</option>
                <option value="percent">אחוז</option>
                <option value="amount">סכום ₪</option>
              </select>
            </label>
            {discountType !== "none" && (
              <label>
                {discountType === "percent" ? "אחוז הנחה" : "סכום הנחה ₪"}
                <input
                  type="number"
                  min={0}
                  max={discountType === "percent" ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(Number(event.target.value))}
                />
              </label>
            )}
            <label>
              מע״מ
              <select
                value={vatMode}
                onChange={(event) => setVatMode(event.target.value as typeof vatMode)}
              >
                <option value="included">כלול במחיר</option>
                <option value="excluded">להוסיף 18%</option>
              </select>
            </label>
            <div className="quote-form-total">
              לתשלום{" "}
              <strong>
                {total ? shekels(total.payableAgorot) : "יש לתקן את המחיר או ההנחה"}
              </strong>
            </div>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || !total || !modelId}
              >
                {busy ? "יוצר…" : "יצירת הצעה וקישור"}
              </button>
              <button type="button" className="button button-outline" onClick={() => setOpen(false)}>
                ביטול
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card detail-card">
        <div className="section-heading flex-wrap gap-3">
          <h2>הצעות שנוצרו ({filteredQuotes.length})</h2>
          <div className="status-pills-bar" role="group" aria-label="סינון סטטוס הצעות מחיר">
            {(
              [
                ["all", "הכל", statusCounts.all, "neutral"],
                ["sent", "נשלחו", statusCounts.sent, "blue"],
                ["accepted", "אושרו", statusCounts.accepted, "green"],
                ["cancelled", "בוטלו", statusCounts.cancelled, "neutral"],
              ] as const
            ).map(([key, label, count, tone]) => (
              <button
                key={key}
                type="button"
                className={
                  `status-pill-tab tone-${tone}` + (statusFilter === key ? " is-active" : "")
                }
                onClick={() => setStatusFilter(key)}
              >
                <span>{label}</span>
                <bdi>{count}</bdi>
              </button>
            ))}
          </div>
        </div>

        {liveQuotes.length > 2 && (
          <div className="search-field">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="חיפוש הצעה לפי שם לקוח, חנות, טלפון או דגם…"
              aria-label="חיפוש ברשימת הצעות המחיר"
            />
          </div>
        )}

        {error && !open && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {filteredQuotes.length ? (
          <div className="quote-list">
            {filteredQuotes.map((quote) => {
              const model = modelsById.get(quote.modelId);
              const thumbUrl = model?.imageUrl || model?.exhibitUrl;
              return (
                <article key={quote.id} className="quote-list-row">
                  <div className="quote-row-model-info">
                    {thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt={quote.modelName}
                        className="quote-row-thumb"
                      />
                    )}
                    <div>
                      <strong>{quote.modelName}</strong>
                      <span>
                        {quote.customerName}
                        {quote.storeName ? ` · ${quote.storeName}` : ""} ·{" "}
                        <bdi dir="ltr">{quote.customerPhone}</bdi> · {quote.quantity}{" "}
                        {quote.quantity === 1 ? "יחידה" : "יחידות"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <strong>{shekels(quoteTotal(quote).payableAgorot)}</strong>
                    <span
                      className={
                        "status "
                        + (quote.status === "accepted"
                          ? "status-green"
                          : quote.status === "cancelled"
                            ? "status-neutral"
                            : "status-blue")
                      }
                    >
                      {quote.status === "accepted"
                        ? "אושרה"
                        : quote.status === "cancelled"
                          ? "בוטלה"
                          : "נשלחה"}
                    </span>
                  </div>
                  <div className="quote-row-actions">
                    {quote.status !== "cancelled" && (
                      <>
                        <button
                          type="button"
                          className="quote-whatsapp-link"
                          onClick={() => handleSendWhatsappWithImage(quote)}
                          title={`שליחת תמונת המוצר וכל מלל ההצעה ללא קישור אל ${quote.customerPhone}`}
                        >
                          <MessageCircle size={15} /> וואטסאפ (תמונה + הצעה)
                        </button>
                        <Link href={`/orders?new=1&quoteId=${quote.id}`}>
                          <PackagePlus size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> הפוך להזמנה
                        </Link>
                        <a href={shareUrl(quote)} target="_blank" rel="noopener noreferrer">
                          צפייה
                        </a>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(shareUrl(quote))}
                        >
                          העתקת קישור
                        </button>
                      </>
                    )}
                    {quote.status === "sent" && (
                      <button type="button" onClick={() => cancel(quote.id)}>
                        ביטול הצעה
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {liveQuotes.length ? "לא נמצאו הצעות התואמות לסינון." : "עדיין אין הצעות. התחילו בהצעה הראשונה."}
          </p>
        )}
      </section>
    </div>
  );
}

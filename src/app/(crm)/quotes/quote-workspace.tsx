"use client";

import { startTransition, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  MessageCircle,
  Minus,
  PackagePlus,
  Phone,
  Plus,
  Save,
  Search,
  Sparkles,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { newRequestId, requestJson } from "@/lib/client-api";
import { formatDate, phoneHref } from "@/lib/presentation";
import { quoteTotal } from "@/lib/quotes/pricing";
import type { PublicQuote } from "@/lib/quotes/schema";
import {
  shareQuoteImageAndTextOnWhatsapp,
  type QuoteWhatsappModelInfo,
} from "@/lib/quotes/whatsapp";
import type { Customer } from "@/lib/validation/models";

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

function expiryStatusBadge(expiresAt?: string, status?: string) {
  if (!expiresAt || status === "cancelled" || status === "accepted") return null;
  const diffMs = Date.parse(expiresAt) - Date.now();
  const days = Math.ceil(diffMs / 86_400_000);
  if (days < 0) {
    return <span className="sla-badge is-urgent">פג תוקף</span>;
  }
  if (days <= 3) {
    return <span className="sla-badge is-urgent">בתוקף עוד {days === 1 ? "יום" : `${days} ימים`}</span>;
  }
  return <span className="sla-badge is-normal">בתוקף עוד {days} ימים</span>;
}

export function QuoteWorkspace({
  models,
  customers: initialCustomers = [],
  initialCustomer,
  initialOpenNew = false,
  quotes,
}: {
  models: ModelOption[];
  customers?: QuoteCustomerOption[];
  initialCustomer?: QuoteCustomerOption;
  initialOpenNew?: boolean;
  quotes: PublicQuote[];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [customers, setCustomers] = useState<QuoteCustomerOption[]>(initialCustomers);
  const [open, setOpen] = useState(initialOpenNew);
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

  // Inline "+ לקוח חדש" modal state inside Quotes
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustType, setNewCustType] = useState<"private" | "store">("store");
  const [newCustName, setNewCustName] = useState("");
  const [newCustStore, setNewCustStore] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustBusy, setNewCustBusy] = useState(false);
  const [newCustError, setNewCustError] = useState("");
  const newCustRequestId = useRef("");

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

  const kpiStats = useMemo(() => {
    let activeValueAgorot = 0;
    let sent = 0;
    let accepted = 0;
    let cancelled = 0;
    for (const q of liveQuotes) {
      if (q.status === "sent") sent += 1;
      else if (q.status === "accepted") accepted += 1;
      else if (q.status === "cancelled") cancelled += 1;
      if (q.status !== "cancelled") {
        try {
          activeValueAgorot += quoteTotal(q).payableAgorot;
        } catch {
          // ignore malformed total
        }
      }
    }
    return {
      all: liveQuotes.length,
      sent,
      accepted,
      cancelled,
      activeValueAgorot,
    };
  }, [liveQuotes]);

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
    if (!clean) return models.slice(0, 14);
    return models
      .filter(
        (m) =>
          m.name.toLocaleLowerCase("he").includes(clean)
          || (m.device ?? "").toLocaleLowerCase("he").includes(clean),
      )
      .slice(0, 14);
  }, [models, modelSearch]);

  function pickModel(id: string) {
    const price = models.find((m) => m.id === id)?.msrp ?? 0;
    setModelId(id);
    setUnitPrice(price);
    setTotalPrice(Number((price * quantity).toFixed(2)));
  }

  function applyQuickDiscount(preset: "none" | "p5" | "p10" | "p15") {
    if (preset === "none") {
      setDiscountType("none");
      setDiscountValue(0);
    } else if (preset === "p5") {
      setDiscountType("percent");
      setDiscountValue(5);
    } else if (preset === "p10") {
      setDiscountType("percent");
      setDiscountValue(10);
    } else {
      setDiscountType("percent");
      setDiscountValue(15);
    }
  }

  async function handleSaveInlineCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newCustBusy) return;
    setNewCustError("");
    setNewCustBusy(true);
    if (!newCustRequestId.current) newCustRequestId.current = newRequestId();
    try {
      const saved = await requestJson<Customer>("/api/orders/customers", "POST", {
        customerType: newCustType,
        name: newCustName,
        store: newCustType === "store" ? newCustStore : "",
        phone: newCustPhone,
        requestId: newCustRequestId.current,
      });
      const option: QuoteCustomerOption = {
        id: saved.id,
        name: saved.name,
        store: saved.customerType === "store" ? saved.store : "",
        phone: saved.phone,
        customerType: saved.customerType === "store" ? "store" : "private",
      };
      setCustomers((prev) => [option, ...prev.filter((c) => c.id !== option.id)]);
      setType(option.customerType);
      setCustomerName(option.name);
      setStoreName(option.store);
      setCustomerPhone(option.phone);
      setNewCustOpen(false);
      newCustRequestId.current = "";
      addToast({
        title: "הלקוח נשמר ושויך להצעת המחיר",
        variant: "success",
      });
    } catch (err) {
      setNewCustError((err as Error).message || "לא ניתן לשמור את הלקוח.");
    } finally {
      setNewCustBusy(false);
    }
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
      addToast({
        title: "הצעת המחיר נוצרה בהצלחה",
        description: "אפשר לשתף מיד בוואטסאפ או להעתיק את הקישור.",
        variant: "success",
      });
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

  function copyQuoteLink(quote: PublicQuote) {
    void navigator.clipboard.writeText(shareUrl(quote));
    addToast({
      title: "קישור ההצעה הועתק ללוח",
      variant: "success",
    });
  }

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
      addToast({
        title: "ההצעה בוטלה",
        variant: "default",
      });
      startTransition(() => router.refresh());
    } else {
      setError((await response.json()).error || "לא ניתן לבטל את ההצעה");
    }
  }

  const selectedModelObj = modelsById.get(modelId);

  return (
    <div className="page-stack quote-workspace">
      <section className="module-hero-header card">
        <div className="module-hero-main">
          <span className="module-hero-icon tone-red" aria-hidden>
            <FileText size={24} />
          </span>
          <div className="page-title">
            <h1>הצעות מחיר</h1>
            <p>הצעות מחיר יוקרתיות עם תצוגת 3D, שליחת תמונה ומלל בוואטסאפ ואישור לקוח בלחיצה</p>
          </div>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setCreated(null);
            setOpen(true);
          }}
        >
          <Plus size={18} /> הצעה חדשה
        </button>
      </section>

      {/* 4 KPI SUMMARY CARDS */}
      <section className="kpi-summary-strip" aria-label="סיכום הצעות מחיר">
        <div className="kpi-summary-card card">
          <span className="kpi-summary-icon tone-red" aria-hidden>
            <FileText size={19} />
          </span>
          <div>
            <strong>{kpiStats.all}</strong>
            <span>סה״כ הצעות</span>
          </div>
        </div>
        <div className="kpi-summary-card card">
          <span className="kpi-summary-icon tone-blue" aria-hidden>
            <Clock3 size={19} />
          </span>
          <div>
            <strong>{kpiStats.sent}</strong>
            <span>ממתינות לאישור</span>
          </div>
        </div>
        <div className="kpi-summary-card card">
          <span className="kpi-summary-icon tone-green" aria-hidden>
            <CircleCheck size={19} />
          </span>
          <div>
            <strong>{kpiStats.accepted}</strong>
            <span>אושרו ע״י לקוח</span>
          </div>
        </div>
        <div className="kpi-summary-card card">
          <span className="kpi-summary-icon tone-amber" aria-hidden>
            <Sparkles size={19} />
          </span>
          <div>
            <strong>{shekels(kpiStats.activeValueAgorot)}</strong>
            <span>שווי הצעות פעילות</span>
          </div>
        </div>
      </section>

      {shareHint && (
        <p className="success-message" role="status">
          {shareHint}
        </p>
      )}

      {created && (
        <div className="card quote-created-banner" role="status">
          <div className="quote-created-info">
            <span className="status status-green">
              <CircleCheck size={14} aria-hidden /> ההצעה מוכנה לשיתוף
            </span>
            <strong>
              {created.modelName} ×{created.quantity} עבור {created.customerName}
              {created.storeName ? ` (${created.storeName})` : ""}
            </strong>
          </div>
          <div className="quote-created-actions">
            <button
              type="button"
              className="button detail-wa-btn"
              onClick={() => handleSendWhatsappWithImage(created)}
            >
              <MessageCircle size={16} /> שליחת תמונה + הצעה בוואטסאפ ({created.customerPhone})
            </button>
            <Button asChild variant="soft">
              <Link href={`/orders?new=1&quoteId=${created.id}`}>
                <PackagePlus size={16} /> הפוך להזמנה
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={shareUrl(created)} target="_blank" rel="noopener noreferrer">
                פתיחת הצעה <ExternalLink size={15} />
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={() => copyQuoteLink(created)}>
              <Copy size={15} /> העתקת קישור
            </Button>
          </div>
        </div>
      )}

      {open && (
        <section className="card quote-editor">
          <div className="section-heading">
            <h2>
              <span className="section-icon">
                <FileText size={18} aria-hidden />
              </span>
              פרטי ההצעה החדשה
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X size={16} /> סגירה
            </Button>
          </div>

          <div className="smart-customer-box">
            <div className="smart-customer-top">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewCustError("");
                  setNewCustName(custSearch.trim());
                  setNewCustOpen(true);
                }}
              >
                <UserRoundPlus size={16} /> לקוח חדש
              </Button>
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

          <div className="quote-visual-models">
            <div className="quote-visual-head">
              <span>בחירה ויזואלית מהירה של דגם מהקטלוג:</span>
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
                placeholder="שם מלא של הלקוח"
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
                  placeholder="שם החנות או העסק"
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
                placeholder="050-0000000"
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

            <div className="quote-qty-field">
              <label htmlFor="quote-qty-input">כמות</label>
              <div className="quote-qty-control">
                <button
                  type="button"
                  className="qty-step-btn"
                  aria-label="הפחתת כמות"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus size={15} />
                </button>
                <input
                  id="quote-qty-input"
                  aria-label="כמות"
                  type="number"
                  min={1}
                  max={100000}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  required
                />
                <button
                  type="button"
                  className="qty-step-btn"
                  aria-label="הגדלת כמות"
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

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

            <div className="field-wide quote-discount-box">
              <div className="quick-chips-header">
                <span>הנחה מהירה בלחיצה:</span>
                <div className="quick-chips-row">
                  <button
                    type="button"
                    className={"quick-chip" + (discountType === "none" ? " is-selected" : "")}
                    onClick={() => applyQuickDiscount("none")}
                  >
                    ללא הנחה
                  </button>
                  <button
                    type="button"
                    className={
                      "quick-chip"
                      + (discountType === "percent" && discountValue === 5 ? " is-selected" : "")
                    }
                    onClick={() => applyQuickDiscount("p5")}
                  >
                    5% הנחה
                  </button>
                  <button
                    type="button"
                    className={
                      "quick-chip"
                      + (discountType === "percent" && discountValue === 10 ? " is-selected" : "")
                    }
                    onClick={() => applyQuickDiscount("p10")}
                  >
                    10% הנחה
                  </button>
                  <button
                    type="button"
                    className={
                      "quick-chip"
                      + (discountType === "percent" && discountValue === 15 ? " is-selected" : "")
                    }
                    onClick={() => applyQuickDiscount("p15")}
                  >
                    15% הנחה
                  </button>
                </div>
              </div>
              <div className="fields-grid">
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
              </div>
            </div>

            <div className="quote-invoice-summary">
              <div className="quote-invoice-meta">
                <span>
                  {selectedModelObj?.name ?? "דגם"} × {quantity} יח׳
                </span>
                {total && total.discountAgorot > 0 && (
                  <span className="quote-discount-pill">
                    חיסכון ללקוח: {shekels(total.discountAgorot)}
                  </span>
                )}
              </div>
              <div className="quote-form-total">
                <span>סה״כ לתשלום ({vatMode === "included" ? "כולל מע״מ" : "בתוספת מע״מ"})</span>
                <strong>
                  {total ? shekels(total.payableAgorot) : "יש לתקן את המחיר או ההנחה"}
                </strong>
              </div>
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

      {/* INLINE MODAL — CREATE NEW CUSTOMER FROM QUOTE FORM */}
      <Modal
        open={newCustOpen}
        onOpenChange={(next) => {
          if (!newCustBusy) setNewCustOpen(next);
        }}
        title="לקוח חדש"
        description="הלקוח יישמר אוטומטית במודול לקוחות ופרטיו ימולאו בהצעת המחיר."
      >
        <form className="dialog-form" onSubmit={handleSaveInlineCustomer} noValidate>
          <label className="field">
            <span>סוג לקוח</span>
            <select
              value={newCustType}
              onChange={(e) => setNewCustType(e.target.value as "private" | "store")}
            >
              <option value="store">חנות / עסק</option>
              <option value="private">לקוח פרטי</option>
            </select>
          </label>
          <label className="field">
            <span>שם לקוח / איש קשר</span>
            <input
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              required
              maxLength={120}
              placeholder="שם מלא"
            />
          </label>
          {newCustType === "store" && (
            <label className="field">
              <span>שם החנות</span>
              <input
                value={newCustStore}
                onChange={(e) => setNewCustStore(e.target.value)}
                required
                maxLength={120}
                placeholder="למשל: אופני המרכז"
              />
            </label>
          )}
          <label className="field">
            <span>מספר טלפון</span>
            <input
              type="tel"
              dir="ltr"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              required
              maxLength={32}
              placeholder="050-0000000"
            />
          </label>
          {newCustError && (
            <p role="alert" className="error-message">
              {newCustError}
            </p>
          )}
          <div className="dialog-actions">
            <Button type="submit" disabled={newCustBusy}>
              <Save size={16} /> {newCustBusy ? "שומר…" : "שמירת לקוח ושיוך להצעה"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={newCustBusy}
              onClick={() => setNewCustOpen(false)}
            >
              ביטול
            </Button>
          </div>
        </form>
      </Modal>

      <section className="card detail-card">
        <div className="section-heading flex-wrap gap-3">
          <h2>הצעות שנוצרו ({filteredQuotes.length})</h2>
          <div className="status-pills-bar" role="group" aria-label="סינון סטטוס הצעות מחיר">
            {(
              [
                ["all", "הכל", kpiStats.all, "neutral"],
                ["sent", "ממתינות לאישור", kpiStats.sent, "blue"],
                ["accepted", "אושרו ע״י לקוח", kpiStats.accepted, "green"],
                ["cancelled", "בוטלו", kpiStats.cancelled, "neutral"],
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

        {liveQuotes.length > 0 && (
          <div className="search-field">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="חיפוש הצעה לפי שם לקוח, חנות, טלפון או דגם…"
              aria-label="חיפוש ברשימת הצעות המחיר"
            />
            {listQuery && (
              <button
                type="button"
                className="inline-clear-btn"
                onClick={() => setListQuery("")}
                aria-label="ניקוי חיפוש הצעות"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {error && !open && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {filteredQuotes.length ? (
          <div className="quote-deal-cards">
            {filteredQuotes.map((quote) => {
              const model = modelsById.get(quote.modelId);
              const thumbUrl = model?.imageUrl || model?.exhibitUrl;
              const statusTone =
                quote.status === "accepted"
                  ? "green"
                  : quote.status === "cancelled"
                    ? "neutral"
                    : "blue";
              const statusLabel =
                quote.status === "accepted"
                  ? "אושרה ע״י הלקוח"
                  : quote.status === "cancelled"
                    ? "בוטלה"
                    : "נשלחה ללקוח";

              return (
                <article
                  key={quote.id}
                  className={`quote-deal-card accent-${statusTone}`}
                >
                  <div className="quote-deal-main">
                    {thumbUrl && (
                      <div className="quote-deal-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl}
                          alt={quote.modelName}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="quote-deal-info">
                      <div className="quote-deal-topline">
                        <span className={`status status-${statusTone}`}>{statusLabel}</span>
                        {expiryStatusBadge(quote.expiresAt, quote.status)}
                        <small className="muted">{formatDate(quote.createdAt)}</small>
                      </div>
                      <h3>
                        {quote.modelName} ·{" "}
                        <span className="quote-qty-pill">
                          {quote.quantity} {quote.quantity === 1 ? "יחידה" : "יחידות"}
                        </span>
                      </h3>
                      <div className="quote-deal-customer">
                        <strong>{quote.customerName}</strong>
                        {quote.storeName ? <span>· {quote.storeName}</span> : null}
                        <span>·</span>
                        <a href={phoneHref(quote.customerPhone)} className="phone-link">
                          <Phone size={13} aria-hidden />
                          <bdi dir="ltr">{quote.customerPhone}</bdi>
                        </a>
                      </div>
                    </div>
                    <div className="quote-deal-price">
                      <small>סה״כ לתשלום</small>
                      <strong>{shekels(quoteTotal(quote).payableAgorot)}</strong>
                    </div>
                  </div>

                  <div className="quote-deal-actions">
                    {quote.status !== "cancelled" && (
                      <>
                        <button
                          type="button"
                          className="button button-sm detail-wa-btn"
                          onClick={() => handleSendWhatsappWithImage(quote)}
                          title={`שליחת תמונת המוצר וכל מלל ההצעה אל ${quote.customerPhone}`}
                        >
                          <MessageCircle size={15} /> וואטסאפ (תמונה + הצעה)
                        </button>
                        <Button asChild variant="soft" size="sm">
                          <Link href={`/orders?new=1&quoteId=${quote.id}`}>
                            <PackagePlus size={15} /> הפוך להזמנה
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={shareUrl(quote)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={14} /> צפייה
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyQuoteLink(quote)}
                        >
                          <Copy size={14} /> העתקת קישור
                        </Button>
                      </>
                    )}
                    {quote.status === "sent" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="delete-button"
                        onClick={() => cancel(quote.id)}
                      >
                        ביטול הצעה
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <FileText size={23} strokeWidth={1.65} aria-hidden />
            </span>
            <strong>
              {liveQuotes.length
                ? "לא נמצאו הצעות מחיר התואמות לסינון"
                : "עדיין אין הצעות מחיר — צרו את ההצעה הראשונה בלחיצה"}
            </strong>
            {!open && (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => {
                  setCreated(null);
                  setOpen(true);
                }}
              >
                <Plus size={16} /> יצירת ההצעה הראשונה
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

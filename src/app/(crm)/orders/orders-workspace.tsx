"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  Check,
  MapPin,
  MessageCircle,
  Minus,
  PackagePlus,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeletePasswordDialog } from "@/components/ui/delete-password-dialog";
import { Status } from "@/components/ui/status";
import { requestJson } from "@/lib/client-api";
import { orderStatuses, type Order, type OrderStatus } from "@/lib/orders/schema";
import { buildMoranOrderWhatsappUrl } from "@/lib/orders/whatsapp";
import { formatDate, phoneHref } from "@/lib/presentation";
import type { Device, Role } from "@/lib/validation/models";

export type OrderCatalogModelOption = {
  id: string;
  name: string;
  device: Device;
  msrp: number | null;
  imageUrl?: string;
  battery?: string;
  colors: string[];
  comingSoon?: boolean;
};

export type OrderQuotePrefill = {
  quoteId: string;
  modelId: string;
  quantity: number;
  agreedUnitPriceShekels?: number;
  customerType: "private" | "store";
  customerName: string;
  storeName?: string;
  customerPhone: string;
};

type DraftLineItem = {
  rowKey: string;
  modelId: string;
  searchQuery: string;
  deviceFilter: "all" | Device;
  pickerOpen: boolean;
  color: string;
  quantity: number;
  agreedPriceText: string;
};

const formatShekels = (agorot: number) => {
  const isWhole = agorot % 100 === 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(agorot / 100);
};

function makeDraftRow(defaultModelId = "", overrides?: Partial<DraftLineItem>): DraftLineItem {
  return {
    rowKey: Math.random().toString(36).slice(2, 10),
    modelId: defaultModelId,
    searchQuery: "",
    deviceFilter: "all",
    pickerOpen: !defaultModelId,
    color: "",
    quantity: 1,
    agreedPriceText: "",
    ...overrides,
  };
}

export function OrdersWorkspace({
  models,
  orders,
  userRole,
  moranPhone,
  pickupAddress,
  initialOpenNew = false,
  initialPrefill,
}: {
  models: OrderCatalogModelOption[];
  orders: Order[];
  userRole: Role;
  moranPhone: string;
  pickupAddress: string;
  initialOpenNew?: boolean;
  initialPrefill?: OrderQuotePrefill;
}) {
  const router = useRouter();
  const isStaff = userRole === "admin" || userRole === "employee";
  const isAdmin = userRole === "admin";

  const modelsById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const [openForm, setOpenForm] = useState(initialOpenNew);
  const [customerType, setCustomerType] = useState<"private" | "store">(
    initialPrefill?.customerType ?? "store",
  );
  const [customerName, setCustomerName] = useState(initialPrefill?.customerName ?? "");
  const [storeName, setStoreName] = useState(initialPrefill?.storeName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialPrefill?.customerPhone ?? "");
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftLineItem[]>(() => [
    makeDraftRow(initialPrefill?.modelId ?? "", {
      pickerOpen: !initialPrefill?.modelId,
      quantity: initialPrefill?.quantity ?? 1,
      agreedPriceText:
        initialPrefill?.agreedUnitPriceShekels !== undefined
          ? String(initialPrefill.agreedUnitPriceShekels)
          : "",
    }),
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [listError, setListError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const st of orderStatuses) counts[st] = 0;
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("he");
    const qDigits = q.replace(/\D/g, "");
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!q) return true;
      const haystacks = [
        order.number,
        order.customerName,
        order.storeName ?? "",
        order.customerPhone,
        order.createdByName,
        order.deliveryAddress ?? "",
        order.notes,
        ...order.items.flatMap((it) => [it.modelName, it.color ?? "", it.device]),
      ];
      if (haystacks.some((h) => h.toLocaleLowerCase("he").includes(q))) return true;
      if (qDigits.length >= 3 && order.customerPhone.replace(/\D/g, "").includes(qDigits)) {
        return true;
      }
      return false;
    });
  }, [orders, statusFilter, search]);

  function resetNewOrderForm() {
    setCustomerType("store");
    setCustomerName("");
    setStoreName("");
    setCustomerPhone("");
    setFulfillmentType("delivery");
    setDeliveryAddress("");
    setPriority("normal");
    setNotes("");
    setItems([makeDraftRow("")]);
    setFormError("");
  }

  function updateItem(rowKey: string, patch: Partial<DraftLineItem>) {
    setItems((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)),
    );
  }

  function removeItemRow(rowKey: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.rowKey !== rowKey)));
  }

  async function handleSubmitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    for (const row of items) {
      if (!row.modelId) {
        setFormError("יש לבחור דגם מהקטלוג בכל שורת הזמנה.");
        return;
      }
      if (row.agreedPriceText.trim() !== "") {
        const num = Number(row.agreedPriceText);
        if (!Number.isFinite(num) || num < 0) {
          setFormError("המחיר שנקבע עם הלקוח חייב להיות מספר חיובי תקין.");
          return;
        }
      }
    }

    const payload = {
      customerType,
      customerName: customerName.trim(),
      storeName: customerType === "store" ? storeName.trim() : undefined,
      customerPhone: customerPhone.trim(),
      fulfillmentType,
      deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
      priority,
      notes: notes.trim(),
      sourceQuoteId: initialPrefill?.quoteId,
      items: items.map((row) => {
        const trimmedPrice = row.agreedPriceText.trim();
        const agreedUnitPriceAgorot =
          trimmedPrice !== "" ? Math.round(Number(trimmedPrice) * 100) : undefined;
        return {
          modelId: row.modelId,
          color: row.color.trim() || undefined,
          quantity: Math.max(1, Math.round(row.quantity)),
          agreedUnitPriceAgorot,
        };
      }),
    };

    setSubmitting(true);
    try {
      const saved = await requestJson<Order>("/api/orders", "POST", payload);
      setCreatedOrder(saved);
      setOpenForm(false);
      resetNewOrderForm();
      router.refresh();

      // Immediately launch WhatsApp to Moran with the text-only formatted order
      const waUrl = buildMoranOrderWhatsappUrl(saved, moranPhone, pickupAddress);
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setFormError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(orderId: string, nextStatus: OrderStatus) {
    setListError("");
    setBusyOrderId(orderId);
    try {
      await requestJson(`/api/orders/${orderId}`, "PATCH", { status: nextStatus });
      router.refresh();
    } catch (caught) {
      setListError((caught as Error).message);
    } finally {
      setBusyOrderId("");
    }
  }

  async function handleAgentCancel(order: Order) {
    if (!window.confirm(`לבטל את הזמנה ${order.number}?`)) return;
    await handleStatusChange(order.id, "בוטלה");
  }

  return (
    <div className="page-stack orders-workspace">
      <div className="page-title title-with-action">
        <div>
          <h1>הזמנות</h1>
          <p>
            פתיחת הזמנה מהירה ע״י סוכן ושליחה מיידית בוואטסאפ למורן (
            <bdi dir="ltr">{moranPhone}</bdi>)
          </p>
        </div>
        <Button
          onClick={() => {
            setCreatedOrder(null);
            setOpenForm((v) => !v);
          }}
        >
          <PackagePlus size={18} /> {openForm ? "סגירת טופס" : "הזמנה חדשה"}
        </Button>
      </div>

      {createdOrder && (
        <section className="card order-created-banner" role="status">
          <div>
            <strong>
              <Check size={18} aria-hidden /> הזמנה {createdOrder.number} נשמרה במערכת!
            </strong>
            <p className="muted">
              נפתח חלון הוואטסאפ אל מורן (<bdi dir="ltr">{moranPhone}</bdi>) עם כל מלל ההזמנה. אם החלון נחסם בדפדפן, לחצו כאן לשליחה:
            </p>
          </div>
          <a
            href={buildMoranOrderWhatsappUrl(createdOrder, moranPhone, pickupAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-whatsapp-quote"
          >
            <MessageCircle size={17} /> שליחת ההזמנה למורן בוואטסאפ
          </a>
        </section>
      )}

      {openForm && (
        <section className="card order-editor-card" aria-label="הזמנה חדשה">
          <div className="section-heading">
            <h2>
              <span className="section-icon">
                <PackagePlus size={18} />
              </span>
              הזמנה חדשה למורן
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpenForm(false)}
            >
              <X size={16} /> סגירה
            </Button>
          </div>

          <form onSubmit={handleSubmitOrder} className="order-form-stack">
            {/* STEP 1 — MODEL SEARCH & ITEMS */}
            <div className="order-form-section">
              <h3>1. בחירת דגם מהקטלוג</h3>
              <div className="order-items-stack">
                {items.map((row, idx) => {
                  const selectedModel = row.modelId ? modelsById.get(row.modelId) : undefined;
                  const searchNormalized = row.searchQuery.trim().toLocaleLowerCase("he");
                  const matchingModels = models.filter((m) => {
                    if (row.deviceFilter !== "all" && m.device !== row.deviceFilter) {
                      return false;
                    }
                    if (!searchNormalized) return true;
                    return (
                      m.name.toLocaleLowerCase("he").includes(searchNormalized)
                      || m.device.toLocaleLowerCase("he").includes(searchNormalized)
                      || (m.battery ?? "").toLocaleLowerCase("he").includes(searchNormalized)
                    );
                  });

                  const agreedNum =
                    row.agreedPriceText.trim() !== "" ? Number(row.agreedPriceText) : null;

                  return (
                    <div key={row.rowKey} className="order-item-box">
                      <div className="order-item-box-head">
                        <strong>
                          {items.length > 1 ? `כלי #${idx + 1} בהזמנה` : "פרטי הכלי להזמנה"}
                        </strong>
                        {items.length > 1 && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => removeItemRow(row.rowKey)}
                          >
                            <Trash2 size={14} /> הסרת שורה
                          </button>
                        )}
                      </div>

                      {selectedModel && !row.pickerOpen ? (
                        <div className="order-selected-model-card">
                          <div className="order-selected-model-main">
                            {selectedModel.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={selectedModel.imageUrl}
                                alt={selectedModel.name}
                                className="order-model-thumb-lg"
                              />
                            ) : (
                              <span className="order-model-thumb-fallback">
                                <Bike size={22} />
                              </span>
                            )}
                            <div>
                              <strong dir="ltr">{selectedModel.name}</strong>
                              <span>
                                {selectedModel.device}
                                {selectedModel.battery ? ` · ${selectedModel.battery}` : ""}
                                {selectedModel.msrp
                                  ? ` · מחירון: ₪${selectedModel.msrp.toLocaleString("he-IL")}`
                                  : ""}
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateItem(row.rowKey, { pickerOpen: true })}
                          >
                            החלפת דגם
                          </Button>
                        </div>
                      ) : (
                        <div className="order-model-picker">
                          <div className="order-model-search-bar">
                            <div className="search-field">
                              <Search size={17} aria-hidden />
                              <input
                                type="search"
                                value={row.searchQuery}
                                onChange={(e) =>
                                  updateItem(row.rowKey, { searchQuery: e.target.value })
                                }
                                placeholder="חיפוש דגם (למשל MAX 2, MIA, 10X, SUPRA, 48V)..."
                                aria-label="חיפוש דגם להזמנה"
                              />
                            </div>
                            <div className="order-device-pills" role="group" aria-label="סינון קטגוריה">
                              {(
                                [
                                  ["all", "הכל"],
                                  ["קורקינט חשמלי", "קורקינטים"],
                                  ["אופניים חשמליים", "אופניים"],
                                ] as const
                              ).map(([val, label]) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={
                                    "order-filter-pill"
                                    + (row.deviceFilter === val ? " is-active" : "")
                                  }
                                  onClick={() => updateItem(row.rowKey, { deviceFilter: val })}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="order-model-results" role="listbox" aria-label="תוצאות דגמים">
                            {matchingModels.slice(0, 12).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className={
                                  "order-model-option"
                                  + (row.modelId === m.id ? " is-selected" : "")
                                }
                                onClick={() =>
                                  updateItem(row.rowKey, {
                                    modelId: m.id,
                                    pickerOpen: false,
                                    color:
                                      m.colors.includes(row.color) ? row.color : "",
                                  })
                                }
                              >
                                {m.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={m.imageUrl}
                                    alt=""
                                    aria-hidden
                                    className="order-model-option-img"
                                  />
                                ) : (
                                  <span className="order-model-option-fallback">
                                    <Bike size={18} />
                                  </span>
                                )}
                                <div className="order-model-option-text">
                                  <strong dir="ltr">{m.name}</strong>
                                  <small>
                                    {m.device}
                                    {m.battery ? ` · ${m.battery}` : ""}
                                  </small>
                                </div>
                                <div className="order-model-option-price">
                                  {m.msrp ? (
                                    <span dir="ltr">₪{m.msrp.toLocaleString("he-IL")}</span>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </div>
                              </button>
                            ))}
                            {matchingModels.length === 0 && (
                              <p className="muted" style={{ padding: "12px", margin: 0 }}>
                                לא נמצאו דגמים התואמים לחיפוש.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedModel && (
                        <div className="order-item-controls-grid">
                          <label className="order-field">
                            <span>כמות יחידות</span>
                            <div className="order-qty-stepper">
                              <button
                                type="button"
                                aria-label="הפחתת כמות"
                                onClick={() =>
                                  updateItem(row.rowKey, {
                                    quantity: Math.max(1, row.quantity - 1),
                                  })
                                }
                              >
                                <Minus size={15} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={10000}
                                value={row.quantity}
                                onChange={(e) =>
                                  updateItem(row.rowKey, {
                                    quantity: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                required
                              />
                              <button
                                type="button"
                                aria-label="הגדלת כמות"
                                onClick={() =>
                                  updateItem(row.rowKey, { quantity: row.quantity + 1 })
                                }
                              >
                                <Plus size={15} />
                              </button>
                            </div>
                          </label>

                          <div className="order-field">
                            <span>צבע (לא חובה)</span>
                            {selectedModel.colors.length > 0 && (
                              <div className="order-color-chips">
                                {selectedModel.colors.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    className={
                                      "order-filter-pill" + (row.color === c ? " is-active" : "")
                                    }
                                    onClick={() =>
                                      updateItem(row.rowKey, {
                                        color: row.color === c ? "" : c,
                                      })
                                    }
                                  >
                                    {c}
                                  </button>
                                ))}
                              </div>
                            )}
                            <input
                              type="text"
                              maxLength={60}
                              value={row.color}
                              onChange={(e) => updateItem(row.rowKey, { color: e.target.value })}
                              placeholder={
                                selectedModel.colors.length > 0
                                  ? "בחרו למעלה או הקלידו צבע..."
                                  : "למשל שחור / לבן..."
                              }
                            />
                          </div>

                          <label className="order-field">
                            <span>
                              מחיר שנקבע עם הלקוח ₪{" "}
                              <small className="muted">(לא חובה)</small>
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              dir="ltr"
                              value={row.agreedPriceText}
                              onChange={(e) =>
                                updateItem(row.rowKey, { agreedPriceText: e.target.value })
                              }
                              placeholder={
                                selectedModel.msrp
                                  ? `מחירון: ₪${selectedModel.msrp.toLocaleString("he-IL")} (השאירו ריק אם ללא שינוי)`
                                  : "הזינו רק אם נקבע מחיר מיוחד"
                              }
                            />
                            {selectedModel.msrp && agreedNum !== null && Number.isFinite(agreedNum) && (
                              <small className="order-price-diff-hint">
                                יוצג למורן: ₪{agreedNum.toLocaleString("he-IL")} מול מחירון ₪
                                {selectedModel.msrp.toLocaleString("he-IL")}
                              </small>
                            )}
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, makeDraftRow("")])}
                >
                  <Plus size={15} /> הוספת דגם נוסף לאותה הזמנה
                </Button>
              </div>
            </div>

            {/* STEP 2 — CUSTOMER & DELIVERY DETAILS */}
            <div className="order-form-section">
              <h3>2. פרטי הלקוח ואספקה</h3>
              <div className="quote-form">
                <label>
                  סוג לקוח
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as "private" | "store")}
                  >
                    <option value="store">חנות / עסק</option>
                    <option value="private">לקוח פרטי</option>
                  </select>
                </label>

                <label>
                  שם לקוח / איש קשר
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="שם מלא של הלקוח או איש הקשר"
                  />
                </label>

                {customerType === "store" && (
                  <label>
                    שם החנות
                    <input
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      required
                      maxLength={120}
                      placeholder="למשל: אופני המרכז"
                    />
                  </label>
                )}

                <label>
                  טלפון הלקוח
                  <input
                    type="tel"
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                    minLength={7}
                    maxLength={32}
                    placeholder="050-0000000"
                  />
                </label>

                <label>
                  אופן אספקה
                  <select
                    value={fulfillmentType}
                    onChange={(e) =>
                      setFulfillmentType(e.target.value as "pickup" | "delivery")
                    }
                  >
                    <option value="delivery">משלוח לכתובת הלקוח / החנות</option>
                    <option value="pickup">איסוף עצמי ({pickupAddress})</option>
                  </select>
                </label>

                <label>
                  דחיפות הזמנה
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
                  >
                    <option value="normal">רגילה</option>
                    <option value="urgent">⚡ דחופה</option>
                  </select>
                </label>
              </div>

              {fulfillmentType === "delivery" && (
                <label className="order-field" style={{ marginTop: "10px" }}>
                  <span>עיר וכתובת מלאה למשלוח</span>
                  <input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required
                    maxLength={300}
                    placeholder="רחוב, מספר בית, עיר וקומה/הנחיות לשליח"
                  />
                </label>
              )}

              <label className="order-field" style={{ marginTop: "10px" }}>
                <span>הערות למורן (לא חובה)</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="דגשים להזמנה, שעת תיאום, אביזרים נלווים או תנאי תשלום..."
                />
              </label>
            </div>

            {formError && (
              <p role="alert" className="error-message">
                {formError}
              </p>
            )}

            <div className="dialog-actions">
              <button
                type="submit"
                className="button button-whatsapp-quote"
                disabled={submitting}
              >
                <MessageCircle size={17} />
                {submitting
                  ? "שומר ושולח…"
                  : `שמירת הזמנה ושליחה למורן בוואטסאפ (${moranPhone})`}
              </button>
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* ORDERS LIST & STATUS TRACKING */}
      <section className="card detail-card" aria-label="רשימת הזמנות">
        <div className="orders-toolbar">
          <div className="order-status-tabs" role="tablist" aria-label="סינון הזמנות לפי סטטוס">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "all"}
              className={"order-filter-pill" + (statusFilter === "all" ? " is-active" : "")}
              onClick={() => setStatusFilter("all")}
            >
              הכל ({statusCounts.all ?? 0})
            </button>
            {orderStatuses.map((st) => (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={statusFilter === st}
                className={"order-filter-pill" + (statusFilter === st ? " is-active" : "")}
                onClick={() => setStatusFilter(st)}
              >
                {st} ({statusCounts[st] ?? 0})
              </button>
            ))}
          </div>

          <div className="search-field">
            <Search size={17} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isStaff
                  ? "חיפוש לפי מספר הזמנה, לקוח, חנות, דגם או סוכן..."
                  : "חיפוש בהזמנות שלי לפי לקוח, דגם או מספר..."
              }
              aria-label="חיפוש הזמנות"
            />
          </div>
        </div>

        {listError && (
          <p role="alert" className="error-message">
            {listError}
          </p>
        )}

        {filteredOrders.length > 0 ? (
          <div className="orders-list">
            {filteredOrders.map((order) => {
              const waHref = buildMoranOrderWhatsappUrl(order, moranPhone, pickupAddress);
              return (
                <article key={order.id} className="order-card-row">
                  <div className="order-card-top">
                    <div className="order-card-badges">
                      <strong className="record-number" dir="ltr">
                        {order.number}
                      </strong>
                      <Status value={order.status} />
                      {order.priority === "urgent" && (
                        <span className="status status-amber">
                          <Zap size={13} aria-hidden /> דחופה
                        </span>
                      )}
                      {isStaff && (
                        <span className="status status-neutral">
                          סוכן: {order.createdByName}
                        </span>
                      )}
                    </div>
                    <span className="muted" style={{ fontSize: ".84rem" }}>
                      {formatDate(order.createdAt, true)}
                    </span>
                  </div>

                  <div className="order-card-customer">
                    <div>
                      <strong>
                        {order.customerName}
                        {order.customerType === "store" && order.storeName
                          ? ` · חנות: ${order.storeName}`
                          : " · לקוח פרטי"}
                      </strong>
                      <span className="order-customer-meta">
                        <a href={phoneHref(order.customerPhone)} className="phone-link">
                          <Phone size={13} aria-hidden />
                          <bdi dir="ltr">{order.customerPhone}</bdi>
                        </a>
                        <span>·</span>
                        <span>
                          {order.fulfillmentType === "delivery" ? (
                            <>
                              <Truck size={14} aria-hidden /> משלוח: {order.deliveryAddress}
                            </>
                          ) : (
                            <>
                              <MapPin size={14} aria-hidden /> איסוף עצמי
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                  </div>

                  <ul className="order-card-items">
                    {order.items.map((item) => {
                      const modelInfo = modelsById.get(item.modelId);
                      return (
                        <li key={item.id} className="order-card-item-line">
                          <div className="quote-row-model-info">
                            {modelInfo?.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={modelInfo.imageUrl}
                                alt=""
                                aria-hidden
                                className="quote-row-thumb"
                              />
                            )}
                            <div>
                              <strong dir="ltr">{item.modelName}</strong>
                              <span>
                                {item.device}
                                {item.color ? ` · צבע: ${item.color}` : ""} · כמות:{" "}
                                <strong>
                                  {item.quantity} {item.quantity === 1 ? "יחידה" : "יחידות"}
                                </strong>
                              </span>
                            </div>
                          </div>

                          {item.agreedUnitPriceAgorot !== undefined && (
                            <div className="order-agreed-price-pill">
                              <span>
                                נקבע עם הלקוח:{" "}
                                <strong dir="ltr">
                                  {formatShekels(item.agreedUnitPriceAgorot)}
                                </strong>
                              </span>
                              {item.catalogMsrpAgorot !== undefined
                                && item.catalogMsrpAgorot > 0 && (
                                  <small className="muted" dir="ltr">
                                    מחירון: {formatShekels(item.catalogMsrpAgorot)}
                                  </small>
                                )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {order.notes && (
                    <p className="order-card-note">
                      <strong>הערות למורן:</strong> {order.notes}
                    </p>
                  )}

                  <div className="order-card-actions">
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="quote-whatsapp-link"
                    >
                      <MessageCircle size={15} /> שליחה למורן בוואטסאפ
                    </a>

                    {isStaff && (
                      <label className="order-inline-status-label">
                        <span>סטטוס טיפול:</span>
                        <select
                          aria-label={`שינוי סטטוס עבור ${order.number}`}
                          value={order.status}
                          disabled={busyOrderId === order.id}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value as OrderStatus)
                          }
                        >
                          {orderStatuses.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {!isStaff && order.status === "חדשה" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyOrderId === order.id}
                        onClick={() => handleAgentCancel(order)}
                      >
                        ביטול הזמנה
                      </Button>
                    )}

                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(order);
                        }}
                      >
                        <Trash2 size={15} /> מחיקה
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {orders.length === 0
              ? "עדיין לא נפתחו הזמנות. לחצו על 'הזמנה חדשה' כדי לשלוח הזמנה ראשונה למורן."
              : "לא נמצאו הזמנות התואמות לסינון."}
          </p>
        )}
      </section>

      <DeletePasswordDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
        title="מחיקת הזמנה"
        description={
          deleteTarget
            ? `פעולה זו תמחק לצמיתות את הזמנה ${deleteTarget.number} מהמערכת.`
            : ""
        }
        action="מחיקה"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={async (deletePassword) => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          setDeleteError("");
          try {
            await requestJson(`/api/orders/${deleteTarget.id}`, "DELETE", {
              deletePassword,
            });
            setDeleteTarget(null);
            router.refresh();
          } catch (caught) {
            setDeleteError((caught as Error).message);
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </div>
  );
}

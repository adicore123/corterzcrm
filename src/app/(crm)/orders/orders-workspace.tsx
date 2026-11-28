"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  Save,
  Search,
  Store,
  Trash2,
  Truck,
  UserRound,
  UserRoundPlus,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeletePasswordDialog } from "@/components/ui/delete-password-dialog";
import { Modal } from "@/components/ui/dialog";
import { Status } from "@/components/ui/status";
import { newRequestId, requestJson } from "@/lib/client-api";
import { orderStatuses, type Order, type OrderStatus } from "@/lib/orders/schema";
import { buildMoranOrderWhatsappUrl } from "@/lib/orders/whatsapp";
import { launchWhatsappUrl, openPendingDesktopTab } from "@/lib/phone";
import { formatDate, phoneHref } from "@/lib/presentation";
import type { Customer, Device, Role } from "@/lib/validation/models";

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

export type OrderCustomerOption = {
  id: string;
  name: string;
  store: string;
  phone: string;
  customerType: "private" | "store";
};

export type OrderQuotePrefill = {
  quoteId: string;
  modelId: string;
  quantity: number;
  agreedUnitPriceShekels?: number;
  customerId?: string;
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
  initialCustomers,
  orders,
  userRole,
  moranPhone,
  pickupAddress,
  initialOpenNew = false,
  initialPrefill,
  initialCustomerId,
  initialSearch,
  customersPreloaded = true,
}: {
  models: OrderCatalogModelOption[];
  initialCustomers: OrderCustomerOption[];
  orders: Order[];
  userRole: Role;
  moranPhone: string;
  pickupAddress: string;
  initialOpenNew?: boolean;
  initialPrefill?: OrderQuotePrefill;
  initialCustomerId?: string;
  initialSearch?: string;
  customersPreloaded?: boolean;
}) {
  const router = useRouter();
  const isStaff = userRole === "admin" || userRole === "employee";
  const isAdmin = userRole === "admin";

  const modelsById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  // Customer directory state (synced with newly added inline customers & lazy background load)
  const [customers, setCustomers] = useState<OrderCustomerOption[]>(initialCustomers);
  const customersLoadedRef = useRef(customersPreloaded);

  useEffect(() => {
    if (customersLoadedRef.current) return;
    let cancelled = false;
    fetch("/api/orders/customers")
      .then((res) => (res.ok ? (res.json() as Promise<OrderCustomerOption[]>) : null))
      .then((fetched) => {
        if (!fetched || cancelled) return;
        customersLoadedRef.current = true;
        setCustomers((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          return [...prev, ...fetched.filter((c) => !existingIds.has(c.id))];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const customersById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const resolvedInitialCustId = initialPrefill?.customerId ?? initialCustomerId ?? "";
  const [openForm, setOpenForm] = useState(initialOpenNew);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(resolvedInitialCustId);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(!resolvedInitialCustId);

  // Inline "+ לקוח חדש" modal state
  const [newCustOpen, setNewCustOpen] = useState(
    Boolean(initialPrefill && !initialPrefill.customerId),
  );
  const [newCustType, setNewCustType] = useState<"private" | "store">(
    initialPrefill?.customerType ?? "store",
  );
  const [newCustName, setNewCustName] = useState(initialPrefill?.customerName ?? "");
  const [newCustStore, setNewCustStore] = useState(initialPrefill?.storeName ?? "");
  const [newCustPhone, setNewCustPhone] = useState(initialPrefill?.customerPhone ?? "");
  const [newCustBusy, setNewCustBusy] = useState(false);
  const [newCustError, setNewCustError] = useState("");
  const newCustRequestId = useRef("");

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
  const [search, setSearch] = useState(initialSearch ?? "");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [listError, setListError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Instant optimistic/local order list overlays so UI updates in <1ms while RSC refreshes silently
  const [addedOrders, setAddedOrders] = useState<Order[]>([]);
  const [patchedOrders, setPatchedOrders] = useState<Record<string, Order>>({});
  const [deletedOrderIds, setDeletedOrderIds] = useState<Set<string>>(() => new Set());

  const liveOrders = useMemo(() => {
    const serverIds = new Set(orders.map((o) => o.id));
    const freshAdded = addedOrders.filter((o) => !serverIds.has(o.id));
    return [...freshAdded, ...orders]
      .filter((o) => !deletedOrderIds.has(o.id))
      .map((o) => {
        const local = patchedOrders[o.id];
        return local && local.updatedAt >= o.updatedAt ? local : o;
      });
  }, [orders, addedOrders, patchedOrders, deletedOrderIds]);

  const selectedCustomer = selectedCustomerId
    ? customersById.get(selectedCustomerId)
    : undefined;

  const matchingCustomers = useMemo(() => {
    const q = customerSearch.trim().toLocaleLowerCase("he");
    const qDigits = q.replace(/\D/g, "");
    if (!q) return customers;
    return customers.filter((c) => {
      if (
        c.name.toLocaleLowerCase("he").includes(q)
        || c.store.toLocaleLowerCase("he").includes(q)
        || c.phone.toLocaleLowerCase("he").includes(q)
      ) {
        return true;
      }
      if (qDigits.length >= 3 && c.phone.replace(/\D/g, "").includes(qDigits)) {
        return true;
      }
      return false;
    });
  }, [customers, customerSearch]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: liveOrders.length };
    for (const st of orderStatuses) counts[st] = 0;
    for (const o of liveOrders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [liveOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("he");
    const qDigits = q.replace(/\D/g, "");
    return liveOrders.filter((order) => {
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
  }, [liveOrders, statusFilter, search]);

  function resetNewOrderForm() {
    setSelectedCustomerId("");
    setCustomerSearch("");
    setCustomerPickerOpen(true);
    setFulfillmentType("delivery");
    setDeliveryAddress("");
    setPriority("normal");
    setNotes("");
    setItems([makeDraftRow("")]);
    setFormError("");
  }

  function openNewCustomerModal() {
    setNewCustType("store");
    setNewCustName(customerSearch.trim() && !/\d/.test(customerSearch) ? customerSearch.trim() : "");
    setNewCustStore("");
    setNewCustPhone(/\d{3,}/.test(customerSearch) ? customerSearch.trim() : "");
    setNewCustError("");
    newCustRequestId.current = "";
    setNewCustOpen(true);
  }

  async function handleSaveInlineCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setNewCustError("");

    if (!newCustName.trim()) {
      setNewCustError("יש להזין שם לקוח או איש קשר.");
      return;
    }
    if (newCustType === "store" && !newCustStore.trim()) {
      setNewCustError("יש להזין את שם החנות.");
      return;
    }
    if (!newCustPhone.trim()) {
      setNewCustError("יש להזין מספר טלפון.");
      return;
    }

    if (!newCustRequestId.current) newCustRequestId.current = newRequestId();
    setNewCustBusy(true);
    try {
      const saved = await requestJson<Customer>("/api/orders/customers", "POST", {
        requestId: newCustRequestId.current,
        customerType: newCustType,
        name: newCustName.trim(),
        store: newCustType === "store" ? newCustStore.trim() : "",
        phone: newCustPhone.trim(),
      });
      const inferredType =
        saved.customerType
        ?? (saved.store && saved.store.trim() && saved.store.trim() !== "פרטי"
          ? "store"
          : "private");
      const option: OrderCustomerOption = {
        id: saved.id,
        name: saved.name,
        store: inferredType === "store" ? saved.store : "",
        phone: saved.phone,
        customerType: inferredType,
      };
      setCustomers((prev) => {
        const without = prev.filter((item) => item.id !== option.id);
        return [option, ...without];
      });
      setSelectedCustomerId(option.id);
      setCustomerPickerOpen(false);
      setNewCustOpen(false);
      newCustRequestId.current = "";
      startTransition(() => router.refresh());
    } catch (caught) {
      setNewCustError((caught as Error).message);
    } finally {
      setNewCustBusy(false);
    }
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

    if (!selectedCustomerId) {
      setFormError("יש לבחור לקוח ממאגר הלקוחות או להוסיף לקוח חדש באמצעות הכפתור '+ לקוח חדש'.");
      return;
    }

    if (fulfillmentType === "delivery" && !deliveryAddress.trim()) {
      setFormError("יש להזין עיר וכתובת מלאה למשלוח.");
      return;
    }

    const payload = {
      customerId: selectedCustomerId,
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

    // Synchronously reserve desktop tab during user gesture so popup blockers never block WhatsApp
    const pendingTab = openPendingDesktopTab();
    setSubmitting(true);
    try {
      const saved = await requestJson<Order>("/api/orders", "POST", payload);
      const waUrl = buildMoranOrderWhatsappUrl(saved, moranPhone, pickupAddress);
      setCreatedOrder(saved);
      setAddedOrders((prev) => [saved, ...prev.filter((o) => o.id !== saved.id)]);
      setOpenForm(false);
      resetNewOrderForm();
      startTransition(() => router.refresh());
      launchWhatsappUrl(waUrl, pendingTab);
    } catch (caught) {
      if (pendingTab && !pendingTab.closed) {
        try {
          pendingTab.close();
        } catch {
          // Ignore
        }
      }
      setFormError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(orderId: string, nextStatus: OrderStatus) {
    setListError("");
    setBusyOrderId(orderId);
    try {
      const updated = await requestJson<Order>(`/api/orders/${orderId}`, "PATCH", { status: nextStatus });
      setPatchedOrders((prev) => ({ ...prev, [orderId]: updated }));
      startTransition(() => router.refresh());
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
              נפתחה הודעת הוואטסאפ אל מורן (<bdi dir="ltr">{moranPhone}</bdi>). לשליחה חוזרת לחצו:
            </p>
          </div>
          <a
            href={buildMoranOrderWhatsappUrl(createdOrder, moranPhone, pickupAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-whatsapp-quote order-wa-cta"
          >
            <MessageCircle size={17} /> שליחה למורן בוואטסאפ
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

          <form onSubmit={handleSubmitOrder} className="order-form-stack" noValidate>
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

            {/* STEP 2 — CUSTOMER FROM CUSTOMERS MODULE + INLINE NEW CUSTOMER */}
            <div className="order-form-section">
              <div className="order-section-title-row">
                <h3>2. לקוח ממאגר הלקוחות ואופן אספקה</h3>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={openNewCustomerModal}
                >
                  <UserRoundPlus size={16} /> לקוח חדש
                </Button>
              </div>

              {selectedCustomer && !customerPickerOpen ? (
                <div className="order-selected-model-card order-selected-customer-card">
                  <div className="order-selected-model-main">
                    <span className="order-customer-avatar" aria-hidden>
                      {selectedCustomer.customerType === "store" ? (
                        <Store size={20} />
                      ) : (
                        <UserRound size={20} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {selectedCustomer.name}
                        {selectedCustomer.customerType === "store" && selectedCustomer.store
                          ? ` · ${selectedCustomer.store}`
                          : ""}
                      </strong>
                      <span>
                        {selectedCustomer.customerType === "store" ? "חנות / עסק" : "לקוח פרטי"}{" "}
                        · <bdi dir="ltr">{selectedCustomer.phone}</bdi>
                      </span>
                    </div>
                  </div>
                  <div className="order-customer-card-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomerPickerOpen(true)}
                    >
                      החלפת לקוח
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={openNewCustomerModal}
                    >
                      <UserRoundPlus size={15} /> לקוח חדש
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="order-customer-picker">
                  <div className="order-customer-search-row">
                    <div className="search-field">
                      <Search size={17} aria-hidden />
                      <input
                        type="search"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="חפשו לקוח לפי שם, חנות או מספר טלפון..."
                        aria-label="חיפוש לקוח במאגר"
                      />
                    </div>
                  </div>

                  {matchingCustomers.length > 0 ? (
                    <div className="order-customer-results" role="listbox" aria-label="תוצאות לקוחות">
                      {matchingCustomers.slice(0, 10).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={
                            "order-model-option"
                            + (selectedCustomerId === c.id ? " is-selected" : "")
                          }
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerPickerOpen(false);
                          }}
                        >
                          <span className="order-model-option-fallback" aria-hidden>
                            {c.customerType === "store" ? (
                              <Store size={17} />
                            ) : (
                              <UserRound size={17} />
                            )}
                          </span>
                          <div className="order-model-option-text">
                            <strong>
                              {c.name}
                              {c.customerType === "store" && c.store ? ` · ${c.store}` : ""}
                            </strong>
                            <small>
                              {c.customerType === "store" ? "חנות" : "לקוח פרטי"} ·{" "}
                              <bdi dir="ltr">{c.phone}</bdi>
                            </small>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="order-customer-empty">
                      <p className="muted">
                        {customers.length === 0
                          ? "עדיין אין לקוחות במאגר. הוסיפו לקוח ראשון בלחיצה:"
                          : "לא נמצא לקוח תואם במאגר. ניתן להוסיף לקוח חדש כעת:"}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={openNewCustomerModal}>
                        <UserRoundPlus size={16} /> הוספת לקוח חדש למאגר
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="quote-form" style={{ marginTop: "6px" }}>
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
                <label className="order-field" style={{ marginTop: "8px" }}>
                  <span>עיר וכתובת מלאה למשלוח</span>
                  <input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required
                    maxLength={300}
                    placeholder="רחוב, מספר בית, עיר והנחיות לשליח"
                  />
                </label>
              )}

              <label className="order-field" style={{ marginTop: "8px" }}>
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

            <div className="dialog-actions order-submit-actions">
              <button
                type="submit"
                className="button button-whatsapp-quote order-wa-cta"
                disabled={submitting}
              >
                <MessageCircle size={18} />
                <span>
                  {submitting
                    ? "שומר ושולח…"
                    : "שמירת הזמנה ושליחה למורן בוואטסאפ"}
                </span>
              </button>
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* INLINE MODAL — ADD NEW CUSTOMER DIRECTLY INTO CUSTOMERS MODULE */}
      <Modal
        open={newCustOpen}
        onOpenChange={(next) => {
          if (!newCustBusy) setNewCustOpen(next);
        }}
        title="לקוח חדש"
        description="הלקוח יישמר אוטומטית במודול לקוחות וישויך להזמנה הנוכחית."
      >
        <form className="dialog-form" onSubmit={handleSaveInlineCustomer} noValidate>
          <label className="field">
            <span>סוג לקוח</span>
            <select
              aria-label="סוג לקוח"
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
              aria-label="שם לקוח"
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
                aria-label="שם החנות"
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
              aria-label="מספר טלפון"
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
              <Save size={16} /> {newCustBusy ? "שומר…" : "שמירת לקוח ושיוך להזמנה"}
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
            {liveOrders.length === 0
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
          const targetId = deleteTarget.id;
          setDeleteBusy(true);
          setDeleteError("");
          try {
            await requestJson(`/api/orders/${targetId}`, "DELETE", {
              deletePassword,
            });
            setDeletedOrderIds((prev) => new Set(prev).add(targetId));
            setDeleteTarget(null);
            startTransition(() => router.refresh());
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

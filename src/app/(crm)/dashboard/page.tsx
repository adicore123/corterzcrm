import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CircleCheck,
  ClipboardList,
  FileText,
  PackagePlus,
  Plus,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  UserRoundPlus,
  Wrench,
} from "lucide-react";
import { authorizedUser } from "@/lib/auth/page";
import { dashboard } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { listOrdersForUser } from "@/lib/orders/service";
import { formatDate } from "@/lib/presentation";
import { listQuotesForUser } from "@/lib/quotes/service";
import { DEFAULT_PICKUP_ADDRESS } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { RecordTable } from "@/components/record-table";
import { repairRow, standardRow } from "@/components/record-cells";

export const metadata: Metadata = { title: "סקירה כללית" };

export default async function DashboardPage() {
  const user = await authorizedUser();
  const [data, settings, orders, quotes] = await Promise.all([
    dashboard(),
    readCollection("settings"),
    listOrdersForUser(user),
    listQuotesForUser(user),
  ]);
  const isAgent = user.role === "agent";
  const pickupAddress = settings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS;
  const customersMap = new Map(data.customers.map((customer) => [customer.id, customer]));
  const modelsMap = new Map(data.models.map((item) => [item.name.toLocaleLowerCase("he"), item]));

  const newOrders = orders.filter((o) => o.status === "חדשה");
  const activeAgentOrders = orders.filter((o) => o.status !== "סופקה" && o.status !== "בוטלה");
  const acceptedQuotes = quotes.filter((q) => q.status === "accepted");

  const metrics = [
    {
      label: "תיקי תקינה פעילים",
      value: data.counts.activeStandards,
      icon: ClipboardList,
      tone: "red",
      href: "/standards?status=active",
    },
    {
      label: "תיקי תקינה בעיכוב",
      value: data.counts.delayed,
      icon: TriangleAlert,
      tone: "amber",
      href: "/standards?delay=מתעכב",
    },
    {
      label: "תיקי תקינה שהסתיימו",
      value: data.counts.completed,
      icon: CircleCheck,
      tone: "green",
      href: "/standards?status=הסתיים",
    },
    {
      label: "תיקונים פעילים",
      value: data.counts.activeRepairs,
      icon: Wrench,
      tone: "red",
      href: "/repairs?status=active",
    },
  ];

  return (
    <div className="dashboard">
      <section className="dashboard-banner">
        <div className="track-lines" aria-hidden />
        <div className="dashboard-banner-inner">
          <div>
            <h1>סקירה כללית</h1>
            <p>
              {isAgent
                ? `שלום ${user.name} · ממשק סוכן למכירות, הזמנות, הצעות מחיר וקטלוג 3D`
                : `שלום ${user.name} · מרכז השליטה והתפעול של קורטז`}
            </p>
          </div>
          {!isAgent && newOrders.length > 0 && (
            <Link href="/orders" prefetch={true} className="banner-alert-pill">
              <PackagePlus size={17} aria-hidden />
              <span>
                {newOrders.length === 1
                  ? "הזמנת סוכן חדשה אחת ממתינה לטיפול"
                  : `${newOrders.length} הזמנות סוכנים חדשות ממתינות לטיפול`}
              </span>
              <ArrowLeft size={15} aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <section className="metrics" aria-label="תמונת מצב">
        {metrics.map(({ label, value, icon: Icon, tone, href }) => (
          <Link href={href} prefetch={true} key={label} className="metric card">
            <span className={"metric-icon tone-" + tone}>
              <Icon size={24} strokeWidth={1.8} aria-hidden />
            </span>
            <span className="metric-copy">
              <strong>{value}</strong>
              <span>{label}</span>
            </span>
            <ArrowLeft className="metric-arrow" size={16} aria-hidden />
          </Link>
        ))}
      </section>

      <section className="card quick-card" aria-labelledby="quick-title">
        <h2 id="quick-title">פעולות מהירות</h2>
        <div className="quick-actions">
          <Button asChild>
            <Link href="/orders?new=1" prefetch={true}>
              <PackagePlus size={18} /> הזמנה חדשה
            </Link>
          </Button>
          {!isAgent && (
            <Button variant="soft" asChild>
              <Link href="/standards/new" prefetch={true}>
                <Plus size={18} /> תיק מכון תקנים
              </Link>
            </Button>
          )}
          {!isAgent && (
            <Button variant="soft" asChild>
              <Link href="/repairs/new" prefetch={true}>
                <Wrench size={17} /> תיקון חדש
              </Link>
            </Button>
          )}
          <Button variant="soft" asChild>
            <Link href="/faults" prefetch={true}>
              <ShieldAlert size={18} /> תקלות ופתיחות הגבלה
            </Link>
          </Button>
          {isAgent && (
            <Button variant="soft" asChild>
              <Link href="/faults/new" prefetch={true}>
                <Plus size={18} /> מדריך חדש לדגם
              </Link>
            </Button>
          )}
          {isAgent && (
            <Button variant="soft" asChild>
              <Link href="/catalog" prefetch={true}>
                <Sparkles size={18} /> קטלוג סוכנים
              </Link>
            </Button>
          )}
          {!isAgent && (
            <Button variant="soft" asChild>
              <Link href="/customers/new" prefetch={true}>
                <UserRoundPlus size={18} /> לקוח חדש
              </Link>
            </Button>
          )}
        </div>
      </section>

      {(isAgent
        ? activeAgentOrders.length > 0 || acceptedQuotes.length > 0
        : newOrders.length > 0 || acceptedQuotes.length > 0) && (
        <section className="ops-spotlight-grid" aria-label="מוקד מכירות והזמנות">
          <div className="card ops-spotlight-card">
            <div className="section-heading">
              <h2>
                <span className="section-icon">
                  <PackagePlus size={17} aria-hidden />
                </span>
                {isAgent
                  ? `ההזמנות הפעילות שלי (${activeAgentOrders.length})`
                  : `הזמנות סוכנים חדשות לטיפול (${newOrders.length})`}
              </h2>
              <Link className="section-link" href="/orders" prefetch={true}>
                למסך ההזמנות <ArrowLeft size={14} />
              </Link>
            </div>
            {(isAgent ? activeAgentOrders : newOrders).length === 0 ? (
              <p className="muted text-sm">כל ההזמנות טופלו — אין הזמנות ממתינות כרגע.</p>
            ) : (
              <ul className="ops-mini-list">
                {(isAgent ? activeAgentOrders : newOrders).slice(0, 4).map((ord) => (
                  <li key={ord.id}>
                    <Link href={`/orders?q=${encodeURIComponent(ord.number)}`} prefetch={false} className="ops-mini-item">
                      <div>
                        <strong>
                          <bdi dir="ltr">{ord.number}</bdi> · {ord.customerName}
                          {ord.storeName ? ` (${ord.storeName})` : ""}
                        </strong>
                        <small>
                          {ord.items.map((it) => `${it.modelName} ×${it.quantity}`).join(", ")} ·{" "}
                          {formatDate(ord.createdAt)}
                        </small>
                      </div>
                      <Status value={ord.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card ops-spotlight-card">
            <div className="section-heading">
              <h2>
                <span className="section-icon">
                  <FileText size={17} aria-hidden />
                </span>
                הצעות מחיר שאושרו ({acceptedQuotes.length})
              </h2>
              <Link className="section-link" href="/quotes" prefetch={true}>
                למסך הצעות המחיר <ArrowLeft size={14} />
              </Link>
            </div>
            {acceptedQuotes.length === 0 ? (
              <p className="muted text-sm">אין כרגע הצעות מחיר חדשות שאושרו ע״י לקוחות.</p>
            ) : (
              <ul className="ops-mini-list">
                {acceptedQuotes.slice(0, 4).map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/orders?new=1&quoteId=${q.id}`}
                      prefetch={false}
                      className="ops-mini-item"
                    >
                      <div>
                        <strong>
                          {q.customerName}
                          {q.storeName ? ` · ${q.storeName}` : ""}
                        </strong>
                        <small>
                          {q.modelName} ×{q.quantity} · אושרה להפיכה להזמנה
                        </small>
                      </div>
                      <span className="status status-green">הפוך להזמנה ←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div className="dashboard-split">
        <section className="card data-card" aria-labelledby="recent-standards">
          <div className="section-heading">
            <h2 id="recent-standards">תיקי תקינה אחרונים</h2>
            <Link
              className="section-link"
              href="/standards"
              prefetch={true}
              aria-label="כל תיקי התקינה"
            >
              לכל התיקים <ArrowLeft size={14} />
            </Link>
          </div>
          <RecordTable
            rows={data.standards.map((item) => standardRow(item, "recent", modelsMap, isAgent))}
            columns={["מספר תיק", "דגם", "סטטוס", "עודכן לאחרונה"]}
            empty="אין תיקי תקינה להצגה"
            showEmptyHeader
          />
        </section>
        <section className="card data-card" aria-labelledby="delayed">
          <div className="section-heading">
            <h2 id="delayed">תיקים בעיכוב</h2>
            <Link
              className="section-link"
              href="/standards?delay=מתעכב"
              prefetch={true}
              aria-label="כל התיקים בעיכוב"
            >
              לכל התיקים <ArrowLeft size={14} />
            </Link>
          </div>
          <RecordTable
            rows={data.delayed.map((item) => standardRow(item, "delayed", modelsMap, isAgent))}
            columns={["מספר תיק", "דגם", "סטטוס", "סיבת עיכוב"]}
            empty="אין תיקים בעיכוב"
            icon={TriangleAlert}
            showEmptyHeader
          />
        </section>
      </div>

      <section className="card data-card" aria-labelledby="recent-repairs">
        <div className="section-heading">
          <h2 id="recent-repairs">תיקונים אחרונים</h2>
          <Link className="section-link" href="/repairs" prefetch={true} aria-label="כל התיקונים">
            לכל התיקונים <ArrowLeft size={14} />
          </Link>
        </div>
        <RecordTable
          rows={data.repairs.map((item) =>
            repairRow(item, customersMap, true, modelsMap, { readOnly: isAgent, pickupAddress }),
          )}
          columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          empty="אין תיקונים אחרונים"
          icon={Wrench}
          showEmptyHeader
        />
      </section>
    </div>
  );
}

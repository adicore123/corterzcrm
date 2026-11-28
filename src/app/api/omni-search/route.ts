import { NextRequest, NextResponse } from "next/server";
import { safeApiErrorResponse } from "@/lib/api-guard";
import { getUser, sessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { catalogModels } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { listOrdersForUser } from "@/lib/orders/service";
import { listQuotesForUser } from "@/lib/quotes/service";

export type OmniSearchItem = {
  id: string;
  category: "repairs" | "orders" | "customers" | "standards" | "faults" | "models" | "quotes";
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "red" | "amber" | "green" | "blue" | "neutral";
  href: string;
  phone?: string;
  keywords: string;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request.cookies.get(sessionCookie)?.value);
    if (!user) throw new AppError(401, "יש להיכנס למערכת.");
    const isAgent = user.role === "agent";

    const [models, faults, orders, quotes, repairs, standards, customers] = await Promise.all([
      catalogModels(),
      readCollection("faults"),
      listOrdersForUser(user),
      listQuotesForUser(user),
      isAgent ? Promise.resolve([]) : readCollection("repairs"),
      isAgent ? Promise.resolve([]) : readCollection("standards"),
      isAgent ? Promise.resolve([]) : readCollection("customers"),
    ]);

    const customersById = new Map(customers.map((c) => [c.id, c]));
    const items: OmniSearchItem[] = [];

    for (const r of repairs.slice(0, 150)) {
      const cust = customersById.get(r.customerId);
      items.push({
        id: `rep-${r.id}`,
        category: "repairs",
        title: `${r.number} · ${r.model}`,
        subtitle: `${cust ? `${cust.name} (${cust.phone})` : "לקוח"} · סידורי ${r.serial}`,
        badge: r.status,
        badgeTone: r.status === "הסתיים" ? "green" : r.status === "בטיפול" ? "blue" : "red",
        href: `/repairs/${r.id}`,
        phone: cust?.phone,
        keywords: `${r.number} ${r.model} ${r.serial} ${r.fault} ${r.work} ${cust?.name ?? ""} ${cust?.store ?? ""} ${cust?.phone ?? ""}`.toLocaleLowerCase("he"),
      });
    }

    for (const o of orders.slice(0, 120)) {
      const modelsSummary = o.items.map((it) => `${it.modelName} ×${it.quantity}`).join(", ");
      items.push({
        id: `ord-${o.id}`,
        category: "orders",
        title: `${o.number} · ${o.customerName}${o.storeName ? ` (${o.storeName})` : ""}`,
        subtitle: `${modelsSummary} · סוכן: ${o.createdByName}`,
        badge: o.status,
        badgeTone:
          o.status === "סופקה"
            ? "green"
            : o.status === "בוטלה"
              ? "neutral"
              : o.status === "חדשה"
                ? "red"
                : "blue",
        href: `/orders?q=${encodeURIComponent(o.number)}`,
        phone: o.customerPhone,
        keywords: `${o.number} ${o.customerName} ${o.storeName ?? ""} ${o.customerPhone} ${modelsSummary} ${o.createdByName}`.toLocaleLowerCase("he"),
      });
    }

    for (const c of customers.slice(0, 200)) {
      items.push({
        id: `cus-${c.id}`,
        category: "customers",
        title: c.name + (c.store ? ` · ${c.store}` : ""),
        subtitle: `${c.customerType === "store" ? "חנות" : "לקוח פרטי"} · ${c.phone}`,
        badge: c.customerType === "store" ? "חנות" : "פרטי",
        badgeTone: "neutral",
        href: `/customers/${c.id}`,
        phone: c.phone,
        keywords: `${c.name} ${c.store} ${c.phone} ${c.phone.replace(/\D/g, "")}`.toLocaleLowerCase("he"),
      });
    }

    for (const s of standards.slice(0, 100)) {
      items.push({
        id: `std-${s.id}`,
        category: "standards",
        title: `${s.number} · ${s.model}`,
        subtitle: `${s.device}${s.delay === "מתעכב" && s.delayReason ? ` · עיכוב: ${s.delayReason}` : ""}`,
        badge: s.delay === "מתעכב" ? "בעיכוב" : s.status,
        badgeTone: s.delay === "מתעכב" ? "amber" : s.status === "הסתיים" ? "green" : "blue",
        href: `/standards/${s.id}`,
        keywords: `${s.number} ${s.model} ${s.device} ${s.notes} ${s.delayReason}`.toLocaleLowerCase("he"),
      });
    }

    for (const f of faults.slice(0, 100)) {
      const codes = f.commonFaults.map((cf) => `${cf.code} ${cf.title}`).join(" · ");
      items.push({
        id: `flt-${f.id}`,
        category: "faults",
        title: `מדריך תקלות ופתיחת הגבלה · ${f.model}`,
        subtitle: codes || f.summary || f.device,
        badge: `${f.commonFaults.length} תקלות`,
        badgeTone: "amber",
        href: `/faults/${f.id}`,
        keywords: `${f.model} ${f.device} ${f.summary} ${f.unlockInstructions} ${codes}`.toLocaleLowerCase("he"),
      });
    }

    for (const q of quotes.slice(0, 80)) {
      items.push({
        id: `quo-${q.id}`,
        category: "quotes",
        title: `הצעת מחיר · ${q.customerName}${q.storeName ? ` (${q.storeName})` : ""}`,
        subtitle: `${q.modelName} ×${q.quantity} · ${q.customerPhone}`,
        badge: q.status === "accepted" ? "אושרה" : q.status === "cancelled" ? "בוטלה" : "נשלחה",
        badgeTone: q.status === "accepted" ? "green" : q.status === "cancelled" ? "neutral" : "blue",
        href: "/quotes",
        phone: q.customerPhone,
        keywords: `${q.customerName} ${q.storeName ?? ""} ${q.customerPhone} ${q.modelName}`.toLocaleLowerCase("he"),
      });
    }

    for (const m of models.slice(0, 80)) {
      items.push({
        id: `mod-${m.id}`,
        category: "models",
        title: m.name,
        subtitle: `${m.device}${m.msrp ? ` · ₪${m.msrp.toLocaleString("he-IL")}` : ""}`,
        badge: "דגם",
        badgeTone: "neutral",
        href: isAgent ? `/catalog?model=${m.id}` : `/models/${m.id}`,
        keywords: `${m.name} ${m.device} ${m.summary ?? ""}`.toLocaleLowerCase("he"),
      });
    }

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return safeApiErrorResponse(error, "omni-search");
  }
}

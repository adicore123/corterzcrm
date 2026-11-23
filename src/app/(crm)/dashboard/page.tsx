import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, ClipboardList, Plus, ShieldAlert, Sparkles, TriangleAlert, UserRoundPlus, Wrench } from "lucide-react";
import { authorizedUser } from "@/lib/auth/page";
import { dashboard } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { DEFAULT_PICKUP_ADDRESS } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { RecordTable } from "@/components/record-table";
import { repairRow, standardRow } from "@/components/record-cells";

export const metadata: Metadata = { title: "סקירה כללית" };

export default async function DashboardPage() {
  const user = await authorizedUser();
  const [data, settings] = await Promise.all([dashboard(), readCollection("settings")]);
  const isAgent = user.role === "agent";
  const pickupAddress = settings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS;
  const customersMap = new Map(data.customers.map((customer) => [customer.id, customer]));
  const modelsMap = new Map(data.models.map((item) => [item.name.toLocaleLowerCase("he"), item]));
  const metrics = [
    { label: "תיקי תקינה פעילים", value: data.counts.activeStandards, icon: ClipboardList, tone: "red", href: "/standards?status=active" },
    { label: "תיקי תקינה בעיכוב", value: data.counts.delayed, icon: TriangleAlert, tone: "amber", href: "/standards?delay=מתעכב" },
    { label: "תיקי תקינה שהסתיימו", value: data.counts.completed, icon: CircleCheck, tone: "green", href: "/standards?status=הסתיים" },
    { label: "תיקונים פעילים", value: data.counts.activeRepairs, icon: Wrench, tone: "red", href: "/repairs?status=active" },
  ];

  return <div className="dashboard">
    <section className="dashboard-banner">
      <div className="track-lines" aria-hidden />
      <div><h1>סקירה כללית</h1><p>{isAgent ? "ממשק סוכן · צפייה בנתוני המערכת ועדכון תקלות ופתיחות הגבלה" : "מרכז התפעול של קורטז"}</p></div>
    </section>
    <section className="metrics" aria-label="תמונת מצב">
      {metrics.map(({ label, value, icon: Icon, tone, href }) => <Link href={href} prefetch={false} key={label} className="metric card">
        <span className={"metric-icon tone-" + tone}><Icon size={24} strokeWidth={1.8} aria-hidden /></span>
        <span className="metric-copy"><strong>{value}</strong><span>{label}</span></span>
        <ArrowLeft className="metric-arrow" size={16} aria-hidden />
      </Link>)}
    </section>
    <section className="card quick-card" aria-labelledby="quick-title">
      <h2 id="quick-title">פעולות מהירות</h2>
      <div className="quick-actions">
        {!isAgent && <Button asChild><Link href="/standards/new"><Plus size={18} /> תיק מכון תקנים</Link></Button>}
        {!isAgent && <Button asChild><Link href="/repairs/new"><Wrench size={17} /> תיקון חדש</Link></Button>}
        <Button variant={isAgent ? "default" : "soft"} asChild><Link href="/faults"><ShieldAlert size={18} /> תקלות ופתיחות הגבלה</Link></Button>
        {isAgent && <Button variant="soft" asChild><Link href="/faults/new"><Plus size={18} /> מדריך חדש לדגם</Link></Button>}
        {isAgent && <Button variant="soft" asChild><Link href="/catalog"><Sparkles size={18} /> קטלוג סוכנים</Link></Button>}
        {!isAgent && <Button variant="soft" asChild><Link href="/customers/new"><UserRoundPlus size={18} /> לקוח חדש</Link></Button>}
      </div>
    </section>
    <div className="dashboard-split">
      <section className="card data-card" aria-labelledby="recent-standards">
        <div className="section-heading"><h2 id="recent-standards">תיקי תקינה אחרונים</h2><Link className="section-link" href="/standards" aria-label="כל תיקי התקינה">לכל התיקים <ArrowLeft size={14} /></Link></div>
        <RecordTable rows={data.standards.map((item) => standardRow(item, "recent", modelsMap, isAgent))} columns={["מספר תיק", "דגם", "סטטוס", "עודכן לאחרונה"]}
          empty="אין תיקי תקינה להצגה" showEmptyHeader />
      </section>
      <section className="card data-card" aria-labelledby="delayed">
        <div className="section-heading"><h2 id="delayed">תיקים בעיכוב</h2><Link className="section-link" href="/standards?delay=מתעכב" aria-label="כל התיקים בעיכוב">לכל התיקים <ArrowLeft size={14} /></Link></div>
        <RecordTable rows={data.delayed.map((item) => standardRow(item, "delayed", modelsMap, isAgent))} columns={["מספר תיק", "דגם", "סטטוס", "סיבת עיכוב"]}
          empty="אין תיקים בעיכוב" icon={TriangleAlert} showEmptyHeader />
      </section>
    </div>
    <section className="card data-card" aria-labelledby="recent-repairs">
      <div className="section-heading"><h2 id="recent-repairs">תיקונים אחרונים</h2><Link className="section-link" href="/repairs" aria-label="כל התיקונים">לכל התיקונים <ArrowLeft size={14} /></Link></div>
      <RecordTable rows={data.repairs.map((item) => repairRow(item, customersMap, true, modelsMap, { readOnly: isAgent, pickupAddress }))} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
        empty="אין תיקונים אחרונים" icon={Wrench} showEmptyHeader />
    </section>
  </div>;
}

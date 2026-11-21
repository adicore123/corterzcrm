import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleCheck, ClipboardList, Images, ListChecks, Pencil, Plus, Wrench } from "lucide-react";
import { readCollection } from "@/lib/json-db/store";
import { formatDate, labels } from "@/lib/presentation";
import type { Customer, Module, Repair, Standard } from "@/lib/validation/models";
import { PhoneLink, RecordNumber, repairRow, TaskProgress } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { DeleteButton } from "./delete-button";
import { PhotoGallery } from "./photos";

type Value = [label: string, value: ReactNode];

function Details({ rows }: { rows: Value[] }) {
  return <dl className="details-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>;
}

export async function RecordDetail({ module, record, admin, saved }: {
  module: Module; record: Standard | Repair | Customer; admin: boolean; saved: boolean;
}) {
  const number = "number" in record ? record.number : undefined;
  const title = "model" in record ? record.model : record.name;
  const [customers, repairs] = await Promise.all([
    "serial" in record ? readCollection("customers") : [],
    "name" in record ? readCollection("repairs") : [],
  ]);
  const customer = "serial" in record ? customers.find((item) => item.id === record.customerId) : undefined;
  const history = repairs.filter((repair) => repair.customerId === record.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const names = new Map("name" in record ? [[record.id, record.name]] : []);
  const dates: Value[] = [["תאריך פתיחה", formatDate(record.createdAt, true)], ["עודכן לאחרונה", formatDate(record.updatedAt, true)]];

  return <div className="page-stack">
    <Link className="back-link" href={"/" + module}><ArrowRight size={16} aria-hidden />{labels[module]}</Link>
    <div className="page-title title-with-action">
      <div>
        <h1>{title}</h1>
        <div className="record-subline">
          {number && <RecordNumber number={number} />}
          {"status" in record && <Status value={record.status} />}
          {"delay" in record && <Status value={record.delay} />}
        </div>
      </div>
      <div className="detail-actions">
        <Button asChild variant="outline"><Link href={"/" + module + "/" + record.id + "/edit"}><Pencil size={17} /> עריכה</Link></Button>
        {admin && <DeleteButton module={module} id={record.id} version={record.updatedAt} subject={number ?? title} />}
      </div>
    </div>
    {saved && <p className="success-message" role="status"><CircleCheck size={18} /> השינויים נשמרו בהצלחה.</p>}
    {"tasks" in record && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי תיק תקינה</h2>
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", record.model], ["סטטוס טיפול", <Status key="status" value={record.status} />],
          ["סטטוס עיכוב", <Status key="delay" value={record.delay} />], ...(record.delay === "מתעכב" ? [["סיבת עיכוב", record.delayReason] as Value] : []), ...dates]} />
        {record.notes && <div className="detail-notes"><h3>הערות</h3><p>{record.notes}</p></div>}
      </section>
      <section className="card detail-card">
        <div className="section-heading"><h2><span className="section-icon"><ListChecks size={18} /></span>מה נשאר לעשות?</h2>
          <TaskProgress tasks={record.tasks} />
        </div>
        {record.tasks.length ? <ul className="task-list">{record.tasks.map((task) =>
          <li key={task.id} className={task.done ? "task-done" : ""}>
            <span className="task-state" aria-label={task.done ? "הושלמה" : "פתוחה"}>{task.done && <Check size={15} />}</span>
            <span>{task.title}</span>
          </li>)}</ul> : <p className="muted">אין משימות בתיק.</p>}
      </section>
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="standards" id={record.id} photos={record.photos} /></section>
    </>}
    {"serial" in record && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><Wrench size={18} /></span>פרטי תיקון</h2>
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", record.model], ["מספר סידורי", <bdi key="serial">{record.serial}</bdi>],
          ["לקוח", customer && <Link key="customer" className="text-link" href={"/customers/" + customer.id}>{customer.name}</Link>],
          ["סטטוס תיקון", <Status key="status" value={record.status} />], ...dates]} />
        <div className="detail-notes"><h3>מה התקלה?</h3><p>{record.fault}</p></div>
        <div className="detail-notes"><h3>מה תוקן?</h3><p>{record.work || "טרם תועד תיקון."}</p></div>
      </section>
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="repairs" id={record.id} photos={record.photos} /></section>
    </>}
    {"name" in record && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי לקוח</h2>
        <Details rows={[["שם לקוח", record.name], ["שם החנות", record.store], ["מספר טלפון", <PhoneLink key="phone" phone={record.phone} />], ...dates]} />
      </section>
      <section className="card data-card">
        <div className="section-heading"><h2>היסטוריית תיקונים</h2>
          <Button asChild size="sm" variant="outline"><Link href={"/repairs/new?customer=" + record.id}><Plus size={16} /> תיקון חדש</Link></Button>
        </div>
        <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          rows={history.map((item) => repairRow(item, names, true))} empty="אין תיקונים משויכים" showEmptyHeader />
      </section>
    </>}
  </div>;
}

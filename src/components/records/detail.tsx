import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bike, CircleCheck, ClipboardList, Images, Pencil, Plus, Wrench } from "lucide-react";
import { catalogModels } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { formatDate, labels } from "@/lib/presentation";
import type { CatalogModel, Customer, Module, Repair, Standard } from "@/lib/validation/models";
import { ModelBadge, PhoneLink, RecordNumber, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { DeleteButton } from "./delete-button";
import { PhotoGallery } from "./photos";
import { PrintButton, QuickStatus } from "./quick-status";
import { TaskChecklist } from "./task-checklist";

type Value = [label: string, value: ReactNode];

function Details({ rows }: { rows: Value[] }) {
  return <dl className="details-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>;
}

export async function RecordDetail({ module, record, admin, saved }: {
  module: Module; record: Standard | Repair | Customer | CatalogModel; admin: boolean; saved: boolean;
}) {
  const number = "number" in record ? record.number : undefined;
  const title = "model" in record ? record.model : record.name;
  const isModelRecord = module === "models" && !("phone" in record) && !("model" in record);
  const [customers, repairs, standards, models] = await Promise.all([
    "serial" in record || isModelRecord ? readCollection("customers") : [],
    "phone" in record || isModelRecord ? readCollection("repairs") : [],
    isModelRecord ? readCollection("standards") : [],
    catalogModels(),
  ]);
  const modelsMap = new Map(models.map((item) => [item.name.toLocaleLowerCase("he"), item]));
  const customer = "serial" in record ? customers.find((item) => item.id === record.customerId) : undefined;
  const linkedModel = "model" in record
    ? modelsMap.get(record.model.toLocaleLowerCase("he"))
    : undefined;
  const history = "phone" in record
    ? repairs.filter((repair) => repair.customerId === record.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const modelStandards = isModelRecord
    ? standards.filter((item) => item.model.toLocaleLowerCase("he") === record.name.toLocaleLowerCase("he"))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const modelRepairs = isModelRecord
    ? repairs.filter((item) => item.model.toLocaleLowerCase("he") === record.name.toLocaleLowerCase("he"))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const names = new Map("phone" in record ? [[record.id, record.name]] : customers.map((c) => [c.id, c.name]));
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
          {isModelRecord && <span className="status status-neutral">{record.device}</span>}
        </div>
      </div>
      <div className="detail-actions no-print">
        {("tasks" in record || "serial" in record) && <PrintButton />}
        <Button asChild variant="outline"><Link href={"/" + module + "/" + record.id + "/edit"}><Pencil size={17} /> עריכה</Link></Button>
        {admin && <DeleteButton module={module} id={record.id} version={record.updatedAt} subject={number ?? title} />}
      </div>
    </div>
    {saved && <p className="success-message no-print" role="status"><CircleCheck size={18} /> השינויים נשמרו בהצלחה.</p>}
    {"tasks" in record && <>
      <section className="card detail-card">
        <div className="section-heading">
          <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי תיק תקינה</h2>
          <QuickStatus key={record.updatedAt} module="standards" record={record} />
        </div>
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", linkedModel ? <ModelBadge key="model" model={linkedModel} linked /> : record.model], ["סטטוס טיפול", <Status key="status" value={record.status} />],
          ["סטטוס עיכוב", <Status key="delay" value={record.delay} />], ...(record.delay === "מתעכב" ? [["סיבת עיכוב", record.delayReason] as Value] : []), ...dates]} />
        {record.notes && <div className="detail-notes"><h3>הערות</h3><p>{record.notes}</p></div>}
      </section>
      <TaskChecklist key={record.updatedAt} record={record} />
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="standards" id={record.id} photos={record.photos} /></section>
    </>}
    {"serial" in record && <>
      <section className="card detail-card">
        <div className="section-heading">
          <h2><span className="section-icon"><Wrench size={18} /></span>פרטי תיקון</h2>
          <QuickStatus key={record.updatedAt} module="repairs" record={record} />
        </div>
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", linkedModel ? <ModelBadge key="model" model={linkedModel} linked /> : record.model], ["מספר סידורי", <bdi key="serial">{record.serial}</bdi>],
          ["לקוח", customer && <Link key="customer" className="text-link" href={"/customers/" + customer.id}>{customer.name}</Link>],
          ...(customer ? [["טלפון לקוח", <PhoneLink key="cphone" phone={customer.phone}
            whatsappMessage={`שלום ${customer.name}, עדכון מקורטז לגבי תיקון ${record.number} (${record.model}) — סטטוס הטיפול: ${record.status}.`} />] as Value] : []),
          ["סטטוס תיקון", <Status key="status" value={record.status} />], ...dates]} />
        <div className="detail-notes"><h3>מה התקלה?</h3><p>{record.fault}</p></div>
        <div className="detail-notes"><h3>מה תוקן?</h3><p>{record.work || "טרם תועד תיקון."}</p></div>
      </section>
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="repairs" id={record.id} photos={record.photos} /></section>
    </>}
    {"phone" in record && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי לקוח</h2>
        <Details rows={[["שם לקוח", record.name], ["שם החנות", record.store], ["מספר טלפון", <PhoneLink key="phone" phone={record.phone} />], ...dates]} />
      </section>
      <section className="card data-card">
        <div className="section-heading"><h2>היסטוריית תיקונים</h2>
          <Button asChild size="sm" variant="outline"><Link href={"/repairs/new?customer=" + record.id}><Plus size={16} /> תיקון חדש</Link></Button>
        </div>
        <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          rows={history.map((item) => repairRow(item, names, true, modelsMap))} empty="אין תיקונים משויכים" showEmptyHeader />
      </section>
    </>}
    {isModelRecord && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><Bike size={18} /></span>פרטי הדגם</h2>
        {record.imageUrl && <div className="catalog-image-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={record.imageUrl} alt={record.name} className="catalog-thumb-lg" />
          <div><strong>{record.name}</strong><p className="muted">{record.device}</p></div>
        </div>}
        <Details rows={[
          ["שם הדגם", record.name],
          ["סוג מכשיר", record.device],
          ["תיקי מכון תקנים", modelStandards.length],
          ["תיקונים משויכים", modelRepairs.length],
          ...dates,
        ]} />
        {record.notes && <div className="detail-notes"><h3>מפרט והערות</h3><p>{record.notes}</p></div>}
      </section>
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות הדגם</h2>
        <PhotoGallery module="models" id={record.id} photos={record.photos} /></section>
      <section className="card data-card">
        <div className="section-heading"><h2>תיקי מכון תקנים של דגם זה</h2>
          <Button asChild size="sm" variant="outline"><Link href={"/standards/new?model=" + record.id}><Plus size={16} /> תיק מכון תקנים</Link></Button>
        </div>
        <RecordTable icon={ClipboardList} columns={["מספר תיק", "דגם", "סטטוס", "עודכן לאחרונה"]}
          rows={modelStandards.map((item) => standardRow(item, "recent"))} empty="אין תיקי תקינה משויכים לדגם זה" showEmptyHeader />
      </section>
      <section className="card data-card">
        <div className="section-heading"><h2>תיקונים של דגם זה</h2>
          <Button asChild size="sm" variant="outline"><Link href={"/repairs/new?model=" + record.id}><Plus size={16} /> תיקון חדש</Link></Button>
        </div>
        <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          rows={modelRepairs.map((item) => repairRow(item, names, true))} empty="אין תיקונים משויכים לדגם זה" showEmptyHeader />
      </section>
    </>}
  </div>;
}

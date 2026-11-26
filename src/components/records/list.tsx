import Link from "next/link";
import { Bike, ClipboardList, ListFilter, Plus, Search, ShieldAlert, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerRow, faultGuideRow, modelRow, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { FaultsModuleHub } from "./faults-hub";
import { catalogModels, searchRecords, type RecordFilters } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { labels, moduleCopy } from "@/lib/presentation";
import { canEditModule, DEFAULT_PICKUP_ADDRESS, delayStatuses, devices, repairStatuses, standardStatuses, type FaultGuide, type Module, type Role } from "@/lib/validation/models";

const icons = { standards: ClipboardList, repairs: Wrench, customers: Users, models: Bike, faults: ShieldAlert };

export async function RecordList({ module, filters, deleted, userRole = "admin" }: {
  module: Module; filters: RecordFilters; deleted: boolean; userRole?: Role;
}) {
  const canEdit = canEditModule(userRole, module);
  const readOnly = !canEdit;
  const [records, contacts, repairs, standards, models, settings] = await Promise.all([
    searchRecords(module, filters),
    module === "repairs" ? readCollection("customers") : [],
    module === "customers" || module === "models" || module === "faults" ? readCollection("repairs") : [],
    module === "models" ? readCollection("standards") : [],
    module === "standards" || module === "repairs" || module === "faults" ? catalogModels() : [],
    module === "repairs" ? readCollection("settings") : Promise.resolve({ pickupAddress: DEFAULT_PICKUP_ADDRESS }),
  ]);
  const pickupAddress = settings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS;
  const customersMap = new Map(contacts.map((item) => [item.id, item]));
  const modelsMap = new Map(models.map((item) => [item.name.toLocaleLowerCase("he"), item]));
  const counts = new Map<string, number>();
  const modelRepairs = new Map<string, number>();
  const modelStandards = new Map<string, number>();
  for (const repair of repairs) {
    counts.set(repair.customerId, (counts.get(repair.customerId) ?? 0) + 1);
    const key = repair.model.toLocaleLowerCase("he");
    modelRepairs.set(key, (modelRepairs.get(key) ?? 0) + 1);
  }
  for (const standard of standards) {
    const key = standard.model.toLocaleLowerCase("he");
    modelStandards.set(key, (modelStandards.get(key) ?? 0) + 1);
  }
  const rows = records.map((item) => {
    if ("tasks" in item) return standardRow(item, "list", modelsMap, readOnly);
    if ("serial" in item) return repairRow(item, customersMap, false, modelsMap, { readOnly, pickupAddress });
    if ("phone" in item) return customerRow(item, counts.get(item.id) ?? 0, readOnly);
    if ("commonFaults" in item) return faultGuideRow(item, modelRepairs.get(item.model.toLocaleLowerCase("he")) ?? 0, modelsMap);
    const key = item.name.toLocaleLowerCase("he");
    return modelRow(item, modelStandards.get(key) ?? 0, modelRepairs.get(key) ?? 0, readOnly);
  });
  const copy = moduleCopy[module];
  const columns = module === "standards" ? ["מספר תיק", "דגם", "סוג מכשיר", "סטטוס", "עיכוב", "משימות", "עדכון אחרון"]
    : module === "repairs" ? ["מספר תיקון", "דגם", "מספר סידורי", "לקוח", "סטטוס", "עדכון אחרון"]
    : module === "models" ? ["שם דגם", "סוג מכשיר", "תיקי תקינה", "תיקונים"]
    : module === "faults" ? ["דגם", "סוג מכשיר", "תקלות נפוצות", "קבצים", "פתיחת הגבלה", "תיקוני מעבדה", "עדכון אחרון"]
    : ["שם לקוח", "חנות", "טלפון", "תיקונים"];
  const filtered = Boolean(filters.q || filters.status || filters.delay || filters.sort);
  const href = "/" + module;

  const listSection = (
    <section className="card list-card" aria-label={labels[module]}>
      <form method="get" action={href} className="filters" aria-label="חיפוש וסינון">
        <div className="search-field">
          <Search size={18} aria-hidden />
          <input type="search" name="q" aria-label={copy.search} placeholder={copy.search} defaultValue={filters.q} maxLength={120} />
        </div>
        {(module === "standards" || module === "repairs") && <select name="status" aria-label="סינון לפי סטטוס" defaultValue={filters.status ?? ""}>
          <option value="">כל הסטטוסים</option>
          <option value="active">כל הפעילים</option>
          {(module === "standards" ? standardStatuses : repairStatuses).map((item) => <option key={item}>{item}</option>)}
        </select>}
        {module === "models" && <select name="status" aria-label="סינון לפי סוג מכשיר" defaultValue={filters.status ?? ""}>
          <option value="">כל סוגי הכלים</option>
          {devices.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>}
        {module === "faults" && <select name="status" aria-label="סינון מדריכי תקלות" defaultValue={filters.status ?? ""}>
          <option value="">הכל</option>
          <option value="has-video">כולל סרטון פתיחת הגבלה</option>
          <option value="has-files">כולל קבצים מצורפים</option>
          {devices.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>}
        {module === "standards" && <select name="delay" aria-label="סינון עיכובים" defaultValue={filters.delay ?? ""}>
          <option value="">כל מצבי העיכוב</option>{delayStatuses.map((item) => <option key={item}>{item}</option>)}
        </select>}
        <select name="sort" aria-label="מיון רשומות" defaultValue={filters.sort ?? ""}>
          <option value="">{module === "models" ? "לפי שם דגם" : "עדכון אחרון"}</option>
          <option value="created">נפתחו לאחרונה</option>
          <option value="oldest">מהישן לחדש</option>
        </select>
        <Button type="submit" variant="outline"><ListFilter size={17} /> חיפוש</Button>
        {filtered && <Button variant="ghost" asChild><Link href={href}>ניקוי</Link></Button>}
      </form>
      <div className="list-toolbar"><span>{rows.length === 1 ? "רשומה אחת" : rows.length + " רשומות"}</span></div>
      <RecordTable rows={rows} columns={columns} icon={icons[module]} empty={filtered ? "לא נמצאו תוצאות" : copy.empty} showEmptyHeader />
    </section>
  );

  return <div className="page-stack">
    <div className="page-title title-with-action">
      <div><h1>{labels[module]}</h1><p>{copy.description}</p></div>
      {canEdit && <Button asChild><Link href={href + "/new"}><Plus size={18} /> {copy.create}</Link></Button>}
    </div>
    {deleted && <p className="success-message" role="status">הרשומה נמחקה.</p>}
    {module === "faults" ? (
      <FaultsModuleHub records={records as FaultGuide[]} catalogModels={models} canEdit={canEdit}>
        {listSection}
      </FaultsModuleHub>
    ) : (
      listSection
    )}
  </div>;
}

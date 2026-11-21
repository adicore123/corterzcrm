import Link from "next/link";
import { ClipboardList, ListFilter, Plus, Search, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerRow, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { searchRecords, type RecordFilters } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { labels, moduleCopy } from "@/lib/presentation";
import { delayStatuses, repairStatuses, standardStatuses, type Module } from "@/lib/validation/models";

const icons = { standards: ClipboardList, repairs: Wrench, customers: Users };

export async function RecordList({ module, filters, deleted }: { module: Module; filters: RecordFilters; deleted: boolean }) {
  const [records, contacts, repairs] = await Promise.all([
    searchRecords(module, filters),
    module === "repairs" ? readCollection("customers") : [],
    module === "customers" ? readCollection("repairs") : [],
  ]);
  const names = new Map(contacts.map((item) => [item.id, item.name]));
  const counts = new Map<string, number>();
  for (const repair of repairs) counts.set(repair.customerId, (counts.get(repair.customerId) ?? 0) + 1);
  const rows = records.map((item) => {
    if ("tasks" in item) return standardRow(item, "list");
    if ("serial" in item) return repairRow(item, names);
    return customerRow(item, counts.get(item.id) ?? 0);
  });
  const copy = moduleCopy[module];
  const columns = module === "standards" ? ["מספר תיק", "דגם", "סוג מכשיר", "טיפול", "עיכוב", "משימות", "עדכון אחרון"]
    : module === "repairs" ? ["מספר תיקון", "דגם", "מספר סידורי", "לקוח", "סטטוס", "עדכון אחרון"]
      : ["שם לקוח", "חנות", "טלפון", "תיקונים"];
  const filtered = Boolean(filters.q || filters.status || filters.delay || filters.sort);
  const href = "/" + module;

  return <div className="page-stack">
    <div className="page-title title-with-action">
      <div><h1>{labels[module]}</h1><p>{copy.description}</p></div>
      <Button asChild><Link href={href + "/new"}><Plus size={18} /> {copy.create}</Link></Button>
    </div>
    {deleted && <p className="success-message" role="status">הרשומה נמחקה.</p>}
    <section className="card list-card" aria-label={labels[module]}>
      <form method="get" action={href} className="filters" aria-label="חיפוש וסינון">
        <div className="search-field">
          <Search size={18} aria-hidden />
          <input type="search" name="q" aria-label={copy.search} placeholder={copy.search} defaultValue={filters.q} maxLength={120} />
        </div>
        {module !== "customers" && <select name="status" aria-label="סינון לפי סטטוס" defaultValue={filters.status ?? ""}>
          <option value="">כל הסטטוסים</option>
          <option value="active">כל הפעילים</option>
          {(module === "standards" ? standardStatuses : repairStatuses).map((item) => <option key={item}>{item}</option>)}
        </select>}
        {module === "standards" && <select name="delay" aria-label="סינון עיכובים" defaultValue={filters.delay ?? ""}>
          <option value="">כל מצבי העיכוב</option>{delayStatuses.map((item) => <option key={item}>{item}</option>)}
        </select>}
        <select name="sort" aria-label="מיון רשומות" defaultValue={filters.sort ?? ""}>
          <option value="">עדכון אחרון</option><option value="created">נפתחו לאחרונה</option><option value="oldest">מהישן לחדש</option>
        </select>
        <Button type="submit" variant="outline"><ListFilter size={17} /> חיפוש</Button>
        {filtered && <Button variant="ghost" asChild><Link href={href}>ניקוי</Link></Button>}
      </form>
      <div className="list-toolbar"><span>{rows.length === 1 ? "רשומה אחת" : rows.length + " רשומות"}</span></div>
      <RecordTable rows={rows} columns={columns} icon={icons[module]} empty={filtered ? "לא נמצאו תוצאות" : copy.empty} showEmptyHeader />
    </section>
  </div>;
}

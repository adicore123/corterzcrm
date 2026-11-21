import Link from "next/link";
import { ChevronLeft, ClipboardList, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type TableRow = { id: string; label: string; href: string; cells: ReactNode[] };

export function RecordTable({ columns, rows, empty, icon: Icon = ClipboardList, showEmptyHeader = false }: {
  columns: string[]; rows: TableRow[]; empty: string; icon?: LucideIcon; showEmptyHeader?: boolean;
}) {
  return <>
    {(rows.length > 0 || showEmptyHeader) && <table className="data-table">
      <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}<th scope="col" className="table-open"><span className="sr-only">פתיחה</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        {row.cells.map((cell, index) => <td key={columns[index]}>
          {index === 0 ? <Link className="record-link" href={row.href} prefetch={false}>{cell}</Link> : cell}
        </td>)}
        <td className="table-open"><Link href={row.href} prefetch={false} className="row-arrow" aria-label={"פתיחת " + row.label}><ChevronLeft size={17} /></Link></td>
      </tr>)}</tbody>
    </table>}
    {rows.length > 0 && <ul className="mobile-records">{rows.map((row) => <li className="mobile-record" key={row.id}>
      <Link className="mobile-record-title" href={row.href} prefetch={false}>
        <span>{row.cells[0]}</span><ChevronLeft size={18} aria-hidden />
      </Link>
      <dl>{row.cells.slice(1).map((cell, index) => <div key={columns[index + 1]}><dt>{columns[index + 1]}</dt><dd>{cell}</dd></div>)}</dl>
    </li>)}</ul>}
    {rows.length === 0 && <div className="empty-state"><span className="empty-icon"><Icon size={23} strokeWidth={1.65} aria-hidden /></span><strong>{empty}</strong></div>}
  </>;
}

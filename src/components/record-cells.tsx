import Link from "next/link";
import { Phone } from "lucide-react";
import { formatDate, phoneHref } from "@/lib/presentation";
import type { Customer, Repair, Standard } from "@/lib/validation/models";
import { Status } from "./ui/status";

export function RecordNumber({ number }: { number: string }) {
  return <bdi className="record-number" dir="ltr">{number}</bdi>;
}

export function CustomerLink({ id, names }: { id: string; names: Map<string, string> }) {
  const name = names.get(id);
  return name ? <Link className="text-link" href={"/customers/" + id} prefetch={false}>{name}</Link> : "—";
}

export function PhoneLink({ phone }: { phone: string }) {
  return <a className="phone-link" href={phoneHref(phone)}><Phone size={14} aria-hidden /><bdi dir="ltr">{phone}</bdi></a>;
}

export function TaskProgress({ tasks }: { tasks: Standard["tasks"] }) {
  if (!tasks.length) return <span className="muted">—</span>;
  const done = tasks.filter((task) => task.done).length;
  return <span className="task-progress">
    <progress max={tasks.length} value={done} aria-label="משימות שהושלמו" />
    <bdi dir="ltr">{done}/{tasks.length}</bdi>
  </span>;
}

export function standardRow(item: Standard, mode: "list" | "recent" | "delayed") {
  const progress = <TaskProgress tasks={item.tasks} />;
  const status = <Status value={item.status} />;
  const delay = <Status value={item.delay} />;
  const date = formatDate(item.updatedAt);
  const cells = mode === "list" ? [item.model, item.device, status, delay, progress, date]
    : mode === "delayed" ? [item.model, status, item.delayReason] : [item.model, status, date];
  return { id: item.id, label: item.number, href: "/standards/" + item.id,
    cells: [<RecordNumber key="number" number={item.number} />, ...cells] };
}

export function repairRow(item: Repair, names: Map<string, string>, recent = false) {
  const customer = <CustomerLink id={item.customerId} names={names} />;
  const status = <Status value={item.status} />;
  const cells = recent ? [item.model, customer, formatDate(item.createdAt), status]
    : [item.model, <bdi key="serial">{item.serial}</bdi>, customer, status, formatDate(item.updatedAt)];
  return { id: item.id, label: item.number, href: "/repairs/" + item.id,
    cells: [<RecordNumber key="number" number={item.number} />, ...cells] };
}

export function customerRow(item: Customer, count: number) {
  return { id: item.id, label: item.name, href: "/customers/" + item.id,
    cells: [item.name, item.store || "—", <PhoneLink key="phone" phone={item.phone} />, count] };
}

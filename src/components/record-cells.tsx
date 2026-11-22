import Link from "next/link";
import { Bike, MessageCircle, Phone, Video } from "lucide-react";
import { formatDate, phoneHref, whatsappHref } from "@/lib/presentation";
import type { CatalogModel, Customer, FaultGuide, Repair, Standard } from "@/lib/validation/models";
import { Status } from "./ui/status";

export function modelThumbUrl(model: Pick<CatalogModel, "id" | "imageUrl" | "photos">) {
  if (model.photos.length > 0) return "/api/images/models/" + model.id + "/" + model.photos[0].id;
  return model.imageUrl || undefined;
}

export function ModelBadge({ model, linked = false }: { model: Pick<CatalogModel, "id" | "name" | "imageUrl" | "photos">; linked?: boolean }) {
  const src = modelThumbUrl(model);
  const content = <span className="model-cell">
    {src ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={src} alt="" aria-hidden className="model-thumb" loading="lazy" />
    ) : <span className="model-thumb model-thumb-empty" aria-hidden><Bike size={15} /></span>}
    <span>{model.name}</span>
  </span>;
  return linked ? <Link className="text-link" href={"/models/" + model.id} prefetch={false}>{content}</Link> : content;
}

export function RecordNumber({ number }: { number: string }) {
  return <bdi className="record-number" dir="ltr">{number}</bdi>;
}

export function CustomerLink({ id, names }: { id: string; names: Map<string, string> }) {
  const name = names.get(id);
  return name ? <Link className="text-link" href={"/customers/" + id} prefetch={false}>{name}</Link> : "—";
}

export function PhoneLink({ phone, whatsappMessage }: { phone: string; whatsappMessage?: string }) {
  return <span className="phone-actions">
    <a className="phone-link" href={phoneHref(phone)}><Phone size={14} aria-hidden /><bdi dir="ltr">{phone}</bdi></a>
    <a className="whatsapp-link no-print" href={whatsappHref(phone, whatsappMessage)} target="_blank" rel="noopener noreferrer"
      aria-label={"שליחת הודעת וואטסאפ ל־" + phone} title="פתיחת שיחה ב־WhatsApp">
      <MessageCircle size={14} aria-hidden />
    </a>
  </span>;
}

export function TaskProgress({ tasks }: { tasks: Standard["tasks"] }) {
  if (!tasks.length) return <span className="muted">—</span>;
  const done = tasks.filter((task) => task.done).length;
  return <span className="task-progress">
    <progress max={tasks.length} value={done} aria-label="משימות שהושלמו" />
    <bdi dir="ltr">{done}/{tasks.length}</bdi>
  </span>;
}

export function standardRow(item: Standard, mode: "list" | "recent" | "delayed", modelsMap?: Map<string, CatalogModel>) {
  const progress = <TaskProgress tasks={item.tasks} />;
  const status = <Status value={item.status} />;
  const delay = <Status value={item.delay} />;
  const date = formatDate(item.updatedAt);
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const cells = mode === "list" ? [modelCell, item.device, status, delay, progress, date]
    : mode === "delayed" ? [modelCell, status, item.delayReason] : [modelCell, status, date];
  return { id: item.id, label: item.number, href: "/standards/" + item.id,
    cells: [<RecordNumber key="number" number={item.number} />, ...cells] };
}

export function repairRow(item: Repair, names: Map<string, string>, recent = false, modelsMap?: Map<string, CatalogModel>) {
  const customer = <CustomerLink id={item.customerId} names={names} />;
  const status = <Status value={item.status} />;
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const cells = recent ? [modelCell, customer, formatDate(item.createdAt), status]
    : [modelCell, <bdi key="serial">{item.serial}</bdi>, customer, status, formatDate(item.updatedAt)];
  return { id: item.id, label: item.number, href: "/repairs/" + item.id,
    cells: [<RecordNumber key="number" number={item.number} />, ...cells] };
}

export function customerRow(item: Customer, count: number) {
  return { id: item.id, label: item.name, href: "/customers/" + item.id,
    cells: [item.name, item.store || "—", <PhoneLink key="phone" phone={item.phone} />, count] };
}

export function modelRow(item: CatalogModel, standardsCount: number, repairsCount: number) {
  return {
    id: item.id,
    label: item.name,
    href: "/models/" + item.id,
    cells: [<ModelBadge key="model" model={item} />, item.device, standardsCount, repairsCount],
  };
}

export function faultGuideRow(item: FaultGuide, repairsCount: number, modelsMap?: Map<string, CatalogModel>) {
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const filesCount = item.attachments.filter((att) => att.kind === "file").length;
  const videosCount = item.attachments.filter((att) => att.kind === "video").length + item.videoLinks.length;
  const videoBadge = videosCount > 0
    ? <span key="vid" className="status status-green"><Video size={13} aria-hidden /> {videosCount === 1 ? "יש סרטון" : `${videosCount} סרטונים`}</span>
    : <span key="vid" className="status status-neutral">ללא סרטון</span>;
  return {
    id: item.id,
    label: item.model,
    href: "/faults/" + item.id,
    cells: [modelCell, item.device, item.commonFaults.length, filesCount, videoBadge, repairsCount, formatDate(item.updatedAt)],
  };
}

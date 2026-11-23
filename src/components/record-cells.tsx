import Link from "next/link";
import { Bike, MessageCircle, Phone, Video } from "lucide-react";
import { formatDate, phoneHref, whatsappHref } from "@/lib/presentation";
import type { CatalogModel, Customer, FaultGuide, Photo, PhotoModule, Repair, Standard } from "@/lib/validation/models";
import {
  formatCustomerWhatsapp, formatFaultGuideWhatsapp, formatModelWhatsapp,
  formatRepairWhatsapp, formatStandardWhatsapp,
} from "@/lib/whatsapp-card";
import type { CardPhoto } from "./card-actions";
import { InlineStandardStatus } from "./records/inline-standard-status";
import { InlineRepairStatus } from "./records/inline-repair-status";
import type { TableRow } from "./record-table";
import { Status } from "./ui/status";

export function modelThumbUrl(model?: Pick<CatalogModel, "id" | "imageUrl" | "photos">) {
  if (!model) return undefined;
  if (model.photos.length > 0) return "/api/images/models/" + model.id + "/" + model.photos[0].id;
  return model.imageUrl || undefined;
}

function recordCardPhotos(module: PhotoModule, id: string, photos: Photo[]): CardPhoto[] {
  return photos.map((photo) => ({
    id: photo.id,
    name: photo.name,
    url: `/api/images/${module}/${id}/${photo.id}`,
  }));
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

export function standardRow(item: Standard, mode: "list" | "recent" | "delayed", modelsMap?: Map<string, CatalogModel>): TableRow {
  const progress = <TaskProgress tasks={item.tasks} />;
  const status = <InlineStandardStatus key={"status-" + mode} record={item} variant="table" />;
  const delay = <Status value={item.delay} />;
  const date = formatDate(item.updatedAt);
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const cells = mode === "list" ? [modelCell, item.device, status, delay, progress, date]
    : mode === "delayed" ? [modelCell, status, item.delayReason] : [modelCell, status, date];
  const accent = item.delay === "מתעכב" ? "amber" : item.status === "הסתיים" ? "green" : item.status === "בטיפול" ? "blue" : "red";

  return {
    id: item.id,
    label: item.number,
    href: "/standards/" + item.id,
    editHref: "/standards/" + item.id + "/edit",
    cells: [<RecordNumber key="number" number={item.number} />, ...cells],
    card: {
      number: item.number,
      title: item.model,
      subtitle: item.device,
      modelImageUrl: modelThumbUrl(catalogModel),
      fallbackIcon: "bike",
      badges: item.delay === "מתעכב" ? [<Status key="delay" value={item.delay} />] : [],
      statusControl: <InlineStandardStatus record={item} variant="mobile" />,
      accent,
      highlightNote: item.delay === "מתעכב" && item.delayReason
        ? { label: "סיבת עיכוב", text: item.delayReason, tone: "amber" }
        : item.notes
          ? { label: "הערות", text: item.notes, tone: "neutral" }
          : undefined,
      meta: [
        ...(item.tasks.length ? [{ label: "משימות", value: <TaskProgress tasks={item.tasks} /> }] : []),
        { label: "עיכוב", value: item.delay },
        { label: "עדכון אחרון", value: date },
      ],
      photos: recordCardPhotos("standards", item.id, item.photos),
      whatsappMessage: formatStandardWhatsapp(item),
    },
  };
}

export function repairRow(
  item: Repair,
  customersSource: Map<string, Customer> | Map<string, string>,
  recent = false,
  modelsMap?: Map<string, CatalogModel>,
): TableRow {
  const entry = customersSource.get(item.customerId);
  const customerObj = entry && typeof entry === "object" ? entry : undefined;
  const customerName = customerObj ? customerObj.name : typeof entry === "string" ? entry : undefined;
  const names = new Map(customerName ? [[item.customerId, customerName]] : []);
  const customer = <CustomerLink id={item.customerId} names={names} />;
  const status = <InlineRepairStatus key={"status-" + (recent ? "recent" : "list")} record={item} variant="table" />;
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const cells = recent ? [modelCell, customer, formatDate(item.createdAt), status]
    : [modelCell, <bdi key="serial">{item.serial}</bdi>, customer, status, formatDate(item.updatedAt)];
  const accent = item.status === "הסתיים" ? "green" : item.status === "בטיפול" ? "blue" : "red";

  return {
    id: item.id,
    label: item.number,
    href: "/repairs/" + item.id,
    editHref: "/repairs/" + item.id + "/edit",
    cells: [<RecordNumber key="number" number={item.number} />, ...cells],
    card: {
      number: item.number,
      title: item.model,
      subtitle: item.device,
      modelImageUrl: modelThumbUrl(catalogModel),
      fallbackIcon: "bike",
      badges: [],
      statusControl: <InlineRepairStatus record={item} variant="mobile" />,
      accent,
      highlightNote: item.fault ? { label: "תיאור תקלה", text: item.fault, tone: "neutral" } : undefined,
      meta: [
        { label: "לקוח", value: customerName ? <Link className="text-link" href={"/customers/" + item.customerId} prefetch={false}>{customerName}</Link> : "—" },
        { label: "מספר סידורי", value: <bdi dir="ltr">{item.serial}</bdi> },
        ...(!recent && customerObj?.customerType === "store" && customerObj.store ? [{ label: "חנות", value: customerObj.store }] : []),
        { label: recent ? "נפתח" : "עדכון אחרון", value: formatDate(recent ? item.createdAt : item.updatedAt) },
      ],
      photos: recordCardPhotos("repairs", item.id, item.photos),
      whatsappMessage: formatRepairWhatsapp(item, customerObj),
      phoneHref: customerObj ? phoneHref(customerObj.phone) : undefined,
    },
  };
}

export function customerRow(item: Customer, count: number): TableRow {
  const initial = Array.from(item.name.trim())[0]?.toLocaleUpperCase() || "ל";
  return {
    id: item.id,
    label: item.name,
    href: "/customers/" + item.id,
    editHref: "/customers/" + item.id + "/edit",
    cells: [item.name, item.customerType === "store" ? item.store || "—" : "—", <PhoneLink key="phone" phone={item.phone} />, count],
    card: {
      title: item.name,
      subtitle: item.customerType === "store" ? item.store || "חנות" : "לקוח פרטי",
      avatarText: initial,
      fallbackIcon: "customer",
      badges: [<span key="count" className="status status-neutral">{count === 1 ? "תיקון אחד" : `${count} תיקונים`}</span>],
      accent: count > 0 ? "blue" : "neutral",
      meta: [
        { label: "טלפון", value: <PhoneLink phone={item.phone} />, wide: true },
        { label: "עדכון אחרון", value: formatDate(item.updatedAt) },
      ],
      whatsappMessage: formatCustomerWhatsapp(item, count),
      phoneHref: phoneHref(item.phone),
    },
  };
}

export function modelRow(item: CatalogModel, standardsCount: number, repairsCount: number): TableRow {
  const photos = recordCardPhotos("models", item.id, item.photos);
  return {
    id: item.id,
    label: item.name,
    href: "/models/" + item.id,
    editHref: "/models/" + item.id + "/edit",
    cells: [<ModelBadge key="model" model={item} />, item.device, standardsCount, repairsCount],
    card: {
      title: item.name,
      subtitle: item.device,
      modelImageUrl: modelThumbUrl(item),
      fallbackIcon: "bike",
      badges: [
        <span key="dev" className="status status-neutral">{item.device}</span>,
        ...(item.msrp ? [<span key="price" className="status status-green">₪{item.msrp.toLocaleString("he-IL")}</span>] : []),
      ],
      accent: "red",
      highlightNote: item.summary ? { label: "תקציר", text: item.summary, tone: "neutral" } : undefined,
      meta: [
        { label: "תיקי תקינה", value: standardsCount },
        { label: "תיקונים", value: repairsCount },
      ],
      photos,
      whatsappMessage: formatModelWhatsapp(item, standardsCount, repairsCount),
      extraLink: { href: "/catalog?model=" + item.id, label: "תצוגת 3D" },
    },
  };
}

export function faultGuideRow(item: FaultGuide, repairsCount: number, modelsMap?: Map<string, CatalogModel>): TableRow {
  const catalogModel = modelsMap?.get(item.model.toLocaleLowerCase("he"));
  const modelCell = catalogModel ? <ModelBadge key="model" model={catalogModel} /> : item.model;
  const filesCount = item.attachments.filter((att) => att.kind === "file").length;
  const videosCount = item.attachments.filter((att) => att.kind === "video").length + item.videoLinks.length;
  const videoBadge = videosCount > 0
    ? <span key="vid" className="status status-green"><Video size={13} aria-hidden /> {videosCount === 1 ? "יש סרטון" : `${videosCount} סרטונים`}</span>
    : <span key="vid" className="status status-neutral">ללא סרטון</span>;
  const firstCodes = item.commonFaults.map((f) => f.code).filter(Boolean).slice(0, 4);

  return {
    id: item.id,
    label: item.model,
    href: "/faults/" + item.id,
    editHref: "/faults/" + item.id + "/edit",
    cells: [modelCell, item.device, item.commonFaults.length, filesCount, videoBadge, repairsCount, formatDate(item.updatedAt)],
    card: {
      title: item.model,
      subtitle: item.device,
      modelImageUrl: modelThumbUrl(catalogModel),
      fallbackIcon: "fault",
      badges: [
        videoBadge,
        ...(firstCodes.length ? [<bdi key="codes" className="fault-code-pill" dir="ltr">{firstCodes.join(" · ")}</bdi>] : []),
      ],
      accent: videosCount > 0 ? "green" : "amber",
      highlightNote: item.unlockInstructions
        ? { label: "פתיחת הגבלה", text: item.unlockInstructions, tone: "neutral" }
        : item.summary
          ? { label: "תקציר טכני", text: item.summary, tone: "neutral" }
          : undefined,
      meta: [
        { label: "תקלות נפוצות", value: item.commonFaults.length },
        { label: "קבצים מצורפים", value: filesCount },
        { label: "תיקוני מעבדה", value: repairsCount },
        { label: "עדכון אחרון", value: formatDate(item.updatedAt) },
      ],
      photos: recordCardPhotos("faults", item.id, item.photos),
      whatsappMessage: formatFaultGuideWhatsapp(item, repairsCount),
    },
  };
}

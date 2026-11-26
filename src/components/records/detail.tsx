import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight, Bike, CircleCheck, ClipboardList, Download, ExternalLink, Eye, FileText,
  Images, Pencil, Plus, ShieldAlert, SlidersHorizontal, Sparkles, Unlock, Wrench,
} from "lucide-react";
import { catalogModels } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { embedVideoUrl, formatBytes, formatDate, labels, whatsappHref } from "@/lib/presentation";
import { canEditModule, DEFAULT_PICKUP_ADDRESS, type CatalogModel, type Customer, type FaultGuide, type Module, type Repair, type Role, type Standard } from "@/lib/validation/models";
import {
  completedRepairCustomerMessage, formatCustomerWhatsapp, formatFaultGuideWhatsapp, formatModelWhatsapp,
  formatRepairWhatsapp, formatStandardWhatsapp,
} from "@/lib/whatsapp-card";
import { CardWhatsappButton } from "@/components/card-actions";
import { ModelBadge, modelThumbUrl, PhoneLink, RecordNumber, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { DeleteButton } from "./delete-button";
import { FaultCommonList, FaultGuideDetailTabs, QuickUnlockModalButton } from "./fault-quick-add";
import { PhotoGallery } from "./photos";
import { PrintButton, QuickStatus } from "./quick-status";
import { TaskChecklist } from "./task-checklist";

type Value = [label: string, value: ReactNode];

function Details({ rows }: { rows: Value[] }) {
  return <dl className="details-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>;
}

export async function RecordDetail({ module, record, admin, userRole, saved }: {
  module: Module; record: Standard | Repair | Customer | CatalogModel | FaultGuide; admin: boolean; userRole?: Role; saved: boolean;
}) {
  const effectiveRole: Role = userRole ?? (admin ? "admin" : "employee");
  const canEdit = canEditModule(effectiveRole, module);
  const isAgent = effectiveRole === "agent";
  const number = "number" in record ? record.number : undefined;
  const title = "model" in record ? record.model : record.name;
  const isModelRecord = module === "models" && !("phone" in record) && !("model" in record);
  const isFaultGuide = module === "faults" && "commonFaults" in record;
  const [customers, repairs, standards, models, faults, quotes, orders, systemSettings] = await Promise.all([
    "serial" in record || isModelRecord || isFaultGuide ? readCollection("customers") : [],
    "phone" in record || isModelRecord || isFaultGuide ? readCollection("repairs") : [],
    isModelRecord ? readCollection("standards") : [],
    catalogModels(),
    isModelRecord ? readCollection("faults") : [],
    "phone" in record && !isAgent ? readCollection("quotes") : [],
    "phone" in record && !isAgent ? readCollection("orders") : [],
    readCollection("settings"),
  ]);
  const modelsMap = new Map(models.map((item) => [item.name.toLocaleLowerCase("he"), item]));
  const modelsById = new Map(models.map((item) => [item.id, item]));
  const customer = "serial" in record ? customers.find((item) => item.id === record.customerId) : undefined;
  const linkedModel = "model" in record
    ? ((record.modelId ? modelsById.get(record.modelId) : undefined) ?? modelsMap.get(record.model.toLocaleLowerCase("he")))
    : undefined;
  const modelFaultGuide = isModelRecord
    ? faults.find((item) => item.modelId === record.id || item.model.toLocaleLowerCase("he") === record.name.toLocaleLowerCase("he"))
    : undefined;
  const history = "phone" in record
    ? repairs.filter((repair) => repair.customerId === record.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const normDigits = (p: string) => {
    const d = p.replace(/\D/g, "");
    return d.startsWith("972") ? "0" + d.slice(3) : d;
  };
  const customerQuotes = "phone" in record && !isAgent
    ? quotes
        .filter((q) => q.customerId === record.id || (normDigits(record.phone) && normDigits(q.customerPhone) === normDigits(record.phone)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const customerOrders = "phone" in record && !isAgent
    ? orders
        .filter((o) => o.customerId === record.id || (normDigits(record.phone) && normDigits(o.customerPhone) === normDigits(record.phone)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const modelStandards = isModelRecord
    ? standards.filter((item) => item.modelId === record.id || item.model.toLocaleLowerCase("he") === record.name.toLocaleLowerCase("he"))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const targetModelLower = isModelRecord ? record.name.toLocaleLowerCase("he") : isFaultGuide ? record.model.toLocaleLowerCase("he") : "";
  const targetModelId = isModelRecord ? record.id : isFaultGuide ? linkedModel?.id : undefined;
  const modelRepairs = targetModelLower
    ? repairs.filter((item) => (targetModelId && item.modelId === targetModelId) || item.model.toLocaleLowerCase("he") === targetModelLower)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const customersMap = new Map("phone" in record ? [[record.id, record]] : customers.map((c) => [c.id, c]));
  const dates: Value[] = [["תאריך פתיחה", formatDate(record.createdAt, true)], ["עודכן לאחרונה", formatDate(record.updatedAt, true)]];
  const detailWhatsappMessage = "tasks" in record
    ? formatStandardWhatsapp(record)
    : "serial" in record
      ? formatRepairWhatsapp(record, customer)
      : "phone" in record
        ? formatCustomerWhatsapp(record, history.length)
        : isFaultGuide
          ? formatFaultGuideWhatsapp(record, modelRepairs.length)
          : formatModelWhatsapp(record as CatalogModel, modelStandards.length, modelRepairs.length);
  const linkedModelThumb = modelThumbUrl(linkedModel);
  const pickupAddress = systemSettings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS;
  const readyMessage = "serial" in record && customer
    ? completedRepairCustomerMessage(customer, record.model, pickupAddress, record.work)
    : undefined;
  const hasRepairCustomerPhone = "serial" in record && Boolean(customer?.phone);
  const headerWhatsappMessage = hasRepairCustomerPhone && readyMessage
    ? readyMessage
    : detailWhatsappMessage;

  return <div className="page-stack">
    <Link className="back-link" href={"/" + module}><ArrowRight size={16} aria-hidden />{labels[module]}</Link>
    <div className="page-title title-with-action">
      <div>
        <h1>{title}</h1>
        <div className="record-subline">
          {number && <RecordNumber number={number} />}
          {"status" in record && <Status value={record.status} />}
          {"delay" in record && <Status value={record.delay} />}
          {(isModelRecord || isFaultGuide) && <span className="status status-neutral">{record.device}</span>}
        </div>
      </div>
      <div className="detail-actions no-print">
        <CardWhatsappButton
          message={headerWhatsappMessage}
          recordHref={"/" + module + "/" + record.id}
          label={number ?? title}
          variant="detail"
          targetPhone={hasRepairCustomerPhone ? customer?.phone : undefined}
          targetDisplay={hasRepairCustomerPhone ? customer?.name : undefined}
        />
        {isModelRecord && <Button asChild variant="soft"><Link href={"/catalog?model=" + record.id}><Sparkles size={16} /> תצוגת 3D בקטלוג</Link></Button>}
        {isFaultGuide && linkedModel && <Button asChild variant="soft"><Link href={"/models/" + linkedModel.id}><Bike size={16} /> כרטיס הדגם</Link></Button>}
        {("tasks" in record || "serial" in record || isFaultGuide) && <PrintButton />}
        {canEdit && <Button asChild variant="outline"><Link href={"/" + module + "/" + record.id + "/edit"}><Pencil size={17} /> עריכה</Link></Button>}
        {admin && <DeleteButton module={module} id={record.id} version={record.updatedAt} subject={number ?? title} />}
      </div>
    </div>
    {saved && <p className="success-message no-print" role="status"><CircleCheck size={18} /> השינויים נשמרו בהצלחה.</p>}
    {"tasks" in record && <>
      <section className="card detail-card">
        <div className="section-heading">
          <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי תיק תקינה</h2>
          {canEdit && <QuickStatus key={record.updatedAt} module="standards" record={record} />}
        </div>
        {linkedModel && linkedModelThumb && <div className="catalog-image-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={linkedModelThumb} alt={linkedModel.name} className="catalog-thumb-lg" />
          <div><strong>{linkedModel.name}</strong><p className="muted">{record.device}</p></div>
        </div>}
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", linkedModel ? <ModelBadge key="model" model={linkedModel} linked /> : record.model], ["סטטוס טיפול", <Status key="status" value={record.status} />],
          ["סטטוס עיכוב", <Status key="delay" value={record.delay} />], ...(record.delay === "מתעכב" ? [["סיבת עיכוב", record.delayReason] as Value] : []), ...dates]} />
        {record.notes && <div className="detail-notes"><h3>הערות</h3><p>{record.notes}</p></div>}
      </section>
      <TaskChecklist key={record.updatedAt} record={record} readOnly={!canEdit} />
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="standards" id={record.id} photos={record.photos} /></section>
    </>}
    {"serial" in record && <>
      <section className="card detail-card">
        <div className="section-heading">
          <h2><span className="section-icon"><Wrench size={18} /></span>פרטי תיקון</h2>
          {canEdit && <QuickStatus key={record.updatedAt} module="repairs" record={record} />}
        </div>
        {linkedModel && linkedModelThumb && <div className="catalog-image-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={linkedModelThumb} alt={linkedModel.name} className="catalog-thumb-lg" />
          <div><strong>{linkedModel.name}</strong><p className="muted">{record.device} · סידורי <bdi dir="ltr">{record.serial}</bdi></p></div>
        </div>}
        <Details rows={[["סוג מכשיר", record.device], ["שם הדגם", linkedModel ? <ModelBadge key="model" model={linkedModel} linked /> : record.model], ["מספר סידורי", <bdi key="serial">{record.serial}</bdi>],
          ["לקוח", customer && <Link key="customer" className="text-link" href={"/customers/" + customer.id}>{customer.name}</Link>],
          ...(customer ? [["סוג לקוח", customer.customerType === "private" ? "לקוח פרטי" : customer.customerType === "store" ? "חנות" : "סוג לקוח לבירור"] as Value] : []),
          ...(customer ? [["טלפון לקוח", <PhoneLink key="cphone" phone={customer.phone}
            whatsappMessage={record.status === "הסתיים" && readyMessage
              ? readyMessage
              : `שלום ${customer.name}, עדכון מקורטז לגבי תיקון ${record.number} (${record.model}) — סטטוס הטיפול: ${record.status}.`} />] as Value] : []),
          ["סטטוס תיקון", <Status key="status" value={record.status} />], ...dates]} />
        <div className="detail-notes"><h3>מה התקלה?</h3><p>{record.fault}</p></div>
        <div className="detail-notes"><h3>מה תוקן?</h3><p>{record.work || "טרם תועד תיקון."}</p></div>
        {record.status === "הסתיים" && customer && readyMessage && <div className="detail-notes no-print">
          <Button asChild><a href={whatsappHref(customer.phone, readyMessage)} target="_blank" rel="noopener noreferrer">הכנת הודעה ללקוח בוואטסאפ</a></Button>
        </div>}
      </section>
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות</h2>
        <PhotoGallery module="repairs" id={record.id} photos={record.photos} /></section>
    </>}
    {"phone" in record && <>
      <section className="card detail-card">
        <h2><span className="section-icon"><ClipboardList size={18} /></span>פרטי לקוח</h2>
        <Details rows={[["שם לקוח", record.name], ["סוג לקוח", record.customerType === "private" ? "לקוח פרטי" : record.customerType === "store" ? "חנות" : "סוג לקוח לבירור"], ...(record.customerType === "store" ? [["שם החנות", record.store] as Value] : []), ["מספר טלפון", <PhoneLink key="phone" phone={record.phone} />], ...dates]} />
      </section>
      <section className="card data-card">
        <div className="section-heading"><h2>היסטוריית תיקונים</h2>
          {!isAgent && <Button asChild size="sm" variant="outline"><Link href={"/repairs/new?customer=" + record.id}><Plus size={16} /> תיקון חדש</Link></Button>}
        </div>
        <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          rows={history.map((item) => repairRow(item, customersMap, true, modelsMap, { readOnly: isAgent, pickupAddress }))} empty="אין תיקונים משויכים" showEmptyHeader />
      </section>
      {!isAgent && customerOrders.length > 0 && (
        <section className="card detail-card">
          <div className="section-heading">
            <h2><span className="section-icon"><ClipboardList size={18} /></span>הזמנות ללקוח זה ({customerOrders.length})</h2>
            <Button asChild size="sm" variant="outline"><Link href="/orders">לכל ההזמנות</Link></Button>
          </div>
          <ul className="settings-list">
            {customerOrders.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>
                    <bdi dir="ltr">{o.number}</bdi> · {o.items.map((it) => `${it.modelName} (×${it.quantity})`).join(", ")}
                  </strong>
                  <span>סוכן: {o.createdByName} · {formatDate(o.createdAt, true)}</span>
                </div>
                <Status value={o.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!isAgent && customerQuotes.length > 0 && (
        <section className="card detail-card">
          <div className="section-heading">
            <h2><span className="section-icon"><FileText size={18} /></span>הצעות מחיר ללקוח זה ({customerQuotes.length})</h2>
            <Button asChild size="sm" variant="outline"><Link href="/quotes">לכל הצעות המחיר</Link></Button>
          </div>
          <ul className="settings-list">
            {customerQuotes.map((q) => (
              <li key={q.id}>
                <div>
                  <strong>{q.modelName} · {q.quantity} {q.quantity === 1 ? "יחידה" : "יחידות"}</strong>
                  <span>{formatDate(q.createdAt, true)} · {q.status === "accepted" ? "אושרה" : q.status === "cancelled" ? "בוטלה" : "נשלחה"}</span>
                </div>
                {q.status !== "cancelled" && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/proposal/${q.shareToken}`} target="_blank" rel="noopener noreferrer">
                      צפייה בהצעה <ExternalLink size={14} />
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
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
          ...(record.msrp ? [["מחיר מחירון", "₪" + record.msrp.toLocaleString("he-IL")] as Value] : []),
          ["תיקי מכון תקנים", modelStandards.length],
          ["תיקונים משויכים", modelRepairs.length],
          ...dates,
        ]} />
        {record.summary && <div className="detail-notes"><h3>תקציר קטלוג</h3><p>{record.summary}</p></div>}
        {record.notes && <div className="detail-notes"><h3>הערות</h3><p>{record.notes}</p></div>}
      </section>
      {record.specs && record.specs.length > 0 && <section className="card detail-card">
        <h2><span className="section-icon"><SlidersHorizontal size={18} /></span>מפרט טכני</h2>
        <dl className="spec-detail-grid">
          {record.specs.map((spec) => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}
        </dl>
      </section>}
      <section className="card detail-card"><h2><span className="section-icon"><Images size={18} /></span>תמונות הדגם</h2>
        <PhotoGallery module="models" id={record.id} photos={record.photos} /></section>
      <section className="card data-card">
        <div className="section-heading"><h2>תיקי מכון תקנים של דגם זה</h2>
          {!isAgent && <Button asChild size="sm" variant="outline"><Link href={"/standards/new?model=" + record.id}><Plus size={16} /> תיק מכון תקנים</Link></Button>}
        </div>
        <RecordTable icon={ClipboardList} columns={["מספר תיק", "דגם", "סטטוס", "עודכן לאחרונה"]}
          rows={modelStandards.map((item) => standardRow(item, "recent", modelsMap, isAgent))} empty="אין תיקי תקינה משויכים לדגם זה" showEmptyHeader />
      </section>
      <section className="card data-card">
        <div className="section-heading"><h2>תיקונים של דגם זה</h2>
          {!isAgent && <Button asChild size="sm" variant="outline"><Link href={"/repairs/new?model=" + record.id}><Plus size={16} /> תיקון חדש</Link></Button>}
        </div>
        <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
          rows={modelRepairs.map((item) => repairRow(item, customersMap, true, modelsMap, { readOnly: isAgent, pickupAddress }))} empty="אין תיקונים משויכים לדגם זה" showEmptyHeader />
      </section>
      <section className="card detail-card">
        <div className="section-heading">
          <h2><span className="section-icon"><ShieldAlert size={18} /></span>תקלות ופתיחת הגבלה של דגם זה</h2>
          {modelFaultGuide ? (
            <Button asChild size="sm"><Link href={"/faults/" + modelFaultGuide.id}>פתיחת המדריך המלא</Link></Button>
          ) : (
            <Button asChild size="sm" variant="outline"><Link href={"/faults/new?model=" + record.id}><Plus size={16} /> יצירת מדריך לדגם</Link></Button>
          )}
        </div>
        {modelFaultGuide ? (
          <Details rows={[
            ["תקלות נפוצות מתועדות", modelFaultGuide.commonFaults.length],
            ["קבצים טכניים מצורפים", modelFaultGuide.attachments.filter((item) => item.kind === "file").length],
            ["סרטוני פתיחת הגבלה", modelFaultGuide.attachments.filter((item) => item.kind === "video").length + modelFaultGuide.videoLinks.length],
            ["עודכן לאחרונה", formatDate(modelFaultGuide.updatedAt, true)],
          ]} />
        ) : (
          <p className="muted">טרם הוזן מדריך תקלות ופתיחת הגבלה עבור דגם זה.</p>
        )}
      </section>
    </>}
    {isFaultGuide && (() => {
      const uploadedVideos = record.attachments.filter((item) => item.kind === "video");
      const uploadedFiles = record.attachments.filter((item) => item.kind === "file");
      const hasUnlock = Boolean(
        record.unlockInstructions.trim().length > 0
          || uploadedVideos.length > 0
          || record.videoLinks.length > 0,
      );

      const unlockSection = (
        <section className="card detail-card">
          <div className="section-heading">
            <h2><span className="section-icon"><Unlock size={18} /></span>פתיחת הגבלה — הוראות וסרטונים</h2>
            {canEdit && <QuickUnlockModalButton key={record.updatedAt} record={record} />}
          </div>
          {record.unlockInstructions ? (
            <div className="detail-notes unlock-instructions-box"><h3>הוראות ביצוע</h3><p>{record.unlockInstructions}</p></div>
          ) : (
            <p className="muted">טרם הוזנו הוראות כתובות לפתיחת הגבלה.</p>
          )}
          {(uploadedVideos.length > 0 || record.videoLinks.length > 0) && <div className="unlock-videos-grid">
            {uploadedVideos.map((video) => {
              const streamUrl = "/api/files/faults/" + record.id + "/" + video.id;
              return <article className="unlock-video-card" key={video.id}>
                <div className="unlock-video-head">
                  <strong>{video.name}</strong>
                  <small>{formatBytes(video.bytes)}</small>
                </div>
                <video controls playsInline preload="metadata" src={streamUrl} className="unlock-video-player" />
                <div className="unlock-video-actions no-print">
                  <Button asChild size="sm" variant="outline"><a href={streamUrl + "?download=1"}><Download size={15} /> הורדת סרטון</a></Button>
                </div>
              </article>;
            })}
            {record.videoLinks.map((link) => {
              const embed = embedVideoUrl(link.url);
              return <article className="unlock-video-card" key={link.id}>
                <div className="unlock-video-head">
                  <strong>{link.title}</strong>
                </div>
                {embed ? (
                  <div className="unlock-video-embed">
                    <iframe src={embed} title={link.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                ) : null}
                <div className="unlock-video-actions no-print">
                  <Button asChild size="sm" variant="outline">
                    <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> פתיחת סרטון בקישור חיצוני</a>
                  </Button>
                </div>
              </article>;
            })}
          </div>}
        </section>
      );

      const faultsSection = <FaultCommonList key={record.updatedAt} record={record} />;

      const filesAndPhotosSection = (
        <>
          <section className="card detail-card">
            <h2><span className="section-icon"><FileText size={18} /></span>קבצים ומסמכים טכניים ({uploadedFiles.length})</h2>
            {uploadedFiles.length === 0 ? (
              <p className="muted">אין קבצים מצורפים לדגם זה. ניתן להעלות PDF, Word, Excel או סכמות דרך ״עריכה״.</p>
            ) : (
              <div className="attachment-list">
                {uploadedFiles.map((file) => {
                  const fileUrl = "/api/files/faults/" + record.id + "/" + file.id;
                  const viewable = file.type === "application/pdf" || file.type.startsWith("image/") || file.type === "text/plain";
                  return <div className="attachment-row" key={file.id}>
                    <div className="attachment-meta">
                      <FileText size={18} aria-hidden />
                      <div><strong>{file.name}</strong><small>{formatBytes(file.bytes)}</small></div>
                    </div>
                    <div className="attachment-actions no-print">
                      {viewable && <Button asChild size="sm" variant="outline">
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer"><Eye size={15} /> צפייה</a>
                      </Button>}
                      <Button asChild size="sm" variant="outline">
                        <a href={fileUrl + "?download=1"}><Download size={15} /> הורדה</a>
                      </Button>
                    </div>
                  </div>;
                })}
              </div>
            )}
          </section>

          <section className="card detail-card">
            <h2><span className="section-icon"><Images size={18} /></span>תמונות אבחון וחיווט</h2>
            <PhotoGallery module="faults" id={record.id} photos={record.photos} />
            {record.notes && <div className="detail-notes"><h3>הערות פנימיות לצוות</h3><p>{record.notes}</p></div>}
          </section>

          <section className="card data-card">
            <div className="section-heading">
              <h2>תקלות שדווחו בפועל בתיקונים של {record.model} ({modelRepairs.length})</h2>
              <Button asChild size="sm" variant="outline">
                <Link href={linkedModel ? "/repairs/new?model=" + linkedModel.id : "/repairs/new"}><Plus size={16} /> פתיחת תיקון לדגם</Link>
              </Button>
            </div>
            <RecordTable icon={Wrench} columns={["מספר תיקון", "דגם", "לקוח", "תאריך פתיחה", "סטטוס"]}
              rows={modelRepairs.map((item) => repairRow(item, customersMap, true, modelsMap))}
              empty="אין תיקונים רשומים לדגם זה במעבדה" showEmptyHeader />
          </section>
        </>
      );

      return <>
        <section className="card detail-card">
          <h2><span className="section-icon"><ShieldAlert size={18} /></span>סקירת הדגם</h2>
          {linkedModel && linkedModelThumb && <div className="catalog-image-banner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={linkedModelThumb} alt={linkedModel.name} className="catalog-thumb-lg" />
            <div><strong>{linkedModel.name}</strong><p className="muted">{record.device}</p></div>
          </div>}
          <Details rows={[
            ["שם הדגם", linkedModel ? <ModelBadge key="model" model={linkedModel} linked /> : record.model],
            ["סוג מכשיר", record.device],
            ["תקלות נפוצות מתועדות", record.commonFaults.length],
            ["קבצים מצורפים", uploadedFiles.length],
            ["סרטוני פתיחת הגבלה", uploadedVideos.length + record.videoLinks.length],
            ["תיקוני מעבדה לדגם", modelRepairs.length],
            ...dates,
          ]} />
          {record.summary && <div className="detail-notes"><h3>תקציר טכני</h3><p>{record.summary}</p></div>}
        </section>

        <FaultGuideDetailTabs
          hasUnlock={hasUnlock}
          commonFaultsCount={record.commonFaults.length}
          filesCount={uploadedFiles.length + record.photos.length}
          unlockSection={unlockSection}
          faultsSection={faultsSection}
          filesAndPhotosSection={filesAndPhotosSection}
        />
      </>;
    })()}
  </div>;
}

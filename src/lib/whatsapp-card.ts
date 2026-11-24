import { formatDate, whatsappHref } from "./presentation";
import { DEFAULT_PICKUP_ADDRESS, type CatalogModel, type Customer, type FaultGuide, type Repair, type Standard } from "./validation/models";

export const CORTEZ_WHATSAPP_NUMBER = "972525510004";
export const CORTEZ_WHATSAPP_DISPLAY = "+972 52-551-0004";

const maxWhatsappChars = 2800;

export function repairReadyMessage(
  customer: Pick<Customer, "name" | "store" | "customerType">,
  model: string,
  pickupAddress = DEFAULT_PICKUP_ADDRESS,
  work?: string,
): string | undefined {
  const cleanWork = work?.trim();
  const workLine = cleanWork ? `\nפירוט התיקון שבוצע: ${trimText(cleanWork, 500)}.` : "";
  if (customer.customerType === "private") {
    return `היי ${customer.name}, כאן צוות קורטז. שמחים לעדכן שהתיקון של ה־${model} הסתיים והכלי שלך מוכן לאיסוף!${workLine}\nמוזמן להגיע לאסוף אותו בכתובת ${pickupAddress}. מחכים לך, צוות קורטז.`;
  }
  if (customer.customerType === "store") {
    const storeLabel = customer.store ? ` (${customer.store})` : "";
    return `היי ${customer.name}${storeLabel}, כאן צוות קורטז. שמחים לעדכן שהתיקון של ה־${model} הסתיים והכלי מוכן לאיסוף!${workLine}\nמוזמנים להגיע לאסוף אותו בכתובת ${pickupAddress}. תודה, צוות קורטז.`;
  }
  return undefined;
}

export function completedRepairCustomerMessage(
  customer: Pick<Customer, "name" | "store" | "customerType">,
  model: string,
  pickupAddress = DEFAULT_PICKUP_ADDRESS,
  work?: string,
): string {
  const explicit = repairReadyMessage(customer, model, pickupAddress, work);
  if (explicit) return explicit;
  const cleanWork = work?.trim();
  const workLine = cleanWork ? `\nפירוט התיקון שבוצע: ${trimText(cleanWork, 500)}.` : "";
  if (customer.store && customer.store.trim() && customer.store.trim() !== "פרטי") {
    return `היי ${customer.name} (${customer.store}), כאן צוות קורטז. שמחים לעדכן שהתיקון של ה־${model} הסתיים והכלי מוכן לאיסוף!${workLine}\nמוזמנים להגיע לאסוף אותו בכתובת ${pickupAddress}. תודה, צוות קורטז.`;
  }
  return `היי ${customer.name}, כאן צוות קורטז. שמחים לעדכן שהתיקון של ה־${model} הסתיים והכלי שלך מוכן לאיסוף!${workLine}\nמוזמן להגיע לאסוף אותו בכתובת ${pickupAddress}. מחכים לך, צוות קורטז.`;
}

function trimText(value: string, max: number): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

export function buildCortezWhatsappUrl(message: string, absoluteRecordUrl?: string): string {
  const full = absoluteRecordUrl ? `${message}\n\n🔗 קישור לכרטיס:\n${absoluteRecordUrl}` : message;
  const bounded = full.length > maxWhatsappChars ? full.slice(0, maxWhatsappChars - 1) + "…" : full;
  return `https://wa.me/${CORTEZ_WHATSAPP_NUMBER}?text=${encodeURIComponent(bounded)}`;
}

export function buildTargetWhatsappUrl(message: string, targetPhone?: string, absoluteRecordUrl?: string): string {
  if (targetPhone && targetPhone.replace(/\D/g, "").length >= 7) {
    const bounded = message.length > maxWhatsappChars ? message.slice(0, maxWhatsappChars - 1) + "…" : message;
    return whatsappHref(targetPhone, bounded);
  }
  return buildCortezWhatsappUrl(message, absoluteRecordUrl);
}

export function formatStandardWhatsapp(item: Standard): string {
  const lines: string[] = [
    `*קורטז | תיק מכון תקנים ${item.number}*`,
    `• דגם: ${item.model}`,
    `• סוג מכשיר: ${item.device}`,
    `• סטטוס טיפול: ${item.status}`,
    `• סטטוס עיכוב: ${item.delay}`,
  ];
  if (item.delay === "מתעכב" && item.delayReason) {
    lines.push(`• סיבת עיכוב: ${trimText(item.delayReason, 350)}`);
  }
  if (item.tasks.length > 0) {
    const done = item.tasks.filter((task) => task.done).length;
    lines.push(`• משימות: ${done}/${item.tasks.length} הושלמו`);
    const openTasks = item.tasks.filter((task) => !task.done);
    const doneTasks = item.tasks.filter((task) => task.done);
    for (const task of openTasks.slice(0, 8)) {
      lines.push(`  ⬜ ${trimText(task.title, 120)}`);
    }
    if (openTasks.length > 8) lines.push(`  …ועוד ${openTasks.length - 8} משימות פתוחות`);
    for (const task of doneTasks.slice(0, 4)) {
      lines.push(`  ✅ ${trimText(task.title, 120)}`);
    }
    if (doneTasks.length > 4) lines.push(`  …ועוד ${doneTasks.length - 4} משימות שהושלמו`);
  }
  if (item.notes) {
    lines.push(`• הערות: ${trimText(item.notes, 450)}`);
  }
  if (item.photos.length > 0) {
    lines.push(`• תמונות מצורפות: ${item.photos.length}`);
  }
  lines.push(`• עדכון אחרון: ${formatDate(item.updatedAt, true)}`);
  return lines.join("\n");
}

export function formatRepairWhatsapp(item: Repair, customer?: Customer): string {
  const lines: string[] = [
    `*קורטז | תיקון מעבדה ${item.number}*`,
    `• דגם: ${item.model}`,
    `• סוג מכשיר: ${item.device}`,
    `• מספר סידורי: ${item.serial}`,
    `• סטטוס תיקון: ${item.status}`,
  ];
  if (customer) {
    const customerParts = [customer.name, customer.store, customer.phone].filter(Boolean);
    lines.push(`• לקוח: ${customerParts.join(" · ")}`);
  }
  if (item.fault) {
    lines.push(`• תיאור תקלה: ${trimText(item.fault, 500)}`);
  }
  if (item.work) {
    lines.push(`• מה תוקן: ${trimText(item.work, 500)}`);
  }
  if (item.photos.length > 0) {
    lines.push(`• תמונות מצורפות: ${item.photos.length}`);
  }
  lines.push(`• פתיחה: ${formatDate(item.createdAt, true)} | עדכון: ${formatDate(item.updatedAt, true)}`);
  return lines.join("\n");
}

export function formatCustomerWhatsapp(item: Customer, repairsCount: number): string {
  const lines: string[] = [
    `*קורטז | כרטיס לקוח: ${item.name}*`,
    ...(item.store ? [`• חנות / עסק: ${item.store}`] : []),
    `• טלפון: ${item.phone}`,
    `• תיקונים רשומים: ${repairsCount}`,
    `• עדכון אחרון: ${formatDate(item.updatedAt, true)}`,
  ];
  return lines.join("\n");
}

export function formatModelWhatsapp(item: CatalogModel, standardsCount: number, repairsCount: number): string {
  const lines: string[] = [
    `*קורטז | כרטיס דגם: ${item.name}*`,
    `• סוג מכשיר: ${item.device}`,
  ];
  if (item.msrp) {
    lines.push(`• מחיר מחירון מומלץ: ₪${item.msrp.toLocaleString("he-IL")}`);
  }
  lines.push(`• תיקי תקינה: ${standardsCount} | תיקונים: ${repairsCount}`);
  if (item.summary) {
    lines.push(`• תקציר: ${trimText(item.summary, 350)}`);
  }
  if (item.notes) {
    lines.push(`• הערות: ${trimText(item.notes, 350)}`);
  }
  if (item.photos.length > 0) {
    lines.push(`• תמונות מועלות: ${item.photos.length}`);
  }
  return lines.join("\n");
}

export function formatFaultGuideWhatsapp(item: FaultGuide, repairsCount: number): string {
  const filesCount = item.attachments.filter((att) => att.kind === "file").length;
  const videosCount = item.attachments.filter((att) => att.kind === "video").length + item.videoLinks.length;
  const lines: string[] = [
    `*קורטז | תקלות ופתיחת הגבלה: ${item.model}*`,
    `• סוג מכשיר: ${item.device}`,
    `• תקלות נפוצות: ${item.commonFaults.length} | קבצים: ${filesCount} | סרטוני הגבלה: ${videosCount} | תיקוני מעבדה: ${repairsCount}`,
  ];
  if (item.summary) {
    lines.push(`• תקציר טכני: ${trimText(item.summary, 280)}`);
  }
  if (item.unlockInstructions) {
    lines.push(`• פתיחת הגבלה: ${trimText(item.unlockInstructions, 450)}`);
  }
  if (item.commonFaults.length > 0) {
    lines.push("• תקלות נפוצות:");
    for (const fault of item.commonFaults.slice(0, 6)) {
      const prefix = fault.code ? `[${fault.code}] ` : "";
      const fix = fault.solution ? ` — פתרון: ${trimText(fault.solution, 140)}` : "";
      lines.push(`  - ${prefix}${trimText(fault.title, 100)}${fix}`);
    }
    if (item.commonFaults.length > 6) {
      lines.push(`  …ועוד ${item.commonFaults.length - 6} תקלות`);
    }
  }
  if (item.photos.length > 0) {
    lines.push(`• תמונות אבחון: ${item.photos.length}`);
  }
  return lines.join("\n");
}

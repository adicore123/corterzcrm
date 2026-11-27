import { toWhatsappDigits } from "../phone";
import { formatDate } from "../presentation";
import {
  DEFAULT_MORAN_WHATSAPP_DISPLAY,
  DEFAULT_MORAN_WHATSAPP_NUMBER,
  type Order,
} from "./schema";

const formatShekels = (agorot: number) => {
  const isWhole = agorot % 100 === 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(agorot / 100);
};

export function normalizeOrderWhatsappPhone(rawPhone?: string): string {
  return toWhatsappDigits(rawPhone, DEFAULT_MORAN_WHATSAPP_NUMBER);
}

export function formatMoranOrderWhatsappText(
  order: Order,
  pickupAddress?: string,
): string {
  const customerLabel =
    order.customerType === "store" && order.storeName
      ? `${order.customerName} (חנות: ${order.storeName})`
      : order.customerName;

  const fulfillmentLine =
    order.fulfillmentType === "delivery"
      ? `משלוח — ${order.deliveryAddress || "לתיאום כתובת"}`
      : `איסוף עצמי${pickupAddress ? ` (${pickupAddress})` : ""}`;

  const lines: string[] = [
    `📦 *הזמנה חדשה — CORTEZ* | *#${order.number}*`,
    `👤 *סוכן מזמין:* ${order.createdByName}`,
    ``,
    `🏪 *פרטי הלקוח:*`,
    `• *לקוח:* ${customerLabel}`,
    `• *טלפון:* ${order.customerPhone}`,
    `• *אספקה:* ${fulfillmentLine}`,
  ];

  if (order.priority === "urgent") {
    lines.push(`• *דחיפות:* ⚡ דחופה`);
  }

  lines.push(``, `🚲 *פירוט הכלים בהזמנה:*`);

  let totalUnits = 0;
  order.items.forEach((item, idx) => {
    totalUnits += item.quantity;
    const prefix = order.items.length > 1 ? `${idx + 1}. ` : "• ";
    const unitWord = item.quantity === 1 ? "יחידה" : "יחידות";
    lines.push(`${prefix}*${item.modelName}* (${item.device})`);

    const metaParts: string[] = [];
    if (item.color?.trim()) metaParts.push(`צבע: ${item.color.trim()}`);
    metaParts.push(`כמות: *${item.quantity} ${unitWord}*`);
    lines.push(`   ${metaParts.join(" | ")}`);

    if (item.agreedUnitPriceAgorot !== undefined) {
      const agreedText = formatShekels(item.agreedUnitPriceAgorot);
      const msrpNote =
        item.catalogMsrpAgorot !== undefined && item.catalogMsrpAgorot > 0
          ? ` _(מחירון: ${formatShekels(item.catalogMsrpAgorot)})_`
          : "";
      lines.push(`   💰 *מחיר שנקבע עם הלקוח:* ${agreedText}${item.quantity > 1 ? " ליחידה" : ""}${msrpNote}`);
    }
  });

  if (order.items.length > 1) {
    lines.push(`*סה״כ כלים בהזמנה: ${totalUnits} יחידות*`);
  }

  if (order.notes?.trim()) {
    lines.push(``, `📝 *הערות למורן:*`, order.notes.trim());
  }

  lines.push(``, `🕒 הופק במערכת קורטז · ${formatDate(order.createdAt, true)}`);
  return lines.join("\n");
}

export function buildMoranOrderWhatsappUrl(
  order: Order,
  targetPhone = DEFAULT_MORAN_WHATSAPP_DISPLAY,
  pickupAddress?: string,
): string {
  const intlPhone = normalizeOrderWhatsappPhone(targetPhone);
  const text = formatMoranOrderWhatsappText(order, pickupAddress);
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
}

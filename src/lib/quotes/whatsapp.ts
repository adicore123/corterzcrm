import { quoteTotal } from "./pricing";
import type { Quote } from "./schema";

export interface QuoteWhatsappModelInfo {
  id: string;
  name: string;
  device?: string;
  summary?: string;
  imageUrl?: string;
  exhibitUrl?: string;
  specs?: Array<{ label: string; value: string }>;
}

const formatShekels = (agorot: number) => {
  const isWhole = agorot % 100 === 0;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(agorot / 100);
};

export function normalizeWhatsappPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return "972" + digits;
}

/**
 * Builds the complete, detailed WhatsApp message for a price quote,
 * including customer details, product specs, full price breakdown, product image link,
 * and the interactive 3D proposal approval link.
 */
export function buildFullQuoteWhatsappMessage(
  quote: Quote,
  model: QuoteWhatsappModelInfo | undefined,
  origin: string,
): string {
  const price = quoteTotal(quote);
  const customerDisplay =
    quote.customerType === "store" && quote.storeName
      ? `${quote.customerName} (${quote.storeName})`
      : quote.customerName;

  const proposalUrl = `${origin}/proposal/${quote.shareToken}`;
  const productImagePath = model?.exhibitUrl || model?.imageUrl;
  const fullImageUrl = productImagePath
    ? productImagePath.startsWith("http")
      ? productImagePath
      : `${origin}${productImagePath}`
    : `${origin}/api/quotes/${quote.shareToken}/og-image`;

  const lines: string[] = [
    `*הצעת מחיר אישית — CORTEZ* 🌊⚡`,
    `שלום *${customerDisplay}*,`,
    `הכנו עבורך הצעת מחיר מפורטת מבית קורטז:`,
    ``,
    `🚲 *פרטי הכלי:*`,
    `• *דגם:* ${quote.modelName}`,
  ];

  if (model?.device) {
    lines.push(`• *קטגוריה:* ${model.device}`);
  }

  // Include top verified specs (Battery, Range, Speed, Brakes, Tires, Suspension)
  const cleanSpecs = (model?.specs ?? []).filter(
    (s) => s.value.trim() && !(s.label.includes("מנוע") && s.value.trim() === "מנוע עוצמתי"),
  );
  if (cleanSpecs.length > 0) {
    lines.push(``, `⚙️ *מפרט עיקרי של הכלי:*`);
    for (const spec of cleanSpecs.slice(0, 6)) {
      lines.push(`• ${spec.label}: ${spec.value}`);
    }
  } else if (model?.summary) {
    lines.push(`• ${model.summary}`);
  }

  lines.push(
    ``,
    `💳 *פירוט ההצעה והמחיר:*`,
    `• *כמות:* ${quote.quantity} ${quote.quantity === 1 ? "יחידה" : "יחידות"}`,
  );

  if (quote.totalPriceAgorot === undefined || quote.quantity > 1) {
    lines.push(`• *מחיר ליחידה:* ${formatShekels(quote.unitPriceAgorot)}`);
  }
  if (price.discountAgorot > 0) {
    lines.push(`• *סכום לפני הנחה:* ${formatShekels(price.subtotalAgorot)}`);
    lines.push(`• *הנחה מיוחדת:* −${formatShekels(price.discountAgorot)}`);
  }
  lines.push(
    `• *מע״מ:* ${quote.vatMode === "included" ? "כלול במחיר" : formatShekels(price.vatAgorot)}`,
    `• *סה״כ לתשלום: ${formatShekels(price.payableAgorot)}*`,
    ``,
    `🖼️ *תמונת המוצר:*`,
    fullImageUrl,
    ``,
    `✨ *לצפייה בכלי בתלת־ממד ולאישור ההצעה בלחיצה:*`,
    proposalUrl,
  );

  return lines.join("\n");
}

export function buildQuoteWhatsappUrl(
  quote: Quote,
  model: QuoteWhatsappModelInfo | undefined,
  origin: string,
): string {
  const phone = normalizeWhatsappPhone(quote.customerPhone);
  const text = buildFullQuoteWhatsappMessage(quote, model, origin);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

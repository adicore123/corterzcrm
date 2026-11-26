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
 * Builds the complete, detailed WhatsApp caption for a price quote WITHOUT any URLs/links.
 * Designed to be attached directly as the caption under the product image file.
 */
export function buildFullQuoteWhatsappMessage(
  quote: Quote,
  model: QuoteWhatsappModelInfo | undefined,
): string {
  const price = quoteTotal(quote);
  const customerDisplay =
    quote.customerType === "store" && quote.storeName
      ? `${quote.customerName} (${quote.storeName})`
      : quote.customerName;

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
  );

  return lines.join("\n");
}

export function buildQuoteWhatsappUrl(
  quote: Quote,
  model: QuoteWhatsappModelInfo | undefined,
): string {
  const phone = normalizeWhatsappPhone(quote.customerPhone);
  const text = buildFullQuoteWhatsappMessage(quote, model);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Option 2 Share Flow:
 * 1. Fetches the actual PNG product image for the quote (/api/quotes/[token]/og-image).
 * 2. On mobile devices (Web Share API Level 2), shares the actual PNG image file + full link-free
 *    proposal text as caption directly to WhatsApp (and copies the customer's phone number to clipboard
 *    for instant search in WhatsApp).
 * 3. On desktop browsers where file sharing is unavailable, copies the PNG product image to the
 *    system clipboard (for Ctrl+V paste) and opens the direct WhatsApp chat to quote.customerPhone
 *    with the full link-free proposal text.
 */
export async function shareQuoteImageAndTextOnWhatsapp(
  quote: Quote,
  model: QuoteWhatsappModelInfo | undefined,
): Promise<{ mode: "web-share" | "clipboard-wa" | "wa-only"; phone: string }> {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const fullText = buildFullQuoteWhatsappMessage(quote, model);
  const ogImgUrl = `${origin}/api/quotes/${quote.shareToken}/og-image`;

  let imageBlob: Blob | null = null;
  try {
    const res = await fetch(ogImgUrl);
    if (res.ok) {
      imageBlob = await res.blob();
    }
  } catch {
    imageBlob = null;
  }

  // Mobile Web Share API with real PNG file + link-free caption
  if (imageBlob && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    const safeName = quote.modelName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "model";
    const file = new File([imageBlob], `cortez-${safeName}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.clipboard?.writeText(quote.customerPhone);
      } catch {
        // Ignore clipboard permission errors before share
      }
      await navigator.share({
        files: [file],
        text: fullText,
      });
      return { mode: "web-share", phone: quote.customerPhone };
    }
  }

  // Desktop fallback: copy PNG image to clipboard for Ctrl+V and open direct WhatsApp chat to customerPhone
  let copiedImage = false;
  if (
    imageBlob
    && typeof navigator !== "undefined"
    && navigator.clipboard
    && "write" in navigator.clipboard
    && typeof ClipboardItem !== "undefined"
  ) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imageBlob })]);
      copiedImage = true;
    } catch {
      copiedImage = false;
    }
  }

  window.open(buildQuoteWhatsappUrl(quote, model), "_blank", "noopener,noreferrer");
  return { mode: copiedImage ? "clipboard-wa" : "wa-only", phone: quote.customerPhone };
}

import {
  isMobileClient,
  launchWhatsappUrl,
  openPendingDesktopTab,
  toWhatsappDigits,
} from "../phone";
import { quoteTotal } from "./pricing";
import type { PublicQuote, Quote } from "./schema";

type ShareableQuote = Quote | PublicQuote;

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
  return toWhatsappDigits(rawPhone);
}

/**
 * Builds the complete, detailed WhatsApp caption for a price quote WITHOUT any URLs/links.
 */
export function buildFullQuoteWhatsappMessage(
  quote: ShareableQuote,
  model: QuoteWhatsappModelInfo | undefined,
): string {
  const price = quoteTotal(quote);
  const customerDisplay =
    quote.customerType === "store" && quote.storeName
      ? `${quote.customerName} (${quote.storeName})`
      : quote.customerName;

  const lines: string[] = [
    `*הצעת מחיר אישית — CORTEZ*`,
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
    lines.push(``, `*מפרט עיקרי של הכלי:*`);
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
  quote: ShareableQuote,
  model: QuoteWhatsappModelInfo | undefined,
): string {
  const phone = normalizeWhatsappPhone(quote.customerPhone);
  const text = buildFullQuoteWhatsappMessage(quote, model);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Bulletproof Quote Share Flow:
 * 1. On Desktop: opens a pending tab synchronously during the click (preventing popup blockers),
 *    fetches the authentic catalog PNG image to copy to clipboard for Ctrl+V, and navigates directly
 *    to `https://wa.me/<customerPhone>?text=...` (avoiding broken Windows OS share popups).
 * 2. On Mobile: attempts native Web Share API with the PNG file + full link-free text (without
 *    consuming user activation beforehand); if the user gesture expired or Web Share fails for
 *    any reason other than user dismissal (`AbortError`), falls back immediately to `wa.me`!
 */
export async function shareQuoteImageAndTextOnWhatsapp(
  quote: ShareableQuote,
  model: QuoteWhatsappModelInfo | undefined,
): Promise<{ mode: "web-share" | "clipboard-wa" | "wa-only" | "cancelled"; phone: string }> {
  const mobile = isMobileClient();
  const pendingTab = mobile ? null : openPendingDesktopTab();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const fullText = buildFullQuoteWhatsappMessage(quote, model);
  const ogImgUrl = `${origin}/api/quotes/${quote.shareToken}/og-image`;
  const waUrl = buildQuoteWhatsappUrl(quote, model);

  let imageBlob: Blob | null = null;
  try {
    const res = await fetch(ogImgUrl);
    if (res.ok) {
      imageBlob = await res.blob();
    }
  } catch {
    imageBlob = null;
  }

  if (
    mobile
    && imageBlob
    && typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
  ) {
    const safeName = quote.modelName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "model";
    const file = new File([imageBlob], `cortez-${safeName}.png`, { type: "image/png" });
    let canShareFiles = false;
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch {
      canShareFiles = false;
    }

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          text: fullText,
        });
        try {
          await navigator.clipboard?.writeText(quote.customerPhone);
        } catch {
          // Optional post-share convenience copy
        }
        return { mode: "web-share", phone: quote.customerPhone };
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          return { mode: "cancelled", phone: quote.customerPhone };
        }
        // Gesture expired or WebView rejected share -> fall through to direct wa.me launch!
      }
    }
  }

  let copiedImage = false;
  if (
    !mobile
    && imageBlob
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

  launchWhatsappUrl(waUrl, pendingTab);
  return { mode: copiedImage ? "clipboard-wa" : "wa-only", phone: quote.customerPhone };
}

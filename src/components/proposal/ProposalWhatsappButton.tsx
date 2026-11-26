"use client";

import { Image as ImageIcon, MessageCircle } from "lucide-react";
import type { Quote } from "@/lib/quotes/schema";
import {
  buildFullQuoteWhatsappMessage,
  buildQuoteWhatsappUrl,
  type QuoteWhatsappModelInfo,
} from "@/lib/quotes/whatsapp";

export function ProposalWhatsappButton({
  quote,
  model,
}: {
  quote: Quote;
  model?: QuoteWhatsappModelInfo;
}) {
  const getOrigin = () => (typeof window === "undefined" ? "" : window.location.origin);

  function openWhatsappToCustomer() {
    const url = buildQuoteWhatsappUrl(quote, model, getOrigin());
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function shareProposalWithImage() {
    const origin = getOrigin();
    const fullText = buildFullQuoteWhatsappMessage(quote, model, origin);
    const ogImgUrl = `${origin}/api/quotes/${quote.shareToken}/og-image`;

    try {
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
        const res = await fetch(ogImgUrl);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], `cortez-${quote.modelName.replace(/\s+/g, "-")}.png`, {
            type: "image/png",
          });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `הצעת מחיר קורטז — ${quote.modelName}`,
              text: fullText,
              files: [file],
            });
            return;
          }
        }
      }
    } catch {
      // Fallback to direct WhatsApp chat
    }
    openWhatsappToCustomer();
  }

  return (
    <div className="proposal-whatsapp-share-box">
      <button
        type="button"
        className="proposal-whatsapp-btn"
        onClick={openWhatsappToCustomer}
      >
        <MessageCircle size={18} aria-hidden />
        <span>שליחת ההצעה בוואטסאפ ללקוח (<bdi dir="ltr">{quote.customerPhone}</bdi>)</span>
      </button>
      <button
        type="button"
        className="proposal-whatsapp-image-btn"
        onClick={shareProposalWithImage}
      >
        <ImageIcon size={16} aria-hidden />
        <span>שיתוף ההצעה המלאה + תמונת המוצר</span>
      </button>
    </div>
  );
}

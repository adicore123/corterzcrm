"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { PublicQuote, Quote } from "@/lib/quotes/schema";
import {
  shareQuoteImageAndTextOnWhatsapp,
  type QuoteWhatsappModelInfo,
} from "@/lib/quotes/whatsapp";

export function ProposalWhatsappButton({
  quote,
  model,
}: {
  quote: Quote | PublicQuote;
  model?: QuoteWhatsappModelInfo;
}) {
  const [hint, setHint] = useState("");

  async function handleShare() {
    setHint("");
    try {
      const result = await shareQuoteImageAndTextOnWhatsapp(quote, model);
      if (result.mode === "web-share") {
        setHint(`תמונת המוצר ומלל ההצעה הועברו לוואטסאפ (המספר ${result.phone} הועתק לחיפוש מהיר).`);
      } else if (result.mode === "clipboard-wa") {
        setHint(`נפתח הצ׳אט עם ${result.phone} ותמונת המוצר הועתקה ללוח — לחצו Ctrl+V בצ׳אט להדבקת התמונה.`);
      }
    } catch {
      // User dismissed share dialog
    }
  }

  return (
    <div className="proposal-whatsapp-share-box">
      <button
        type="button"
        className="proposal-whatsapp-btn"
        onClick={handleShare}
      >
        <MessageCircle size={18} aria-hidden />
        <span>שליחת תמונת המוצר + ההצעה בוואטסאפ (<bdi dir="ltr">{quote.customerPhone}</bdi>)</span>
      </button>
      {hint && <small className="proposal-whatsapp-hint">{hint}</small>}
    </div>
  );
}

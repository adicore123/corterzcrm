"use client";

import { useState } from "react";
import { CheckCircle2, PhoneCall, ShieldCheck, Truck } from "lucide-react";

export function AcceptQuote({ token, accepted }: { token: string; accepted: boolean }) {
  const [done, setDone] = useState(accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/quotes/${token}/accept`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "לא ניתן לאשר את ההצעה");
      setDone(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposal-accept">
      {done ? (
        <div className="proposal-accept-success">
          <div className="proposal-accept-banner">
            <CheckCircle2 size={22} aria-hidden />
            <p role="status">ההצעה אושרה. תודה! ניצור איתכם קשר להמשך.</p>
          </div>
          <ol className="proposal-next-steps" aria-label="השלבים הבאים לאחר אישור ההצעה">
            <li>
              <ShieldCheck size={16} aria-hidden />
              <div>
                <strong>תיעוד ושריון ההצעה</strong>
                <span>אישור ההצעה נקלט במערכת קורטז ושריין עבורך את תנאי העסקה.</span>
              </div>
            </li>
            <li>
              <PhoneCall size={16} aria-hidden />
              <div>
                <strong>שיחת תיאום אישית</strong>
                <span>נציג קורטז ייצור איתך קשר טלפוני לתיאום מועד מסירה ואמצעי תשלום.</span>
              </div>
            </li>
            <li>
              <Truck size={16} aria-hidden />
              <div>
                <strong>הכנת הכלי ומסירה</strong>
                <span>בדיקת תקינה ואיכות מלאה לפני מסירת הכלי המוכן לנסיעה.</span>
              </div>
            </li>
          </ol>
        </div>
      ) : (
        <button type="button" onClick={accept} disabled={busy}>
          {busy ? "מאשר…" : "אישור ההצעה"}
        </button>
      )}
      {error && <p role="alert" className="proposal-accept-error">{error}</p>}
    </div>
  );
}

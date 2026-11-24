"use client";

import { useState } from "react";

export function AcceptQuote({ token, accepted }: { token: string; accepted: boolean }) {
  const [done, setDone] = useState(accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/quotes/${token}/accept`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "לא ניתן לאשר את ההצעה");
      setDone(true);
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  return <div className="proposal-accept">{done ? <p role="status">ההצעה אושרה. תודה! ניצור איתכם קשר להמשך.</p> : <button type="button" onClick={accept} disabled={busy}>{busy ? "מאשר…" : "אישור ההצעה"}</button>}
    {error && <p role="alert">{error}</p>}</div>;
}

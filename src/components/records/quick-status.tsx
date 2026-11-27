"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { repairStatuses, standardStatuses, type Repair, type Standard } from "@/lib/validation/models";

export function PrintButton() {
  return <Button variant="outline" className="no-print" onClick={() => window.print()}>
    <Printer size={17} /> הדפסה
  </Button>;
}

export function QuickStatus({ module, record }: {
  module: "standards" | "repairs";
  record: Standard | Repair;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(record.status);
  const [version, setVersion] = useState(record.updatedAt);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const options = module === "standards" ? standardStatuses : repairStatuses;

  async function updateStatus(nextStatus: string) {
    if (busy || nextStatus === status) return;
    setBusy(nextStatus);
    setError("");
    try {
      const saved = await requestJson<{ updatedAt: string }>(
        "/api/records/" + module + "/" + record.id,
        "PATCH",
        { status: nextStatus, version },
      );
      setStatus(nextStatus as typeof status);
      setVersion(saved.updatedAt);
      startTransition(() => router.refresh());
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  return <div className="quick-status-bar no-print" role="group" aria-label="שינוי סטטוס מהיר">
    <span className="quick-status-label">שינוי סטטוס מהיר:</span>
    <div className="quick-status-buttons">
      {options.map((option) => {
        const active = status === option;
        return <Button key={option} size="default" variant={active ? "default" : "outline"}
          disabled={Boolean(busy)} aria-pressed={active} onClick={() => updateStatus(option)}>
          {busy === option ? "מעדכן…" : option}
        </Button>;
      })}
    </div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}

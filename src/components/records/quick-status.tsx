"use client";

import { useState } from "react";
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
    const payload = "tasks" in record
      ? {
          number: record.number,
          device: record.device,
          model: record.model,
          status: nextStatus,
          delay: record.delay,
          delayReason: record.delayReason,
          notes: record.notes,
          tasks: record.tasks,
          version,
          keptPhotos: record.photos.map((p) => p.id),
        }
      : {
          device: record.device,
          model: record.model,
          serial: record.serial,
          customerId: record.customerId,
          fault: record.fault,
          work: record.work,
          status: nextStatus,
          version,
          keptPhotos: record.photos.map((p) => p.id),
        };
    try {
      const saved = await requestJson<{ updatedAt: string }>("/api/records/" + module + "/" + record.id, "PUT", payload);
      setStatus(nextStatus as typeof status);
      setVersion(saved.updatedAt);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  return <div className="quick-status-bar no-print" role="group" aria-label="שינוי סטטוס מהיר">
    <span className="quick-status-label">עדכון סטטוס מהיר:</span>
    <div className="quick-status-buttons">
      {options.map((option) => {
        const active = status === option;
        return <Button key={option} size="sm" variant={active ? "default" : "outline"}
          disabled={Boolean(busy)} aria-pressed={active} onClick={() => updateStatus(option)}>
          {busy === option ? "מעדכן…" : option}
        </Button>;
      })}
    </div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}

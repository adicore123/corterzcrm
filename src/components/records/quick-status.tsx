"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/client-api";
import { repairStatuses, standardStatuses, type Repair, type Standard } from "@/lib/validation/models";

export function PrintButton() {
  return (
    <Button variant="outline" className="no-print" onClick={() => window.print()}>
      <Printer size={17} /> הדפסה
    </Button>
  );
}

export function QuickStatus({
  module,
  record,
  readOnly = false,
}: {
  module: "standards" | "repairs";
  record: Standard | Repair;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [status, setStatus] = useState(record.status);
  const [version, setVersion] = useState(record.updatedAt);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const options = module === "standards" ? standardStatuses : repairStatuses;
  const activeIdx = options.indexOf(status as never);

  async function updateStatus(nextStatus: string) {
    if (readOnly || busy || nextStatus === status) return;
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
      addToast({
        title: `הסטטוס עודכן ל־״${nextStatus}״`,
        variant: "success",
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="visual-stepper-wrap no-print" role="group" aria-label="שלבי התקדמות ושינוי סטטוס">
      <div className="visual-stepper">
        {options.map((option, idx) => {
          const isCurrent = status === option;
          const isCompleted = activeIdx > idx;
          const stepTone = idx === 0 ? "red" : idx === options.length - 1 ? "green" : "blue";
          return (
            <button
              key={option}
              type="button"
              disabled={readOnly || Boolean(busy)}
              aria-pressed={isCurrent}
              onClick={() => updateStatus(option)}
              className={
                `visual-step tone-${stepTone}`
                + (isCurrent ? " is-current" : "")
                + (isCompleted ? " is-completed" : "")
              }
            >
              <span className="visual-step-num" aria-hidden="true">
                {isCompleted ? <Check size={14} strokeWidth={2.6} /> : idx + 1}
              </span>
              <span className="visual-step-text">
                <strong>{busy === option ? "מעדכן…" : option}</strong>
                <small>
                  {idx === 0
                    ? module === "repairs"
                      ? "קליטה במעבדה"
                      : "פתיחת תיק"
                    : idx === 1
                      ? "בעבודה פעילה"
                      : module === "repairs"
                        ? "מוכן למסירה ללקוח"
                        : "תקינה הושלמה"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

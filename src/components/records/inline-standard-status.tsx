"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleCheck, ClipboardList, Clock3 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { standardStatuses, type Standard } from "@/lib/validation/models";

function statusToneClass(value: Standard["status"]): string {
  if (value === "הסתיים") return "is-done";
  if (value === "בטיפול") return "is-active";
  return "is-new";
}

function StatusIcon({ value }: { value: Standard["status"] }) {
  if (value === "הסתיים") return <CircleCheck size={16} aria-hidden />;
  if (value === "בטיפול") return <Clock3 size={16} aria-hidden />;
  return <ClipboardList size={16} aria-hidden />;
}

export function InlineStandardStatus({
  record,
  variant,
}: {
  record: Standard;
  variant: "table" | "mobile";
}) {
  const router = useRouter();
  const [override, setOverride] = useState<{ status: Standard["status"]; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");

  const useLocal = Boolean(override && override.version >= record.updatedAt);
  const status = useLocal ? override!.status : record.status;
  const version = useLocal ? override!.version : record.updatedAt;

  async function updateStatus(nextStatus: Standard["status"]) {
    if (busy || nextStatus === status) return;
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      const saved = await requestJson<{ updatedAt: string }>("/api/records/standards/" + record.id, "PUT", {
        number: record.number,
        device: record.device,
        model: record.model,
        status: nextStatus,
        delay: record.delay,
        delayReason: record.delayReason,
        notes: record.notes,
        tasks: record.tasks,
        version,
        keptPhotos: record.photos.map((photo) => photo.id),
      });
      setOverride({ status: nextStatus, version: saved.updatedAt });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tone = statusToneClass(status);

  if (variant === "table") {
    return <div className="inline-status-cell">
      <div className={`inline-status-wrap ${tone}${busy ? " is-busy" : ""}`}>
        <span className="inline-status-icon" aria-hidden>
          <StatusIcon value={status} />
        </span>
        <select
          className="inline-status-select"
          value={status}
          disabled={busy}
          aria-label={"שינוי סטטוס עבור " + record.number}
          onChange={(event) => void updateStatus(event.target.value as Standard["status"])}
        >
          {standardStatuses.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={15} className="inline-status-chevron" aria-hidden />
      </div>
      {savedFlash && <span className="inline-status-saved" role="status">עודכן</span>}
      {error && <span className="field-error inline-status-error" role="alert">{error}</span>}
    </div>;
  }

  return <div className={`standard-status-block ${tone}`} role="group" aria-label={"שינוי סטטוס עבור " + record.number}>
    <div className="standard-status-head">
      <span className="standard-status-current">
        <StatusIcon value={status} />
        <span>סטטוס: <strong>{status}</strong></span>
      </span>
      <span className="standard-status-hint" role="status">
        {busy ? "מעדכן…" : savedFlash ? "נשמר ✓" : "לחיצה להחלפה"}
      </span>
    </div>
    <div className="standard-status-buttons">
      {standardStatuses.map((option) => {
        const active = status === option;
        const optionTone = statusToneClass(option);
        return <button
          key={option}
          type="button"
          className={`standard-status-btn ${optionTone}${active ? " is-selected" : ""}`}
          disabled={busy}
          aria-pressed={active}
          aria-label={"סטטוס " + option + " עבור " + record.number}
          onClick={() => void updateStatus(option)}
        >
          {option}
        </button>;
      })}
    </div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}

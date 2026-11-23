"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleCheck, ClipboardList, Clock3 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { repairStatuses, type Repair } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

export function repairStatusNeedsWork(status: Repair["status"]): boolean {
  return status === "בטיפול" || status === "הסתיים";
}

function statusToneClass(value: Repair["status"]): string {
  if (value === "הסתיים") return "is-done";
  if (value === "בטיפול") return "is-active";
  return "is-new";
}

function StatusIcon({ value }: { value: Repair["status"] }) {
  if (value === "הסתיים") return <CircleCheck size={16} aria-hidden />;
  if (value === "בטיפול") return <Clock3 size={16} aria-hidden />;
  return <ClipboardList size={16} aria-hidden />;
}

export function InlineRepairStatus({ record, variant }: { record: Repair; variant: "table" | "mobile" }) {
  const router = useRouter();
  const [override, setOverride] = useState<{ status: Repair["status"]; work: string; version: string } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<Repair["status"] | null>(null);
  const [workDraft, setWorkDraft] = useState(record.work);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");

  const useLocal = Boolean(override && override.version >= record.updatedAt);
  const status = useLocal ? override!.status : record.status;
  const work = useLocal ? override!.work : record.work;
  const version = useLocal ? override!.version : record.updatedAt;

  function closeEditor() {
    if (busy) return;
    setPendingStatus(null);
    setWorkDraft(work);
    setError("");
  }

  async function persist(nextStatus: Repair["status"], nextWork: string) {
    if (busy || (nextStatus === status && nextWork === work)) return;
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      const saved = await requestJson<{ updatedAt: string }>("/api/records/repairs/" + record.id, "PUT", {
        device: record.device,
        model: record.model,
        serial: record.serial,
        customerId: record.customerId,
        fault: record.fault,
        work: nextWork,
        status: nextStatus,
        version,
        keptPhotos: record.photos.map((photo) => photo.id),
      });
      setOverride({ status: nextStatus, work: nextWork, version: saved.updatedAt });
      setPendingStatus(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function chooseStatus(nextStatus: Repair["status"]) {
    if (busy || nextStatus === status) return;
    if (repairStatusNeedsWork(nextStatus)) {
      setError("");
      setWorkDraft(work);
      setPendingStatus(nextStatus);
      return;
    }
    void persist(nextStatus, work);
  }

  function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingStatus) void persist(pendingStatus, workDraft.trim());
  }

  const tone = statusToneClass(status);
  const controls = variant === "table" ? (
    <div className="inline-status-cell">
      <div className={`inline-status-wrap ${tone}${busy ? " is-busy" : ""}`}>
        <span className="inline-status-icon" aria-hidden><StatusIcon value={status} /></span>
        <select
          className="inline-status-select"
          value={status}
          disabled={busy}
          aria-label={"שינוי סטטוס עבור " + record.number}
          onChange={(event) => chooseStatus(event.target.value as Repair["status"])}
        >
          {repairStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <ChevronDown size={15} className="inline-status-chevron" aria-hidden />
      </div>
      {savedFlash && <span className="inline-status-saved" role="status">עודכן</span>}
      {error && !pendingStatus && <span className="field-error inline-status-error" role="alert">{error}</span>}
    </div>
  ) : (
    <div className={`standard-status-block ${tone}`} role="group" aria-label={"שינוי סטטוס עבור " + record.number}>
      <div className="standard-status-head">
        <span className="standard-status-current"><StatusIcon value={status} /><span>סטטוס: <strong>{status}</strong></span></span>
        <span className="standard-status-hint" role="status">{busy ? "מעדכן…" : savedFlash ? "נשמר ✓" : "לחיצה להחלפה"}</span>
      </div>
      <div className="standard-status-buttons">
        {repairStatuses.map((option) => <button
          key={option}
          type="button"
          className={`standard-status-btn ${statusToneClass(option)}${status === option ? " is-selected" : ""}`}
          disabled={busy}
          aria-pressed={status === option}
          aria-label={"סטטוס " + option + " עבור " + record.number}
          onClick={() => chooseStatus(option)}
        >{option}</button>)}
      </div>
      {error && !pendingStatus && <span className="field-error" role="alert">{error}</span>}
    </div>
  );

  return <>
    {controls}
    <Modal
      open={Boolean(pendingStatus)}
      onOpenChange={(open) => { if (!open) closeEditor(); }}
      title="תיעוד הטיפול"
      description={pendingStatus ? `לפני מעבר לסטטוס „${pendingStatus}”, אפשר לעדכן מה נעשה בתיקון.` : "עדכון מה נעשה בתיקון"}
      className="repair-work-dialog"
    >
      <form className="dialog-form repair-work-form" onSubmit={submitWork} noValidate>
        <Field label="מה נעשה בתיקון?" hint="התיעוד נשמר יחד עם הסטטוס באותה פעולה.">
          {(props) => <textarea {...props} value={workDraft} onChange={(event) => setWorkDraft(event.target.value)} maxLength={4000} autoFocus />}
        </Field>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="dialog-actions">
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירת סטטוס ותיעוד"}</Button>
          <Button type="button" variant="outline" onClick={closeEditor} disabled={busy}>ביטול</Button>
        </div>
      </form>
    </Modal>
  </>;
}

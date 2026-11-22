"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Save, Search } from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { faultSeverities, type CommonFault, type FaultGuide, type FaultSeverity } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

export function FaultCommonList({ record }: { record: FaultGuide }) {
  const router = useRouter();
  const [faults, setFaults] = useState<CommonFault[]>(record.commonFaults);
  const [version, setVersion] = useState(record.updatedAt);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<FaultSeverity>("נפוצה");
  const [symptoms, setSymptoms] = useState("");
  const [solution, setSolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const q = query.trim().toLocaleLowerCase("he");
  const filtered = q
    ? faults.filter((item) => [item.code, item.title, item.symptoms, item.solution, item.severity]
        .some((v) => v.toLocaleLowerCase("he").includes(q)))
    : faults;

  async function submitQuickFault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("יש להזין כותרת תקלה.");
      return;
    }
    setSaving(true);
    setError("");
    const nextFault: CommonFault = {
      id: newRequestId(),
      code: code.trim(),
      title: title.trim(),
      severity,
      symptoms: symptoms.trim(),
      solution: solution.trim(),
    };
    const nextList = [...faults, nextFault];
    try {
      const updated = await requestJson<FaultGuide>("/api/records/faults/" + record.id, "PUT", {
        device: record.device,
        model: record.model,
        summary: record.summary,
        unlockInstructions: record.unlockInstructions,
        commonFaults: nextList,
        videoLinks: record.videoLinks,
        notes: record.notes,
        version,
        keptPhotos: record.photos.map((photo) => photo.id),
        keptAttachments: record.attachments.map((att) => att.id),
      });
      setFaults(updated.commonFaults);
      setVersion(updated.updatedAt);
      setCode("");
      setTitle("");
      setSeverity("נפוצה");
      setSymptoms("");
      setSolution("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="card detail-card">
    <div className="section-heading">
      <h2><span className="section-icon"><AlertTriangle size={18} /></span>תקלות נפוצות וקודי שגיאה ({faults.length})</h2>
      <Modal open={open} onOpenChange={setOpen} title="הוספת תקלה נפוצה לדגם" description={`התקלה תתווסף למדריך של ${record.model}`}
        trigger={<Button size="sm" variant="outline" disabled={faults.length >= 50}><Plus size={16} /> הוספת תקלה נפוצה</Button>}>
        <form className="dialog-form" onSubmit={submitQuickFault} noValidate>
          <div className="fields-grid">
            <label className="field"><span>קוד תקלה (אופציונלי)</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" maxLength={32} placeholder="למשל E07" />
            </label>
            <label className="field"><span>סיווג</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as FaultSeverity)}>
                {faultSeverities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field field-wide"><span>כותרת התקלה</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="למשל חיישן הול מנוע / ניתוק בלם" />
            </label>
            <label className="field field-wide"><span>תסמינים וגורם אפשרי</span>
              <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={2} maxLength={1000} />
            </label>
            <label className="field field-wide"><span>פתרון מומלץ</span>
              <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={3} maxLength={2000} />
            </label>
          </div>
          {error && <p role="alert" className="error-message">{error}</p>}
          <div className="dialog-actions">
            <Button type="submit" disabled={saving}><Save size={16} /> {saving ? "שומר…" : "שמירת תקלה"}</Button>
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>ביטול</Button>
          </div>
        </form>
      </Modal>
    </div>

    {faults.length >= 3 && <div className="search-field fault-inline-search">
      <Search size={17} aria-hidden />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        aria-label="סינון תקלות של הדגם" placeholder="חיפוש קוד תקלה (E07) או מילה בפתרון…" />
    </div>}

    {filtered.length === 0 ? (
      <p className="muted">{faults.length === 0 ? "טרם נרשמו תקלות נפוצות לדגם זה." : "לא נמצאו תקלות תואמות לחיפוש."}</p>
    ) : (
      <div className="fault-cards-grid">
        {filtered.map((item) => (
          <article className="fault-card" key={item.id}>
            <div className="fault-card-top">
              <div className="fault-card-badges">
                {item.code && <bdi className="fault-code-pill" dir="ltr">{item.code}</bdi>}
                <span className={"status " + (item.severity === "קריטית" ? "status-red" : item.severity === "תחזוקה" ? "status-neutral" : "status-amber")}>
                  {item.severity}
                </span>
              </div>
              <h3>{item.title}</h3>
            </div>
            {item.symptoms && <div className="fault-card-block"><small>תסמינים / גורם</small><p>{item.symptoms}</p></div>}
            {item.solution && <div className="fault-card-block is-solution"><small>פתרון מומלץ</small><p>{item.solution}</p></div>}
          </article>
        ))}
      </div>
    )}
  </section>;
}

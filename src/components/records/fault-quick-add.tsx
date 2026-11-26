"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Layers, Plus, Save, Search, Unlock } from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { faultSeverities, type CommonFault, type FaultGuide, type FaultSeverity } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

export function QuickUnlockModalButton({ record }: { record: FaultGuide }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(record.unlockInstructions);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasExisting = Boolean(
    record.unlockInstructions.trim()
      || record.videoLinks.length > 0
      || record.attachments.some((a) => a.kind === "video"),
  );

  async function submitQuickUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanInstructions = instructions.trim();
    const cleanVideoUrl = videoUrl.trim();
    const cleanVideoTitle = videoTitle.trim() || `פתיחת הגבלה — ${record.model}`;

    if (!cleanInstructions && !cleanVideoUrl) {
      setError("יש להזין הוראות פתיחת הגבלה או קישור לסרטון.");
      return;
    }

    setSaving(true);
    setError("");
    const nextVideoLinks = cleanVideoUrl
      ? [...record.videoLinks, { id: newRequestId(), title: cleanVideoTitle, url: cleanVideoUrl }]
      : record.videoLinks;

    try {
      await requestJson<FaultGuide>("/api/records/faults/" + record.id, "PUT", {
        device: record.device,
        model: record.model,
        summary: record.summary,
        unlockInstructions: cleanInstructions,
        commonFaults: record.commonFaults,
        videoLinks: nextVideoLinks,
        notes: record.notes,
        version: record.updatedAt,
        keptPhotos: record.photos.map((photo) => photo.id),
        keptAttachments: record.attachments.map((att) => att.id),
      });
      setVideoTitle("");
      setVideoUrl("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (next) setInstructions(record.unlockInstructions);
        setOpen(next);
      }}
      title={hasExisting ? `עדכון פתיחת הגבלה — ${record.model}` : `הוספת פתיחת הגבלה — ${record.model}`}
      description={`הוראות וסרטוני פתיחת ההגבלה יישמרו תחת הדגם ${record.model} ויופיעו בחוצץ פתיחת הגבלה.`}
      trigger={
        <Button size="sm" variant="outline">
          <Plus size={16} /> {hasExisting ? "עדכון / הוספת פתיחת הגבלה" : "הוספת פתיחת הגבלה"}
        </Button>
      }
    >
      <form className="dialog-form" onSubmit={submitQuickUnlock} noValidate>
        <div className="fields-grid">
          <label className="field field-wide">
            <span>הוראות פתיחת הגבלה שלב אחר שלב</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="לדוגמה: הדלקת הצג → לחיצה ממושכת על + ו־- → כניסה להגדרת P08 → שינוי ערך…"
            />
          </label>
          <label className="field">
            <span>כותרת סרטון הדרכה (אופציונלי)</span>
            <input
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              maxLength={120}
              placeholder="למשל הדרכת פתיחת הגבלה בצג"
            />
          </label>
          <label className="field">
            <span>קישור לסרטון (YouTube / Drive / Vimeo)</span>
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              dir="ltr"
              maxLength={1000}
              placeholder="https://youtu.be/..."
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="submit" disabled={saving}>
            <Save size={16} /> {saving ? "שומר…" : "שמירת פתיחת הגבלה"}
          </Button>
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
            ביטול
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function FaultGuideDetailTabs({
  commonFaultsCount,
  filesCount,
  unlockSection,
  faultsSection,
  filesAndPhotosSection,
}: {
  hasUnlock?: boolean;
  commonFaultsCount: number;
  filesCount: number;
  unlockSection: ReactNode;
  faultsSection: ReactNode;
  filesAndPhotosSection: ReactNode;
}) {
  const [tab, setTab] = useState<"all" | "faults" | "unlock" | "files">("all");

  return (
    <div className="fault-detail-tabs-shell">
      <div className="faults-module-tabs" role="tablist" aria-label="חוצצי מדריך הדגם">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "faults"}
          className={"faults-tab-btn" + (tab === "faults" ? " is-active" : "")}
          onClick={() => setTab("faults")}
        >
          <AlertTriangle size={16} aria-hidden />
          <span>חוצץ תקלות נפוצות</span>
          <span className="faults-tab-count">{commonFaultsCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "unlock"}
          className={"faults-tab-btn is-unlock-tab" + (tab === "unlock" ? " is-active" : "")}
          onClick={() => setTab("unlock")}
        >
          <Unlock size={16} aria-hidden />
          <span>חוצץ פתיחת הגבלה</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "files"}
          className={"faults-tab-btn" + (tab === "files" ? " is-active" : "")}
          onClick={() => setTab("files")}
        >
          <FileText size={16} aria-hidden />
          <span>קבצים ותמונות</span>
          <span className="faults-tab-count">{filesCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={"faults-tab-btn" + (tab === "all" ? " is-active" : "")}
          onClick={() => setTab("all")}
        >
          <Layers size={16} aria-hidden />
          <span>הצג הכל</span>
        </button>
      </div>

      {(tab === "all" || tab === "unlock") && unlockSection}
      {(tab === "all" || tab === "faults") && faultsSection}
      {(tab === "all" || tab === "files") && filesAndPhotosSection}
    </div>
  );
}

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

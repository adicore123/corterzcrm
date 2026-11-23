"use client";

import { useCallback, useId, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, FileText, FileUp, Film, Images, Link2, Plus, ShieldAlert, Trash2, Unlock, Video, X } from "lucide-react";
import { newRequestId } from "@/lib/client-api";
import { formatBytes } from "@/lib/presentation";
import {
  faultGuideInput, faultSeverities,
  type CatalogModel, type FaultGuide, type FaultGuideInput,
} from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { useProtectedDelete } from "@/components/ui/delete-password-dialog";
import { Field } from "@/components/ui/field";
import { DeviceFields, Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useAttachmentDraft, useEditor, usePhotoDraft } from "./use-editor";

const fileAccept = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp";
const videoAccept = "video/mp4,video/quicktime,video/webm,video/x-m4v,video/*";

export function FaultForm({
  record, models, catalog = [], initialModel, cloud, canDelete = true,
}: {
  record?: FaultGuide;
  models: string[];
  catalog?: CatalogModel[];
  initialModel?: CatalogModel;
  cloud: boolean;
  canDelete?: boolean;
}) {
  const [catalogList, setCatalogList] = useState(catalog);
  const [modelNames, setModelNames] = useState(models);
  const fileInputId = useId();
  const videoInputId = useId();

  const { control, register, handleSubmit, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<FaultGuideInput>({
    resolver: zodResolver(faultGuideInput),
    defaultValues: record ? {
      device: record.device,
      model: record.model,
      summary: record.summary,
      unlockInstructions: record.unlockInstructions,
      commonFaults: record.commonFaults,
      videoLinks: record.videoLinks,
      notes: record.notes,
    } : {
      device: initialModel?.device ?? "קורקינט חשמלי",
      model: initialModel?.name ?? "",
      summary: "",
      unlockInstructions: "",
      commonFaults: [],
      videoLinks: [],
      notes: "",
    },
  });

  const selectedDevice = useWatch({ control, name: "device" });
  const selectedModel = useWatch({ control, name: "model" });
  const watchedVideoLinks = useWatch({ control, name: "videoLinks" });
  const watchedCommonFaults = useWatch({ control, name: "commonFaults" });
  const commonFaults = useFieldArray({ name: "commonFaults", control, keyName: "fieldKey" });
  const videoLinks = useFieldArray({ name: "videoLinks", control, keyName: "fieldKey" });
  const photos = usePhotoDraft(record?.photos ?? []);
  const attachments = useAttachmentDraft(record?.attachments ?? []);
  const editor = useEditor("faults", record, isDirty, photos, cloud, attachments);
  const { requestDelete, dialog: deleteDialog } = useProtectedDelete(editor.authorizeDelete);
  const savedFaultIds = new Set((record?.commonFaults ?? []).map((item) => item.id));
  const savedVideoIds = new Set((record?.videoLinks ?? []).map((item) => item.id));

  const handleModelSelected = useCallback((picked: CatalogModel) => {
    setValue("device", picked.device, { shouldDirty: true, shouldValidate: true });
    setValue("model", picked.name, { shouldDirty: true, shouldValidate: true });
  }, [setValue]);

  const savedVideos = attachments.kept.filter((item) => item.kind === "video");
  const pendingVideos = attachments.pending.filter((item) => item.kind === "video");
  const savedFiles = attachments.kept.filter((item) => item.kind === "file");
  const pendingFiles = attachments.pending.filter((item) => item.kind === "file");
  const totalAttachments = attachments.kept.length + attachments.pending.length;

  return <>
    {deleteDialog}
    <Editor module="faults" title={record ? "עריכת מדריך תקלות ופתיחת הגבלה" : "מדריך תקלות ופתיחת הגבלה חדש"}
      cancel={record ? "/faults/" + record.id : "/faults"}
      loading={isSubmitting || editor.leaving || photos.processing} error={editor.error}
      progress={editor.progress} unsaved={editor.unsaved} onSubmit={handleSubmit(editor.save)}>

    <Section title="זיהוי הדגם" icon={ShieldAlert}>
      <div className="fields-grid">
        <DeviceFields
          device={register("device")} model={register("model")} models={modelNames} catalog={catalogList}
          selectedDevice={selectedDevice} selectedModel={selectedModel}
          deviceError={errors.device?.message} modelError={errors.model?.message}
          onModelSelected={handleModelSelected}
          onModelCreated={canDelete ? ((created) => {
            setCatalogList((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name, "he")));
            setModelNames((list) => Array.from(new Set([...list, created.name])).sort((a, b) => a.localeCompare(b, "he")));
            setValue("device", created.device, { shouldDirty: true, shouldValidate: true });
            setValue("model", created.name, { shouldDirty: true, shouldValidate: true });
          }) : undefined}
        />
        <Field label="תקציר טכני לדגם (אופציונלי)" error={errors.summary?.message} className="field-wide">{(props) =>
          <textarea {...props} {...register("summary")} rows={2} maxLength={1000}
            placeholder="מידע כללי על בקר, צג, מנוע או גרסת חומרה של הדגם" />
        }</Field>
      </div>
    </Section>

    <Section title="פתיחת הגבלה — הוראות וסרטונים" icon={Unlock}>
      <div className="fields-grid">
        <Field label="הוראות פתיחת הגבלה שלב אחר שלב" error={errors.unlockInstructions?.message} className="field-wide">{(props) =>
          <textarea {...props} {...register("unlockInstructions")} rows={4} maxLength={4000}
            placeholder="לדוגמה: הדלקת הצג → לחיצה ממושכת על + ו־- → כניסה להגדרת P08 → שינוי ערך / ניתוק כבל הגבלה לבן בבקר…" />
        }</Field>
      </div>

      <div className="upload-zone">
        <span className="upload-mark"><Video size={22} aria-hidden /></span>
        <div className="upload-copy">
          <strong>העלאת סרטון פתיחת הגבלה</strong>
          <span>קובצי MP4, MOV או WebM ישירות מהטלפון או מהמחשב (עד 100 מ״ב לסרטון)</span>
        </div>
        <div className="upload-controls">
          <div className="upload-option">
            <input type="file" id={videoInputId} className="sr-only" accept={videoAccept} multiple disabled={totalAttachments >= 15}
              onChange={(event) => {
                const input = event.currentTarget;
                const selected = Array.from(input.files ?? []);
                if (selected.length) attachments.add(selected, "video");
                input.value = "";
              }} />
            <label className="button button-outline" htmlFor={videoInputId}><Film size={17} /> העלאת סרטון</label>
          </div>
        </div>
      </div>

      {(savedVideos.length > 0 || pendingVideos.length > 0) && <div className="attachment-list">
        {savedVideos.map((item) => <div className="attachment-row" key={item.id}>
          <div className="attachment-meta">
            <Film size={18} aria-hidden />
            <div><strong>{item.name}</strong><small>{formatBytes(item.bytes)} · סרטון שמור</small></div>
          </div>
          {canDelete && <Button size="icon" variant="ghost" aria-label={"הסרת סרטון " + item.name}
            onClick={() => requestDelete(`להסיר את הסרטון ${item.name}? יש להזין סיסמת מחיקה.`, () => attachments.removeSaved(item.id))}><X size={16} /></Button>}
        </div>)}
        {pendingVideos.map((item) => <div className="attachment-row is-pending" key={item.id}>
          <div className="attachment-meta">
            <Film size={18} aria-hidden />
            <div>
              <strong>{item.file.name}</strong>
              <small>{formatBytes(item.file.size)} · ממתין להעלאה בשמירה</small>
            </div>
          </div>
          <Button size="icon" variant="ghost" aria-label={"הסרת סרטון " + item.file.name} onClick={() => attachments.removePending(item.id)}><X size={16} /></Button>
        </div>)}
      </div>}

      <div className="fault-subblock">
        <div className="fault-subblock-head">
          <h3><Link2 size={16} aria-hidden /> קישורים לסרטוני פתיחת הגבלה (YouTube / Google Drive / Vimeo)</h3>
        </div>
        <div className="spec-inputs">
          {videoLinks.fields.map((item, index) => {
            const vidId = watchedVideoLinks?.[index]?.id;
            const isSavedVideoLink = Boolean(vidId && savedVideoIds.has(vidId));
            return <div className="spec-edit-row" key={item.fieldKey}>
              <input type="hidden" {...register(`videoLinks.${index}.id`)} />
              <div>
                <input {...register(`videoLinks.${index}.title`)} aria-label={"כותרת סרטון " + (index + 1)}
                  aria-invalid={Boolean(errors.videoLinks?.[index]?.title)} placeholder="כותרת (למשל פתיחת הגבלה בצג S866)" maxLength={120} />
                {errors.videoLinks?.[index]?.title && <span className="field-error" role="alert">{errors.videoLinks[index]?.title?.message}</span>}
              </div>
              <div>
                <input {...register(`videoLinks.${index}.url`)} dir="ltr" aria-label={"קישור סרטון " + (index + 1)}
                  aria-invalid={Boolean(errors.videoLinks?.[index]?.url)} placeholder="https://youtube.com/watch?v=..." maxLength={1000} />
                {errors.videoLinks?.[index]?.url && <span className="field-error" role="alert">{errors.videoLinks[index]?.url?.message}</span>}
              </div>
              {(!isSavedVideoLink || canDelete) && <Button size="icon" variant="ghost" aria-label={"מחיקת קישור סרטון " + (index + 1)} onClick={() => {
                if (isSavedVideoLink) {
                  requestDelete(`למחוק את קישור סרטון ${index + 1}? יש להזין סיסמת מחיקה.`, () => videoLinks.remove(index));
                } else {
                  videoLinks.remove(index);
                }
              }}><Trash2 size={16} /></Button>}
            </div>;
          })}
        </div>
        <Button variant="outline" disabled={videoLinks.fields.length >= 10}
          onClick={() => videoLinks.append({ id: newRequestId(), title: "", url: "" }, { focusName: `videoLinks.${videoLinks.fields.length}.title` })}>
          <Plus size={17} /> הוספת קישור לסרטון
        </Button>
      </div>
    </Section>

    <Section title="תקלות נפוצות וקודי שגיאה של הדגם" icon={AlertTriangle}>
      <p className="muted">תעדו קודי תקלה (כגון E01, E07, E10), תקלות חוזרות ופתרונות מוכחים עבור הצוות.</p>
      <div className="fault-edit-list">
        {commonFaults.fields.map((item, index) => {
          const faultId = watchedCommonFaults?.[index]?.id;
          const isSavedFault = Boolean(faultId && savedFaultIds.has(faultId));
          return <div className="fault-edit-card" key={item.fieldKey}>
            <input type="hidden" {...register(`commonFaults.${index}.id`)} />
            <div className="fault-edit-head">
              <strong>תקלה #{index + 1}</strong>
              {(!isSavedFault || canDelete) && <Button size="icon" variant="ghost" aria-label={"מחיקת תקלה " + (index + 1)} onClick={() => {
                if (isSavedFault) {
                  requestDelete(`למחוק את תקלה #${index + 1}? יש להזין סיסמת מחיקה.`, () => commonFaults.remove(index));
                } else {
                  commonFaults.remove(index);
                }
              }}><Trash2 size={16} /></Button>}
            </div>
          <div className="fields-grid">
            <Field label="קוד תקלה (אופציונלי)" error={errors.commonFaults?.[index]?.code?.message}>{(props) =>
              <input {...props} {...register(`commonFaults.${index}.code`)} dir="ltr" maxLength={32} placeholder="למשל E07 / E10" />
            }</Field>
            <Field label="רמת שכיחות / סיווג" error={errors.commonFaults?.[index]?.severity?.message}>{(props) =>
              <select {...props} {...register(`commonFaults.${index}.severity`)}>
                {faultSeverities.map((sev) => <option key={sev} value={sev}>{sev}</option>)}
              </select>
            }</Field>
            <Field label="כותרת התקלה" error={errors.commonFaults?.[index]?.title?.message} className="field-wide">{(props) =>
              <input {...props} {...register(`commonFaults.${index}.title`)} maxLength={160} required placeholder="למשל תקלת חיישן מנוע / ניתוק ידית בלם" />
            }</Field>
            <Field label="תסמינים וגורם אפשרי" error={errors.commonFaults?.[index]?.symptoms?.message}>{(props) =>
              <textarea {...props} {...register(`commonFaults.${index}.symptoms`)} rows={2} maxLength={1000} placeholder="מה רואים על הצג או מרגישים בכלי?" />
            }</Field>
            <Field label="פתרון מומלץ ודרכי טיפול" error={errors.commonFaults?.[index]?.solution?.message}>{(props) =>
              <textarea {...props} {...register(`commonFaults.${index}.solution`)} rows={2} maxLength={2000} placeholder="שלבי בדיקה, חיווט או חלקים להחלפה" />
            }</Field>
          </div>
        </div>;
        })}
      </div>
      <Button variant="outline" disabled={commonFaults.fields.length >= 50}
        onClick={() => commonFaults.append(
          { id: newRequestId(), code: "", title: "", symptoms: "", solution: "", severity: "נפוצה" },
          { focusName: `commonFaults.${commonFaults.fields.length}.title` },
        )}>
        <Plus size={17} /> הוספת תקלה נפוצה
      </Button>
    </Section>

    <Section title="קבצים ומסמכים טכניים לדגם" icon={FileText}>
      <div className="upload-zone">
        <span className="upload-mark"><FileUp size={22} aria-hidden /></span>
        <div className="upload-copy">
          <strong>העלאת קובץ תקלות / מדריך לדגם</strong>
          <span>PDF, Word, Excel, CSV, TXT או סכמת חיווט (עד 25 מ״ב לקובץ)</span>
        </div>
        <div className="upload-controls">
          <div className="upload-option">
            <input type="file" id={fileInputId} className="sr-only" accept={fileAccept} multiple disabled={totalAttachments >= 15}
              onChange={(event) => {
                const input = event.currentTarget;
                const selected = Array.from(input.files ?? []);
                if (selected.length) attachments.add(selected, "file");
                input.value = "";
              }} />
            <label className="button button-outline" htmlFor={fileInputId}><FileUp size={17} /> בחירת קבצים</label>
          </div>
        </div>
      </div>
      {attachments.error && <p className="error-message" role="alert">{attachments.error}</p>}
      {(savedFiles.length > 0 || pendingFiles.length > 0) && <div className="attachment-list">
        {savedFiles.map((item) => <div className="attachment-row" key={item.id}>
          <div className="attachment-meta">
            <FileText size={18} aria-hidden />
            <div><strong>{item.name}</strong><small>{formatBytes(item.bytes)} · קובץ שמור</small></div>
          </div>
          {canDelete && <Button size="icon" variant="ghost" aria-label={"הסרת קובץ " + item.name}
            onClick={() => requestDelete(`להסיר את הקובץ ${item.name}? יש להזין סיסמת מחיקה.`, () => attachments.removeSaved(item.id))}><X size={16} /></Button>}
        </div>)}
        {pendingFiles.map((item) => <div className="attachment-row is-pending" key={item.id}>
          <div className="attachment-meta">
            <FileText size={18} aria-hidden />
            <div><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)} · ממתין להעלאה בשמירה</small></div>
          </div>
          <Button size="icon" variant="ghost" aria-label={"הסרת קובץ " + item.file.name} onClick={() => attachments.removePending(item.id)}><X size={16} /></Button>
        </div>)}
      </div>}
    </Section>

    <Section title="תמונות אבחון וחיווט והערות נוספות" icon={Images}>
      <PhotoPicker module="faults" id={record?.id} photos={photos} onAuthorizeDelete={editor.authorizeDelete} canDelete={canDelete} />
      <Field label="הערות פנימיות לצוות" error={errors.notes?.message} className="field-wide">{(props) =>
        <textarea {...props} {...register("notes")} rows={2} maxLength={4000} placeholder="דגשים נוספים לטכנאים ולסוכנים" />
      }</Field>
    </Section>
  </Editor>
  </>;
}

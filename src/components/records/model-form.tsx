"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bike, Images, Plus, Save } from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { devices, modelInput, type CatalogModel, type Device, type ModelInput } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: ModelInput = { device: "קורקינט חשמלי", name: "", imageUrl: "", notes: "" };

export function ModelForm({ record, cloud }: { record?: CatalogModel; cloud: boolean }) {
  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<ModelInput>({
    resolver: zodResolver(modelInput),
    defaultValues: record ? { device: record.device, name: record.name, imageUrl: record.imageUrl ?? "", notes: record.notes } : defaults,
  });
  const photos = usePhotoDraft(record?.photos ?? []);
  const editor = useEditor("models", record, isDirty, photos, cloud);

  return <Editor module="models" title={record ? "עריכת דגם" : "דגם חדש"} cancel={record ? "/models/" + record.id : "/models"}
    loading={isSubmitting || editor.leaving} error={editor.error} progress={editor.progress} unsaved={editor.unsaved}
    onSubmit={handleSubmit(editor.save)}>
    <Section title="פרטי הדגם" icon={Bike}>
      <div className="fields-grid">
        <Field label="סוג מכשיר" error={errors.device?.message}>{(props) =>
          <select {...props} {...register("device")} required>{devices.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        }</Field>
        <Field label="שם הדגם" error={errors.name?.message}>{(props) =>
          <input {...props} {...register("name")} maxLength={120} required placeholder="למשל CORTEZ MAX 4 2027" />
        }</Field>
        <Field label="קישור לתמונת קטלוג (אופציונלי)" error={errors.imageUrl?.message} className="field-wide">{(props) =>
          <input {...props} {...register("imageUrl")} dir="ltr" maxLength={500} placeholder="https://cortez.co.il/..." />
        }</Field>
        <Field label="מפרט והערות" error={errors.notes?.message} className="field-wide">{(props) =>
          <textarea {...props} {...register("notes")} rows={3} maxLength={4000} placeholder="פרטי סוללה, בלמים, הערות תקינה או חלקי חילוף נפוצים" />
        }</Field>
      </div>
    </Section>
    <Section title="תמונות הדגם" icon={Images}>
      {record?.imageUrl && <div className="catalog-image-banner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={record.imageUrl} alt={record.name} className="catalog-thumb-lg" />
        <div><strong>תמונת קטלוג רשמית</strong><p className="muted">ניתן גם להעלות תמונות נוספות של הדגם מהמכשיר או מהמצלמה.</p></div>
      </div>}
      <PhotoPicker module="models" id={record?.id} photos={photos} />
    </Section>
  </Editor>;
}

export function InlineModel({ defaultDevice = "קורקינט חשמלי", onSave }: { defaultDevice?: Device; onSave: (model: CatalogModel) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");
  const { register, handleSubmit, reset, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<ModelInput>({
    resolver: zodResolver(modelInput), defaultValues: { ...defaults, device: defaultDevice },
  });

  useEffect(() => {
    if (!open) setValue("device", defaultDevice);
  }, [defaultDevice, open, setValue]);

  function closeNow() {
    reset({ ...defaults, device: defaultDevice });
    setError("");
    requestId.current = "";
    setConfirmDiscard(false);
    setOpen(false);
  }

  function change(next: boolean) {
    if (!next) {
      if (isSubmitting) return;
      if (isDirty) {
        setConfirmDiscard(true);
        return;
      }
      closeNow();
      return;
    }
    setOpen(true);
  }

  async function save(values: ModelInput) {
    setError("");
    if (!requestId.current) requestId.current = newRequestId();
    try {
      const model = await requestJson<CatalogModel>("/api/records/models", "POST", { ...values, requestId: requestId.current });
      onSave(model);
      closeNow();
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return <>
    <Modal open={open} onOpenChange={change} title="דגם חדש במאגר" description="הדגם יישמר במאגר הדגמים וישויך לרשומה הנוכחית."
      trigger={<Button variant="outline" className="inline-customer-button"><Plus size={17} /> דגם חדש</Button>}>
      <form noValidate className="dialog-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.stopPropagation(); void handleSubmit(save)(event); }}>
        <Field label="סוג מכשיר" error={errors.device?.message}>{(props) =>
          <select {...props} {...register("device")} required>{devices.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        }</Field>
        <Field label="שם הדגם" error={errors.name?.message}>{(props) =>
          <input {...props} {...register("name")} maxLength={120} required placeholder="למשל CORTEZ MAX 4 2027" />
        }</Field>
        <Field label="הערות / מפרט" error={errors.notes?.message}>{(props) =>
          <textarea {...props} {...register("notes")} rows={2} maxLength={4000} />
        }</Field>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="dialog-actions">
          <Button type="submit" disabled={isSubmitting}><Save size={17} /> {isSubmitting ? "שומר…" : "שמירת דגם"}</Button>
          <Button variant="outline" disabled={isSubmitting} onClick={() => change(false)}>ביטול</Button>
        </div>
      </form>
    </Modal>
    <UnsavedDialog open={confirmDiscard} onConfirm={closeNow} onCancel={() => setConfirmDiscard(false)}
      description="לסגור את הטופס בלי לשמור את פרטי הדגם?" />
  </>;
}

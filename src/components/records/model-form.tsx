"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bike, Images, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { devices, modelInput, type CatalogModel, type Device, type ModelInput } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { StudioContentEditor } from "@/components/catalog/studio-content-editor";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: ModelInput = { device: "קורקינט חשמלי", name: "", imageUrl: "", notes: "", summary: "", msrp: null, specs: [] };

export function ModelForm({ record, cloud }: { record?: CatalogModel; cloud: boolean }) {
  const { control, register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<ModelInput>({
    resolver: zodResolver(modelInput),
    defaultValues: record ? {
      device: record.device,
      name: record.name,
      imageUrl: record.imageUrl ?? "",
      notes: record.notes,
      summary: record.summary ?? "",
      msrp: record.msrp ?? null,
      specs: record.specs ?? [],
      galleryUrls: record.galleryUrls ?? [],
      productUrl: record.productUrl ?? "",
      published: record.published !== false,
      model3dUrl: record.model3dUrl ?? "",
      videoUrl: record.videoUrl ?? "",
      publicDescription: record.publicDescription ?? "",
      dimensions: record.dimensions ?? "",
      foldedDimensions: record.foldedDimensions ?? "",
      metrics: record.metrics ?? {},
      features: record.features ?? [],
      studio: record.studio ?? {},
    } : defaults,
  });
  const watchedAsset = useWatch({ control, name: "model3dUrl" });
  const watchedName = useWatch({ control, name: "name" });
  const specs = useFieldArray({ name: "specs", control, keyName: "fieldKey" });
  const features = useFieldArray({ name: "features", control, keyName: "fieldKey" });
  const photos = usePhotoDraft(record?.photos ?? []);
  const editor = useEditor("models", record, isDirty, photos, cloud);

  return <Editor module="models" title={record ? "עריכת דגם" : "דגם חדש"} cancel={record ? "/models/" + record.id : "/models"}
    loading={isSubmitting || editor.leaving || photos.processing} error={editor.error} progress={editor.progress} unsaved={editor.unsaved}
    onSubmit={handleSubmit((values) => editor.save({ ...values, galleryUrls: values.galleryUrls?.map((url) => url.trim()).filter(Boolean) }))}>
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
        <Field label="הערות פנימיות" error={errors.notes?.message} className="field-wide">{(props) =>
          <textarea {...props} {...register("notes")} rows={2} maxLength={4000} placeholder="הערות תקינה או חלקי חילוף פנימיים" />
        }</Field>
      </div>
    </Section>
    <Section title="חוויית המוצר בקטלוג" icon={Images}>
      <label className="catalog-publish-control"><input type="checkbox" {...register("published")} /> הדגם מפורסם בקטלוג הציבורי</label>
      <div className="fields-grid">
        <Field label="תיאור מפורט ללקוח" error={errors.publicDescription?.message} className="field-wide">{(props) => <textarea {...props} {...register("publicDescription")} rows={4} maxLength={4000} placeholder="פרטי הדגם, תכונותיו ומשמעותן ללקוח. תוכן זה מוצג לציבור." />}</Field>
        <Field label="קישור לקובץ תלת־ממד GLB" error={errors.model3dUrl?.message}>{(props) => <input {...props} {...register("model3dUrl")} dir="ltr" placeholder="https://…/model.glb" />}</Field>
        <Field label="קישור לווידאו MP4 / WebM" error={errors.videoUrl?.message}>{(props) => <input {...props} {...register("videoUrl")} dir="ltr" placeholder="https://…/video.mp4" />}</Field>
        <Field label="עמוד הדגם באתר קורטז" error={errors.productUrl?.message} className="field-wide">{(props) => <input {...props} {...register("productUrl")} dir="ltr" />}</Field>
        <Field label="מידות הכלי — כולל יחידות" error={errors.dimensions?.message}>{(props) => <input {...props} {...register("dimensions")} placeholder="אורך × רוחב × גובה בס״מ, לפי מפרט היצרן" />}</Field>
        <Field label="מידות במצב מקופל — כולל יחידות" error={errors.foldedDimensions?.message}>{(props) => <input {...props} {...register("foldedDimensions")} placeholder="רק אם קיים מנגנון קיפול ומידות מאומתות" />}</Field>
        <Field label="תמונות גלריה — קישור אחד בכל שורה" error={errors.galleryUrls ? "יש לבדוק את קישורי התמונות (עד 12 קישורים)." : undefined} className="field-wide">{(props) => <Controller name="galleryUrls" control={control} render={({ field }) => <textarea {...props} name={field.name} ref={field.ref} value={(field.value ?? []).join("\n")} onBlur={field.onBlur} onChange={(event) => field.onChange(event.target.value.split("\n"))} dir="ltr" rows={4} />} />}</Field>
        {([
          ["rangeKm", "טווח מוצהר מרבי (ק״מ)"], ["speedKmh", "מהירות לפי המפרט (קמ״ש)"],
          ["batteryWh", "קיבולת סוללה מאומתת (Wh)"], ["weightKg", "משקל מאומת (ק״ג)"],
        ] as const).map(([key, label]) => <Field key={key} label={label} error={errors.metrics?.[key]?.message}>{(props) => <input {...props} {...register(`metrics.${key}`, { setValueAs: (value) => value === "" || value == null ? (Object.hasOwn(record?.metrics ?? {}, key) ? null : undefined) : Number(value) })} type="number" min="0.1" step="any" dir="ltr" placeholder="לא ידוע" />}</Field>)}
      </div>
      <p className="muted">תלת־ממד יוצג רק לאחר הוספת מודל אמיתי של הדגם. הקובץ צריך להיות נגיש לציבור ולתמוך ב־CORS. נתונים מספריים מאומתים מחליפים את חילוץ הנתונים מהטקסט.</p>
      {features.fields.map((feature, index) => <div className="catalog-feature-edit" key={feature.fieldKey}>
        <Field label={`כותרת מאפיין ${index + 1}`} error={errors.features?.[index]?.title?.message}>{(props) => <input {...props} {...register(`features.${index}.title`)} maxLength={120} placeholder="למשל מערכת הבלימה" />}</Field>
        <Field label={`הסבר מאפיין ${index + 1}`} error={errors.features?.[index]?.description?.message}>{(props) => <textarea {...props} {...register(`features.${index}.description`)} maxLength={1000} rows={2} placeholder="הסבר מאומת על הרכיב והמשמעות שלו ללקוח" />}</Field>
        <Button variant="ghost" size="icon" aria-label={`מחיקת הסבר ${index + 1}`} onClick={() => features.remove(index)}><Trash2 size={16} /></Button>
      </div>)}
      <Button variant="outline" disabled={features.fields.length >= 12} onClick={() => features.append({ title: "", description: "" })}><Plus size={16} /> הוספת הסבר על מאפיין</Button>
    </Section>
    <Section title="סטודיו מתקדם, סיור וגרסאות" icon={Images}>
      {errors.studio && <p role="alert" className="field-error">יש לבדוק שכל התחנות, הרכיבים והגרסאות כוללים כותרת ותוכן תקינים, ושכל המידות חיוביות.</p>}
      <Controller name="studio" control={control} render={({ field }) => <StudioContentEditor value={field.value} onChange={field.onChange} assetUrl={watchedAsset} name={watchedName} />} />
    </Section>
    <Section title="מפרט טכני ופרטי קטלוג" icon={SlidersHorizontal}>
      <div className="fields-grid">
        <Field label="מחיר מחירון מומלץ (₪)" error={errors.msrp?.message}>{(props) =>
          <input {...props} {...register("msrp", {
            setValueAs: (value) => {
              if (value === "" || value === null || value === undefined) return null;
              const num = Number(value);
              return Number.isFinite(num) ? num : null;
            },
          })} type="number" min={0} max={1000000} step={1} dir="ltr" placeholder="למשל 3890" />
        }</Field>
        <Field label="תיאור קצר לקטלוג הסוכנים" error={errors.summary?.message} className="field-wide">{(props) =>
          <textarea {...props} {...register("summary")} rows={2} maxLength={600} placeholder="תיאור תמציתי של הדגם שיוצג ללקוחות בקטלוג הסוכנים" />
        }</Field>
      </div>
      <div className="spec-inputs">
        {specs.fields.map((spec, index) => <div className="spec-edit-row" key={spec.fieldKey}>
          <div>
            <input {...register(`specs.${index}.label`)} aria-label={"שם מאפיין " + (index + 1)}
              aria-invalid={Boolean(errors.specs?.[index]?.label)} placeholder="מאפיין (למשל סוללה)" maxLength={80} />
            {errors.specs?.[index]?.label && <span className="field-error" role="alert">{errors.specs[index]?.label?.message}</span>}
          </div>
          <div>
            <input {...register(`specs.${index}.value`)} aria-label={"ערך מאפיין " + (index + 1)}
              aria-invalid={Boolean(errors.specs?.[index]?.value)} placeholder="ערך (למשל 48V/15.6Ah)" maxLength={240} />
            {errors.specs?.[index]?.value && <span className="field-error" role="alert">{errors.specs[index]?.value?.message}</span>}
          </div>
          <Button size="icon" variant="ghost" onClick={() => specs.remove(index)} aria-label={"מחיקת מאפיין " + (index + 1)}><Trash2 size={16} /></Button>
        </div>)}
      </div>
      <Button variant="outline" disabled={specs.fields.length >= 40}
        onClick={() => specs.append({ label: "", value: "" }, { focusName: "specs." + specs.fields.length + ".label" })}>
        <Plus size={17} /> הוספת מאפיין טכני
      </Button>
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

"use client";

import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, ClipboardList, Images, ListChecks, Plus, Trash2 } from "lucide-react";
import { newRequestId } from "@/lib/client-api";
import { delayStatuses, standardsInput, standardStatuses, type Standard, type StandardInput } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DeviceFields, Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: StandardInput = { device: "קורקינט חשמלי", model: "", status: "חדש", delay: "ללא עיכוב", delayReason: "", notes: "", tasks: [] };

export function StandardsForm({ record, models, cloud }: { record?: Standard; models: string[]; cloud: boolean }) {
  const { control, register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<StandardInput>({
    resolver: zodResolver(standardsInput), defaultValues: record ? standardsInput.parse(record) : defaults,
  });
  const tasks = useFieldArray({ name: "tasks", control, keyName: "fieldKey" });
  const values = useWatch({ name: "tasks", control });
  const delay = useWatch({ name: "delay", control });
  const photos = usePhotoDraft(record?.photos ?? []);
  const editor = useEditor("standards", record, isDirty, photos, cloud);
  const completed = values.filter((value) => value.done).length;
  const title = record ? "עריכת תיק תקינה" : "תיק מכון תקנים חדש";

  return <Editor module="standards" title={title} cancel={record ? "/standards/" + record.id : "/standards"}
    loading={isSubmitting || editor.leaving} error={editor.error} progress={editor.progress} onSubmit={handleSubmit(editor.save)}>
    <Section title="פרטי הכלי" icon={ClipboardList}>
      <div className="fields-grid"><DeviceFields device={register("device")} model={register("model")} models={models}
        deviceError={errors.device?.message} modelError={errors.model?.message} /></div>
    </Section>
    <Section title="מצב הטיפול" icon={ClipboardCheck}>
      <div className="fields-grid">
        <Field label="סטטוס טיפול" error={errors.status?.message}>{(props) => <select {...props} {...register("status")}>
          {standardStatuses.map((value) => <option key={value}>{value}</option>)}
        </select>}</Field>
        <Field label="סטטוס עיכוב" error={errors.delay?.message}>{(props) => <select {...props} {...register("delay")}>
          {delayStatuses.map((value) => <option key={value}>{value}</option>)}
        </select>}</Field>
        {delay === "מתעכב" && <Field label="סיבת עיכוב" error={errors.delayReason?.message} className="field-wide">
          {(props) => <textarea {...props} {...register("delayReason")} rows={2} maxLength={1000} required />}
        </Field>}
        <Field label="הערות" error={errors.notes?.message} className="field-wide">
          {(props) => <textarea {...props} {...register("notes")} rows={3} maxLength={4000} />}
        </Field>
      </div>
    </Section>
    <Section title="מה נשאר לעשות?" icon={ListChecks}>
      {values.length > 0 && <div className="checklist-progress" role="status">
        <progress max={values.length} value={completed} aria-label="התקדמות משימות" /><span>{completed} מתוך {values.length} משימות הושלמו</span>
      </div>}
      <div className="task-inputs">{tasks.fields.map((task, index) => <div className="task-edit" key={task.fieldKey}>
        <input type="checkbox" {...register(`tasks.${index}.done`)} aria-label={"סימון משימה " + (index + 1) + " כהושלמה"} />
        <div><input {...register(`tasks.${index}.title`)} aria-label={"שם משימה " + (index + 1)}
          aria-invalid={Boolean(errors.tasks?.[index]?.title)} placeholder="תיאור המשימה" maxLength={240} />
          {errors.tasks?.[index]?.title && <span className="field-error" role="alert">{errors.tasks[index]?.title?.message}</span>}</div>
        <Button size="icon" variant="ghost" onClick={() => tasks.remove(index)} aria-label={"מחיקת משימה " + (index + 1)}><Trash2 size={16} /></Button>
      </div>)}</div>
      <Button variant="outline" disabled={tasks.fields.length >= 100}
        onClick={() => tasks.append({ id: newRequestId(), title: "", done: false }, { focusName: "tasks." + tasks.fields.length + ".title" })}>
        <Plus size={17} /> הוספת משימה
      </Button>
    </Section>
    <Section title="תמונות" icon={Images}><PhotoPicker module="standards" id={record?.id} photos={photos} /></Section>
  </Editor>;
}

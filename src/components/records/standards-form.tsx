"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, ClipboardList, Images, ListChecks, Plus, Sparkles, Trash2 } from "lucide-react";
import { newRequestId } from "@/lib/client-api";
import {
  delayStatuses,
  standardsInput,
  standardStatuses,
  type CatalogModel,
  type Standard,
  type StandardInput,
} from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { useProtectedDelete } from "@/components/ui/delete-password-dialog";
import { Field } from "@/components/ui/field";
import { DeviceFields, Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: StandardInput = {
  number: "",
  device: "קורקינט חשמלי",
  model: "",
  status: "חדש",
  delay: "ללא עיכוב",
  delayReason: "",
  notes: "",
  tasks: [],
};

const QUICK_STANDARD_TASKS = [
  "קבלת מפרט ומסמכי יצרן",
  "בדיקת מעבדה פיזית לכלי",
  "בדיקת בלמים, תאורה ומחזירי אור",
  "תקינת סוללה ומטען",
  "מדבקות סימון והוראות בטיחות בעברית",
  "אישור סופי ממכון התקנים",
] as const;

function buildSuggestedStandardNumber(): string {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(1000 + (Date.now() % 9000)));
  return `CT-${year}-${suffix}`;
}

export function StandardsForm({
  record,
  models,
  catalog = [],
  initialModel,
  cloud,
}: {
  record?: Standard;
  models: string[];
  catalog?: CatalogModel[];
  initialModel?: CatalogModel;
  cloud: boolean;
}) {
  const [addedModels, setAddedModels] = useState<CatalogModel[]>([]);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<StandardInput>({
    resolver: zodResolver(standardsInput),
    defaultValues: record
      ? standardsInput.parse(record)
      : {
          ...defaults,
          device: initialModel?.device ?? defaults.device,
          model: initialModel?.name ?? defaults.model,
        },
  });
  const tasks = useFieldArray({ name: "tasks", control, keyName: "fieldKey" });
  const values = useWatch({ name: "tasks", control });
  const delay = useWatch({ name: "delay", control });
  const currentNumber = useWatch({ name: "number", control });
  const selectedDevice = useWatch({ name: "device", control });
  const selectedModel = useWatch({ name: "model", control });
  const photos = usePhotoDraft(record?.photos ?? [], { module: "standards", cloud });
  const editor = useEditor("standards", record, isDirty, photos, cloud);
  const { requestDelete, dialog: deleteDialog } = useProtectedDelete(editor.authorizeDelete);
  const savedTaskIds = new Set((record?.tasks ?? []).map((item) => item.id));
  const completed = values.filter((value) => value.done).length;
  const title = record ? "עריכת תיק תקינה" : "תיק מכון תקנים חדש";
  const allCatalog = [
    ...addedModels,
    ...catalog.filter((item) => !addedModels.some((added) => added.id === item.id)),
  ];
  const allModelNames = Array.from(new Set([...addedModels.map((item) => item.name), ...models]));

  function addQuickTask(taskTitle: string) {
    if (tasks.fields.length >= 100) return;
    if (values.some((t) => t.title.trim() === taskTitle)) return;
    tasks.append({ id: newRequestId(), title: taskTitle, done: false });
  }

  function addFullStandardChecklist() {
    const existingTitles = new Set(values.map((t) => t.title.trim()));
    for (const preset of QUICK_STANDARD_TASKS) {
      if (tasks.fields.length >= 100) break;
      if (!existingTitles.has(preset)) {
        tasks.append({ id: newRequestId(), title: preset, done: false });
      }
    }
  }

  return (
    <>
      {deleteDialog}
      <Editor
        module="standards"
        title={title}
        cancel={record ? "/standards/" + record.id : "/standards"}
        loading={isSubmitting || editor.leaving || photos.processing}
        error={editor.error}
        progress={editor.progress}
        unsaved={editor.unsaved}
        onSubmit={handleSubmit(editor.save)}
      >
        <Section title="פרטי הכלי" icon={ClipboardList}>
          <div className="fields-grid">
            <div>
              <Field label="מספר תיק" error={errors.number?.message}>
                {(props) => (
                  <input
                    {...props}
                    {...register("number")}
                    placeholder="למשל CT-2026-0105"
                    maxLength={120}
                    required
                    dir="auto"
                  />
                )}
              </Field>
              {!record && !currentNumber?.trim() && (
                <button
                  type="button"
                  className="quick-chip is-accent mt-1.5"
                  onClick={() =>
                    setValue("number", buildSuggestedStandardNumber(), {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <Sparkles size={13} aria-hidden /> מילוי מספר תיק אוטומטי
                </button>
              )}
            </div>
            <DeviceFields
              device={register("device")}
              model={register("model")}
              models={allModelNames}
              catalog={allCatalog}
              selectedDevice={selectedDevice}
              selectedModel={selectedModel}
              onModelCreated={(created) => {
                setAddedModels((items) => [...items, created]);
                setValue("device", created.device, { shouldDirty: true, shouldValidate: true });
                setValue("model", created.name, { shouldDirty: true, shouldValidate: true });
              }}
              onModelSelected={(picked) => {
                setValue("device", picked.device, { shouldDirty: true, shouldValidate: true });
                if (selectedModel !== picked.name) {
                  setValue("model", picked.name, { shouldDirty: true, shouldValidate: true });
                }
              }}
              deviceError={errors.device?.message}
              modelError={errors.model?.message}
            />
          </div>
        </Section>
        <Section title="מצב הטיפול" icon={ClipboardCheck}>
          <div className="fields-grid">
            <Field label="סטטוס טיפול" error={errors.status?.message}>
              {(props) => (
                <select {...props} {...register("status")}>
                  {standardStatuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="סטטוס עיכוב" error={errors.delay?.message}>
              {(props) => (
                <select {...props} {...register("delay")}>
                  {delayStatuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              )}
            </Field>
            {delay === "מתעכב" && (
              <Field label="סיבת עיכוב" error={errors.delayReason?.message} className="field-wide">
                {(props) => (
                  <textarea {...props} {...register("delayReason")} rows={2} maxLength={1000} required />
                )}
              </Field>
            )}
            <Field label="הערות" error={errors.notes?.message} className="field-wide">
              {(props) => <textarea {...props} {...register("notes")} rows={3} maxLength={4000} />}
            </Field>
          </div>
        </Section>
        <Section title="מה נשאר לעשות?" icon={ListChecks}>
          <div className="quick-chips-header">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span>הוספה מהירה של שלבי תקינה בלחיצה:</span>
              <button
                type="button"
                className="quick-chip is-accent"
                onClick={addFullStandardChecklist}
              >
                <Sparkles size={13} aria-hidden /> הוספת סט תקינה מומלץ (6 שלבים)
              </button>
            </div>
            <div className="quick-chips-row">
              {QUICK_STANDARD_TASKS.map((preset) => {
                const exists = values.some((t) => t.title.trim() === preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={exists}
                    className={"quick-chip" + (exists ? " is-selected" : "")}
                    onClick={() => addQuickTask(preset)}
                  >
                    + {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {values.length > 0 && (
            <div className="checklist-progress" role="status">
              <progress max={values.length} value={completed} aria-label="התקדמות משימות" />
              <span>
                {completed} מתוך {values.length} משימות הושלמו
              </span>
            </div>
          )}
          <div className="task-inputs">
            {tasks.fields.map((task, index) => (
              <div className="task-edit" key={task.fieldKey}>
                <input
                  type="checkbox"
                  {...register(`tasks.${index}.done`)}
                  aria-label={"סימון משימה " + (index + 1) + " כהושלמה"}
                />
                <div>
                  <input
                    {...register(`tasks.${index}.title`)}
                    aria-label={"שם משימה " + (index + 1)}
                    aria-invalid={Boolean(errors.tasks?.[index]?.title)}
                    placeholder="תיאור המשימה"
                    maxLength={240}
                  />
                  {errors.tasks?.[index]?.title && (
                    <span className="field-error" role="alert">
                      {errors.tasks[index]?.title?.message}
                    </span>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={"מחיקת משימה " + (index + 1)}
                  onClick={() => {
                    const id = values[index]?.id;
                    if (id && savedTaskIds.has(id)) {
                      requestDelete(`למחוק את משימה ${index + 1}? יש להזין סיסמת מחיקה.`, () =>
                        tasks.remove(index),
                      );
                    } else {
                      tasks.remove(index);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={tasks.fields.length >= 100}
            onClick={() =>
              tasks.append(
                { id: newRequestId(), title: "", done: false },
                { focusName: "tasks." + tasks.fields.length + ".title" },
              )
            }
          >
            <Plus size={17} /> הוספת משימה
          </Button>
        </Section>
        <Section title="תמונות" icon={Images}>
          <PhotoPicker
            module="standards"
            id={record?.id}
            photos={photos}
            onAuthorizeDelete={editor.authorizeDelete}
          />
        </Section>
      </Editor>
    </>
  );
}

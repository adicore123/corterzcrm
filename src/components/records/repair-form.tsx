"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Images, Wrench } from "lucide-react";
import { repairInput, repairStatuses, type CatalogModel, type Customer, type Repair, type RepairInput } from "@/lib/validation/models";
import { Field } from "@/components/ui/field";
import { InlineCustomer } from "./customer-form";
import { DeviceFields, Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: RepairInput = { device: "קורקינט חשמלי", model: "", serial: "", customerId: "", fault: "", work: "", status: "התקבל" };

export function RepairForm({ record, models, catalog = [], initialModel, customers, customerId, cloud }: {
  record?: Repair; models: string[]; catalog?: CatalogModel[]; initialModel?: CatalogModel; customers: Customer[]; customerId?: string; cloud: boolean;
}) {
  const [added, setAdded] = useState<Customer[]>([]);
  const [addedModels, setAddedModels] = useState<CatalogModel[]>([]);
  const { control, register, handleSubmit, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<RepairInput>({
    resolver: zodResolver(repairInput),
    defaultValues: record ?? {
      ...defaults,
      customerId: customerId ?? "",
      device: initialModel?.device ?? defaults.device,
      model: initialModel?.name ?? defaults.model,
    },
  });
  const selectedDevice = useWatch({ name: "device", control });
  const selectedModel = useWatch({ name: "model", control });
  const selectedCustomerId = useWatch({ name: "customerId", control });
  const photos = usePhotoDraft(record?.photos ?? []);
  const editor = useEditor("repairs", record, isDirty, photos, cloud);
  const allCatalog = [...addedModels, ...catalog.filter((item) => !addedModels.some((addedItem) => addedItem.id === item.id))];
  const allModelNames = Array.from(new Set([...addedModels.map((item) => item.name), ...models]));

  return <Editor module="repairs" title={record ? "עריכת תיקון" : "תיקון חדש"} cancel={record ? "/repairs/" + record.id : "/repairs"}
    loading={isSubmitting || editor.leaving || photos.processing} error={editor.error} progress={editor.progress} unsaved={editor.unsaved}
    onSubmit={handleSubmit(editor.save)}>
    <Section title="כלי ולקוח" icon={ClipboardList}>
      <div className="fields-grid">
        <DeviceFields device={register("device")} model={register("model")} models={allModelNames}
          catalog={allCatalog} selectedDevice={selectedDevice} selectedModel={selectedModel}
          onModelCreated={(created) => {
            setAddedModels((items) => [...items, created]);
            setValue("device", created.device, { shouldDirty: true, shouldValidate: true });
            setValue("model", created.name, { shouldDirty: true, shouldValidate: true });
          }}
          onModelSelected={(picked) => {
            setValue("device", picked.device, { shouldDirty: true, shouldValidate: true });
            if (selectedModel !== picked.name) setValue("model", picked.name, { shouldDirty: true, shouldValidate: true });
          }}
          deviceError={errors.device?.message} modelError={errors.model?.message} />
        <Field label="מספר סידורי של הכלי" error={errors.serial?.message}>{(props) =>
          <input {...props} {...register("serial")} dir="auto" autoCapitalize="none" spellCheck={false} maxLength={120} required />
        }</Field>
        <Field label="לקוח" error={errors.customerId && "יש לבחור לקוח."}>{(props) => <div className="customer-control">
          <Controller name="customerId" control={control} render={({ field }) => <select {...props} {...field} required>
            <option value="">בחירת לקוח</option>
            {[...added, ...customers.filter((item) => !added.some((customer) => customer.id === item.id))].map((customer) =>
              <option key={customer.id} value={customer.id}>{customer.name}{customer.store ? " · " + customer.store : ""} · {customer.customerType === "private" ? "לקוח פרטי" : customer.customerType === "store" ? "חנות" : "סוג לקוח לבירור"} · {customer.phone}</option>)}
          </select>} />
          <InlineCustomer onSave={(customer) => {
            setAdded((items) => [...items, customer]);
            setValue("customerId", customer.id, { shouldDirty: true, shouldValidate: true });
          }} />
        </div>}</Field>
        {selectedCustomerId && <p className="muted">סוג לקוח: {([...added, ...customers].find((item) => item.id === selectedCustomerId)?.customerType === "private") ? "לקוח פרטי" : ([...added, ...customers].find((item) => item.id === selectedCustomerId)?.customerType === "store") ? "חנות" : "לבירור"}</p>}
      </div>
    </Section>
    <Section title="פרטי תיקון" icon={Wrench}>
      <div className="fields-grid">
        <Field label="סטטוס תיקון" error={errors.status?.message}>{(props) => <select {...props} {...register("status")}>
          {repairStatuses.map((value) => <option key={value}>{value}</option>)}
        </select>}</Field>
        <Field label="מה התקלה?" error={errors.fault?.message} className="field-wide">
          {(props) => <textarea {...props} {...register("fault")} rows={3} maxLength={4000} required />}
        </Field>
        <Field label="מה תוקן?" error={errors.work?.message} className="field-wide">
          {(props) => <textarea {...props} {...register("work")} rows={3} maxLength={4000} />}
        </Field>
      </div>
    </Section>
    <Section title="תמונות" icon={Images}><PhotoPicker module="repairs" id={record?.id} photos={photos} onAuthorizeDelete={editor.authorizeDelete} /></Section>
  </Editor>;
}

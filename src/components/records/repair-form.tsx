"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ClipboardList, Images, Search, Sparkles, Wrench, X } from "lucide-react";
import {
  repairInput,
  repairStatuses,
  type CatalogModel,
  type Customer,
  type Device,
  type Repair,
  type RepairInput,
} from "@/lib/validation/models";
import { Field } from "@/components/ui/field";
import { InlineCustomer } from "./customer-form";
import { DeviceFields, Editor, Section } from "./form-parts";
import { PhotoPicker } from "./photos";
import { useEditor, usePhotoDraft } from "./use-editor";

const defaults: RepairInput = {
  device: "קורקינט חשמלי",
  model: "",
  serial: "",
  customerId: "",
  fault: "",
  work: "",
  status: "התקבל",
};

const QUICK_FAULT_CHIPS = [
  "סוללה לא נטענת / נפילת מתח",
  "תקלה בבקר / אינו נדלק",
  "רעש או נתק במנוע",
  "בלמים חלשים / החלפת רפידות",
  "פנצ׳ר / החלפת צמיג",
  "תקלה בצג / קוד שגיאה",
  "חופש במנגנון קיפול / כידון",
  "ידית גז לא מגיבה",
] as const;

const QUICK_WORK_CHIPS = [
  "בוצע אבחון מעבדה ובדיקה מקיפה",
  "הוחלף בקר ונבדקה נסיעה תקינה",
  "הוחלפה פנימית / צמיג ונופח לחץ תקין",
  "בוצע כיוון בלמים והחלפת רפידות",
  "תוקן חיווט וחוזקו מחברים",
  "נבדקה טעינה ותקינות סוללה תחת עומס",
  "חוזק כידון ומנגנון קיפול",
] as const;

export type CustomerPastVehicle = {
  customerId: string;
  device: Device;
  model: string;
  serial: string;
};

function appendChipText(current: string, snippet: string): string {
  const trimmed = (current ?? "").trim();
  if (!trimmed) return snippet;
  if (trimmed.includes(snippet)) return trimmed;
  return `${trimmed} · ${snippet}`;
}

export function RepairForm({
  record,
  models,
  catalog = [],
  initialModel,
  customers,
  customerVehicles = [],
  customerId,
  cloud,
}: {
  record?: Repair;
  models: string[];
  catalog?: CatalogModel[];
  initialModel?: CatalogModel;
  customers: Customer[];
  customerVehicles?: CustomerPastVehicle[];
  customerId?: string;
  cloud: boolean;
}) {
  const [added, setAdded] = useState<Customer[]>([]);
  const [addedModels, setAddedModels] = useState<CatalogModel[]>([]);
  const [custQuery, setCustQuery] = useState("");
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<RepairInput>({
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
  const currentFault = useWatch({ name: "fault", control });
  const currentWork = useWatch({ name: "work", control });
  const photos = usePhotoDraft(record?.photos ?? [], { module: "repairs", cloud });
  const editor = useEditor("repairs", record, isDirty, photos, cloud);

  const allCustomers = useMemo(
    () => [...added, ...customers.filter((item) => !added.some((c) => c.id === item.id))],
    [added, customers],
  );
  const selectedCustomer = useMemo(
    () => allCustomers.find((item) => item.id === selectedCustomerId),
    [allCustomers, selectedCustomerId],
  );

  const quickCustomerMatches = useMemo(() => {
    const clean = custQuery.trim().toLocaleLowerCase("he");
    if (!clean) return [];
    const digits = clean.replace(/\D/g, "");
    return allCustomers
      .filter((c) => {
        if (
          c.name.toLocaleLowerCase("he").includes(clean)
          || c.store.toLocaleLowerCase("he").includes(clean)
          || c.phone.includes(clean)
        ) {
          return true;
        }
        return digits.length >= 2 && c.phone.replace(/\D/g, "").includes(digits);
      })
      .slice(0, 6);
  }, [allCustomers, custQuery]);

  const pastToolsForCustomer = useMemo(() => {
    if (!selectedCustomerId) return [];
    const seen = new Set<string>();
    const out: CustomerPastVehicle[] = [];
    for (const v of customerVehicles) {
      if (v.customerId !== selectedCustomerId) continue;
      const key = `${v.model}|${v.serial}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= 3) break;
    }
    return out;
  }, [customerVehicles, selectedCustomerId]);

  const allCatalog = [
    ...addedModels,
    ...catalog.filter((item) => !addedModels.some((addedItem) => addedItem.id === item.id)),
  ];
  const allModelNames = Array.from(new Set([...addedModels.map((item) => item.name), ...models]));

  return (
    <Editor
      module="repairs"
      title={record ? "עריכת תיקון" : "תיקון חדש"}
      cancel={record ? "/repairs/" + record.id : "/repairs"}
      loading={isSubmitting || editor.leaving || photos.processing}
      error={editor.error}
      progress={editor.progress}
      unsaved={editor.unsaved}
      onSubmit={handleSubmit(editor.save)}
    >
      <Section title="לקוח וכלי" icon={ClipboardList}>
        <div className="fields-grid">
          <div className="field field-wide smart-customer-box">
            <div className="smart-search-row">
              <div className="search-field">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  value={custQuery}
                  onChange={(e) => setCustQuery(e.target.value)}
                  placeholder="חיפוש מהיר של לקוח לפי שם, שם חנות או טלפון…"
                  aria-label="חיפוש מהיר של לקוח קיים"
                />
                {custQuery && (
                  <button
                    type="button"
                    className="inline-clear-btn"
                    onClick={() => setCustQuery("")}
                    aria-label="ניקוי חיפוש לקוח"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {quickCustomerMatches.length > 0 && (
              <div className="smart-customer-pills" role="listbox" aria-label="תוצאות חיפוש לקוחות">
                {quickCustomerMatches.map((cust) => {
                  const isPicked = cust.id === selectedCustomerId;
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      className={"smart-customer-pill" + (isPicked ? " is-selected" : "")}
                      onClick={() => {
                        setValue("customerId", cust.id, { shouldDirty: true, shouldValidate: true });
                        setCustQuery("");
                      }}
                    >
                      {isPicked && <Check size={14} aria-hidden />}
                      <strong>{cust.name}</strong>
                      {cust.store && <span>· {cust.store}</span>}
                      <bdi dir="ltr" className="muted">
                        {cust.phone}
                      </bdi>
                    </button>
                  );
                })}
              </div>
            )}

            <Field label="לקוח" error={errors.customerId && "יש לבחור לקוח."}>
              {(props) => (
                <div className="customer-control">
                  <Controller
                    name="customerId"
                    control={control}
                    render={({ field }) => (
                      <select {...props} {...field} required>
                        <option value="">בחירת לקוח מהרשימה ({allCustomers.length})</option>
                        {allCustomers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                            {customer.store ? " · " + customer.store : ""} ·{" "}
                            {customer.customerType === "private"
                              ? "לקוח פרטי"
                              : customer.customerType === "store"
                                ? "חנות"
                                : "סוג לקוח לבירור"}{" "}
                            · {customer.phone}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  <InlineCustomer
                    onSave={(customer) => {
                      setAdded((items) => [...items, customer]);
                      setValue("customerId", customer.id, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                </div>
              )}
            </Field>

            {selectedCustomer && (
              <div className="selected-customer-banner">
                <span>
                  נבחר: <strong>{selectedCustomer.name}</strong>
                  {selectedCustomer.store ? ` · ${selectedCustomer.store}` : ""} ·{" "}
                  {selectedCustomer.customerType === "private"
                    ? "לקוח פרטי"
                    : selectedCustomer.customerType === "store"
                      ? "חנות"
                      : "לבירור"}{" "}
                  · <bdi dir="ltr">{selectedCustomer.phone}</bdi>
                </span>
              </div>
            )}

            {!record && pastToolsForCustomer.length > 0 && (
              <div className="past-vehicle-banner">
                <span className="past-vehicle-label">
                  <Sparkles size={15} aria-hidden /> כלים קודמים של לקוח זה — לחצו למילוי אוטומטי:
                </span>
                <div className="quick-chips-row">
                  {pastToolsForCustomer.map((tool) => (
                    <button
                      key={`${tool.model}-${tool.serial}`}
                      type="button"
                      className="quick-chip is-accent"
                      onClick={() => {
                        setValue("device", tool.device, { shouldDirty: true, shouldValidate: true });
                        setValue("model", tool.model, { shouldDirty: true, shouldValidate: true });
                        setValue("serial", tool.serial, { shouldDirty: true, shouldValidate: true });
                      }}
                    >
                      {tool.model} · סידורי <bdi dir="ltr">{tool.serial}</bdi>
                    </button>
                  ))}
                </div>
              </div>
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
          <Field label="מספר סידורי של הכלי" error={errors.serial?.message}>
            {(props) => (
              <input
                {...props}
                {...register("serial")}
                dir="auto"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="הזינו מספר שלדה / סידורי"
                maxLength={120}
                required
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="פרטי תיקון (לחיצה מהירה או הקלדה)" icon={Wrench}>
        <div className="fields-grid">
          <Field label="סטטוס תיקון" error={errors.status?.message}>
            {(props) => (
              <select {...props} {...register("status")}>
                {repairStatuses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            )}
          </Field>

          <div className="field field-wide">
            <div className="quick-chips-header">
              <span>תגיות תקלה נפוצות בלחיצה:</span>
              <div className="quick-chips-row">
                {QUICK_FAULT_CHIPS.map((chip) => {
                  const active = (currentFault ?? "").includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={"quick-chip" + (active ? " is-selected" : "")}
                      onClick={() =>
                        setValue("fault", appendChipText(getValues("fault"), chip), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      + {chip}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="מה התקלה?" error={errors.fault?.message} className="field-wide">
              {(props) => (
                <textarea
                  {...props}
                  {...register("fault")}
                  rows={3}
                  placeholder="תארו את התקלה או לחצו על התגיות המוכנות למעלה…"
                  maxLength={4000}
                  required
                />
              )}
            </Field>
          </div>

          <div className="field field-wide">
            <div className="quick-chips-header">
              <span>תגיות תיעוד תיקון בלחיצה:</span>
              <div className="quick-chips-row">
                {QUICK_WORK_CHIPS.map((chip) => {
                  const active = (currentWork ?? "").includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={"quick-chip" + (active ? " is-selected" : "")}
                      onClick={() =>
                        setValue("work", appendChipText(getValues("work"), chip), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      + {chip}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="מה תוקן?" error={errors.work?.message} className="field-wide">
              {(props) => (
                <textarea
                  {...props}
                  {...register("work")}
                  rows={3}
                  placeholder="מה בוצע בתיקון? (יופיע גם בהודעת הוואטסאפ ללקוח כשהכלי מוכן)"
                  maxLength={4000}
                />
              )}
            </Field>
          </div>
        </div>
      </Section>
      <Section title="תמונות" icon={Images}>
        <PhotoPicker
          module="repairs"
          id={record?.id}
          photos={photos}
          onAuthorizeDelete={editor.authorizeDelete}
        />
      </Section>
    </Editor>
  );
}

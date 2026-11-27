"use client";

import { useEffect, useId, useState, type FormEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bike, LayoutGrid, Save, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { labels } from "@/lib/presentation";
import { devices, type CatalogModel, type Device, type Module } from "@/lib/validation/models";
import type { UseFormRegisterReturn } from "react-hook-form";
import { InlineModel } from "./model-form";
import type { UnsavedState } from "./use-editor";

export function modelImageSrc(model?: Pick<CatalogModel, "id" | "imageUrl" | "photos">) {
  if (!model) return undefined;
  if (model.photos.length > 0) return "/api/images/models/" + model.id + "/" + model.photos[0].id;
  const raw = model.imageUrl || undefined;
  if (raw && raw.startsWith("https://cortez.co.il/wp-content/uploads/")) {
    return `/api/catalog-image?url=${encodeURIComponent(raw)}&w=160`;
  }
  return raw;
}

export function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return <section className="card editor-section">
    <h2><span className="section-icon"><Icon size={18} aria-hidden /></span>{title}</h2>
    {children}
  </section>;
}

export function Editor({ module, title, cancel, loading, error, progress, unsaved, onSubmit, children }: {
  module: Module; title: string; cancel: string; loading: boolean; error: string;
  progress: number | null; unsaved?: UnsavedState; onSubmit: FormEventHandler<HTMLFormElement>; children: ReactNode;
}) {
  return <>
    <Link className="back-link" href={cancel}><ArrowRight size={16} aria-hidden />{labels[module]}</Link>
    <div className="page-title"><h1>{title}</h1></div>
    <form className="editor" noValidate onSubmit={onSubmit} aria-busy={loading}>
      <fieldset className="editor-fields" disabled={loading}>{children}</fieldset>
      {progress !== null && <div className="upload-progress card" role="status">
        <label htmlFor="upload-progress">{progress < 100 ? "מעלה קבצים ותמונות…" : "שומר את הרשומה…"}</label>
        <progress id="upload-progress" value={progress} max={100} /><bdi>{progress}%</bdi>
      </div>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="form-actions">
        <Button type="submit" disabled={loading}><Save size={17} aria-hidden />{loading ? "שומר…" : "שמירה"}</Button>
        <Button asChild variant="outline"><Link href={cancel}>ביטול</Link></Button>
      </div>
    </form>
    {unsaved && <UnsavedDialog open={unsaved.promptOpen} onConfirm={unsaved.confirmLeave} onCancel={unsaved.cancelLeave} description={unsaved.message} />}
  </>;
}

export function DeviceFields({
  model, device, models, catalog, selectedDevice, selectedModel, onModelCreated, onModelSelected, modelError, deviceError,
}: {
  model: UseFormRegisterReturn; device: UseFormRegisterReturn; models: string[];
  catalog?: CatalogModel[]; selectedDevice?: Device; selectedModel?: string;
  onModelCreated?: (created: CatalogModel) => void;
  onModelSelected?: (picked: CatalogModel) => void;
  modelError?: string; deviceError?: string;
}) {
  const list = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterDevice, setFilterDevice] = useState<string>("");
  const matchingCatalog = catalog?.filter((item) => !selectedDevice || item.device === selectedDevice) ?? [];
  const options = matchingCatalog.length > 0
    ? Array.from(new Set([...matchingCatalog.map((item) => item.name), ...models.filter((name) => !catalog?.some((c) => c.name === name))]))
    : models;
  const activeModel = catalog?.find((item) => item.name.toLocaleLowerCase("he") === (selectedModel ?? "").trim().toLocaleLowerCase("he"));
  const thumb = modelImageSrc(activeModel);

  useEffect(() => {
    if (activeModel && selectedDevice && activeModel.device !== selectedDevice && onModelSelected) {
      onModelSelected(activeModel);
    }
  }, [activeModel, selectedDevice, onModelSelected]);

  const pickerItems = (catalog ?? []).filter((item) => {
    const targetDevice = filterDevice || selectedDevice || "";
    if (targetDevice && targetDevice !== "all" && item.device !== targetDevice) return false;
    const q = query.trim().toLocaleLowerCase("he");
    if (!q) return true;
    return item.name.toLocaleLowerCase("he").includes(q) || item.device.toLocaleLowerCase("he").includes(q);
  });

  return <>
    <Field label="סוג מכשיר" error={deviceError}>{(props) =>
      <select {...props} {...device} required>{devices.map((item) => <option key={item}>{item}</option>)}</select>
    }</Field>
    <Field label="שם הדגם" error={modelError}>{(props) =>
      <div className={onModelCreated ? "customer-control" : undefined}>
        <div>
          <input {...props} {...model} placeholder="בחירה ממאגר הדגמים או הזנת דגם" list={list} maxLength={120} required />
          <datalist id={list}>{options.map((item) => <option key={item} value={item} />)}</datalist>
          {activeModel && <div className="selected-model-chip">
            {thumb && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={thumb} alt="" aria-hidden className="model-chip-thumb" loading="lazy" />
            )}
            <span><strong>{activeModel.name}</strong> · {activeModel.device}</span>
          </div>}
        </div>
        <div className="inline-model-actions">
          {catalog && catalog.length > 0 && onModelSelected && (
            <Modal open={pickerOpen} onOpenChange={(next) => {
              setPickerOpen(next);
              if (next) { setQuery(""); setFilterDevice(selectedDevice ?? ""); }
            }} title="בחירת דגם ממאגר קורטז" description="בחרו דגם מהקטלוג או סננו לפי סוג כלי" className="catalog-picker-modal"
              trigger={<Button variant="outline" title="בחירה ויזואלית ממאגר הדגמים"><LayoutGrid size={16} /> קטלוג</Button>}>
              <div className="catalog-picker-toolbar">
                <div className="search-field">
                  <Search size={17} aria-hidden />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="חיפוש דגם..." aria-label="חיפוש דגם בקטלוג" />
                </div>
                <select value={filterDevice || "all"} onChange={(e) => setFilterDevice(e.target.value)} aria-label="סינון קטלוג לפי סוג כלי">
                  <option value="all">כל הכלים</option>
                  {devices.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="catalog-picker-grid">
                {pickerItems.map((item) => {
                  const src = modelImageSrc(item);
                  const selected = activeModel?.id === item.id;
                  return <button key={item.id} type="button" className={"catalog-picker-card" + (selected ? " is-selected" : "")}
                    onClick={() => { onModelSelected(item); setPickerOpen(false); }}>
                    {src ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={src} alt="" aria-hidden className="catalog-picker-img" loading="lazy" />
                    ) : <span className="catalog-picker-img model-thumb-empty" aria-hidden><Bike size={22} /></span>}
                    <strong>{item.name}</strong>
                    <small className="muted">{item.device}</small>
                  </button>;
                })}
                {pickerItems.length === 0 && <p className="muted">לא נמצאו דגמים תואמים.</p>}
              </div>
            </Modal>
          )}
          {onModelCreated && <InlineModel defaultDevice={selectedDevice} onSave={onModelCreated} />}
        </div>
      </div>
    }</Field>
  </>;
}

export function CustomerFields({ name, store, phone, customerType, selectedCustomerType, errors }: {
  name: UseFormRegisterReturn; store: UseFormRegisterReturn; phone: UseFormRegisterReturn; customerType: UseFormRegisterReturn;
  selectedCustomerType?: "private" | "store";
  errors: { name?: { message?: string }; store?: { message?: string }; phone?: { message?: string }; customerType?: { message?: string } };
}) {
  return <>
    <Field label="סוג לקוח" error={errors.customerType?.message}>{(props) => <select {...props} {...customerType} required>
      <option value="">בחירת סוג לקוח</option><option value="private">לקוח פרטי</option><option value="store">חנות</option>
    </select>}</Field>
    <Field label="שם לקוח" error={errors.name?.message}>{(props) => <input {...props} {...name} autoComplete="name" maxLength={120} required />}</Field>
    {selectedCustomerType === "store" && <Field label="שם החנות" error={errors.store?.message}>
      {(props) => <input {...props} {...store} autoComplete="organization" maxLength={120} />}
    </Field>}
    <Field label="מספר טלפון" error={errors.phone?.message}>{(props) => <input {...props} {...phone} type="tel" dir="ltr" autoComplete="tel" maxLength={32} required />}</Field>
  </>;
}

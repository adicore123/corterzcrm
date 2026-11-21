"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Save, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnsavedDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { labels } from "@/lib/presentation";
import { devices, type CatalogModel, type Device, type Module } from "@/lib/validation/models";
import type { UseFormRegisterReturn } from "react-hook-form";
import { InlineModel } from "./model-form";
import type { UnsavedState } from "./use-editor";

export function modelImageSrc(model?: Pick<CatalogModel, "id" | "imageUrl" | "photos">) {
  if (!model) return undefined;
  if (model.photos.length > 0) return "/api/images/models/" + model.id + "/" + model.photos[0].id;
  return model.imageUrl || undefined;
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
        <label htmlFor="upload-progress">{progress < 100 ? "מעלה תמונות…" : "שומר את הרשומה…"}</label>
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
  model, device, models, catalog, selectedDevice, selectedModel, onModelCreated, modelError, deviceError,
}: {
  model: UseFormRegisterReturn; device: UseFormRegisterReturn; models: string[];
  catalog?: CatalogModel[]; selectedDevice?: Device; selectedModel?: string;
  onModelCreated?: (created: CatalogModel) => void; modelError?: string; deviceError?: string;
}) {
  const list = useId();
  const matchingCatalog = catalog?.filter((item) => !selectedDevice || item.device === selectedDevice) ?? [];
  const options = matchingCatalog.length > 0
    ? Array.from(new Set([...matchingCatalog.map((item) => item.name), ...models.filter((name) => !catalog?.some((c) => c.name === name))]))
    : models;
  const activeModel = catalog?.find((item) => item.name.toLocaleLowerCase("he") === (selectedModel ?? "").trim().toLocaleLowerCase("he"));
  const thumb = modelImageSrc(activeModel);

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
        {onModelCreated && <InlineModel defaultDevice={selectedDevice} onSave={onModelCreated} />}
      </div>
    }</Field>
  </>;
}

export function CustomerFields({ name, store, phone, errors }: {
  name: UseFormRegisterReturn; store: UseFormRegisterReturn; phone: UseFormRegisterReturn;
  errors: { name?: { message?: string }; store?: { message?: string }; phone?: { message?: string } };
}) {
  return <>
    <Field label="שם לקוח" error={errors.name?.message}>{(props) => <input {...props} {...name} autoComplete="name" maxLength={120} required />}</Field>
    <Field label="שם החנות" error={errors.store?.message}>{(props) => <input {...props} {...store} autoComplete="organization" maxLength={120} />}</Field>
    <Field label="מספר טלפון" error={errors.phone?.message}>{(props) => <input {...props} {...phone} type="tel" dir="ltr" autoComplete="tel" maxLength={32} required />}</Field>
  </>;
}

"use client";

import { useId, useState } from "react";
import { Camera, ImagePlus, Images, X } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { useProtectedDelete } from "@/components/ui/delete-password-dialog";
import type { Photo, PhotoModule } from "@/lib/validation/models";
import type { PhotoDraft } from "./use-editor";

const accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*";
const urlFor = (module: PhotoModule, recordId: string, photoId: string) => "/api/images/" + module + "/" + recordId + "/" + photoId;

function PhotoPreview({ url, label, name }: { url: string; label: string; name: string }) {
  const [open, setOpen] = useState(false);
  return <Modal open={open} onOpenChange={setOpen} title={label} description={name} className="photo-modal"
    trigger={<button type="button" className="photo-preview" aria-label={label}>
      {/* Authenticated image routes and blob previews load directly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} loading="lazy" />
    </button>}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="photo-full" src={url} alt={label} />
  </Modal>;
}

export function PhotoGallery({ module, photos, id }: { module: PhotoModule; photos: Photo[]; id: string }) {
  if (!photos.length) return <p className="muted gallery-empty"><Images size={18} /> אין תמונות מצורפות.</p>;
  return <div className="photo-grid">{photos.map((photo, index) => <PhotoPreview key={photo.id} name={photo.name}
    url={urlFor(module, id, photo.id)} label={"תמונה " + (index + 1)} />)}</div>;
}

export function PhotoPicker({ module, id, photos, onAuthorizeDelete, canDelete = true }: {
  module: PhotoModule; id?: string; photos: PhotoDraft; onAuthorizeDelete?: (password: string) => void; canDelete?: boolean;
}) {
  const gallery = useId();
  const camera = useId();
  const { requestDelete, dialog } = useProtectedDelete(onAuthorizeDelete);
  const count = photos.kept.length + photos.pending.length;
  return <>
    {dialog}
    <div className="upload-zone">
      <span className="upload-mark"><Images size={22} aria-hidden /></span>
      <div className="upload-copy"><strong>תמונות מצורפות</strong><span>עד 10 תמונות · תומך גם ב־HEIC מ־Samsung ו־iPhone (עד 20 מ״ב)</span></div>
      <div className="upload-controls">
        <div className="upload-option">
          <input type="file" id={gallery} className="sr-only" accept={accept} multiple disabled={count >= 10}
            onChange={async (event) => {
              const input = event.currentTarget;
              const selected = Array.from(input.files ?? []);
              if (selected.length) await photos.add(selected, false);
              input.value = "";
            }} />
          <label className="button button-outline" htmlFor={gallery}><ImagePlus size={17} /> בחירת תמונות</label>
        </div>
        <div className="upload-option">
          <input type="file" id={camera} className="sr-only" accept="image/*" capture="environment" disabled={count >= 10}
            onChange={async (event) => {
              const input = event.currentTarget;
              const selected = Array.from(input.files ?? []);
              if (selected.length) await photos.add(selected, true);
              input.value = "";
            }} />
          <label className="button button-outline" htmlFor={camera}><Camera size={17} /> צילום תמונה</label>
        </div>
      </div>
    </div>
    {photos.processing && <p className="muted" role="status">מעבד ודוחס תמונות…</p>}
    {photos.error && <p className="error-message" role="alert">{photos.error}</p>}
    {count > 0 && <div className="photo-grid">
      {id && photos.kept.map((photo, index) => <div className="photo-item" key={photo.id}>
        <PhotoPreview url={urlFor(module, id, photo.id)} label={"תמונה " + (index + 1)} name={photo.name} />
        {canDelete && <button className="photo-remove" type="button" aria-label={"הסרת תמונה " + (index + 1)}
          onClick={() => {
            if (onAuthorizeDelete) {
              requestDelete(`להסיר את תמונה ${index + 1}? יש להזין סיסמת מחיקה.`, () => photos.removeSaved(photo.id));
            } else {
              photos.removeSaved(photo.id);
            }
          }}><X size={16} /></button>}
      </div>)}
      {photos.pending.map((photo, index) => {
        const number = photos.kept.length + index + 1;
        return <div className="photo-item" key={photo.preview}>
          {photo.needsServerDecode ? (
            <div className="photo-preview photo-heic-pending" aria-label={"תמונה " + number}>
              <Images size={24} aria-hidden />
              <strong>HEIC</strong>
              <span>{photo.uploadStatus === "uploaded" ? "מוכן ✓" : photo.uploadStatus === "uploading" ? "מעלה…" : "יומר בשמירה"}</span>
            </div>
          ) : (
            <PhotoPreview url={photo.preview} label={"תמונה " + number} name={photo.file.name} />
          )}
          {photo.uploadStatus === "uploading" && <span className="photo-stage-badge is-uploading" aria-hidden>מעלה…</span>}
          {photo.uploadStatus === "uploaded" && <span className="photo-stage-badge is-ready" aria-hidden>מוכן ✓</span>}
          <button className="photo-remove" type="button" aria-label={"הסרת תמונה " + number} onClick={() => photos.removePreview(photo.preview)}><X size={16} /></button>
        </div>;
      })}
    </div>}
  </>;
}

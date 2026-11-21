"use client";

import { useId, useState } from "react";
import { Camera, ImagePlus, Images, X } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import type { Photo, PhotoModule } from "@/lib/validation/models";
import type { PhotoDraft } from "./use-editor";

const accept = "image/jpeg,image/png,image/webp";
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

export function PhotoPicker({ module, id, photos }: { module: PhotoModule; id?: string; photos: PhotoDraft }) {
  const gallery = useId();
  const camera = useId();
  const count = photos.kept.length + photos.pending.length;
  return <>
    <div className="upload-zone">
      <span className="upload-mark"><Images size={22} aria-hidden /></span>
      <div className="upload-copy"><strong>תמונות מצורפות</strong><span>עד 10 תמונות, 8 מ״ב לתמונה</span></div>
      <div className="upload-controls">
        <div className="upload-option">
          <input type="file" id={gallery} className="sr-only" accept={accept} multiple disabled={count >= 10}
            onChange={(event) => { photos.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <label className="button button-outline" htmlFor={gallery}><ImagePlus size={17} /> בחירת תמונות</label>
        </div>
        <div className="upload-option">
          <input type="file" id={camera} className="sr-only" accept="image/*" capture="environment" disabled={count >= 10}
            onChange={(event) => { photos.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <label className="button button-outline" htmlFor={camera}><Camera size={17} /> צילום תמונה</label>
        </div>
      </div>
    </div>
    {photos.error && <p className="error-message" role="alert">{photos.error}</p>}
    {count > 0 && <div className="photo-grid">
      {id && photos.kept.map((photo, index) => <div className="photo-item" key={photo.id}>
        <PhotoPreview url={urlFor(module, id, photo.id)} label={"תמונה " + (index + 1)} name={photo.name} />
        <button className="photo-remove" type="button" aria-label={"הסרת תמונה " + (index + 1)} onClick={() => photos.removeSaved(photo.id)}><X size={16} /></button>
      </div>)}
      {photos.pending.map((photo, index) => {
        const number = photos.kept.length + index + 1;
        return <div className="photo-item" key={photo.preview}>
          <PhotoPreview url={photo.preview} label={"תמונה " + number} name={photo.file.name} />
          <button className="photo-remove" type="button" aria-label={"הסרת תמונה " + number} onClick={() => photos.removePreview(photo.preview)}><X size={16} /></button>
        </div>;
      })}
    </div>}
  </>;
}

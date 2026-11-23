"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowUpLeft, ChevronLeft, ChevronRight, Images, MessageCircle, X } from "lucide-react";
import { buildTargetWhatsappUrl, CORTEZ_WHATSAPP_DISPLAY } from "@/lib/whatsapp-card";
import { Button } from "./ui/button";

export type CardPhoto = {
  id: string;
  url: string;
  name: string;
};

export function CardWhatsappButton({
  message, recordHref, label, variant = "mobile", targetPhone, targetDisplay,
}: {
  message: string;
  recordHref: string;
  label: string;
  variant?: "table" | "mobile" | "detail";
  targetPhone?: string;
  targetDisplay?: string;
}) {
  const initialHref = buildTargetWhatsappUrl(message, targetPhone);
  const recipientDisplay = targetPhone ? (targetDisplay ? `${targetDisplay} (${targetPhone})` : targetPhone) : CORTEZ_WHATSAPP_DISPLAY;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
    const absoluteUrl = new URL(recordHref, window.location.origin).toString();
    event.currentTarget.href = buildTargetWhatsappUrl(message, targetPhone, absoluteUrl);
  }

  const ariaLabel = `שליחת פרטי ${label} בוואטסאפ אל ${recipientDisplay}`;

  if (variant === "table") {
    return <a
      href={initialHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="action-pill-wa"
      aria-label={ariaLabel}
      title={`שליחה לוואטסאפ (${recipientDisplay})`}
    >
      <MessageCircle size={15} aria-hidden />
    </a>;
  }

  if (variant === "detail") {
    return <a
      href={initialHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="button detail-wa-btn"
      aria-label={ariaLabel}
      title={`שליחת הודעה בוואטסאפ אל ${recipientDisplay}`}
    >
      <MessageCircle size={17} aria-hidden />
      <span>{targetPhone ? "וואטסאפ ללקוח" : "שליחה לוואטסאפ"}</span>
    </a>;
  }

  return <a
    href={initialHref}
    target="_blank"
    rel="noopener noreferrer"
    onClick={handleClick}
    className="mobile-action-btn is-whatsapp"
    aria-label={ariaLabel}
  >
    <MessageCircle size={16} aria-hidden />
    <span>{targetPhone ? "וואטסאפ ללקוח" : "וואטסאפ"}</span>
  </a>;
}

export function CardPhotoGallery({
  photos, title, recordHref, mode = "table",
}: {
  photos: CardPhoto[];
  title: string;
  recordHref: string;
  mode?: "table" | "mobile-strip" | "mobile-button";
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open || photos.length <= 1) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => (current + 1) % photos.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => (current - 1 + photos.length) % photos.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;

  const activeIndex = index < photos.length ? index : 0;
  const active = photos[activeIndex];

  function openAt(nextIndex: number) {
    setIndex(nextIndex);
    setOpen(true);
  }

  return <>
    {mode === "table" && (
      <button
        type="button"
        className="action-pill-photo"
        onClick={() => openAt(0)}
        aria-label={`צפייה ב־${photos.length} תמונות של ${title}`}
        title={`צפייה בתמונות (${photos.length})`}
      >
        <Images size={14} aria-hidden />
        <span>{photos.length}</span>
      </button>
    )}

    {mode === "mobile-button" && (
      <button
        type="button"
        className="mobile-action-btn is-photos"
        onClick={() => openAt(0)}
        aria-label={`צפייה ב־${photos.length} תמונות של ${title}`}
      >
        <Images size={16} aria-hidden />
        <span>תמונות ({photos.length})</span>
      </button>
    )}

    {mode === "mobile-strip" && (
      <div className="mobile-photo-strip" aria-label={`תמונות שצורפו אל ${title}`}>
        <div className="mobile-photo-strip-head">
          <span><Images size={14} aria-hidden /> תמונות שצורפו ({photos.length})</span>
          <button type="button" className="mobile-photo-all" onClick={() => openAt(0)}>צפייה</button>
        </div>
        <div className="mobile-photo-thumbs">
          {photos.slice(0, 4).map((photo, idx) => {
            const extra = idx === 3 && photos.length > 4 ? photos.length - 4 : 0;
            return <button
              type="button"
              key={photo.id}
              className="mobile-photo-thumb"
              onClick={() => openAt(idx)}
              aria-label={`פתיחת תמונה ${idx + 1} מתוך ${photos.length} של ${title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" loading="lazy" />
              {extra > 0 && <span className="mobile-photo-more">+{extra}</span>}
            </button>;
          })}
        </div>
      </div>
    )}

    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content card-lightbox-modal" dir="rtl">
          <div className="dialog-heading">
            <div className="lightbox-title-wrap">
              <Dialog.Title>תמונות · {title}</Dialog.Title>
              <Dialog.Description className="muted">
                תמונה {activeIndex + 1} מתוך {photos.length}{active?.name ? ` · ${active.name}` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="סגירת גלריית תמונות"><X size={20} /></Button>
            </Dialog.Close>
          </div>

          <div className="lightbox-stage">
            {photos.length > 1 && (
              <button
                type="button"
                className="lightbox-nav lightbox-prev"
                aria-label="תמונה קודמת"
                onClick={() => setIndex((current) => (current - 1 + photos.length) % photos.length)}
              >
                <ChevronRight size={22} />
              </button>
            )}
            {active && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="lightbox-main-img" src={active.url} alt={`${title} — תמונה ${activeIndex + 1}`} />
            )}
            {photos.length > 1 && (
              <button
                type="button"
                className="lightbox-nav lightbox-next"
                aria-label="תמונה הבאה"
                onClick={() => setIndex((current) => (current + 1) % photos.length)}
              >
                <ChevronLeft size={22} />
              </button>
            )}
          </div>

          {photos.length > 1 && (
            <div className="lightbox-thumbs" aria-label="בחירת תמונה">
              {photos.map((photo, idx) => (
                <button
                  type="button"
                  key={photo.id}
                  className={"lightbox-thumb" + (idx === activeIndex ? " is-active" : "")}
                  onClick={() => setIndex(idx)}
                  aria-label={`תמונה ${idx + 1}`}
                  aria-pressed={idx === activeIndex}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="lightbox-footer">
            <Button asChild size="sm" variant="outline" onClick={() => setOpen(false)}>
              <Link href={recordHref}>לכרטיס המלא <ArrowUpLeft size={15} /></Link>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

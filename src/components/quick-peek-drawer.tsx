"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowLeft, Eye, Images, Pencil, Phone, X } from "lucide-react";
import { CardWhatsappButton, type CardPhoto } from "./card-actions";
import { Button } from "./ui/button";

export function QuickPeekTrigger({
  label,
  title,
  number,
  subtitle,
  accent = "neutral",
  thumbNode,
  badgesNode,
  highlightNote,
  metaNode,
  photos = [],
  whatsappMessage,
  whatsappPhone,
  whatsappTargetLabel,
  phoneHref,
  href,
  editHref,
}: {
  label: string;
  title: string;
  number?: string;
  subtitle?: string;
  accent?: "red" | "amber" | "green" | "blue" | "neutral";
  thumbNode: ReactNode;
  badgesNode?: ReactNode;
  highlightNote?: { label: string; text: string; tone?: "amber" | "neutral" };
  metaNode?: ReactNode;
  photos?: CardPhoto[];
  whatsappMessage: string;
  whatsappPhone?: string;
  whatsappTargetLabel?: string;
  phoneHref?: string;
  href: string;
  editHref?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="row-action-btn"
          aria-label={"הצצה מהירה עבור " + label}
          title="הצצה מהירה מהצד"
        >
          <Eye size={15} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`quick-peek-drawer accent-${accent}`} dir="rtl">
          <div className="quick-peek-head">
            <div className="quick-peek-title-row">
              {thumbNode}
              <div className="quick-peek-titles">
                {number && (
                  <span className="mobile-card-number">
                    <bdi dir="ltr">{number}</bdi>
                  </span>
                )}
                <Dialog.Title asChild>
                  <h2>{title}</h2>
                </Dialog.Title>
                {subtitle && (
                  <Dialog.Description className="muted text-sm">{subtitle}</Dialog.Description>
                )}
                {!subtitle && <Dialog.Description className="sr-only">{title}</Dialog.Description>}
                {badgesNode}
              </div>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="סגירת הצצה מהירה">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>

          <div className="quick-peek-body">
            {highlightNote && (
              <div
                className={
                  "quick-peek-note" + (highlightNote.tone === "amber" ? " is-amber" : "")
                }
              >
                <small>{highlightNote.label}</small>
                <p>{highlightNote.text}</p>
              </div>
            )}

            {metaNode}

            {photos.length > 0 && (
              <div className="quick-peek-photos">
                <span className="quick-peek-section-label">
                  <Images size={15} aria-hidden /> תמונות מצורפות ({photos.length})
                </span>
                <div className="quick-peek-photo-grid">
                  {photos.map((p) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="quick-peek-photo-item"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.name} loading="lazy" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="quick-peek-footer">
            <CardWhatsappButton
              message={whatsappMessage}
              recordHref={href}
              label={label}
              variant="mobile"
              targetPhone={whatsappPhone}
              targetDisplay={whatsappTargetLabel}
            />
            {phoneHref && (
              <a href={phoneHref} className="button button-outline button-sm">
                <Phone size={15} aria-hidden /> חיוג
              </a>
            )}
            {editHref && (
              <Button asChild variant="outline" size="sm">
                <Link href={editHref} prefetch={false} onClick={() => setOpen(false)}>
                  <Pencil size={15} /> עריכה
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={href} prefetch={false} onClick={() => setOpen(false)}>
                לדף הכרטיס המלא <ArrowLeft size={15} />
              </Link>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

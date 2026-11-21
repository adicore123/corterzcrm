"use client";

import { AlertDialog, Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function Modal({ open, onOpenChange, title, description, children, className, trigger }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; className?: string; trigger?: ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className={"dialog-content " + (className ?? "")} dir="rtl">
        <div className="dialog-heading">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="סגירה"><X size={20} /></Button></Dialog.Close>
        </div>
        <Dialog.Description className={description ? "muted" : "sr-only"}>{description || title}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function Confirm({ open, onOpenChange, title, description, action, busy, onConfirm, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; action: string;
  busy: boolean; onConfirm: () => void; children: ReactNode;
}) {
  return <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="dialog-overlay" />
      <AlertDialog.Content className="dialog-content" dir="rtl">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description className="muted">{description}</AlertDialog.Description>
        <div className="dialog-actions">
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>{busy ? "מתבצע…" : action}</Button>
          <AlertDialog.Cancel asChild><Button variant="outline" disabled={busy}>ביטול</Button></AlertDialog.Cancel>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}

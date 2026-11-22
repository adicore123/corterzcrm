"use client";

import { useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { Lock } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { Button } from "./button";

function DeletePasswordForm({
  description,
  action,
  busy,
  error,
  onConfirm,
}: {
  description: string;
  action: string;
  busy: boolean;
  error?: string;
  onConfirm: (password: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const inputId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!busy && password.trim()) void onConfirm(password);
  }

  return <>
    <AlertDialog.Description className="muted">{description}</AlertDialog.Description>
    <form onSubmit={submit} className="dialog-form" noValidate>
      <label className="field" htmlFor={inputId}>
        <span className="inline-flex items-center gap-1.5">
          <Lock size={14} aria-hidden />
          <span>סיסמת מחיקה</span>
        </span>
        <input
          id={inputId}
          type="password"
          dir="ltr"
          autoComplete="off"
          autoFocus
          aria-label="סיסמת מחיקה"
          placeholder="הזן סיסמת מחיקה"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={64}
          disabled={busy}
        />
      </label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="dialog-actions">
        <Button type="submit" variant="destructive" disabled={busy || !password.trim()}>
          {busy ? "מאמת…" : action}
        </Button>
        <AlertDialog.Cancel asChild>
          <Button type="button" variant="outline" disabled={busy}>ביטול</Button>
        </AlertDialog.Cancel>
      </div>
    </form>
  </>;
}

export function DeletePasswordDialog({
  open,
  onOpenChange,
  title = "אישור מחיקה באמצעות סיסמה",
  description,
  action = "מחיקה",
  busy,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  action?: string;
  busy: boolean;
  error?: string;
  onConfirm: (password: string) => void | Promise<void>;
  children?: ReactNode;
}) {
  return <AlertDialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    {children && <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>}
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="dialog-overlay" />
      <AlertDialog.Content className="dialog-content" dir="rtl">
        <div className="dialog-heading">
          <AlertDialog.Title>{title}</AlertDialog.Title>
        </div>
        {open && <DeletePasswordForm key="active" description={description} action={action} busy={busy} error={error} onConfirm={onConfirm} />}
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}

type PendingDelete = {
  description: string;
  onConfirmed: () => void;
};

export function useProtectedDelete(onAuthorized?: (password: string) => void) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestDelete = useCallback((description: string, onConfirmed: () => void) => {
    setError("");
    setPending({ description, onConfirmed });
  }, []);

  async function confirm(password: string) {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth/verify-delete-password", "POST", { password });
      const callback = pending.onConfirmed;
      onAuthorized?.(password);
      setPending(null);
      callback();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dialog = <DeletePasswordDialog
    open={Boolean(pending)}
    onOpenChange={(next) => {
      if (!next && !busy) {
        setPending(null);
        setError("");
      }
    }}
    description={pending?.description ?? ""}
    busy={busy}
    error={error}
    onConfirm={confirm}
  />;

  return { requestDelete, dialog };
}

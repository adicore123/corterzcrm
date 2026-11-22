"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import type { Module } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { DeletePasswordDialog } from "@/components/ui/delete-password-dialog";

export function DeleteButton({ module, id, version, subject }: { module: Module; id: string; version: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [pageError, setPageError] = useState("");

  async function remove(deletePassword: string) {
    if (busy) return;
    setBusy(true);
    setDialogError("");
    setPageError("");
    try {
      await requestJson("/api/records/" + module + "/" + id, "DELETE", { version, deletePassword });
      setOpen(false);
      router.replace("/" + module + "?deleted=1");
      router.refresh();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("סיסמ")) {
        setDialogError(message);
      } else {
        setPageError(message);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return <>
    <DeletePasswordDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setDialogError("");
        if (next) setPageError("");
        setOpen(next);
      }}
      title="מחיקת רשומה"
      description={"למחוק את " + subject + " לצמיתות? יש להזין סיסמת מחיקה."}
      action="מחיקה"
      busy={busy}
      error={dialogError}
      onConfirm={remove}
    >
      <Button variant="ghost" className="delete-button"><Trash2 size={17} /> מחיקה</Button>
    </DeletePasswordDialog>
    {pageError && <p className="error-message delete-error" role="alert">{pageError}</p>}
  </>;
}

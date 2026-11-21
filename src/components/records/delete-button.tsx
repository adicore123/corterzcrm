"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import type { Module } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/dialog";

export function DeleteButton({ module, id, version, subject }: { module: Module; id: string; version: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/records/" + module + "/" + id, "DELETE", { version });
      router.replace("/" + module + "?deleted=1");
      router.refresh();
      setOpen(false);
    } catch (error) {
      setError((error as Error).message);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Confirm open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }} title="מחיקת רשומה"
      description={"למחוק את " + subject + " לצמיתות?"} action="מחיקה" busy={busy} onConfirm={remove}>
      <Button variant="ghost" className="delete-button"><Trash2 size={17} /> מחיקה</Button>
    </Confirm>
    {error && <p className="error-message delete-error" role="alert">{error}</p>}
  </>;
}

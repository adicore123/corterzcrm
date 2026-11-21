"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newRequestId, requestJson, uploadBlobRecord, uploadRecord } from "@/lib/client-api";
import type { Module, Photo } from "@/lib/validation/models";

type PendingPhoto = { file: File; preview: string };
const unsavedMessage = "יש שינויים שלא נשמרו. לצאת מהטופס?";
const supportedImages = ["image/jpeg", "image/png", "image/webp"];

export function useUnsaved(dirty: boolean, ignore: { current: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    function unload(event: BeforeUnloadEvent) {
      if (ignore.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function confirmLeave(event: Event) {
      if (!ignore.current && !window.confirm(unsavedMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")
        || target.protocol === "tel:" || target.href === window.location.href) return;
      confirmLeave(event);
    }
    // Protect same-document history navigation in browsers supporting the Navigation API.
    // The click handler covers regular links and beforeunload covers closing or refreshing.
    function navigate(event: Event) {
      const navigationEvent = event as Event & { navigationType?: string; destination?: { url: string } };
      if (event.cancelable && navigationEvent.navigationType === "traverse"
        && navigationEvent.destination?.url !== window.location.href) confirmLeave(event);
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", unload);
    window.addEventListener("cortez:leave", confirmLeave);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("cortez:leave", confirmLeave);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty, ignore]);
}

export function usePhotoDraft(initial: Photo[]) {
  const [kept, setKept] = useState(initial);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState("");
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  }, []);

  function add(files: File[]) {
    setError("");
    const valid = files.filter((file) => supportedImages.includes(file.type) && file.size > 0 && file.size <= 8 * 1024 * 1024);
    const room = 10 - kept.length - pending.length;
    if (valid.length < files.length) setError("יש לבחור תמונות JPG, PNG או WebP בגודל של עד 8 מ״ב לתמונה.");
    else if (valid.length > room) setError("ניתן לצרף עד 10 תמונות לרשומה.");
    const added = valid.slice(0, room).map((file) => {
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      return { file, preview };
    });
    setPending((items) => [...items, ...added]);
  }
  function removePreview(preview: string) {
    URL.revokeObjectURL(preview);
    objectUrls.current.delete(preview);
    setPending((items) => items.filter((item) => item.preview !== preview));
    setError("");
  }
  function removeSaved(id: string) {
    setKept((items) => items.filter((item) => item.id !== id));
    setError("");
  }
  return { kept, pending, error, add, removePreview, removeSaved, dirty: pending.length > 0 || kept.length !== initial.length };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

export function useEditor(module: Module, record: { id: string; updatedAt: string } | undefined, dirty: boolean, photos?: PhotoDraft, cloud = false) {
  const router = useRouter();
  const bypass = useRef(false);
  const sending = useRef(false);
  const requestId = useRef("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  useUnsaved(dirty || Boolean(photos?.dirty), bypass);

  async function save(values: object) {
    if (sending.current) return;
    sending.current = true;
    setError("");
    const id = record?.id;
    const endpoint = "/api/records/" + module + (id ? "/" + id : "");
    if (!id && !requestId.current) requestId.current = newRequestId();
    const payload = { ...values, version: record?.updatedAt, requestId: requestId.current || undefined, keptPhotos: photos?.kept.map((item) => item.id) };
    const method = id ? "PUT" : "POST";
    try {
      const files = photos?.pending.map((item) => item.file) ?? [];
      if (files.length) setProgress(0);
      let saved: { id: string };
      if (files.length === 0) saved = await requestJson(endpoint, method, payload);
      else if (cloud && module !== "customers") saved = await uploadBlobRecord(module, endpoint, method, payload, files, setProgress);
      else saved = await uploadRecord(endpoint, method, payload, files, setProgress);
      bypass.current = true;
      setLeaving(true);
      router.push("/" + module + "/" + saved.id + "?saved=1");
      router.refresh();
    } catch (error) {
      sending.current = false;
      setError((error as Error).message);
    } finally {
      setProgress(null);
    }
  }
  return { save, error, leaving, progress };
}

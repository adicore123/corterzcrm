"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newRequestId, requestJson, uploadBlobRecord, uploadRecord } from "@/lib/client-api";
import type { Module, Photo } from "@/lib/validation/models";

type PendingPhoto = { file: File; preview: string };
const unsavedMessage = "יש שינויים שלא נשמרו. לצאת מהטופס?";
const supportedImages = ["image/jpeg", "image/png", "image/webp"];
const maxUploadBytes = 8 * 1024 * 1024;
const compressThresholdBytes = 2 * 1024 * 1024;

async function prepareClientImage(file: File): Promise<File | null> {
  if (file.size <= 0) return null;
  const supported = supportedImages.includes(file.type);
  if (supported && file.size <= compressThresholdBytes) return file;
  if (!supported && !file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height, 1));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return supported && file.size <= maxUploadBytes ? file : null;
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
      if (!blob || blob.size > maxUploadBytes) return supported && file.size <= maxUploadBytes ? file : null;
      const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], baseName.slice(0, 245) + ".webp", { type: "image/webp" });
    } finally {
      bitmap.close();
    }
  } catch {
    return supported && file.size <= maxUploadBytes ? file : null;
  }
}

export function useUnsaved(dirty: boolean, ignore: { current: boolean }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  function askLeave(action: () => void) {
    pendingAction.current = action;
    setPromptOpen(true);
  }

  function confirmLeave() {
    const action = pendingAction.current;
    pendingAction.current = null;
    setPromptOpen(false);
    if (action) action();
  }

  function cancelLeave() {
    pendingAction.current = null;
    setPromptOpen(false);
  }

  function requestClose(onClose: () => void) {
    if (!dirty || ignore.current) {
      onClose();
      return;
    }
    askLeave(onClose);
  }

  useEffect(() => {
    if (!dirty) return;
    function unload(event: BeforeUnloadEvent) {
      if (ignore.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function handleCustomLeave(event: Event) {
      if (ignore.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      askLeave(() => {
        ignore.current = true;
        const signout = document.querySelector<HTMLButtonElement>(".signout");
        signout?.click();
      });
    }
    function click(event: MouseEvent) {
      if (ignore.current || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")
        || target.protocol === "tel:" || target.href === window.location.href) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      askLeave(() => {
        ignore.current = true;
        target.click();
      });
    }
    function navigate(event: Event) {
      const navigationEvent = event as Event & { navigationType?: string; destination?: { url: string } };
      if (!ignore.current && event.cancelable && navigationEvent.navigationType === "traverse"
        && navigationEvent.destination?.url && navigationEvent.destination.url !== window.location.href) {
        const destinationUrl = navigationEvent.destination.url;
        event.preventDefault();
        event.stopImmediatePropagation();
        askLeave(() => {
          ignore.current = true;
          window.location.assign(destinationUrl);
        });
      }
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", unload);
    window.addEventListener("cortez:leave", handleCustomLeave);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("cortez:leave", handleCustomLeave);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty, ignore]);

  return { promptOpen, confirmLeave, cancelLeave, requestClose, message: unsavedMessage };
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

  async function add(files: File[]) {
    setError("");
    const room = 10 - kept.length - pending.length;
    const processed = (await Promise.all(files.map(prepareClientImage))).filter((file): file is File => file !== null);
    if (processed.length < files.length) setError("יש לבחור תמונות JPG, PNG או WebP בגודל של עד 8 מ״ב לתמונה.");
    else if (processed.length > room) setError("ניתן לצרף עד 10 תמונות לרשומה.");
    const added = processed.slice(0, room).map((file) => {
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
  const unsaved = useUnsaved(dirty || Boolean(photos?.dirty), bypass);

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
  return { save, error, leaving, progress, unsaved };
}

export type UnsavedState = ReturnType<typeof useUnsaved>;

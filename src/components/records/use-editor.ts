"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newRequestId, requestJson, uploadBlobRecord, uploadRecord } from "@/lib/client-api";
import type { Module, Photo } from "@/lib/validation/models";

type PendingPhoto = { file: File; preview: string };
const unsavedMessage = "יש שינויים שלא נשמרו. לצאת מהטופס?";
const supportedImages = ["image/jpeg", "image/png", "image/webp"];
const maxUploadBytes = 12 * 1024 * 1024;
const compressThresholdBytes = 1.5 * 1024 * 1024;

function inferMimeType(file: File, fromCamera: boolean): string {
  const raw = (file.type || "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (raw && raw !== "application/octet-stream") return raw;
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return fromCamera ? "image/jpeg" : "";
}

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
};

async function decodeClientImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      cleanup: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        if (typeof img.decode === "function") {
          img.decode().then(resolve, () => undefined);
        }
      });
      return {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function prepareClientImage(file: File, fromCamera = false): Promise<File | null> {
  if (file.size <= 0) return null;
  const inferred = inferMimeType(file, fromCamera);
  const supported = supportedImages.includes(inferred);
  if (!fromCamera && supported && file.size <= compressThresholdBytes) {
    // Snapshot bytes immediately so Android content:// handles remain readable until submit.
    const buffer = await file.arrayBuffer().catch(() => null);
    if (!buffer) return null;
    return new File([buffer], file.name || "photo.jpg", { type: inferred });
  }
  if (!supported && !inferred.startsWith("image/")) return null;
  try {
    const decoded = await decodeClientImage(file);
    try {
      const scale = Math.min(1, 2200 / Math.max(decoded.width, decoded.height, 1));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2d context");
      decoded.draw(context, width, height);
      let blob = await canvasToBlob(canvas, "image/webp", 0.85);
      if (!blob || blob.type !== "image/webp" || blob.size > 4_000_000) {
        blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
      }
      if (blob && blob.size > 4_000_000) {
        blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
      }
      if (!blob || blob.size > maxUploadBytes) throw new Error("Canvas export failed");
      const ext = blob.type === "image/jpeg" ? ".jpg" : ".webp";
      const baseName = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
      return new File([blob], baseName.slice(0, 245) + ext, { type: blob.type });
    } finally {
      decoded.cleanup();
    }
  } catch {
    if (file.size <= maxUploadBytes && (supported || inferred === "image/heic" || inferred === "image/heif")) {
      const buffer = await file.arrayBuffer().catch(() => null);
      if (!buffer) return null;
      return new File([buffer], file.name || "photo.jpg", { type: inferred || "image/jpeg" });
    }
    return null;
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
  const [processing, setProcessing] = useState(false);
  const processingCount = useRef(0);
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  }, []);

  async function add(files: File[], fromCamera = false) {
    setError("");
    processingCount.current += 1;
    setProcessing(true);
    try {
      const room = 10 - kept.length - pending.length;
      const processed: File[] = [];
      for (const file of files) {
        const next = await prepareClientImage(file, fromCamera);
        if (next) processed.push(next);
      }
      if (processed.length < files.length) setError("לא ניתן היה לעבד אחת מהתמונות. יש לבחור תמונה עד 12 מ״ב.");
      else if (processed.length > room) setError("ניתן לצרף עד 10 תמונות לרשומה.");
      const added = processed.slice(0, room).map((file) => {
        const preview = URL.createObjectURL(file);
        objectUrls.current.add(preview);
        return { file, preview };
      });
      setPending((items) => [...items, ...added]);
    } finally {
      processingCount.current -= 1;
      if (processingCount.current <= 0) {
        processingCount.current = 0;
        setProcessing(false);
      }
    }
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
  return { kept, pending, error, processing, add, removePreview, removeSaved, dirty: pending.length > 0 || kept.length !== initial.length };
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
    if (sending.current || photos?.processing) return;
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

"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  newRequestId,
  requestJson,
  stageBlobPhotosBatch,
  stageFaultAttachmentsBatch,
  uploadBlobRecord,
  uploadFaultAttachments,
  uploadRecord,
  type StagedAttachmentPayload,
  type StagedPhotoResult,
} from "@/lib/client-api";
import { mapConcurrent } from "@/lib/utils";
import type { Attachment, Module, Photo, PhotoModule } from "@/lib/validation/models";
import { useToast } from "@/components/ui/toast";

export type PendingPhoto = {
  id: string;
  file: File;
  preview: string;
  needsServerDecode?: boolean;
  uploadStatus?: "idle" | "uploading" | "uploaded";
  stagedPromise?: Promise<StagedPhotoResult>;
};

export type PendingAttachment = {
  id: string;
  file: File;
  kind: "file" | "video";
  preview?: string;
  uploadStatus?: "idle" | "uploading" | "uploaded";
  uploadProgress?: number;
  stagedPromise?: Promise<StagedAttachmentPayload>;
};

const unsavedMessage = "יש שינויים שלא נשמרו. לצאת מהטופס?";
const supportedImages = ["image/jpeg", "image/png", "image/webp"];
const maxUploadBytes = 20 * 1024 * 1024;
const compressThresholdBytes = 220 * 1024;
const clientHeicMaxBytes = 10 * 1024 * 1024;
const heicBrands = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
  "heif",
  "heim",
  "heis",
  "hevm",
  "hevs",
]);

function inferMimeType(file: File, fromCamera: boolean): string {
  const raw = (file.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  if (raw && raw !== "application/octet-stream") return raw;
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".avif")) return "image/avif";
  if (name.endsWith(".gif")) return "image/gif";
  return fromCamera ? "image/jpeg" : "";
}

async function detectHeicFile(file: File, inferred: string): Promise<boolean> {
  if (inferred === "image/heic" || inferred === "image/heif") return true;
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    if (head.length < 12) return false;
    if (head[4] !== 0x66 || head[5] !== 0x74 || head[6] !== 0x79 || head[7] !== 0x70) return false;
    const major = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
    if (major === "avif" || major === "avis") return false;
    return heicBrands.has(major);
  } catch {
    return false;
  }
}

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
};

async function decodeClientImage(file: Blob): Promise<DecodedImage> {
  try {
    // Use resizeWidth on large mobile shots (e.g. 48MP/108MP) to avoid 400MB+ bitmap RAM spikes.
    const bitmap =
      file.size > 1.8 * 1024 * 1024
        ? await createImageBitmap(file, {
            imageOrientation: "from-image",
            resizeWidth: 1920,
            resizeQuality: "high",
          })
            .catch(() => createImageBitmap(file, { imageOrientation: "from-image" }))
            .catch(() => createImageBitmap(file))
        : await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() =>
            createImageBitmap(file),
          );
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
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = url;
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

async function compressDecodedBlob(source: Blob, originalName: string): Promise<File> {
  const decoded = await decodeClientImage(source);
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, 1920 / Math.max(decoded.width, decoded.height, 1));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2d context");
    decoded.draw(context, width, height);
    let blob = await canvasToBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp" || blob.size > 4_000_000) {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
    }
    if (blob && blob.size > 4_000_000) {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
    }
    if (!blob || blob.size > maxUploadBytes) throw new Error("Canvas export failed");
    const ext = blob.type === "image/jpeg" ? ".jpg" : ".webp";
    const baseName = (originalName || "photo").replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], baseName.slice(0, 245) + ext, { type: blob.type });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    decoded.cleanup();
  }
}

type PreparedPhoto = { file: File; needsServerDecode?: boolean };

async function prepareClientImage(file: File, fromCamera = false): Promise<PreparedPhoto | null> {
  if (file.size <= 0) return null;
  const inferred = inferMimeType(file, fromCamera);
  const isHeic = await detectHeicFile(file, inferred);
  if (isHeic) {
    if (file.size <= clientHeicMaxBytes) {
      try {
        const { heicTo } = await import("heic-to/next");
        const converted = await heicTo({ blob: file, type: "image/jpeg", quality: 0.86 });
        const compressed = await compressDecodedBlob(converted, file.name || "photo.heic");
        return { file: compressed };
      } catch {
        // Fall through to server-side HEIC decoding.
      }
    }
    if (file.size <= maxUploadBytes) {
      const buffer = await file.arrayBuffer().catch(() => null);
      if (!buffer) return null;
      return {
        file: new File([buffer], file.name || "photo.heic", { type: "image/heic" }),
        needsServerDecode: true,
      };
    }
    return null;
  }

  const supported = supportedImages.includes(inferred);
  if (!fromCamera && supported && file.size <= compressThresholdBytes) {
    // Snapshot bytes immediately so Android content:// handles remain readable until submit.
    const buffer = await file.arrayBuffer().catch(() => null);
    if (!buffer) return null;
    return { file: new File([buffer], file.name || "photo.jpg", { type: inferred }) };
  }
  if (!supported && !inferred.startsWith("image/")) return null;
  try {
    return { file: await compressDecodedBlob(file, file.name || "photo") };
  } catch {
    if (file.size <= maxUploadBytes) {
      const buffer = await file.arrayBuffer().catch(() => null);
      if (!buffer) return null;
      return {
        file: new File([buffer], file.name || "photo.jpg", {
          type: inferred || "application/octet-stream",
        }),
      };
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
      if (
        ignore.current
        || event.defaultPrevented
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.button !== 0
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(target instanceof HTMLAnchorElement)
        || target.target === "_blank"
        || target.hasAttribute("download")
        || target.protocol === "tel:"
        || target.href === window.location.href
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      askLeave(() => {
        ignore.current = true;
        target.click();
      });
    }
    function navigate(event: Event) {
      const navigationEvent = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        !ignore.current
        && event.cancelable
        && navigationEvent.navigationType === "traverse"
        && navigationEvent.destination?.url
        && navigationEvent.destination.url !== window.location.href
      ) {
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

export function usePhotoDraft(
  initial: Photo[],
  options?: { module?: PhotoModule; cloud?: boolean },
) {
  const [kept, setKept] = useState(initial);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const processingCount = useRef(0);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  async function add(files: File[], fromCamera = false) {
    setError("");
    processingCount.current += 1;
    setProcessing(true);
    try {
      const room = 10 - kept.length - pending.length;
      const results = await mapConcurrent(files, 3, (file) =>
        prepareClientImage(file, fromCamera),
      );
      const processed = results.filter((item): item is PreparedPhoto => item !== null);

      if (processed.length < files.length) {
        setError("לא ניתן היה לעבד אחת מהתמונות. יש לבחור תמונה עד 20 מ״ב.");
      } else if (processed.length > room) {
        setError("ניתן לצרף עד 10 תמונות לרשומה.");
      }

      const canEagerStage = Boolean(options?.cloud && options.module);
      const added: PendingPhoto[] = processed.slice(0, Math.max(0, room)).map((item) => {
        const preview = URL.createObjectURL(item.file);
        objectUrls.current.add(preview);
        return {
          id: newRequestId(),
          file: item.file,
          preview,
          needsServerDecode: item.needsServerDecode,
          uploadStatus: canEagerStage ? "uploading" : "idle",
        };
      });

      if (!added.length) return;

      if (canEagerStage && options?.module) {
        const resolvers = new Map<
          string,
          { resolve: (val: StagedPhotoResult) => void; reject: (err: unknown) => void }
        >();
        for (const item of added) {
          item.stagedPromise = new Promise<StagedPhotoResult>((resolve, reject) => {
            resolvers.set(item.id, { resolve, reject });
          });
        }

        setPending((items) => [...items, ...added]);

        // Eagerly stage photos in the background while the user fills out the rest of the form!
        void stageBlobPhotosBatch(
          options.module,
          added.map((it) => ({ id: it.id, file: it.file })),
          undefined,
          (id, res) => {
            resolvers.get(id)?.resolve(res);
            resolvers.delete(id);
            setPending((items) =>
              items.map((it) =>
                it.id === id
                  ? { ...it, uploadStatus: "uploaded", stagedPromise: Promise.resolve(res) }
                  : it,
              ),
            );
          },
        ).catch((err) => {
          // Reset unresolved items to idle so clicking Save retries cleanly without stale rejection
          for (const [, r] of resolvers) {
            r.reject(err);
          }
          setPending((items) =>
            items.map((it) =>
              resolvers.has(it.id)
                ? { ...it, uploadStatus: "idle", stagedPromise: undefined }
                : it,
            ),
          );
          for (const item of added) {
            item.stagedPromise?.catch(() => undefined);
          }
        });
      } else {
        setPending((items) => [...items, ...added]);
      }
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

  return {
    kept,
    pending,
    error,
    processing,
    add,
    removePreview,
    removeSaved,
    dirty: pending.length > 0 || kept.length !== initial.length,
  };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

const maxFileAttachmentBytes = 25 * 1024 * 1024;
const maxVideoAttachmentBytes = 100 * 1024 * 1024;

export function useAttachmentDraft(initial: Attachment[], options?: { cloud?: boolean }) {
  const [kept, setKept] = useState(initial);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState("");
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function add(files: File[], kind: "file" | "video") {
    setError("");
    const room = 15 - kept.length - pending.length;
    const limit = kind === "video" ? maxVideoAttachmentBytes : maxFileAttachmentBytes;
    const valid: File[] = [];
    for (const file of files) {
      if (file.size <= 0 || file.size > limit) continue;
      valid.push(file);
    }
    if (valid.length < files.length) {
      setError(
        kind === "video"
          ? "אחד הסרטונים גדול מדי (עד 100 מ״ב לסרטון)."
          : "אחד הקבצים גדול מדי (עד 25 מ״ב לקובץ).",
      );
    } else if (valid.length > room) {
      setError("ניתן לצרף עד 15 קבצים וסרטונים למדריך.");
    }

    const canEagerUpload = options?.cloud !== undefined;
    const added: PendingAttachment[] = valid.slice(0, Math.max(0, room)).map((file) => {
      const preview = kind === "video" ? URL.createObjectURL(file) : undefined;
      if (preview) objectUrls.current.add(preview);
      return {
        id: newRequestId(),
        file,
        kind,
        preview,
        uploadStatus: canEagerUpload ? "uploading" : "idle",
        uploadProgress: 0,
      };
    });

    if (!added.length) return;

    if (canEagerUpload) {
      const resolvers = new Map<
        string,
        { resolve: (val: StagedAttachmentPayload) => void; reject: (err: unknown) => void }
      >();
      for (const item of added) {
        item.stagedPromise = new Promise<StagedAttachmentPayload>((resolve, reject) => {
          resolvers.set(item.id, { resolve, reject });
        });
      }

      setPending((items) => [...items, ...added]);

      void stageFaultAttachmentsBatch(
        added.map((it) => ({ id: it.id, file: it.file, kind: it.kind })),
        Boolean(options?.cloud),
        undefined,
        (id, pct) => {
          setPending((items) =>
            items.map((it) => (it.id === id ? { ...it, uploadProgress: pct } : it)),
          );
        },
        (id, res) => {
          resolvers.get(id)?.resolve(res);
          resolvers.delete(id);
          setPending((items) =>
            items.map((it) =>
              it.id === id
                ? {
                    ...it,
                    uploadStatus: "uploaded",
                    uploadProgress: 100,
                    stagedPromise: Promise.resolve(res),
                  }
                : it,
            ),
          );
        },
      ).catch((err) => {
        for (const [, r] of resolvers) {
          r.reject(err);
        }
        setPending((items) =>
          items.map((it) =>
            resolvers.has(it.id)
              ? { ...it, uploadStatus: "idle", uploadProgress: 0, stagedPromise: undefined }
              : it,
          ),
        );
        for (const item of added) {
          item.stagedPromise?.catch(() => undefined);
        }
      });
    } else {
      setPending((items) => [...items, ...added]);
    }
  }

  function removePending(id: string) {
    setPending((items) => {
      const target = items.find((item) => item.id === id);
      if (target?.preview) {
        URL.revokeObjectURL(target.preview);
        objectUrls.current.delete(target.preview);
      }
      return items.filter((item) => item.id !== id);
    });
    setError("");
  }

  function removeSaved(id: string) {
    setKept((items) => items.filter((item) => item.id !== id));
    setError("");
  }

  return {
    kept,
    pending,
    error,
    add,
    removePending,
    removeSaved,
    dirty: pending.length > 0 || kept.length !== initial.length,
  };
}

export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>;

export function useEditor(
  module: Module,
  record: { id: string; updatedAt: string } | undefined,
  dirty: boolean,
  photos?: PhotoDraft,
  cloud = false,
  attachments?: AttachmentDraft,
) {
  const router = useRouter();
  const bypass = useRef(false);
  const sending = useRef(false);
  const requestId = useRef("");
  const deletePasswordRef = useRef("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const { addToast } = useToast();
  const unsaved = useUnsaved(dirty || Boolean(photos?.dirty) || Boolean(attachments?.dirty), bypass);

  function authorizeDelete(password: string) {
    deletePasswordRef.current = password;
  }

  async function save(values: object) {
    if (sending.current || photos?.processing) return;
    sending.current = true;
    setError("");
    const id = record?.id;
    const endpoint = "/api/records/" + module + (id ? "/" + id : "");
    if (!id && !requestId.current) requestId.current = newRequestId();
    const method = id ? "PUT" : "POST";
    try {
      const pendingPhotos = photos?.pending ?? [];
      const attachmentFiles = attachments?.pending ?? [];
      if (pendingPhotos.length || attachmentFiles.length) setProgress(0);

      const stagedAttachments = attachmentFiles.length
        ? await uploadFaultAttachments(
            attachmentFiles.map(({ id: attId, file, kind, stagedPromise }) => ({
              id: attId,
              file,
              kind,
              stagedPromise,
            })),
            cloud,
            (pct) => setProgress(pendingPhotos.length ? Math.round(pct * 0.65) : pct),
          )
        : undefined;

      const payload = {
        ...values,
        version: record?.updatedAt,
        requestId: requestId.current || undefined,
        ...(deletePasswordRef.current ? { deletePassword: deletePasswordRef.current } : {}),
        keptPhotos: photos?.kept.map((item) => item.id),
        ...(attachments ? { keptAttachments: attachments.kept.map((item) => item.id) } : {}),
        ...(stagedAttachments?.length ? { stagedAttachments } : {}),
      };

      const photoProgress = (pct: number) =>
        setProgress(attachmentFiles.length ? Math.min(100, 65 + Math.round(pct * 0.35)) : pct);

      let saved: { id: string };
      if (pendingPhotos.length === 0) {
        saved = await requestJson(endpoint, method, payload);
      } else if (cloud && module !== "customers") {
        saved = await uploadBlobRecord(
          module,
          endpoint,
          method,
          payload,
          pendingPhotos.map((p) => ({
            id: p.id,
            file: p.file,
            stagedPromise: p.stagedPromise,
          })),
          photoProgress,
        );
      } else {
        saved = await uploadRecord(
          endpoint,
          method,
          payload,
          pendingPhotos.map((p) => p.file),
          photoProgress,
        );
      }

      bypass.current = true;
      setLeaving(true);
      const isCreate = !id;
      addToast({
        title: isCreate ? "התיק נוצר בהצלחה" : "התיק נשמר בהצלחה",
        description: isCreate
          ? "ניתן להמשיך לערוך או לצפות בפרטי התיק."
          : "השינויים נשמרו ונעדכנו במערכת.",
        variant: "success",
      });
      router.push("/" + module + "/" + saved.id + "?saved=1");
      startTransition(() => router.refresh());
    } catch (error) {
      sending.current = false;
      const message = (error as Error).message || "אירעה שגיאה בשמירה.";
      setError(message);
      addToast({
        title: "שמירה נכשלה",
        description: message,
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setProgress(null);
    }
  }
  return { save, authorizeDelete, error, leaving, progress, unsaved };
}

export type UnsavedState = ReturnType<typeof useUnsaved>;

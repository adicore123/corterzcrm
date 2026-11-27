import { mapConcurrent } from "./utils";
import type { PhotoModule } from "./validation/models";

export async function requestJson<T>(path: string, method: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }).catch(() => {
    throw new Error("אין חיבור לשרת. יש לבדוק את החיבור ולנסות שוב.");
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "לא ניתן להשלים את הפעולה. יש לנסות שוב.");
  return result as T;
}

export function uploadRecord(
  path: string,
  method: string,
  payload: unknown,
  photos: File[],
  progress: (value: number) => void,
) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const data = new FormData();
    data.set("payload", JSON.stringify(payload));
    for (const image of photos) data.append("photos", image);
    const xhr = new XMLHttpRequest();
    xhr.open(method, path);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded * 100) / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.id) resolve(xhr.response);
      else reject(new Error(xhr.response?.error || "לא ניתן לשמור את הרשומה. יש לנסות שוב."));
    };
    xhr.onerror = () => reject(new Error("החיבור נקטע בזמן העלאת התמונות. יש לנסות שוב."));
    xhr.send(data);
  });
}

export function newRequestId() {
  // getRandomValues also works on mobile preview over an HTTP LAN address.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export type StagedPhotoResult = { id: string; name: string };
export type BlobPhotoUploadItem = {
  id: string;
  file: File;
  stagedPromise?: Promise<StagedPhotoResult>;
};

type UploadGrant = { id: string; pathname: string; token: string };

/**
 * Requests upload grants in a single batch HTTP call and uploads all files to Vercel Blob
 * concurrently (concurrency = 4) with aggregated live byte progress.
 */
export async function stageBlobPhotosBatch(
  module: PhotoModule,
  items: Array<{ id: string; file: File }>,
  onProgress?: (pct: number) => void,
  onItemUploaded?: (id: string, result: StagedPhotoResult) => void,
): Promise<StagedPhotoResult[]> {
  if (!items.length) return [];
  const [{ put }, grantResponse] = await Promise.all([
    import("@vercel/blob/client"),
    requestJson<{ grants: UploadGrant[] }>("/api/uploads/" + module, "POST", {
      ids: items.map((item) => item.id),
    }),
  ]);
  const grantMap = new Map(grantResponse.grants.map((g) => [g.id, g]));
  const total = Math.max(
    items.reduce((sum, item) => sum + item.file.size, 0),
    1,
  );
  const loadedById = new Map<string, number>();
  const report = () => {
    if (!onProgress) return;
    let sum = 0;
    for (const v of loadedById.values()) sum += v;
    onProgress(Math.min(99, Math.floor((sum * 100) / total)));
  };

  const staged = await mapConcurrent(items, 4, async (item) => {
    const grant = grantMap.get(item.id);
    if (!grant) {
      throw new Error("לא ניתן להעלות אחת מהתמונות. יש לבדוק את החיבור ולנסות שוב.");
    }
    try {
      await put(grant.pathname, item.file, {
        access: "private",
        token: grant.token,
        contentType: item.file.type || "application/octet-stream",
        onUploadProgress: ({ loaded }) => {
          loadedById.set(item.id, loaded);
          report();
        },
      });
    } catch {
      throw new Error("לא ניתן להעלות אחת מהתמונות. יש לבדוק את החיבור ולנסות שוב.");
    }
    loadedById.set(item.id, item.file.size);
    report();
    const result: StagedPhotoResult = { id: item.id, name: item.file.name.slice(0, 255) };
    onItemUploaded?.(item.id, result);
    return result;
  });

  onProgress?.(100);
  return staged;
}

export async function uploadBlobRecord(
  module: PhotoModule,
  endpoint: string,
  method: string,
  payload: object,
  itemsInput: Array<File | BlobPhotoUploadItem>,
  progress: (value: number) => void,
) {
  const normalized: BlobPhotoUploadItem[] = itemsInput.map((entry) =>
    entry instanceof File ? { id: newRequestId(), file: entry } : entry,
  );

  const needFreshUpload = normalized.filter((item) => !item.stagedPromise);
  const freshMap = new Map<string, StagedPhotoResult>();

  // Run any remaining uploads in a single parallel batch alongside awaiting any in-flight eager uploads
  const [freshResults, eagerResults] = await Promise.all([
    needFreshUpload.length > 0
      ? stageBlobPhotosBatch(module, needFreshUpload, progress)
      : Promise.resolve([] as StagedPhotoResult[]),
    Promise.all(
      normalized
        .filter((item) => Boolean(item.stagedPromise))
        .map(async (item) => [item.id, await item.stagedPromise!] as const),
    ),
  ]);

  for (const res of freshResults) freshMap.set(res.id, res);
  for (const [id, res] of eagerResults) freshMap.set(id, res);

  const stagedPhotos = normalized.map((item) => freshMap.get(item.id)!);
  progress(100);
  return requestJson<{ id: string }>(endpoint, method, { ...payload, stagedPhotos });
}

export type PendingAttachmentInput = {
  id?: string;
  file: File;
  kind: "file" | "video";
  stagedPromise?: Promise<StagedAttachmentPayload>;
};
export type StagedAttachmentPayload = {
  id: string;
  name: string;
  kind: "file" | "video";
  type?: string;
};

function uploadLocalAttachment(
  id: string,
  item: { file: File; kind: "file" | "video" },
  onProgress: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const data = new FormData();
    data.set("id", id);
    data.set("kind", item.kind);
    data.set("file", item.file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/faults");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.response?.error || "לא ניתן להעלות את הקובץ. יש לנסות שוב."));
    };
    xhr.onerror = () => reject(new Error("החיבור נקטע בזמן העלאת הקובץ. יש לנסות שוב."));
    xhr.send(data);
  });
}

export async function stageFaultAttachmentsBatch(
  items: Array<{ id: string; file: File; kind: "file" | "video" }>,
  cloud: boolean,
  progress?: (value: number) => void,
  onItemProgress?: (id: string, pct: number) => void,
  onItemUploaded?: (id: string, result: StagedAttachmentPayload) => void,
): Promise<StagedAttachmentPayload[]> {
  if (!items.length) return [];
  const total = Math.max(
    items.reduce((sum, item) => sum + item.file.size, 0),
    1,
  );
  const loadedById = new Map<string, number>();
  const report = () => {
    if (!progress) return;
    let sum = 0;
    for (const v of loadedById.values()) sum += v;
    progress(Math.min(99, Math.floor((sum * 100) / total)));
  };

  let blobClient: typeof import("@vercel/blob/client") | null = null;
  let grantMap = new Map<string, UploadGrant>();
  if (cloud) {
    const [mod, grantRes] = await Promise.all([
      import("@vercel/blob/client"),
      requestJson<{ grants: UploadGrant[] }>("/api/uploads/attachments", "POST", {
        items: items.map((it) => ({ id: it.id, kind: it.kind })),
      }),
    ]);
    blobClient = mod;
    grantMap = new Map(grantRes.grants.map((g) => [g.id, g]));
  }

  const staged = await mapConcurrent(items, 3, async (item) => {
    const safeName = (
      item.file.name || (item.kind === "video" ? "video.mp4" : "file.pdf")
    ).slice(0, 255);
    const size = Math.max(item.file.size, 1);

    if (cloud && blobClient) {
      const grant = grantMap.get(item.id);
      if (!grant) {
        throw new Error("לא ניתן להעלות את הקובץ. יש לבדוק את החיבור ולנסות שוב.");
      }
      try {
        await blobClient.put(grant.pathname, item.file, {
          access: "private",
          token: grant.token,
          contentType: item.file.type || "application/octet-stream",
          multipart: item.file.size > 5 * 1024 * 1024,
          onUploadProgress: ({ loaded }) => {
            loadedById.set(item.id, loaded);
            onItemProgress?.(item.id, Math.min(99, Math.floor((loaded * 100) / size)));
            report();
          },
        });
      } catch {
        throw new Error(
          item.kind === "video"
            ? "לא ניתן להעלות את הסרטון. יש לבדוק את החיבור ולנסות שוב."
            : "לא ניתן להעלות את הקובץ. יש לבדוק את החיבור ולנסות שוב.",
        );
      }
    } else {
      await uploadLocalAttachment(item.id, item, (loaded) => {
        loadedById.set(item.id, loaded);
        onItemProgress?.(item.id, Math.min(99, Math.floor((loaded * 100) / size)));
        report();
      });
    }

    loadedById.set(item.id, item.file.size);
    onItemProgress?.(item.id, 100);
    report();
    const result: StagedAttachmentPayload = {
      id: item.id,
      name: safeName,
      kind: item.kind,
      type: item.file.type || undefined,
    };
    onItemUploaded?.(item.id, result);
    return result;
  });

  progress?.(100);
  return staged;
}

export async function uploadFaultAttachments(
  items: PendingAttachmentInput[],
  cloud: boolean,
  progress: (value: number) => void,
): Promise<StagedAttachmentPayload[]> {
  if (!items.length) return [];
  const normalized = items.map((item) => ({
    id: item.id ?? newRequestId(),
    file: item.file,
    kind: item.kind,
    stagedPromise: item.stagedPromise,
  }));

  const needFresh = normalized.filter((item) => !item.stagedPromise);
  const resultMap = new Map<string, StagedAttachmentPayload>();

  const [freshResults, eagerResults] = await Promise.all([
    needFresh.length > 0
      ? stageFaultAttachmentsBatch(needFresh, cloud, progress)
      : Promise.resolve([] as StagedAttachmentPayload[]),
    Promise.all(
      normalized
        .filter((item) => Boolean(item.stagedPromise))
        .map(async (item) => [item.id, await item.stagedPromise!] as const),
    ),
  ]);

  for (const res of freshResults) resultMap.set(res.id, res);
  for (const [id, res] of eagerResults) resultMap.set(id, res);

  progress(100);
  return normalized.map((item) => resultMap.get(item.id)!);
}

import type { PhotoModule } from "./validation/models";

export async function requestJson<T>(path: string, method: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload),
  }).catch(() => { throw new Error("אין חיבור לשרת. יש לבדוק את החיבור ולנסות שוב."); });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "לא ניתן להשלים את הפעולה. יש לנסות שוב.");
  return result as T;
}

export function uploadRecord(path: string, method: string, payload: unknown, photos: File[], progress: (value: number) => void) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const data = new FormData();
    data.set("payload", JSON.stringify(payload));
    for (const image of photos) data.append("photos", image);
    const xhr = new XMLHttpRequest();
    xhr.open(method, path);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round(event.loaded * 100 / event.total));
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
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export async function uploadBlobRecord(
  module: PhotoModule, endpoint: string, method: string, payload: object, files: File[], progress: (value: number) => void,
) {
  const { put } = await import("@vercel/blob/client");
  const stagedPhotos = [];
  const total = files.reduce((size, file) => size + file.size, 0);
  let uploaded = 0;
  for (const file of files) {
    const id = newRequestId();
    const { pathname, token } = await requestJson<{ pathname: string; token: string }>("/api/uploads/" + module, "POST", { id });
    try {
      await put(pathname, file, {
        access: "private",
        token,
        contentType: file.type || "image/jpeg",
        onUploadProgress: ({ loaded }) => progress(Math.min(99, Math.floor((uploaded + loaded) * 100 / total))),
      });
    } catch {
      throw new Error("לא ניתן להעלות אחת מהתמונות. יש לבדוק את החיבור ולנסות שוב.");
    }
    stagedPhotos.push({ id, name: file.name.slice(0, 255) });
    uploaded += file.size;
  }
  progress(100);
  return requestJson<{ id: string }>(endpoint, method, { ...payload, stagedPhotos });
}

import type { Module } from "./validation/models";

export const labels = {
  dashboard: "סקירה כללית",
  standards: "מכון תקנים",
  repairs: "תיקונים",
  customers: "לקוחות",
  models: "מאגר דגמים",
  faults: "תקלות ופתיחות הגבלה",
  catalog: "קטלוג סוכנים",
  settings: "הגדרות",
};

export const moduleCopy = {
  standards: { singular: "תיק תקינה", create: "תיק מכון תקנים", description: "מעקב אחר תיקי תקינה, משימות ועיכובים", empty: "אין תיקי תקינה להצגה", search: "חיפוש לפי מספר תיק או דגם" },
  repairs: { singular: "תיקון", create: "תיקון חדש", description: "ניהול תקלות, תיקונים וכלים שהתקבלו לטיפול", empty: "אין תיקונים להצגה", search: "חיפוש לפי מספר תיקון, דגם או מספר סידורי" },
  customers: { singular: "לקוח", create: "לקוח חדש", description: "פרטי לקוחות והיסטוריית תיקונים", empty: "אין לקוחות להצגה", search: "חיפוש לפי שם, חנות או טלפון" },
  models: { singular: "דגם", create: "דגם חדש", description: "קטלוג דגמי קורטז, תמונות ושיוך לתיקי תקינה ותיקונים", empty: "אין דגמים להצגה", search: "חיפוש לפי שם דגם או סוג מכשיר" },
  faults: { singular: "מדריך תקלות", create: "מדריך חדש לדגם", description: "תקלות נפוצות, קודי שגיאה, קבצים טכניים וסרטוני פתיחת הגבלה לכל כלי", empty: "טרם נוספו מדריכי תקלות ופתיחת הגבלה", search: "חיפוש לפי דגם, קוד תקלה (E07), תסמין או קובץ" },
} satisfies Record<Module, { singular: string; create: string; description: string; empty: string; search: string }>;

const dateFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });
const dateAndTime = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export function formatDate(value: string, includeTime = false) {
  return (includeTime ? dateAndTime : dateFormat).format(new Date(value));
}

export const roleLabel = { admin: "מנהל מערכת", employee: "עובד", agent: "סוכן" } as const;

export function phoneHref(phone: string) {
  return "tel:" + phone.replace(/[^+0-9]/g, "");
}

export function whatsappHref(phone: string, message?: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  const base = "https://wa.me/" + intl;
  return message ? base + "?text=" + encodeURIComponent(message) : base;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function embedVideoUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.slice("/shorts/".length).split("/")[0];
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
      }
      if (url.pathname.startsWith("/embed/")) {
        const id = url.pathname.slice("/embed/".length).split("/")[0];
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
      }
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "vimeo.com") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "drive.google.com") {
      const match = /\/file\/d\/([^/]+)/.exec(url.pathname);
      return match?.[1] ? `https://drive.google.com/file/d/${encodeURIComponent(match[1])}/preview` : null;
    }
    return null;
  } catch {
    return null;
  }
}

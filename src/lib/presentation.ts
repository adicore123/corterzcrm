import type { Module } from "./validation/models";

export const labels = {
  dashboard: "סקירה כללית",
  standards: "מכון תקנים",
  repairs: "תיקונים",
  customers: "לקוחות",
  models: "מאגר דגמים",
  settings: "הגדרות",
};

export const moduleCopy = {
  standards: { singular: "תיק תקינה", create: "תיק מכון תקנים", description: "מעקב אחר תיקי תקינה, משימות ועיכובים", empty: "אין תיקי תקינה להצגה", search: "חיפוש לפי מספר תיק או דגם" },
  repairs: { singular: "תיקון", create: "תיקון חדש", description: "ניהול תקלות, תיקונים וכלים שהתקבלו לטיפול", empty: "אין תיקונים להצגה", search: "חיפוש לפי מספר תיקון, דגם או מספר סידורי" },
  customers: { singular: "לקוח", create: "לקוח חדש", description: "פרטי לקוחות והיסטוריית תיקונים", empty: "אין לקוחות להצגה", search: "חיפוש לפי שם, חנות או טלפון" },
  models: { singular: "דגם", create: "דגם חדש", description: "קטלוג דגמי קורטז, תמונות ושיוך לתיקי תקינה ותיקונים", empty: "אין דגמים להצגה", search: "חיפוש לפי שם דגם או סוג מכשיר" },
} satisfies Record<Module, { singular: string; create: string; description: string; empty: string; search: string }>;

const dateFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });
const dateAndTime = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export function formatDate(value: string, includeTime = false) {
  return (includeTime ? dateAndTime : dateFormat).format(new Date(value));
}

export const roleLabel = { admin: "מנהל מערכת", employee: "עובד" };

export function phoneHref(phone: string) {
  return "tel:" + phone.replace(/[^+0-9]/g, "");
}

export function whatsappHref(phone: string, message?: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;
  const base = "https://wa.me/" + intl;
  return message ? base + "?text=" + encodeURIComponent(message) : base;
}

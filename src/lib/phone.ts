/**
 * Strips invisible Unicode directional marks (LTR/RTL/Bidi isolates added by iOS Contacts & WhatsApp)
 * and normalizes non-breaking spaces and Unicode dashes into standard ASCII characters.
 */
export function sanitizePhoneInput(raw: string): string {
  return raw
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();
}

export function isValidPhoneInput(raw: string): boolean {
  const cleaned = sanitizePhoneInput(raw);
  if (!cleaned || cleaned.length > 32) return false;
  if (!/^\+?[\d\s().-]+$/.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Converts any Israeli or international phone string into clean WhatsApp digits (no '+' prefix),
 * fixing common pitfalls like "+972-052-..." ("972052..." -> "97252...") and 9-digit mobile "52..." -> "97252...".
 */
export function toWhatsappDigits(rawPhone?: string, fallback = ""): string {
  if (!rawPhone) return fallback;
  let digits = sanitizePhoneInput(rawPhone).replace(/\D/g, "");
  if (!digits) return fallback;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("9720") && digits.length >= 12) {
    return "972" + digits.slice(4);
  }
  if (digits.startsWith("972")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return "972" + digits.slice(1);
  }
  if (digits.length >= 8 && digits.length <= 9) {
    return "972" + digits;
  }
  return digits;
}

/**
 * Normalizes Israeli phones into canonical local digits (e.g., "0526111443") for reliable customer deduplication.
 */
export function toCanonicalCustomerDigits(rawPhone?: string): string {
  if (!rawPhone) return "";
  let digits = sanitizePhoneInput(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("9720")) return "0" + digits.slice(4);
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  if (digits.length === 9 && digits.startsWith("5")) return "0" + digits;
  return digits;
}

export function isMobileClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Opens a blank window synchronously during a click/submit gesture on desktop browsers so async
 * API saves never trigger popup blockers when redirecting to WhatsApp afterwards.
 * Returns null on mobile devices (where direct top-level navigation hands off cleanly to WhatsApp app).
 */
export function openPendingDesktopTab(): Window | null {
  if (typeof window === "undefined" || isMobileClient()) return null;
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

/**
 * Navigates to a `https://wa.me/...` URL reliably across iOS Safari, Android Chrome, installed PWA,
 * and Desktop browsers without popup-blocker errors or broken WebView schemes.
 */
export function launchWhatsappUrl(waUrl: string, pendingTab?: Window | null): void {
  if (typeof window === "undefined") return;

  if (pendingTab && !pendingTab.closed) {
    try {
      pendingTab.location.replace(waUrl);
      return;
    } catch {
      try {
        pendingTab.close();
      } catch {
        // Ignore
      }
    }
  }

  if (isMobileClient()) {
    window.location.assign(waUrl);
    return;
  }

  const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(waUrl);
  }
}

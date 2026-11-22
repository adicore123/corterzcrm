"use client";
/* eslint-disable @next/next/no-img-element -- Native Quick Look requires an image child in its AR link. */
import { useState, useSyncExternalStore } from "react";
import { ScanLine } from "lucide-react";
import type { StudioConfig } from "@/lib/validation/models";

const subscribe = () => () => {};
function deviceMode() {
  if (!window.isSecureContext || location.protocol !== "https:") return "unsupported";
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "desktop";
}
export function ProductArEntry({ studio, modelUrl, poster, productUrl }: { studio?: StudioConfig; modelUrl?: string; poster?: string; productUrl: string }) {
  const device = useSyncExternalStore(subscribe, deviceMode, () => "unsupported");
  const [copied, setCopied] = useState(false);
  if (!studio?.arEnabled || !studio.assetVerified || !studio.scaleVerified || !studio.dimensions || !modelUrl?.startsWith("https://")) return null;
  const viewerUrl = new URL("https://arvr.google.com/scene-viewer/1.0");
  viewerUrl.searchParams.set("file", modelUrl); viewerUrl.searchParams.set("mode", "ar_preferred"); viewerUrl.searchParams.set("resizable", "false");
  return <section className="studio-ar-entry" aria-label="הצגת המוצר בחלל">
    <div><ScanLine size={20} /><strong>איך הוא ייראה אצלכם?</strong></div>
    <p>הציבו את הכלי בגודל אמיתי בחלל. התאימות והצבת המודל תלויות במכשיר ובתנאי הסביבה.</p>
    {device === "ios" && studio.usdzUrl ? <a rel="ar" href={studio.usdzUrl}>{poster && <img src={poster} alt="" />}הצגה בחלל ב־iPhone</a> : device === "android" ? <a href={viewerUrl.toString()} target="_blank" rel="noopener noreferrer">הצגה בחלל ב־Android</a> : <><span>פתחו את הקישור בטלפון תומך. אפשר להמשיך לבדוק מידות בסטודיו.</span><button onClick={async () => { try { await navigator.clipboard.writeText(new URL(productUrl, location.origin).toString()); setCopied(true); } catch { setCopied(false); } }}>{copied ? "הקישור הועתק" : "העתקת קישור לטלפון"}</button></>}
  </section>;
}

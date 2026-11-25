"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Box, Camera, Rotate3D, RotateCcw, X } from "lucide-react";
import { getModelImages } from "@/components/catalog/catalog-utils";
import type { CatalogModel } from "@/lib/validation/models";
import type { ProposalMedia } from "@/lib/quotes/proposal-media";

const ProductViewer3D = dynamic(() => import("@/components/catalog/product-viewer-3d").then((module) => module.ProductViewer3D), { ssr: false });

export function ProposalShowroom({ model, media }: { model: CatalogModel; media: ProposalMedia }) {
  const photos = getModelImages(model);
  const [mode, setMode] = useState<"3d" | "photo">(media.kind === "3d" ? "3d" : "photo");
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [activeFeature, setActiveFeature] = useState<number | undefined>(undefined);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || media.kind !== "3d") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [media.kind]);

  const picture = photos[index] || media.poster;
  const show3d = mode === "3d" && media.kind === "3d";
  const studioFeatures = model.studio?.features ?? [];
  const selectedFeature = activeFeature !== undefined ? studioFeatures[activeFeature] : undefined;

  return <section className="proposal-showroom" aria-label={`תצוגת הדגם ${model.name}`}>
    <div className="proposal-showroom-top"><span className="proposal-overline">CORTEZ / PRODUCT EXPERIENCE</span><span className="proposal-view-badge">{show3d ? <><Box size={15} /> מודל תלת־ממדי מאומת</> : <><Camera size={15} /> צילומי מוצר</>}</span></div>
    {status === "error" && media.kind === "3d" && (
      <div className="proposal-fallback-banner" role="status">
        <span>תצוגת התלת־ממד אינה זמינה כרגע — מוצגים צילומי המוצר. ניתן להמשיך לעיין בהצעה ולאשר אותה.</span>
        <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); setMode("3d"); }}>ניסיון חוזר בתלת־ממד</button>
      </div>
    )}
    <div className="proposal-visual" ref={host}>
      {show3d && visible && (
        <ProductViewer3D
          key={`${media.url}-${attempt}`}
          url={media.url}
          name={model.name}
          studio={model.studio}
          coastal
          activeFeature={activeFeature}
          onFeatureSelect={(idx) => setActiveFeature((prev) => (prev === idx ? undefined : idx))}
          onStatus={(next) => {
            setStatus(next);
            if (next === "error") {
              setActiveFeature(undefined);
              setMode("photo");
            }
          }}
        />
      )}
      {(!show3d || !visible || status !== "ready") && <div className="proposal-poster">
        {picture ? <Image src={picture} alt={`${model.name} — ${show3d ? "תמונת פתיחה למודל" : `צילום ${index + 1}`}`} fill sizes="(max-width: 900px) 100vw, 60vw" priority unoptimized /> : <span>{model.name}</span>}
        {show3d && <span className="proposal-loading" role="status">{visible ? "טוען מודל תלת־ממדי…" : "מכין את תצוגת המודל…"}</span>}
      </div>}
      {show3d && status === "ready" && <div className="proposal-drag-hint"><Rotate3D size={16} /> גררו לסיבוב · בחרו מצב חקירה במובייל</div>}
      {show3d && status === "ready" && selectedFeature && (
        <div className="proposal-feature-callout" role="region" aria-label="הסבר על רכיב מאומת">
          <div>
            <strong>{selectedFeature.title}</strong>
            <p>{selectedFeature.description}</p>
          </div>
          <button type="button" aria-label="סגירת הסבר רכיב" onClick={() => setActiveFeature(undefined)}><X size={15} /></button>
        </div>
      )}
    </div>
    <div className="proposal-media-switch" role="group" aria-label="בחירת תצוגה">
      {media.kind === "3d" && <button type="button" aria-pressed={show3d} onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); setMode("3d"); }}><Box size={17} /> תלת־ממד <RotateCcw size={14} /></button>}
      <button type="button" aria-pressed={!show3d} onClick={() => setMode("photo")}><Camera size={17} /> צילומים ({photos.length})</button>
    </div>
    {mode === "photo" && photos.length > 1 && <div className="proposal-thumbs" aria-label="גלריית צילומי מוצר">{photos.slice(0, 8).map((src, photoIndex) => <button type="button" key={src} aria-label={`הצגת צילום ${photoIndex + 1}`} aria-pressed={index === photoIndex} onClick={() => setIndex(photoIndex)}><Image src={src} alt="" fill sizes="90px" unoptimized /></button>)}</div>}
    <p className="proposal-media-note">{show3d ? "המוצר מוצג כמודל תלת־ממדי של הדגם. צבע, גרסה ואבזור יש לאמת מול פרטי ההצעה." : "תצוגת צילום של הדגם. תמונות אינן הדמיה תלת־ממדית."}</p>
  </section>;
}

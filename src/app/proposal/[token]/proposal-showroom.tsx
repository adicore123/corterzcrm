"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Box,
  Camera,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Maximize2,
  Palette,
  Rotate3D,
  RotateCcw,
  Sun,
  Sunset,
  X,
} from "lucide-react";
import { getModelImages, toWebglTextureUrl } from "@/components/catalog/catalog-utils";
import type { CoastalLightingMode } from "@/components/three/AtmosphericSky";
import type { CoastalCameraPreset } from "@/components/three/CameraController";
import { getProposalHeroCutoutUrl, resolveModelVariants } from "@/lib/catalog/coastal-assets";
import type { CatalogModel } from "@/lib/validation/models";
import type { ProposalMedia } from "@/lib/quotes/proposal-media";

const BeachScene = dynamic(
  () => import("@/components/three/BeachScene").then((module) => module.BeachScene),
  { ssr: false },
);
const ProductViewer3D = dynamic(
  () => import("@/components/catalog/product-viewer-3d").then((module) => module.ProductViewer3D),
  { ssr: false },
);

/** Sanitizes gallery image URLs: removes raw WhatsApp filenames and proxies external URLs via /api/catalog-image */
function normalizeGalleryImages(urls: Array<string | undefined>): string[] {
  const clean: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    if (raw.toLowerCase().includes("whatsapp")) continue;
    const proxied = toWebglTextureUrl(raw);
    if (!clean.includes(proxied)) clean.push(proxied);
  }
  return clean;
}

export function ProposalShowroom({ model, media }: { model: CatalogModel; media: ProposalMedia }) {
  const variants = useMemo(() => resolveModelVariants(model), [model]);
  const primaryCutout = useMemo(() => getProposalHeroCutoutUrl(model), [model]);
  const photos = useMemo(() => {
    const baseImages = getModelImages(model);
    const variantUrls = variants.map((v) => v.imageUrl).filter((u): u is string => Boolean(u));
    const cleaned = normalizeGalleryImages([primaryCutout, ...variantUrls, ...baseImages]);
    return cleaned.length > 0 ? cleaned : normalizeGalleryImages([media.poster]);
  }, [model, primaryCutout, variants, media.poster]);

  const [mode, setMode] = useState<"3d" | "photo">(media.kind === "3d" ? "3d" : "photo");
  const [index, setIndex] = useState(0);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [activeFeature, setActiveFeature] = useState<number | undefined>(undefined);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoCameraPreset, setPhotoCameraPreset] = useState<CoastalCameraPreset>("wide");
  const [photoLightingMode, setPhotoLightingMode] = useState<CoastalLightingMode>("daylight");

  const picture = photos[index] || toWebglTextureUrl(media.poster || "");
  const show3d = mode === "3d" && media.kind === "3d";
  const studioFeatures = model.studio?.features ?? [];
  const selectedFeature = activeFeature !== undefined ? studioFeatures[activeFeature] : undefined;

  // Ground the selected photo/variant on the live V3 3D Mediterranean beach stage
  const stageProductImage = useMemo(() => {
    return picture || primaryCutout;
  }, [picture, primaryCutout]);

  const handleVariantSelect = (variantId: string, imageUrl?: string) => {
    setActiveVariantId(variantId);
    if (imageUrl) {
      const targetIdx = photos.indexOf(toWebglTextureUrl(imageUrl));
      if (targetIdx >= 0) {
        setIndex(targetIdx);
        setMode("photo");
      }
    }
  };

  const handleShowroomPreset = (preset: CoastalCameraPreset, mood?: CoastalLightingMode) => {
    setPhotoCameraPreset(preset);
    if (mood) setPhotoLightingMode(mood);
  };

  return (
    <section
      id="proposal-experience"
      className="proposal-showroom"
      aria-label={`תצוגת הדגם ${model.name}`}
    >
      <div className="proposal-showroom-top">
        <div className="proposal-showroom-heading-group">
          <span className="proposal-overline">במת תצוגה חיה וגוונים · CORTEZ 3D COASTAL STUDIO</span>
          <strong className="proposal-showroom-title" dir="ltr">{model.name}</strong>
        </div>
        <span className="proposal-view-badge">
          {show3d ? (
            <>
              <Box size={15} /> מודל תלת־ממדי מאומת
            </>
          ) : (
            <>
              <Camera size={15} /> צילומי מוצר
            </>
          )}
        </span>
      </div>

      {status === "error" && media.kind === "3d" && (
        <div className="proposal-fallback-banner" role="status">
          <span>
            תצוגת התלת־ממד אינה זמינה כרגע — מוצגים צילומי המוצר. ניתן להמשיך לעיין בהצעה ולאשר אותה.
          </span>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
              setMode("3d");
            }}
          >
            ניסיון חוזר בתלת־ממד
          </button>
        </div>
      )}

      <div className="proposal-visual">
        {show3d && (
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

        {show3d && status !== "ready" && (
          <div className="proposal-poster">
            {picture ? (
              <Image
                src={picture}
                alt={`${model.name} — תמונת פתיחה למודל`}
                fill
                sizes="(max-width: 900px) 100vw, 60vw"
                priority
                unoptimized
              />
            ) : (
              <span>{model.name}</span>
            )}
            <span className="proposal-loading" role="status">
              טוען מודל תלת־ממדי…
            </span>
          </div>
        )}

        {!show3d && (
          <div className="proposal-coastal-photo-stage">
            {/* Live Interactive V3 WebGL 2 Mediterranean Beach, Sun, Caustics & Fat-Tire Tracks Stage */}
            <BeachScene
              productName={model.name}
              productMode="photo"
              productImageUrl={stageProductImage}
              cameraPreset={photoCameraPreset}
              lightingMode={photoLightingMode}
              centerStage
              interactiveDrag
            />

            {/* Floating High-Res Studio Photo Preview Card (keeps .proposal-visual img visible & opens Lightbox) */}
            <div className="proposal-studio-preview-card" onClick={() => setLightboxOpen(true)}>
              <div className="proposal-studio-preview-thumb">
                {picture ? (
                  <Image
                    src={picture}
                    alt={`${model.name} — צילום ${index + 1}`}
                    fill
                    sizes="180px"
                    priority
                    unoptimized
                  />
                ) : (
                  <span>{model.name}</span>
                )}
              </div>
              <div className="proposal-studio-preview-meta">
                <span>צילום {index + 1} מתוך {Math.max(photos.length, 1)}</span>
                <strong>הגדלת צילום סטודיו</strong>
              </div>
            </div>

            {/* Interactive V3 Coastal Camera & Light Mood Controls */}
            <div className="proposal-photo-stage-bar" role="group" aria-label="זוויות מצלמה ותאורת חוף">
              <button
                type="button"
                className="proposal-photo-stage-btn"
                aria-pressed={photoCameraPreset === "wide" && photoLightingMode === "daylight"}
                onClick={() => handleShowroomPreset("wide", "daylight")}
              >
                <Eye size={14} aria-hidden />
                <span>מבט חוף רחב</span>
              </button>
              <button
                type="button"
                className="proposal-photo-stage-btn"
                aria-pressed={photoCameraPreset === "closeup"}
                onClick={() => handleShowroomPreset("closeup")}
              >
                <Camera size={14} aria-hidden />
                <span>תקריב כלי על החול</span>
              </button>
              <button
                type="button"
                className="proposal-photo-stage-btn"
                aria-pressed={photoCameraPreset === "sunset" && photoLightingMode === "golden"}
                onClick={() => handleShowroomPreset("sunset", "golden")}
              >
                <Compass size={14} aria-hidden />
                <span>זווית שמש וים</span>
              </button>
              <button
                type="button"
                className="proposal-photo-stage-btn is-gold"
                aria-pressed={photoLightingMode === "golden"}
                onClick={() =>
                  setPhotoLightingMode((prev) => (prev === "daylight" ? "golden" : "daylight"))
                }
              >
                {photoLightingMode === "golden" ? (
                  <Sunset size={14} aria-hidden />
                ) : (
                  <Sun size={14} aria-hidden />
                )}
                <span>{photoLightingMode === "golden" ? "שעת שקיעה זהובה" : "שמש ים־תיכונית"}</span>
              </button>
            </div>

            {picture && (
              <div className="proposal-photo-overlay-controls">
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="proposal-photo-nav prev"
                      aria-label="תמונה קודמת"
                      onClick={() => setIndex((prev) => (prev - 1 + photos.length) % photos.length)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      className="proposal-photo-nav next"
                      aria-label="תמונה הבאה"
                      onClick={() => setIndex((prev) => (prev + 1) % photos.length)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="proposal-photo-zoom-btn"
                  aria-label="הגדלת תמונת מוצר"
                  onClick={() => setLightboxOpen(true)}
                >
                  <Maximize2 size={15} />
                  <span>הגדלה</span>
                </button>
              </div>
            )}
          </div>
        )}

        {show3d && status === "ready" && (
          <div className="proposal-drag-hint">
            <Rotate3D size={16} /> גררו לסיבוב · בחרו מצב חקירה במובייל
          </div>
        )}

        {show3d && status === "ready" && selectedFeature && (
          <div className="proposal-feature-callout" role="region" aria-label="הסבר על רכיב מאומת">
            <div>
              <strong>{selectedFeature.title}</strong>
              <p>{selectedFeature.description}</p>
            </div>
            <button
              type="button"
              aria-label="סגירת הסבר רכיב"
              onClick={() => setActiveFeature(undefined)}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="proposal-showroom-toolbar">
        <div className="proposal-media-switch" role="group" aria-label="בחירת תצוגה">
          {media.kind === "3d" && (
            <button
              type="button"
              aria-pressed={show3d}
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
                setMode("3d");
              }}
            >
              <Box size={17} /> תלת־ממד <RotateCcw size={14} />
            </button>
          )}
          <button type="button" aria-pressed={!show3d} onClick={() => setMode("photo")}>
            <Camera size={17} /> צילומים ({photos.length})
          </button>
        </div>

        {variants.length > 1 && (
          <div className="proposal-variant-strip" role="group" aria-label="בחירת גוון הדגם">
            <span className="proposal-variant-label">
              <Palette size={14} aria-hidden /> גוון:
            </span>
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className="proposal-variant-chip"
                aria-pressed={activeVariantId === variant.id}
                onClick={() => handleVariantSelect(variant.id, variant.imageUrl)}
              >
                <span
                  className="proposal-variant-swatch"
                  style={{ backgroundColor: variant.color || "#0B2433" }}
                  aria-hidden
                />
                <span>{variant.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "photo" && photos.length > 1 && (
        <div className="proposal-thumbs" aria-label="גלריית צילומי מוצר">
          {photos.slice(0, 10).map((src, photoIndex) => (
            <button
              type="button"
              key={src}
              aria-label={`הצגת צילום ${photoIndex + 1}`}
              aria-pressed={index === photoIndex}
              onClick={() => setIndex(photoIndex)}
            >
              <Image src={src} alt="" fill sizes="96px" unoptimized />
            </button>
          ))}
        </div>
      )}

      <p className="proposal-media-note">
        {show3d
          ? "המוצר מוצג כמודל תלת־ממדי של הדגם. צבע, גרסה ואבזור יש לאמת מול פרטי ההצעה."
          : "צילומי המוצר הרשמיים של קורטז מוצבים בבמת חוף הים התיכון החיה. ניתן לגרור לסיבוב זווית המבט, להחליף תאורת שמש/שקיעה ולעבור בין זוויות הצילום והגוונים."}
      </p>

      {lightboxOpen && picture && (
        <div
          className="proposal-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`תצוגה מוגדלת — ${model.name}`}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="proposal-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="proposal-lightbox-header">
              <strong dir="ltr">{model.name}</strong>
              <button
                type="button"
                aria-label="סגירת תצוגה מוגדלת"
                onClick={() => setLightboxOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="proposal-lightbox-stage">
              <Image
                src={picture}
                alt={`${model.name} — תצוגה מוגדלת`}
                fill
                sizes="95vw"
                unoptimized
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

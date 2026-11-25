"use client";

import { useState } from "react";
import { Camera, Compass, Eye, Pause, Play, ShieldCheck, Sparkles, Sun, Sunset } from "lucide-react";
import { Brand } from "@/components/brand";
import { BeachScene } from "@/components/three/BeachScene";
import type { GraphicsQualityProfile } from "@/components/three/AdaptiveQualityManager";
import type { CoastalLightingMode } from "@/components/three/AtmosphericSky";
import type { CoastalCameraPreset } from "@/components/three/CameraController";

export interface CinematicHeroProps {
  customerDisplay: string;
  customerType: "private" | "store";
  modelName: string;
  deviceType?: string;
  summary: string;
  formattedPayable: string;
  quantity: number;
  vatLabel: string;
  productMode: "3d" | "photo";
  model3dUrl?: string;
  productImageUrl?: string;
  keyBadges: Array<{ label: string; value: string }>;
}

/**
 * ProposalHeader + SECTION 01 — Expanded Cinematic 3D Mediterranean Hero (V2).
 * Dedicates ~70% of the viewport to the live WebGL 2 Mediterranean coastline with a visible
 * HDR Sun Orb & Corona, interactive camera presets, lighting mode toggle, and drag-to-orbit parallax.
 */
export function CinematicHero({
  customerDisplay,
  customerType,
  modelName,
  deviceType,
  summary,
  formattedPayable,
  quantity,
  vatLabel,
  productMode,
  model3dUrl,
  productImageUrl,
  keyBadges,
}: CinematicHeroProps) {
  const [motionPaused, setMotionPaused] = useState(false);
  const [qualityProfile, setQualityProfile] = useState<GraphicsQualityProfile>("BALANCED");
  const [cameraPreset, setCameraPreset] = useState<CoastalCameraPreset>("wide");
  const [lightingMode, setLightingMode] = useState<CoastalLightingMode>("daylight");

  return (
    <>
      <header className="proposal-header">
        <Brand />
        <span className="proposal-header-customer">
          {customerType === "store" ? `הצעה מסחרית עבור ${customerDisplay}` : `הצעה אישית עבור ${customerDisplay}`}
        </span>
        <nav className="proposal-header-actions" aria-label="ניווט בהצעת המחיר">
          <button
            type="button"
            className="proposal-motion-toggle"
            aria-pressed={motionPaused}
            onClick={() => setMotionPaused((prev) => !prev)}
            title={motionPaused ? "הפעלת תנועת גלים וסביבה" : "השהיית תנועת גלים וסביבה"}
          >
            {motionPaused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            <span>{motionPaused ? "הפעלת תנועה" : "השהיית תנועה"}</span>
          </button>
          <a href="#proposal-experience" className="proposal-header-link">תצוגת המוצר</a>
          <a href="#offer" className="proposal-header-cta">פרטי ההצעה ואישור <span aria-hidden>↙</span></a>
        </nav>
      </header>

      <section className="proposal-cinematic-hero" aria-labelledby="proposal-title">
        <div className="proposal-hero-canvas-layer" data-quality-profile={qualityProfile}>
          <BeachScene
            productName={modelName}
            productMode={productMode}
            model3dUrl={model3dUrl}
            productImageUrl={productImageUrl}
            motionPaused={motionPaused}
            cameraPreset={cameraPreset}
            lightingMode={lightingMode}
            interactiveDrag
            onQualityChange={setQualityProfile}
          />
          <div className="proposal-hero-scrim" aria-hidden />
        </div>

        <div className="proposal-hero-inner">
          {/* Desktop RTL Right Side: Sleek Floating Glassmorphic Personal Proposal Card */}
          <div className="proposal-hero-content">
            <div className="proposal-hero-eyebrow-row">
              <span className="proposal-kicker">CORTEZ · MEDITERRANEAN LAUNCH EDITION</span>
              {deviceType && <span className="proposal-device-pill">{deviceType}</span>}
            </div>

            <p className="proposal-personal-greeting">
              {customerType === "store"
                ? `שלום ${customerDisplay}, הכנו עבורכם הצעת מחיר מסחרית מותאמת אישית`
                : `שלום ${customerDisplay}, ההצעה האישית שלך מוכנה`}
            </p>

            <h1 id="proposal-title" dir="ltr">{modelName}</h1>
            <p className="proposal-hero-summary">{summary}</p>

            {keyBadges.length > 0 && (
              <dl className="proposal-hero-QuickSpecs" aria-label="נתוני מפתח">
                {keyBadges.map((badge) => (
                  <div key={badge.label}>
                    <dt>{badge.label}</dt>
                    <dd><bdi dir="ltr">{badge.value}</bdi></dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="proposal-hero-commercial-bar">
              <div className="proposal-hero-price-block">
                <span>סך ההצעה לתשלום</span>
                <strong dir="ltr">{formattedPayable}</strong>
                <small>
                  {quantity} {quantity === 1 ? "יחידה" : "יחידות"} · {vatLabel}
                </small>
              </div>
              <div className="proposal-hero-cta-group">
                <a href="#proposal-accept" className="proposal-primary-cta">
                  <ShieldCheck size={18} aria-hidden />
                  <span>לסקירה ואישור ההצעה</span>
                </a>
                <a href="#proposal-experience" className="proposal-secondary-cta">
                  <Compass size={17} aria-hidden />
                  <span>לחקירת הדגם והמפרט</span>
                </a>
              </div>
            </div>
          </div>

          {/* Desktop RTL Left Side: Expanded 3D Mediterranean Beach Stage & Interactive Camera/Sun Controls */}
          <div className="proposal-hero-stage-window">
            <div className="proposal-stage-controls-dock" role="group" aria-label="שליטה בזווית המצלמה ובתאורת החוף">
              <div className="proposal-stage-location-pill">
                <Sparkles size={14} aria-hidden />
                <span>במת חוף חיה · גררו לסיבוב זווית המבט</span>
              </div>

              <div className="proposal-stage-pills">
                <button
                  type="button"
                  className="proposal-stage-pill"
                  aria-pressed={cameraPreset === "wide"}
                  onClick={() => setCameraPreset("wide")}
                >
                  <Eye size={14} aria-hidden />
                  <span>מבט חוף רחב</span>
                </button>
                <button
                  type="button"
                  className="proposal-stage-pill"
                  aria-pressed={cameraPreset === "closeup"}
                  onClick={() => setCameraPreset("closeup")}
                >
                  <Camera size={14} aria-hidden />
                  <span>תקריב כלי על החול</span>
                </button>
                <button
                  type="button"
                  className="proposal-stage-pill"
                  aria-pressed={cameraPreset === "sunset"}
                  onClick={() => setCameraPreset("sunset")}
                >
                  <Compass size={14} aria-hidden />
                  <span>זווית שמש וים</span>
                </button>
                <button
                  type="button"
                  className="proposal-stage-pill is-lighting"
                  aria-pressed={lightingMode === "golden"}
                  onClick={() => setLightingMode((prev) => (prev === "daylight" ? "golden" : "daylight"))}
                >
                  {lightingMode === "golden" ? <Sunset size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
                  <span>{lightingMode === "golden" ? "שעת שקיעה זהובה" : "שמש ים־תיכונית"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

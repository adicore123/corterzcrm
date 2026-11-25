"use client";

import { useState } from "react";
import { Compass, Pause, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { BeachScene } from "@/components/three/BeachScene";
import type { GraphicsQualityProfile } from "@/components/three/AdaptiveQualityManager";

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
 * ProposalHeader + SECTION 01 — Cinematic Hero
 * Combines the real-time WebGL 2 Mediterranean coastline with an immediate, crystal-clear
 * Hebrew RTL presentation of the personal greeting, product, payable price, and primary CTAs.
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
            onQualityChange={setQualityProfile}
          />
          <div className="proposal-hero-scrim" aria-hidden />
        </div>

        <div className="proposal-hero-inner">
          {/* Desktop RTL Right Side: Personal Greeting, Product Title, Summary, Price & Primary CTA */}
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

          {/* Desktop RTL Left Side: Framing caption for the product on the live Mediterranean shoreline */}
          <div className="proposal-hero-stage-window" aria-hidden>
            <div className="proposal-stage-location-pill">
              <Sparkles size={14} />
              <span>CORTEZ COASTAL STAGE · חוף הים התיכון</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

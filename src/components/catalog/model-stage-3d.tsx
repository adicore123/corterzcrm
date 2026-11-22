"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, Focus, Hand, Info, Minimize2, Moon, Pause, Play, RotateCcw, Sun, Sunset, X, ZoomIn, ZoomOut } from "lucide-react";
import type { StudioEnvironment } from "./studio-environments";
import { BeachStage3D } from "./beach-stage-3d";

export type StageHotspot = {
  label: string;
  value: string;
  description?: string;
};

export function ModelStage3D({
  imageUrl,
  modelName,
  deviceName,
  hotspots = [],
  activeHotspot,
  onHotspotSelect,
  onInspectPhoto,
  environment = "day",
  view = "signature",
  onViewChange,
  onEnvironmentChange,
  onInteraction,
  onReady,
}: {
  imageUrl?: string;
  modelName: string;
  deviceName: string;
  hotspots?: StageHotspot[];
  activeHotspot?: number;
  onHotspotSelect?: (index: number | undefined) => void;
  onInspectPhoto?: () => void;
  environment?: StudioEnvironment;
  view?: string;
  onViewChange?: (view: string) => void;
  onEnvironmentChange?: (environment: StudioEnvironment) => void;
  onInteraction?: () => void;
  onReady?: (ready: boolean) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [localLighting, setLocalLighting] = useState<StudioEnvironment>(environment);
  const [localView, setLocalView] = useState<string>(view);
  const [zoom, setZoom] = useState(1);
  const [tour, setTour] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [localHotspot, setLocalHotspot] = useState<number | null>(null);

  const lightingMode = onEnvironmentChange ? environment : localLighting;
  const cameraView = onViewChange ? view : localView;

  useEffect(() => {
    const syncFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFs);
    return () => document.removeEventListener("fullscreenchange", syncFs);
  }, []);

  const displayedHotspotIndex = activeHotspot ?? localHotspot;
  const displayedHotspot = displayedHotspotIndex !== null && displayedHotspotIndex !== undefined
    ? hotspots[displayedHotspotIndex]
    : undefined;

  const setLight = useCallback((next: StudioEnvironment) => {
    setLocalLighting(next);
    onEnvironmentChange?.(next);
  }, [onEnvironmentChange]);

  const setView = useCallback((next: string) => {
    onInteraction?.();
    setLocalView(next);
    setTour(false);
    setZoom(1);
    onViewChange?.(next);
  }, [onInteraction, onViewChange]);

  const handleReset = useCallback(() => {
    onInteraction?.();
    setLocalView("signature");
    setLocalLighting("day");
    setZoom(1);
    setTour(false);
    setInteractive(false);
    setLocalHotspot(null);
    setResetKey((k) => k + 1);
    onHotspotSelect?.(undefined);
    onViewChange?.("signature");
    onEnvironmentChange?.("day");
  }, [onEnvironmentChange, onHotspotSelect, onInteraction, onViewChange]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shellRef.current?.requestFullscreen();
      }
    } catch {
      setFullscreen(false);
    }
  };

  return (
    <div
      ref={shellRef}
      className={
        "stage-3d-shell coastal-studio-shell"
        + (lightingMode === "night" ? " is-night" : lightingMode === "gallery" ? " is-dusk" : "")
      }
      aria-label={"סטודיו חוף 3D עבור " + modelName}
    >
      <div className="coastal-stage-topbar">
        <span className="coastal-stage-badge">{deviceName} · {modelName}</span>
        <span className="coastal-stage-mode-label">
          {lightingMode === "day" ? "אור יום בחוף" : lightingMode === "night" ? "שעת הזהב" : "דמדומי חוף"}
        </span>
      </div>

      <div className="stage-3d-canvas">
        <BeachStage3D
          mode="studio"
          imageUrl={imageUrl}
          alt={modelName + " — סטודיו חוף 3D"}
          environment={lightingMode}
          view={cameraView}
          zoom={zoom}
          tour={tour}
          interactive={interactive}
          resetKey={resetKey}
          onReady={onReady}
          onUnavailable={() => {
            setUnavailable(true);
            onReady?.(false);
          }}
          onInteraction={onInteraction}
        />
      </div>

      {hotspots.length > 0 && (
        <div className="stage-hotspots" aria-label="מאפיינים טכניים בסטודיו">
          {hotspots.slice(0, 4).map((spot, idx) => (
            <button
              key={spot.label}
              type="button"
              className={"stage-hotspot hotspot-" + idx + (displayedHotspotIndex === idx ? " is-selected" : "")}
              aria-pressed={displayedHotspotIndex === idx}
              onClick={() => {
                onInteraction?.();
                const next = displayedHotspotIndex === idx ? undefined : idx;
                setLocalHotspot(next ?? null);
                onHotspotSelect?.(next);
              }}
            >
              <span className="hotspot-dot" aria-hidden />
              <div>
                <small>{spot.label}</small>
                <strong>{spot.value}</strong>
              </div>
            </button>
          ))}
        </div>
      )}

      {displayedHotspot && (
        <div className="stage-hotspot-card" role="region" aria-label="הסבר על מאפיין הדגם">
          <div className="stage-hotspot-card-head">
            <div>
              <small>{displayedHotspot.label}</small>
              <strong>{displayedHotspot.value}</strong>
            </div>
            <div className="stage-hotspot-card-actions">
              {hotspots.length > 1 && (
                <button
                  type="button"
                  aria-label="מאפיין הבא"
                  onClick={() => {
                    const nextIdx = ((displayedHotspotIndex ?? 0) + 1) % hotspots.length;
                    setLocalHotspot(nextIdx);
                    onHotspotSelect?.(nextIdx);
                  }}
                >
                  מאפיין הבא
                </button>
              )}
              <button
                type="button"
                aria-label="סגירת הסבר מאפיין"
                onClick={() => {
                  setLocalHotspot(null);
                  onHotspotSelect?.(undefined);
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>
          {displayedHotspot.description && <p>{displayedHotspot.description}</p>}
        </div>
      )}

      <div className="stage-3d-hud">
        <div className="stage-hud-left">
          <div className="stage-hud-views" role="group" aria-label="זוויות מצלמה">
            {([
              ["signature", "מבט ראשי"],
              ["detail", "מבט קרוב"],
              ["angle", "החלל הרחב"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={"stage-hud-pill" + (cameraView === key ? " is-active" : "")}
                aria-pressed={cameraView === key}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="stage-3d-hint">
            {unavailable
              ? "תצוגת צילום חוף (WebGL אינו זמין במכשיר)"
              : interactive
                ? "גררו להזזת הזווית או השתמשו בחצים"
                : tour
                  ? "סיור מצלמה פעיל"
                  : "אפשר להחליף תאורה, זווית וצבע"}
          </span>
        </div>

        <div className="stage-3d-controls">
          <div className="stage-hud-group" role="group" aria-label="תאורת חוף">
            <button
              type="button"
              className={"stage-hud-btn" + (lightingMode === "day" ? " is-active" : "")}
              aria-label="מעבר לאור יום בחוף"
              aria-pressed={lightingMode === "day"}
              title="אור יום בחוף"
              onClick={() => setLight("day")}
            >
              <Sun size={15} />
            </button>
            <button
              type="button"
              className={"stage-hud-btn" + (lightingMode === "night" ? " is-active" : "")}
              aria-label="מעבר לשעת הזהב"
              aria-pressed={lightingMode === "night"}
              title="שעת הזהב (שקיעה)"
              onClick={() => setLight("night")}
            >
              <Sunset size={15} />
            </button>
            <button
              type="button"
              className={"stage-hud-btn" + (lightingMode === "gallery" ? " is-active" : "")}
              aria-label="מעבר לדמדומי חוף"
              aria-pressed={lightingMode === "gallery"}
              title="דמדומי חוף"
              onClick={() => setLight("gallery")}
            >
              <Moon size={15} />
            </button>
          </div>

          <div className="stage-hud-group" role="group" aria-label="זום ותנועה">
            <button
              type="button"
              className="stage-hud-btn"
              aria-label="התקרבות"
              disabled={zoom >= 1.6}
              onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              className="stage-hud-btn"
              aria-label="הרחקה"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.15).toFixed(2)))}
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              className={"stage-hud-btn" + (tour ? " is-active" : "")}
              aria-label={tour ? "עצירת תנועת מצלמה" : "הפעלת תנועת מצלמה"}
              aria-pressed={tour}
              onClick={() => {
                setTour((v) => !v);
                setInteractive(false);
              }}
            >
              {tour ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              type="button"
              className={"stage-hud-btn" + (interactive ? " is-active" : "")}
              aria-label="שליטה חופשית במצלמה"
              aria-pressed={interactive}
              onClick={() => {
                setInteractive((v) => !v);
                setTour(false);
              }}
            >
              <Hand size={15} />
            </button>
            <button
              type="button"
              className="stage-hud-btn"
              aria-label="איפוס מבט"
              onClick={handleReset}
            >
              <RotateCcw size={15} />
            </button>
            {onInspectPhoto && (
              <button
                type="button"
                className="stage-hud-btn"
                aria-label="הגדלת תמונה לבדיקת פרטים"
                title="הגדלת פרטים"
                onClick={onInspectPhoto}
              >
                <Focus size={15} />
              </button>
            )}
            <button
              type="button"
              className="stage-hud-btn"
              aria-label={fullscreen ? "יציאה ממסך מלא" : "מסך מלא"}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Expand size={15} />}
            </button>
          </div>
        </div>
      </div>

      {hotspots.length > 0 && !displayedHotspot && (
        <span className="coastal-stage-tip" aria-hidden>
          <Info size={13} /> בחרו רכיב למידע טכני
        </span>
      )}
    </div>
  );
}

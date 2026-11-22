"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Compass, Moon, SlidersHorizontal, Sparkles, Sun, Sunset } from "lucide-react";
import type { CatalogModel } from "@/lib/validation/models";
import { getPrimaryExhibitImage } from "@/lib/catalog/coastal-assets";
import { extractKeySpecs, formatPrice, is2027Model, isPremiumModel, parseMetrics } from "./catalog-utils";
import type { StudioEnvironment } from "./studio-environments";
import { BeachStage3D, type BeachSlot } from "./beach-stage-3d";

const wrapIndex = (index: number, len: number) => (index + len) % len;

export function CoastalExhibition({
  items,
  counts,
  showPrice,
  paused = false,
  onOpenModel,
  onOpenFinder,
  onJumpToCatalog,
}: {
  items: CatalogModel[];
  counts: { total: number; scooters: number; bikes: number; series2027: number };
  showPrice: boolean;
  paused?: boolean;
  onOpenModel: (model: CatalogModel) => void;
  onOpenFinder: () => void;
  onJumpToCatalog: () => void;
}) {
  const [position, setPosition] = useState<{ id: string; bay: number; from?: { id: string; bay: number } }>(() => ({
    id: items[0]?.id ?? "",
    bay: 0,
  }));
  const [lighting, setLighting] = useState<StudioEnvironment>("day");
  const [unavailable, setUnavailable] = useState(false);
  const gesture = useRef<{ x: number; y: number; pointer: number } | null>(null);

  const index = Math.max(0, items.findIndex((item) => item.id === position.id));
  const current = items[index] ?? items[0];

  const slots: BeachSlot[] = useMemo(() => {
    if (!items.length || !current) return [];
    const offsets = items.length > 1 ? [-1, 0, 1] : [0];
    return offsets.flatMap((offset) => {
      const bayIndex = position.bay + offset;
      const fromModel = position.from?.bay === bayIndex ? items.find((m) => m.id === position.from?.id) : undefined;
      const picked = fromModel ?? items[wrapIndex(index + offset, items.length)];
      const image = picked ? getPrimaryExhibitImage(picked) : undefined;
      return image ? [{ bay: bayIndex, image, key: `${bayIndex}-${picked.id}` }] : [];
    });
  }, [items, current, index, position]);

  if (!current) return null;

  const currentImage = getPrimaryExhibitImage(current);
  const kpi = extractKeySpecs(current);
  const metrics = parseMetrics(current);
  const priceText = showPrice ? formatPrice(current.msrp) : "";

  function move(delta: number) {
    if (items.length < 2) return;
    setPosition((prev) => {
      const curIdx = Math.max(0, items.findIndex((m) => m.id === prev.id));
      const nextItem = items[wrapIndex(curIdx + delta, items.length)];
      return { id: nextItem.id, bay: prev.bay + delta, from: { id: prev.id, bay: prev.bay } };
    });
  }

  function selectModel(targetId: string) {
    if (targetId === current.id) return;
    const nextIdx = items.findIndex((m) => m.id === targetId);
    if (nextIdx < 0) return;
    const delta = nextIdx > index ? 1 : -1;
    setPosition({ id: targetId, bay: position.bay + delta, from: { id: current.id, bay: position.bay } });
  }

  function cycleLighting() {
    setLighting((prev) => (prev === "day" ? "night" : prev === "night" ? "gallery" : "day"));
  }

  function startGesture(e: ReactPointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0 || items.length < 2 || (e.target as Element).closest("a,button,select")) return;
    gesture.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function finishGesture(e: ReactPointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || e.pointerId !== start.pointer) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      move(dx < 0 ? 1 : -1);
    }
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (items.length < 2 || e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      move(e.key === "ArrowLeft" ? 1 : -1);
    }
  }

  return (
    <section
      className={
        "coastal-exhibition no-print"
        + (lighting === "night" ? " is-golden" : lighting === "gallery" ? " is-twilight" : "")
      }
      aria-label="תערוכת חוף הים של דגמי קורטז"
    >
      <div
        className="coastal-exhibition-stage"
        role="group"
        aria-label="במת התצוגה התלת־ממדית. גררו או השתמשו בחצים למעבר בין הדגמים"
        tabIndex={items.length > 1 ? 0 : -1}
        onPointerDown={startGesture}
        onPointerUp={finishGesture}
        onPointerCancel={() => { gesture.current = null; }}
        onKeyDown={onKey}
      >
        <BeachStage3D
          mode="exhibition"
          imageUrl={currentImage}
          alt={current.name}
          slots={slots}
          bay={position.bay}
          environment={lighting}
          paused={paused}
          onUnavailable={() => setUnavailable(true)}
        />

        {!unavailable && (
          <div className="coastal-light-dock" role="group" aria-label="תאורת חוף הים">
            {([
              ["day", "אור יום בחוף", Sun],
              ["night", "שעת הזהב", Sunset],
              ["gallery", "דמדומי חוף", Moon],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                className={"coastal-light-btn" + (lighting === key ? " is-active" : "")}
                aria-label={label}
                aria-pressed={lighting === key}
                title={label}
                onClick={() => setLighting(key)}
              >
                <Icon size={16} aria-hidden />
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              className="coastal-light-cycle"
              aria-label="החלפת תאורת חוף"
              onClick={cycleLighting}
            >
              {lighting === "day" ? <Sun size={16} /> : lighting === "night" ? <Sunset size={16} /> : <Moon size={16} />}
            </button>
          </div>
        )}

        <div className="coastal-filmstrip">
          <div className="coastal-caption" aria-live="polite">
            <div className="coastal-caption-badges">
              <small>{current.device}</small>
              {is2027Model(current) && <span className="coastal-chip-2027">2027</span>}
              {isPremiumModel(current) && <span className="coastal-chip-premium">PREMIUM</span>}
            </div>
            <button type="button" className="coastal-caption-title" dir="ltr" onClick={() => onOpenModel(current)}>
              {current.name}
            </button>
          </div>

          <div className="coastal-paging">
            <button type="button" onClick={() => move(-1)} disabled={items.length < 2} aria-label="לדגם הקודם">
              <ChevronRight size={18} />
            </button>
            <span dir="ltr">
              {String(index + 1).padStart(2, "0")} <i>/</i> {String(items.length).padStart(2, "0")}
            </span>
            <button type="button" onClick={() => move(1)} disabled={items.length < 2} aria-label="לדגם הבא">
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="coastal-exhibition-panel">
        <div className="coastal-kicker">
          <span aria-hidden />
          <strong>CORTEZ COASTAL SHOWROOM</strong>
        </div>

        <h1>הכלי הבא שלכם.{"\n"}מכל זווית.</h1>
        <p className="coastal-lead">
          קולקציית האופניים והקורקינטים החשמליים של קורטז על במת חוף ים־תיכונית חיה — צילומים מקוריים, צבעים מאומתים ומפרט מלא.
        </p>

        <div className="coastal-stats" aria-label="סיכום הקולקציה">
          <div><strong>{counts.total}</strong><span>דגמים בקטלוג</span></div>
          <div><strong>{counts.bikes}</strong><span>אופניים חשמליים</span></div>
          <div><strong>{counts.scooters}</strong><span>קורקינטים</span></div>
          <div><strong>{counts.series2027}</strong><span>סדרת 2027</span></div>
        </div>

        <dl className="coastal-spotlight-specs">
          {priceText && (
            <div>
              <dt>מחיר מומלץ</dt>
              <dd dir="ltr">{priceText}</dd>
            </div>
          )}
          <div>
            <dt>טווח מרבי</dt>
            <dd>{metrics.rangeKm ? `עד ${metrics.rangeKm} ק״מ` : (kpi.range ?? "—")}</dd>
          </div>
          <div>
            <dt>סוללה</dt>
            <dd dir="ltr">{kpi.battery || "—"}</dd>
          </div>
        </dl>

        {items.length > 1 && (
          <label className="coastal-model-picker">
            <span>דילוג מהיר לדגם בבמה</span>
            <select
              value={current.id}
              onChange={(event) => selectModel(event.target.value)}
              aria-label="בחירת דגם בתצוגה"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="coastal-actions">
          <button type="button" className="coastal-btn primary" onClick={() => onOpenModel(current)}>
            <Sparkles size={16} aria-hidden /> לסטודיו ולפרטי הדגם
          </button>
          <button type="button" className="coastal-btn accent" onClick={onOpenFinder}>
            <Compass size={16} aria-hidden /> מצאו את הקורטז שלכם
          </button>
          <button type="button" className="coastal-btn ghost" onClick={onJumpToCatalog}>
            <SlidersHorizontal size={15} aria-hidden /> לכל הדגמים והסינון
          </button>
        </div>
      </div>
    </section>
  );
}

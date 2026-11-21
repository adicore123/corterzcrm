"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import {
  BatteryCharging, Bike, Check, ChevronLeft, ChevronRight, Copy, ExternalLink,
  Eye, EyeOff, Gauge, GitCompareArrows, Maximize2, MessageCircle, Minimize2,
  Pencil, Printer, Route, Search, Share2, ShieldCheck, SlidersHorizontal, Sparkles, X, Zap,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { CatalogModel } from "@/lib/validation/models";
import type { StageHotspot } from "./model-stage-3d";
import {
  buildWhatsappSpecText, extractKeySpecs, formatPrice, getFlagshipModels,
  getModelImages, groupModelSpecs, is2027Model, isPremiumModel,
  isStudioCutoutImage, parseMetrics,
} from "./catalog-utils";

const ShowroomHero3D = dynamic(
  () => import("./showroom-hero-3d").then((mod) => mod.ShowroomHero3D),
  { ssr: false, loading: () => <div className="showroom-hero-canvas is-fallback" aria-hidden /> },
);

const ModelStage3D = dynamic(
  () => import("./model-stage-3d").then((mod) => mod.ModelStage3D),
  {
    ssr: false,
    loading: () => <div className="stage-3d-shell"><div className="stage-3d-fallback"><span>טוען תצוגת 3D…</span></div></div>,
  },
);

type CategoryFilter = "all" | "קורקינט חשמלי" | "אופניים חשמליים" | "2027";
type FitFilter = "all" | "long-range" | "full-susp" | "hydraulic";
type SortOrder = "featured" | "name" | "range-desc" | "price-asc" | "price-desc";

function TiltModelCard({
  model, showPrice, compared, onOpen, onToggleCompare,
}: {
  model: CatalogModel;
  showPrice: boolean;
  compared: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
}) {
  const images = useMemo(() => getModelImages(model), [model]);
  const kpi = useMemo(() => extractKeySpecs(model), [model]);
  const metrics = useMemo(() => parseMetrics(model), [model]);
  const isNew2027 = is2027Model(model);
  const isPremium = isPremiumModel(model);
  const priceText = showPrice ? formatPrice(model.msrp) : "";
  const heroImg = images[0];
  const cutout = heroImg ? isStudioCutoutImage(heroImg) : false;

  function handleMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * 6.5;
    const ry = (px - 0.5) * 8;
    card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }

  function handleLeave(event: ReactPointerEvent<HTMLElement>) {
    const card = event.currentTarget;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--mx", "50%");
    card.style.setProperty("--my", "50%");
  }

  return <article className="showroom-card" onPointerMove={handleMove} onPointerLeave={handleLeave}>
    <div className="showroom-card-glow" aria-hidden />
    <div className="showroom-card-top">
      <div className="showroom-badges">
        <span className="showroom-badge">{model.device}</span>
        {isNew2027 && <span className="showroom-badge badge-red">2027</span>}
        {isPremium && <span className="showroom-badge badge-titanium">PREMIUM</span>}
      </div>
      <button type="button" className={"showroom-compare-btn" + (compared ? " is-active" : "")}
        onClick={onToggleCompare} aria-pressed={compared} title="הוספה להשוואת דגמים">
        {compared ? <Check size={14} /> : <GitCompareArrows size={14} />}
        <span>{compared ? "בהשוואה" : "השוואה"}</span>
      </button>
    </div>

    <button type="button" className="showroom-card-visual" onClick={onOpen} aria-label={"תצוגת 3D ומפרט עבור " + model.name}>
      <div className="showroom-pedestal-shadow" aria-hidden />
      {heroImg ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={heroImg} alt={model.name} className={cutout ? "is-studio-cutout" : undefined} loading="lazy" />
      ) : (
        <span className="showroom-no-img"><Bike size={42} /></span>
      )}
    </button>

    <div className="showroom-card-body">
      <div className="showroom-card-title-row">
        <h3>{model.name}</h3>
        {priceText && <strong className="showroom-price">{priceText}</strong>}
      </div>
      {model.summary && <p className="showroom-card-summary">{model.summary}</p>}

      <div className="showroom-card-metrics" aria-label="נתוני ליבה">
        <div>
          <strong>{metrics.rangeKm ? `${metrics.rangeKm} ק״מ` : (kpi.range ?? "—")}</strong>
          <span>טווח נסיעה</span>
        </div>
        <div>
          <strong>{kpi.battery ?? "—"}</strong>
          <span>סוללה</span>
        </div>
        <div>
          <strong>{metrics.speedKmh ? `${metrics.speedKmh} קמ״ש` : (kpi.speed ?? (kpi.highlight?.value ?? "—"))}</strong>
          <span>{metrics.speedKmh || kpi.speed ? "מהירות" : (kpi.highlight?.label ?? "מאפיין")}</span>
        </div>
      </div>

      <div className="showroom-card-actions">
        <Button onClick={onOpen} className="showroom-cta">
          <Sparkles size={15} /> חקור ב־3D ומפרט מלא
        </Button>
      </div>
    </div>
  </article>;
}

export function AgentCatalog({
  models, publicMode = false, initialModelId,
}: {
  models: CatalogModel[];
  publicMode?: boolean;
  initialModelId?: string;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("featured");
  const [showPrice, setShowPrice] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [flagshipIdx, setFlagshipIdx] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(() =>
    initialModelId && models.some((m) => m.id === initialModelId) ? initialModelId : null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && presentation && !activeId && !compareOpen) {
        setPresentation(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation, activeId, compareOpen]);

  const counts = useMemo(() => ({
    total: models.length,
    scooters: models.filter((m) => m.device === "קורקינט חשמלי").length,
    bikes: models.filter((m) => m.device === "אופניים חשמליים").length,
    series2027: models.filter(is2027Model).length,
  }), [models]);

  const fleetMax = useMemo(() => {
    let maxRange = 60;
    let maxWh = 1152;
    for (const model of models) {
      const m = parseMetrics(model);
      if (m.rangeKm && m.rangeKm > maxRange) maxRange = m.rangeKm;
      if (m.batteryWh && m.batteryWh > maxWh) maxWh = m.batteryWh;
    }
    return { maxRange, maxWh };
  }, [models]);

  const flagships = useMemo(() => getFlagshipModels(models), [models]);
  const currentFlagship = flagships[flagshipIdx % Math.max(flagships.length, 1)] ?? models[0];
  const flagshipImages = useMemo(() => (currentFlagship ? getModelImages(currentFlagship) : []), [currentFlagship]);
  const flagshipMetrics = useMemo(() => (currentFlagship ? parseMetrics(currentFlagship) : null), [currentFlagship]);
  const flagshipKpi = useMemo(() => (currentFlagship ? extractKeySpecs(currentFlagship) : {}), [currentFlagship]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("he");
    const list = models.filter((model) => {
      if (category === "2027" && !is2027Model(model)) return false;
      if ((category === "קורקינט חשמלי" || category === "אופניים חשמליים") && model.device !== category) return false;

      if (fitFilter !== "all") {
        const m = parseMetrics(model);
        if (fitFilter === "long-range" && (m.rangeKm ?? 0) < 45) return false;
        if (fitFilter === "full-susp" && !m.hasFullSuspension) return false;
        if (fitFilter === "hydraulic" && !m.hasHydraulicBrakes) return false;
      }

      if (!q) return true;
      return [model.name, model.device, model.summary ?? "", model.notes ?? ""].some((v) => v.toLocaleLowerCase("he").includes(q))
        || (model.specs ?? []).some((s) => s.label.toLocaleLowerCase("he").includes(q) || s.value.toLocaleLowerCase("he").includes(q));
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      if (sort === "range-desc") return (parseMetrics(b).rangeKm ?? 0) - (parseMetrics(a).rangeKm ?? 0);
      if (sort === "price-asc") return (a.msrp ?? 999_999) - (b.msrp ?? 999_999);
      if (sort === "price-desc") return (b.msrp ?? -1) - (a.msrp ?? -1);
      const aScore = (is2027Model(a) ? 4 : 0) + ((a.specs?.length ?? 0) > 0 ? 2 : 0) + (isPremiumModel(a) ? 1 : 0);
      const bScore = (is2027Model(b) ? 4 : 0) + ((b.specs?.length ?? 0) > 0 ? 2 : 0) + (isPremiumModel(b) ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.name.localeCompare(b.name, "he");
    });
  }, [models, category, fitFilter, search, sort]);

  const activeModel = useMemo(() => models.find((m) => m.id === activeId) ?? null, [models, activeId]);
  const activeImages = useMemo(() => (activeModel ? getModelImages(activeModel) : []), [activeModel]);
  const activeKpi = useMemo(() => (activeModel ? extractKeySpecs(activeModel) : {}), [activeModel]);
  const activeMetrics = useMemo(() => (activeModel ? parseMetrics(activeModel) : null), [activeModel]);
  const activeSpecGroups = useMemo(() => (activeModel ? groupModelSpecs(activeModel.specs) : []), [activeModel]);

  const activeHotspots = useMemo<StageHotspot[]>(() => {
    if (!activeModel) return [];
    const list: StageHotspot[] = [];
    if (activeKpi.battery) list.push({ label: "סוללה", value: activeKpi.battery });
    if (activeKpi.range) list.push({ label: "טווח נסיעה", value: activeKpi.range });
    if (activeKpi.speed) list.push({ label: "מהירות מרבית", value: activeKpi.speed });
    if (activeKpi.highlight) list.push(activeKpi.highlight);
    return list.slice(0, 4);
  }, [activeModel, activeKpi]);

  const comparedModels = useMemo(() =>
    compareIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModel => Boolean(m)), [compareIds, models]);

  const compareSpecKeys = useMemo(() => {
    const keys: string[] = [];
    for (const model of comparedModels) {
      for (const spec of model.specs ?? []) {
        if (!keys.includes(spec.label)) keys.push(spec.label);
      }
    }
    return keys;
  }, [comparedModels]);

  const compareWinners = useMemo(() => {
    const ranges = comparedModels.map((m) => parseMetrics(m).rangeKm ?? 0);
    const whs = comparedModels.map((m) => parseMetrics(m).batteryWh ?? 0);
    const maxR = Math.max(...ranges);
    const maxW = Math.max(...whs);
    const hasDistinctRange = maxR > 0 && new Set(ranges).size > 1;
    const hasDistinctWh = maxW > 0 && new Set(whs).size > 1;
    return {
      maxRange: hasDistinctRange ? maxR : null,
      maxWh: hasDistinctWh ? maxW : null,
    };
  }, [comparedModels]);

  function openModel(model: CatalogModel) {
    setActiveImageIdx(0);
    setActiveId(model.id);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 3) {
        setToast("ניתן להשוות עד 3 דגמים במקביל.");
        return prev;
      }
      return [...prev, id];
    });
  }

  async function togglePresentation() {
    const next = !presentation;
    setPresentation(next);
    try {
      if (next && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      } else if (!next && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => undefined);
      }
    } catch {
      // Viewport takeover remains active even when fullscreen API is unavailable.
    }
  }

  async function copyShareLink(modelId?: string) {
    const url = new URL("/showroom", window.location.origin);
    if (modelId) url.searchParams.set("model", modelId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setToast(modelId ? "קישור ישיר לדגם הועתק לשיתוף עם הלקוח." : "קישור אולם התצוגה הועתק לשיתוף.");
    } catch {
      setToast(url.toString());
    }
  }

  function shareWhatsapp(model: CatalogModel) {
    const url = new URL("/showroom", window.location.origin);
    url.searchParams.set("model", model.id);
    const text = buildWhatsappSpecText(model, showPrice, url.toString());
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }

  const currentStageImage = activeImages[activeImageIdx] ?? activeImages[0];
  const showEditorialStrip = category === "all" && fitFilter === "all" && search.trim() === "" && flagships.length >= 3;

  return <div className={"showroom-root" + (presentation ? " is-presentation" : "") + (publicMode ? " is-public" : "")}>
    <header className="showroom-topbar no-print">
      <div className="showroom-brand-wrap">
        <span className="showroom-logo-pill"><Brand /></span>
        <span className="showroom-pill-live">ARCHITECTURAL SHOWROOM · 2027</span>
      </div>
      <div className="showroom-hero-controls">
        <button type="button" className="showroom-glass-btn" onClick={() => setShowPrice((v) => !v)}>
          {showPrice ? <EyeOff size={15} /> : <Eye size={15} />}
          <span>{showPrice ? "הסתרת מחירון" : "הצגת מחירון"}</span>
        </button>
        <button type="button" className="showroom-glass-btn" onClick={() => copyShareLink()}>
          <Share2 size={15} />
          <span>קישור שיתוף ללקוח</span>
        </button>
        <button type="button" className="showroom-glass-btn is-primary-glass" onClick={togglePresentation}>
          {presentation ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          <span>{presentation ? "יציאה ממצגת" : "מצב מצגת"}</span>
        </button>
      </div>
    </header>

    <section className="showroom-hero no-print">
      <ShowroomHero3D activeCategory={category} />
      <div className="showroom-hero-inner">
        <div className="showroom-hero-grid">
          <div className="showroom-hero-copy">
            <span className="showroom-eyebrow">קולקציית היבואן הרשמית · 2027</span>
            <h1>קטלוג סוכנים · אולם תצוגה תלת־ממדי</h1>
            <p>הדור הבא של הניידות החשמלית. מפרטים הנדסיים מלאים, השוואות ביצועים ובמת 3D אינטראקטיבית לכל דגמי קורטז בזמן אמת.</p>
            <div className="showroom-stats">
              <div><strong>{counts.total}</strong><span>דגמים בקטלוג</span></div>
              <div><strong>{counts.scooters}</strong><span>קורקינטים חשמליים</span></div>
              <div><strong>{counts.bikes}</strong><span>אופניים חשמליים</span></div>
              <div><strong>{counts.series2027}</strong><span>דגמי סדרת 2027</span></div>
            </div>
          </div>

          {currentFlagship && (
            <div className="showroom-spotlight" aria-label="דגם דגל נבחר">
              <div className="spotlight-header">
                <div className="showroom-badges">
                  <span className="showroom-badge badge-red">דגם דגל</span>
                  <span className="showroom-badge">{currentFlagship.device}</span>
                </div>
                {flagships.length > 1 && (
                  <div className="spotlight-nav">
                    <button type="button" onClick={() => setFlagshipIdx((i) => (i - 1 + flagships.length) % flagships.length)} aria-label="דגם דגל קודם">
                      <ChevronRight size={16} />
                    </button>
                    <span>{(flagshipIdx % flagships.length) + 1}/{flagships.length}</span>
                    <button type="button" onClick={() => setFlagshipIdx((i) => (i + 1) % flagships.length)} aria-label="דגם דגל הבא">
                      <ChevronLeft size={16} />
                    </button>
                  </div>
                )}
              </div>

              <button type="button" className="spotlight-stage" onClick={() => openModel(currentFlagship)}>
                {flagshipImages[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={flagshipImages[0]} alt={currentFlagship.name}
                    className={isStudioCutoutImage(flagshipImages[0]) ? "is-studio-cutout" : undefined} />
                ) : <Bike size={48} />}
              </button>

              <div className="spotlight-footer">
                <div className="spotlight-title">
                  <strong>{currentFlagship.name}</strong>
                  {showPrice && currentFlagship.msrp ? <span className="showroom-price">{formatPrice(currentFlagship.msrp)}</span> : null}
                </div>
                <div className="spotlight-metrics">
                  <div>
                    <strong>{flagshipMetrics?.rangeKm ? `${flagshipMetrics.rangeKm} ק״מ` : (flagshipKpi.range ?? "—")}</strong>
                    <span>טווח מרבי</span>
                  </div>
                  <div>
                    <strong>{flagshipMetrics?.batteryWh ? `${flagshipMetrics.batteryWh.toLocaleString("he-IL")} Wh` : (flagshipKpi.battery ?? "—")}</strong>
                    <span>קיבולת אנרגיה</span>
                  </div>
                  <div>
                    <strong>{flagshipMetrics?.speedKmh ? `${flagshipMetrics.speedKmh} קמ״ש` : (flagshipKpi.speed ?? "25 קמ״ש")}</strong>
                    <span>מהירות תקן</span>
                  </div>
                </div>
                <Button onClick={() => openModel(currentFlagship)} className="showroom-cta">
                  <Sparkles size={15} /> כניסה לבמת 3D של הדגם
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>

    {toast && <div className="showroom-toast no-print" role="status"><Check size={16} /><span>{toast}</span></div>}

    {showEditorialStrip && (
      <section className="showroom-flagship-strip no-print" aria-label="סדרת הדגל 2027">
        <div className="flagship-strip-heading">
          <div>
            <span className="showroom-eyebrow">NEW ARRIVALS · 2027</span>
            <h2>נבחרי סדרת 2027</h2>
          </div>
          <button type="button" className="section-link" onClick={() => setCategory("2027")}>
            לכל דגמי 2027 <ChevronLeft size={15} />
          </button>
        </div>
        <div className="flagship-strip-grid">
          {flagships.slice(0, 3).map((item) => {
            const imgs = getModelImages(item);
            const m = parseMetrics(item);
            const rangePct = m.rangeKm ? Math.round((m.rangeKm / fleetMax.maxRange) * 100) : 50;
            return <article key={item.id} className="flagship-bento-card">
              <div className="flagship-bento-top">
                <span className="showroom-badge badge-red">2027 EDITION</span>
                {showPrice && item.msrp ? <strong className="showroom-price">{formatPrice(item.msrp)}</strong> : null}
              </div>
              <button type="button" className="flagship-bento-img" onClick={() => openModel(item)}>
                {imgs[0] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imgs[0]} alt={item.name} className={isStudioCutoutImage(imgs[0]) ? "is-studio-cutout" : undefined} loading="lazy" />
                )}
              </button>
              <div className="flagship-bento-body">
                <h3>{item.name}</h3>
                <p>{item.device}{m.batteryLabel ? ` · ${m.batteryLabel}` : ""}</p>
                {m.rangeKm && <div className="mini-telemetry-bar">
                  <div><span>טווח עד {m.rangeKm} ק״מ</span><span>{m.batteryWh ? `${m.batteryWh} Wh` : ""}</span></div>
                  <div className="telemetry-track"><span style={{ width: `${rangePct}%` }} /></div>
                </div>}
              </div>
            </article>;
          })}
        </div>
      </section>
    )}

    <section className="showroom-toolbar no-print" aria-label="סינון קטלוג סוכנים">
      <div className="toolbar-row">
        <div className="showroom-categories" role="tablist" aria-label="קטגוריות כלים">
          {([
            ["all", `הכל (${counts.total})`],
            ["קורקינט חשמלי", `קורקינטים (${counts.scooters})`],
            ["אופניים חשמליים", `אופניים חשמליים (${counts.bikes})`],
            ["2027", `סדרת 2027 (${counts.series2027})`],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={category === key}
              className={"showroom-cat-pill" + (category === key ? " is-active" : "")}
              onClick={() => setCategory(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="showroom-search-sort">
          <div className="search-field">
            <Search size={17} aria-hidden />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש דגם או מפרט (48V, Tektro, MAX)…" aria-label="חיפוש בקטלוג הסוכנים" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)} aria-label="מיון דגמים">
            <option value="featured">מומלצים וסדרת 2027</option>
            <option value="name">לפי שם דגם</option>
            <option value="range-desc">טווח נסיעה: ארוך לקצר</option>
            <option value="price-asc">מחיר: מהנמוך לגבוה</option>
            <option value="price-desc">מחיר: מהגבוה לנמוך</option>
          </select>
        </div>
      </div>

      <div className="showroom-fit-row" aria-label="התאמה חכמה ללקוח">
        <span className="fit-label"><SlidersHorizontal size={14} aria-hidden /> התאמה מהירה ללקוח:</span>
        {([
          ["long-range", "טווח ארוך 45+ ק״מ"],
          ["full-susp", "שיכוך מלא"],
          ["hydraulic", "בלמים הידראוליים"],
        ] as const).map(([key, label]) => {
          const active = fitFilter === key;
          return <button key={key} type="button" aria-pressed={active}
            className={"fit-chip" + (active ? " is-active" : "")}
            onClick={() => setFitFilter(active ? "all" : key)}>
            {label}
          </button>;
        })}
        {(category !== "all" || fitFilter !== "all" || search) && (
          <button type="button" className="fit-clear" onClick={() => { setCategory("all"); setFitFilter("all"); setSearch(""); }}>
            איפוס סינון ({filtered.length})
          </button>
        )}
      </div>
    </section>

    <section className="showroom-grid no-print" aria-label="דגמי קטלוג">
      {filtered.map((model) => (
        <TiltModelCard key={model.id} model={model} showPrice={showPrice}
          compared={compareIds.includes(model.id)} onOpen={() => openModel(model)}
          onToggleCompare={() => toggleCompare(model.id)} />
      ))}
      {filtered.length === 0 && (
        <div className="showroom-empty">
          <Bike size={34} aria-hidden />
          <strong>לא נמצאו דגמים תואמים לסינון</strong>
          <Button variant="outline" onClick={() => { setSearch(""); setCategory("all"); setFitFilter("all"); }}>הצגת כל הדגמים</Button>
        </div>
      )}
    </section>

    {compareIds.length > 0 && (
      <div className="showroom-compare-dock no-print" role="region" aria-label="סרגל השוואה">
        <div className="compare-dock-chips">
          <span className="compare-dock-label">השוואה ({compareIds.length}/3):</span>
          {comparedModels.map((item) => (
            <span key={item.id} className="compare-chip">
              {item.name}
              <button type="button" onClick={() => toggleCompare(item.id)} aria-label={"הסרת " + item.name + " מהשוואה"}><X size={13} /></button>
            </span>
          ))}
        </div>
        <div className="compare-dock-actions">
          <Button size="sm" disabled={comparedModels.length < 2} onClick={() => setCompareOpen(true)}>
            <GitCompareArrows size={15} /> השוואת דגמים
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCompareIds([])}>ניקוי</Button>
        </div>
      </div>
    )}

    <Dialog.Root open={Boolean(activeModel)} onOpenChange={(next) => { if (!next) setActiveId(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay no-print" />
        <Dialog.Content className="showroom-modal" dir="rtl">
          {activeModel && <>
            <div className="showroom-modal-header no-print">
              <div className="showroom-modal-title">
                <div className="showroom-badges">
                  <span className="showroom-badge">{activeModel.device}</span>
                  {is2027Model(activeModel) && <span className="showroom-badge badge-red">2027</span>}
                  {isPremiumModel(activeModel) && <span className="showroom-badge badge-titanium">PREMIUM</span>}
                  {showPrice && activeModel.msrp ? <span className="showroom-badge badge-price">{formatPrice(activeModel.msrp)}</span> : null}
                </div>
                <Dialog.Title>{activeModel.name}</Dialog.Title>
                <Dialog.Description className="sr-only">תצוגת 3D ומפרט טכני מלא של {activeModel.name}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button size="icon" variant="ghost" className="showroom-close-btn" aria-label="סגירת תצוגת דגם"><X size={20} /></Button>
              </Dialog.Close>
            </div>

            <div className="showroom-modal-grid">
              <div className="showroom-stage-column no-print">
                <ModelStage3D key={activeModel.id} imageUrl={currentStageImage} modelName={activeModel.name}
                  deviceName={activeModel.device} hotspots={activeHotspots} />
                {activeImages.length > 1 && (
                  <div className="showroom-thumbs" role="list" aria-label="זוויות צילום">
                    {activeImages.map((src, idx) => (
                      <button key={src} type="button" className={"showroom-thumb" + (idx === activeImageIdx ? " is-active" : "")}
                        onClick={() => setActiveImageIdx(idx)} aria-label={"תמונה " + (idx + 1)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" aria-hidden className={isStudioCutoutImage(src) ? "is-studio-cutout" : undefined} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="showroom-info-column">
                <div className="print-spec-header">
                  <h1>CORTEZ · {activeModel.name}</h1>
                  <p>{activeModel.device}{showPrice && activeModel.msrp ? " · מחיר מומלץ: " + formatPrice(activeModel.msrp) : ""}</p>
                </div>

                <div className="configurator-hero-metrics">
                  <div>
                    <strong>{activeMetrics?.rangeKm ? `${activeMetrics.rangeKm} ק״מ` : (activeKpi.range ?? "—")}</strong>
                    <span>טווח נסיעה מרבי</span>
                  </div>
                  <div>
                    <strong>{activeMetrics?.batteryWh ? `${activeMetrics.batteryWh.toLocaleString("he-IL")} Wh` : (activeKpi.battery ?? "—")}</strong>
                    <span>{activeKpi.battery ? `אנרגיית סוללה (${activeKpi.battery})` : "סוללה"}</span>
                  </div>
                  <div>
                    <strong>{activeMetrics?.speedKmh ? `${activeMetrics.speedKmh} קמ״ש` : (activeKpi.speed ?? "25 קמ״ש")}</strong>
                    <span>מהירות תקן מרבית</span>
                  </div>
                </div>

                {(activeMetrics?.rangeKm || activeMetrics?.batteryWh) && (
                  <div className="telemetry-bars-card">
                    {activeMetrics.rangeKm && (
                      <div className="telemetry-bar-row">
                        <div><span>טווח מול מוביל הקטלוג ({fleetMax.maxRange} ק״מ)</span><strong>{activeMetrics.rangeKm} ק״מ</strong></div>
                        <div className="telemetry-track"><span style={{ width: `${Math.min(100, Math.round((activeMetrics.rangeKm / fleetMax.maxRange) * 100))}%` }} /></div>
                      </div>
                    )}
                    {activeMetrics.batteryWh && (
                      <div className="telemetry-bar-row">
                        <div><span>קיבולת אנרגיה מול מוביל הקטלוג ({fleetMax.maxWh.toLocaleString("he-IL")} Wh)</span><strong>{activeMetrics.batteryWh.toLocaleString("he-IL")} Wh</strong></div>
                        <div className="telemetry-track"><span style={{ width: `${Math.min(100, Math.round((activeMetrics.batteryWh / fleetMax.maxWh) * 100))}%` }} /></div>
                      </div>
                    )}
                  </div>
                )}

                {activeModel.summary && <p className="showroom-summary">{activeModel.summary}</p>}

                <div className="showroom-kpi-grid">
                  {activeKpi.battery && <div className="showroom-kpi"><BatteryCharging size={18} /><div><small>סוללה</small><strong>{activeKpi.battery}</strong></div></div>}
                  {activeKpi.range && <div className="showroom-kpi"><Route size={18} /><div><small>טווח נסיעה</small><strong>{activeKpi.range}</strong></div></div>}
                  {activeKpi.speed && <div className="showroom-kpi"><Gauge size={18} /><div><small>מהירות מרבית</small><strong>{activeKpi.speed}</strong></div></div>}
                  {activeKpi.highlight && <div className="showroom-kpi"><ShieldCheck size={18} /><div><small>{activeKpi.highlight.label}</small><strong>{activeKpi.highlight.value}</strong></div></div>}
                </div>

                {activeSpecGroups.length > 0 ? (
                  <div className="showroom-specs-wrap">
                    <h3>מפרט טכני מלא</h3>
                    {activeSpecGroups.map((group) => (
                      <div key={group.id} className="spec-group-block">
                        <h4><Zap size={14} aria-hidden /> {group.title}</h4>
                        <dl className="showroom-specs-table">
                          {group.specs.map((spec) => (
                            <div key={spec.label}>
                              <dt>{spec.label}</dt>
                              <dd>{spec.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">טרם הוזן מפרט טכני מפורט לדגם זה במאגר.</p>
                )}

                {activeModel.notes && !activeModel.notes.includes("דגם רשמי מתוך קטלוג") && (
                  <div className="showroom-notes-box">
                    <strong>הערות נוספות</strong>
                    <p>{activeModel.notes}</p>
                  </div>
                )}

                <div className="showroom-modal-actions no-print">
                  <Button onClick={() => shareWhatsapp(activeModel)}>
                    <MessageCircle size={16} /> שיתוף מפרט ב־WhatsApp
                  </Button>
                  <Button variant="outline" onClick={() => copyShareLink(activeModel.id)}>
                    <Copy size={16} /> העתקת קישור לדגם
                  </Button>
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer size={16} /> הדפסת דף מפרט
                  </Button>
                  {!publicMode && (
                    <Button variant="outline" asChild>
                      <Link href={"/models/" + activeModel.id + "/edit"}><Pencil size={16} /> עריכת דגם ומפרט</Link>
                    </Button>
                  )}
                  {activeModel.productUrl && (
                    <Button variant="ghost" asChild>
                      <a href={activeModel.productUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={16} /> באתר קורטז
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    <Dialog.Root open={compareOpen} onOpenChange={setCompareOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay no-print" />
        <Dialog.Content className="showroom-modal showroom-compare-modal" dir="rtl">
          <div className="showroom-modal-header">
            <div className="showroom-modal-title">
              <Dialog.Title>השוואת דגמי קורטז</Dialog.Title>
              <Dialog.Description className="muted">השוואה הנדסית צד־לצד כולל סימון מוביל ביצועים</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" className="showroom-close-btn" aria-label="סגירת השוואה"><X size={20} /></Button>
            </Dialog.Close>
          </div>
          <div className="compare-table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>מאפיין</th>
                  {comparedModels.map((item) => {
                    const imgs = getModelImages(item);
                    return <th key={item.id}>
                      <div className="compare-head-card">
                        {imgs[0] && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={imgs[0]} alt="" aria-hidden className={isStudioCutoutImage(imgs[0]) ? "is-studio-cutout" : undefined} />
                        )}
                        <strong>{item.name}</strong>
                        <small>{item.device}</small>
                      </div>
                    </th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {showPrice && <tr>
                  <th>מחיר מומלץ</th>
                  {comparedModels.map((item) => <td key={item.id}><strong>{formatPrice(item.msrp) || "—"}</strong></td>)}
                </tr>}
                <tr>
                  <th>טווח מרבי</th>
                  {comparedModels.map((item) => {
                    const km = parseMetrics(item).rangeKm;
                    const win = Boolean(compareWinners.maxRange && km === compareWinners.maxRange);
                    return <td key={item.id} className={win ? "is-winner-cell" : undefined}>
                      <strong>{km ? `${km} ק״מ` : "—"}</strong>
                      {win && <span className="compare-winner-badge">מוביל</span>}
                    </td>;
                  })}
                </tr>
                <tr>
                  <th>קיבולת אנרגיה</th>
                  {comparedModels.map((item) => {
                    const wh = parseMetrics(item).batteryWh;
                    const win = Boolean(compareWinners.maxWh && wh === compareWinners.maxWh);
                    return <td key={item.id} className={win ? "is-winner-cell" : undefined}>
                      <strong>{wh ? `${wh.toLocaleString("he-IL")} Wh` : "—"}</strong>
                      {win && <span className="compare-winner-badge">מוביל</span>}
                    </td>;
                  })}
                </tr>
                {compareSpecKeys.map((label) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {comparedModels.map((item) => {
                      const found = item.specs?.find((s) => s.label === label);
                      return <td key={item.id}>{found?.value ?? "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Dialog } from "radix-ui";
import {
  Bike, Check, Compass, Eye, EyeOff, GitCompareArrows,
  Maximize2, Minimize2, Search, Share2, SlidersHorizontal, Sparkles, X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { CatalogModel } from "@/lib/validation/models";
import { writeCatalogState, type CatalogState } from "@/lib/catalog/catalog-state";
import { getCoastalAsset, getPrimaryExhibitImage, isCoastalExhibitUrl, resolveModelVariants } from "@/lib/catalog/coastal-assets";
import {
  extractBatteryVoltage, extractKeySpecs, filterCatalog, formatPrice,
  getFlagshipModels, is2027Model, isPremiumModel, isStudioCutoutImage, parseMetrics,
  type FitFilter,
} from "./catalog-utils";
import { CoastalExhibition } from "./coastal-exhibition";
import { ProductExperience, type InitialStudioState } from "./product-experience";
import { RideFinderDialog } from "./ride-finder";

const ProductCompare3D = dynamic(() => import("./product-compare-3d").then((module) => module.ProductCompare3D), { ssr: false });

type CategoryFilter = "all" | "קורקינט חשמלי" | "אופניים חשמליים" | "2027";
type SortOrder = "featured" | "name" | "range-desc" | "price-asc" | "price-desc";

function CoastalModelCard({
  model,
  showPrice,
  compared,
  onOpen,
  onToggleCompare,
}: {
  model: CatalogModel;
  showPrice: boolean;
  compared: boolean;
  onOpen: (variantId?: string) => void;
  onToggleCompare: () => void;
}) {
  const variants = useMemo(() => resolveModelVariants(model), [model]);
  const [pickedVariantId, setPickedVariantId] = useState<string | undefined>(undefined);
  const pickedVariant = variants.find((v) => v.id === pickedVariantId);
  const coastal = useMemo(() => getCoastalAsset(model), [model]);
  const defaultImg = useMemo(() => getPrimaryExhibitImage(model), [model]);
  const displayedImg = pickedVariant?.imageUrl || defaultImg;
  const isCleanCutout = Boolean(displayedImg && (isCoastalExhibitUrl(displayedImg) || isStudioCutoutImage(displayedImg)));

  const kpi = useMemo(() => extractKeySpecs(model), [model]);
  const metrics = useMemo(() => parseMetrics(model), [model]);
  const isNew2027 = is2027Model(model);
  const isPremium = isPremiumModel(model);
  const comingSoon = coastal?.availabilityStatus === "coming-soon";
  const priceText = showPrice ? formatPrice(pickedVariant?.price ?? model.msrp) : "";

  return (
    <article className="showroom-card coastal-card">
      <div className="showroom-card-top">
        <div className="showroom-badges">
          <span className="showroom-badge">{model.device}</span>
          {model.published === false && <span className="showroom-badge badge-red">טיוטה</span>}
          {comingSoon && <span className="showroom-badge badge-sand">בקרוב בישראל</span>}
          {isNew2027 && <span className="showroom-badge badge-red">2027</span>}
          {isPremium && <span className="showroom-badge badge-titanium">PREMIUM</span>}
        </div>
        <button
          type="button"
          className={"showroom-compare-btn" + (compared ? " is-active" : "")}
          onClick={onToggleCompare}
          aria-pressed={compared}
          title="הוספה להשוואת דגמים"
        >
          {compared ? <Check size={14} /> : <GitCompareArrows size={14} />}
          <span>{compared ? "בהשוואה" : "השוואה"}</span>
        </button>
      </div>

      <button
        type="button"
        className="showroom-card-visual coastal-pedestal"
        onClick={() => onOpen(pickedVariantId)}
        aria-label={"גלריה ומפרט עבור " + model.name}
      >
        <div className="showroom-pedestal-shadow" aria-hidden />
        {displayedImg ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayedImg}
            alt={model.name}
            className={isCleanCutout ? "is-studio-cutout" : undefined}
            loading="lazy"
          />
        ) : (
          <span className="showroom-no-img"><Bike size={42} /></span>
        )}
      </button>

      {variants.length > 0 && (
        <div className="card-swatch-row" aria-label={"צבעים זמינים עבור " + model.name}>
          {variants.map((variant) => {
            const active = variant.id === pickedVariantId;
            return (
              <button
                key={variant.id}
                type="button"
                className={"card-swatch-dot" + (active ? " is-active" : "")}
                style={{ backgroundColor: variant.color ?? "#374151" }}
                title={variant.title}
                aria-label={"צבע " + variant.title}
                aria-pressed={active}
                onClick={() => setPickedVariantId((prev) => (prev === variant.id ? undefined : variant.id))}
              />
            );
          })}
          <small className="card-swatch-name">
            {pickedVariant ? pickedVariant.title : `${variants.length} צבעים`}
          </small>
        </div>
      )}

      <div className="showroom-card-body">
        <div className="showroom-card-title-row">
          <h3 dir="ltr">{model.name}</h3>
          {priceText && <strong className="showroom-price" dir="ltr">{priceText}</strong>}
        </div>
        {model.summary && <p className="showroom-card-summary">{model.summary}</p>}

        <div className="showroom-card-metrics" aria-label="נתוני ליבה">
          <div>
            <strong>{metrics.rangeKm ? `${metrics.rangeKm} ק״מ` : (kpi.range ?? "—")}</strong>
            <span>טווח נסיעה</span>
          </div>
          <div>
            <strong dir="ltr">{kpi.battery ?? "—"}</strong>
            <span>סוללה</span>
          </div>
          <div>
            <strong>{metrics.speedKmh ? `${metrics.speedKmh} קמ״ש` : (kpi.speed ?? (kpi.highlight?.value ?? "—"))}</strong>
            <span>{metrics.speedKmh || kpi.speed ? "מהירות" : (kpi.highlight?.label ?? "מאפיין")}</span>
          </div>
        </div>

        <div className="showroom-card-actions">
          <Button onClick={() => onOpen(pickedVariantId)} className="showroom-cta">
            <Sparkles size={15} /> לסטודיו ולפרטי הדגם
          </Button>
        </div>
      </div>
    </article>
  );
}

export function AgentCatalog({
  models,
  publicMode = false,
  initialModelId,
  initialState = {},
  initialStudioState = {},
}: {
  models: CatalogModel[];
  publicMode?: boolean;
  initialModelId?: string;
  initialState?: CatalogState;
  initialStudioState?: InitialStudioState;
}) {
  const [category, setCategory] = useState<CategoryFilter>((initialState.category as CategoryFilter) ?? "all");
  const [fitFilters, setFitFilters] = useState<FitFilter[]>(initialState.fits ?? []);
  const [maxPrice, setMaxPrice] = useState(initialState.maxPrice ?? 0);
  const [voltage, setVoltage] = useState("");
  const [suspension, setSuspension] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [compare3d, setCompare3d] = useState(false);
  const [search, setSearch] = useState(initialState.search ?? "");
  const [sort, setSort] = useState<SortOrder>((initialState.sort as SortOrder) ?? "featured");
  const [showPrice, setShowPrice] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() =>
    initialModelId && models.some((m) => m.id === initialModelId) ? initialModelId : null,
  );
  const [activeVariantSeed, setActiveVariantSeed] = useState<string | undefined>(initialStudioState.variant);
  const [compareIds, setCompareIds] = useState<string[]>(
    initialState.compareIds?.filter((id) => models.some((model) => model.id === id)) ?? [],
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [toast, setToast] = useState("");
  const modalOpener = useRef<HTMLElement | null>(null);
  const compareOpener = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.search = writeCatalogState(url.searchParams, { category, search, fits: fitFilters, maxPrice, sort, compareIds }).toString();
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [category, search, fitFilters, maxPrice, sort, compareIds]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && presentation && !activeId && !compareOpen && !finderOpen) {
        setPresentation(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation, activeId, compareOpen, finderOpen]);

  const counts = useMemo(() => ({
    total: models.length,
    scooters: models.filter((m) => m.device === "קורקינט חשמלי").length,
    bikes: models.filter((m) => m.device === "אופניים חשמליים").length,
    series2027: models.filter(is2027Model).length,
  }), [models]);

  const voltageOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of models) {
      const v = extractBatteryVoltage(m);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [models]);

  const flagships = useMemo(() => {
    const picked = getFlagshipModels(models);
    return picked.length ? picked : models.slice(0, 5);
  }, [models]);

  const filtered = useMemo(() => {
    const list = filterCatalog(models, { search, category, fits: fitFilters, maxPrice, voltage, suspension });
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
  }, [models, category, fitFilters, maxPrice, voltage, suspension, search, sort]);

  const exhibitionItems = useMemo(() => {
    const hasFilter = category !== "all" || fitFilters.length > 0 || maxPrice > 0 || Boolean(voltage) || Boolean(suspension) || Boolean(search.trim());
    if (hasFilter && filtered.length > 0) return filtered.slice(0, 8);
    return flagships;
  }, [category, fitFilters.length, maxPrice, voltage, suspension, search, filtered, flagships]);

  const activeModel = useMemo(() => models.find((m) => m.id === activeId) ?? null, [models, activeId]);
  const comparedModels = useMemo(() =>
    compareIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModel => Boolean(m)), [compareIds, models]);

  const compareSpecKeys = useMemo(() => {
    const keys: string[] = [];
    for (const model of comparedModels) {
      for (const spec of model.specs ?? []) {
        if (!keys.includes(spec.label)) keys.push(spec.label);
      }
    }
    return differencesOnly
      ? keys.filter((label) => new Set(comparedModels.map((model) => model.specs?.find((spec) => spec.label === label)?.value ?? "—")).size > 1)
      : keys;
  }, [comparedModels, differencesOnly]);

  const compareWinners = useMemo(() => {
    const ranges = comparedModels.map((m) => parseMetrics(m).rangeKm ?? 0);
    const whs = comparedModels.map((m) => parseMetrics(m).batteryWh ?? 0);
    const maxR = Math.max(...ranges);
    const maxW = Math.max(...whs);
    const hasDistinctRange = ranges.every((value) => value > 0) && new Set(ranges).size > 1;
    const hasDistinctWh = whs.every((value) => value > 0) && new Set(whs).size > 1;
    return {
      maxRange: hasDistinctRange ? maxR : null,
      maxWh: hasDistinctWh ? maxW : null,
    };
  }, [comparedModels]);

  function openModel(model: CatalogModel, variantId?: string) {
    modalOpener.current = document.activeElement as HTMLElement;
    setActiveVariantSeed(variantId);
    setActiveId(model.id);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.id);
    if (variantId) url.searchParams.set("variant", variantId);
    else url.searchParams.delete("variant");
    window.history.replaceState(window.history.state, "", url);
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

  function clearFilters() {
    setCategory("all");
    setFitFilters([]);
    setMaxPrice(0);
    setVoltage("");
    setSuspension("");
    setSearch("");
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
    const url = new URL(modelId ? "/showroom/" + modelId : "/showroom", window.location.origin);
    try {
      await navigator.clipboard.writeText(url.toString());
      setToast(modelId ? "קישור ישיר לדגם הועתק לשיתוף עם הלקוח." : "קישור אולם התצוגה הועתק לשיתוף.");
    } catch {
      setToast(url.toString());
    }
  }

  const anyFilterActive = Boolean(category !== "all" || fitFilters.length > 0 || maxPrice > 0 || voltage || suspension || search);

  return (
    <div className={"showroom-root coastal-root" + (presentation ? " is-presentation" : "") + (publicMode ? " is-public" : "")}>
      <header className="showroom-topbar no-print">
        <div className="showroom-brand-wrap">
          <span className="showroom-logo-pill"><Brand /></span>
          <span className="showroom-pill-live">CORTEZ · אולם התצוגה</span>
        </div>
        <div className="showroom-hero-controls">
          <button type="button" className="showroom-glass-btn is-finder-trigger" onClick={() => setFinderOpen(true)}>
            <Compass size={15} />
            <span>מצאו את הקורטז שלכם</span>
          </button>
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

      <CoastalExhibition
        items={exhibitionItems}
        counts={counts}
        showPrice={showPrice}
        paused={Boolean(activeModel) || compareOpen || finderOpen}
        onOpenModel={(model) => openModel(model)}
        onOpenFinder={() => setFinderOpen(true)}
        onJumpToCatalog={() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      {toast && <div className="showroom-toast no-print" role="status"><Check size={16} /><span>{toast}</span></div>}

      <section className="showroom-toolbar coastal-toolbar no-print" aria-label="סינון קטלוג" ref={gridRef}>
        <div className="toolbar-row">
          <div className="showroom-categories" role="tablist" aria-label="קטגוריות כלים">
            {([
              ["all", `הכל (${counts.total})`],
              ["קורקינט חשמלי", `קורקינטים (${counts.scooters})`],
              ["אופניים חשמליים", `אופניים חשמליים (${counts.bikes})`],
              ["2027", `סדרת 2027 (${counts.series2027})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={category === key}
                className={"showroom-cat-pill" + (category === key ? " is-active" : "")}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="showroom-search-sort">
            <div className="search-field">
              <Search size={17} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש דגם או מפרט (48V, Tektro, MAX)…"
                aria-label="חיפוש בקטלוג הסוכנים"
              />
            </div>
            <button
              type="button"
              className={"coastal-adv-toggle" + (advancedOpen ? " is-open" : "")}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <SlidersHorizontal size={15} /> סינון מתקדם
            </button>
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
          <span className="fit-label"><SlidersHorizontal size={14} aria-hidden /> התאמה מהירה:</span>
          {([
            ["long-range", "טווח ארוך 45+ ק״מ"],
            ["full-susp", "שיכוך מלא"],
            ["hydraulic", "בלמים הידראוליים"],
          ] as const).map(([key, label]) => {
            const active = fitFilters.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                className={"fit-chip" + (active ? " is-active" : "")}
                onClick={() => setFitFilters((prev) => active ? prev.filter((item) => item !== key) : [...prev, key])}
              >
                {label}
              </button>
            );
          })}
          <label className="catalog-budget">
            תקציב עד{" "}
            <select aria-label="תקציב מרבי" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))}>
              <option value={0}>כל המחירים</option>
              <option value={3000}>₪3,000</option>
              <option value={5000}>₪5,000</option>
              <option value={7000}>₪7,000</option>
              <option value={10000}>₪10,000</option>
            </select>
          </label>
          {anyFilterActive && (
            <button type="button" className="fit-clear" onClick={clearFilters}>
              איפוס סינון ({filtered.length})
            </button>
          )}
        </div>

        {advancedOpen && (
          <div className="coastal-advanced-drawer">
            <label>
              <span>מתח סוללה</span>
              <select aria-label="מתח סוללה" value={voltage} onChange={(e) => setVoltage(e.target.value)}>
                <option value="">הכל</option>
                {voltageOptions.map((v) => (
                  <option key={v} value={String(v)}>{v}V</option>
                ))}
              </select>
            </label>
            <label>
              <span>סוג שיכוך</span>
              <select aria-label="סוג שיכוך" value={suspension} onChange={(e) => setSuspension(e.target.value)}>
                <option value="">הכל</option>
                <option value="full">שיכוך מלא</option>
                <option value="front">שיכוך קדמי</option>
              </select>
            </label>
          </div>
        )}
      </section>

      <div className="catalog-results-heading">
        <h2>מצאו את הכלי שלכם</h2>
        <span>{filtered.length} דגמים בקטלוג</span>
      </div>

      <section className="showroom-grid no-print" aria-label="דגמי קטלוג">
        {filtered.map((model) => (
          <CoastalModelCard
            key={model.id}
            model={model}
            showPrice={showPrice}
            compared={compareIds.includes(model.id)}
            onOpen={(variantId) => openModel(model, variantId)}
            onToggleCompare={() => toggleCompare(model.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="showroom-empty">
            <Bike size={34} aria-hidden />
            <strong>לא נמצאו דגמים תואמים לסינון</strong>
            <Button variant="outline" onClick={clearFilters}>הצגת כל הדגמים</Button>
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
                <button type="button" onClick={() => toggleCompare(item.id)} aria-label={"הסרת " + item.name + " מהשוואה"}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="compare-dock-actions">
            <Button
              size="sm"
              disabled={comparedModels.length < 2}
              onClick={() => {
                compareOpener.current = document.activeElement as HTMLElement;
                setCompareOpen(true);
              }}
            >
              <GitCompareArrows size={15} /> השוואת דגמים
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCompareIds([])}>ניקוי</Button>
          </div>
        </div>
      )}

      <RideFinderDialog
        open={finderOpen}
        onOpenChange={setFinderOpen}
        models={models}
        showPrice={showPrice}
        compareIds={compareIds}
        onOpenModel={(model) => openModel(model)}
        onToggleCompare={toggleCompare}
      />

      <Dialog.Root
        open={Boolean(activeModel)}
        onOpenChange={(next) => {
          if (!next) {
            setActiveId(null);
            setActiveVariantSeed(undefined);
            const url = new URL(window.location.href);
            url.searchParams.delete("model");
            for (const key of ["variant", "view", "environment", "mode", "pose"]) url.searchParams.delete(key);
            window.history.replaceState(window.history.state, "", url);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay no-print" />
          <Dialog.Content
            className="showroom-modal"
            dir="rtl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              modalOpener.current?.focus();
            }}
          >
            {activeModel && (
              <>
                <div className="showroom-modal-header no-print">
                  <div className="showroom-modal-title">
                    <div className="showroom-badges">
                      <span className="showroom-badge">{activeModel.device}</span>
                      {is2027Model(activeModel) && <span className="showroom-badge badge-red">2027</span>}
                      {isPremiumModel(activeModel) && <span className="showroom-badge badge-titanium">PREMIUM</span>}
                      {showPrice && activeModel.msrp ? (
                        <span className="showroom-badge badge-price">{formatPrice(activeModel.msrp)}</span>
                      ) : null}
                    </div>
                    <Dialog.Title>{activeModel.name}</Dialog.Title>
                    <Dialog.Description className="sr-only">
                      גלריה ומפרט טכני מלא של {activeModel.name}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button size="icon" variant="ghost" className="showroom-close-btn" aria-label="סגירת תצוגת דגם">
                      <X size={20} />
                    </Button>
                  </Dialog.Close>
                </div>

                <ProductExperience
                  key={activeModel.id + "-" + (activeVariantSeed ?? "")}
                  model={activeModel}
                  showPrice={showPrice}
                  initialStudioState={
                    activeModel.id === initialModelId
                      ? { ...initialStudioState, variant: activeVariantSeed ?? initialStudioState.variant }
                      : { variant: activeVariantSeed }
                  }
                />
                {!publicMode && (
                  <div className="catalog-editor-link">
                    <Link href={"/models/" + activeModel.id + "/edit"}>עריכת תוכן הדגם והמדיה ←</Link>
                  </div>
                )}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={compareOpen} onOpenChange={setCompareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay no-print" />
          <Dialog.Content
            className="showroom-modal showroom-compare-modal"
            dir="rtl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              compareOpener.current?.focus();
            }}
          >
            <div className="showroom-modal-header">
              <div className="showroom-modal-title">
                <Dialog.Title>השוואת דגמי קורטז</Dialog.Title>
                <Dialog.Description className="muted">
                  השוו את הנתונים וההבדלים בין הדגמים שבחרתם
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button size="icon" variant="ghost" className="showroom-close-btn" aria-label="סגירת השוואה">
                  <X size={20} />
                </Button>
              </Dialog.Close>
            </div>

            {comparedModels.filter((model) => model.model3dUrl).length >= 2 && (
              <button className="studio-tour-launch" onClick={() => setCompare3d((value) => !value)}>
                {compare3d ? "חזרה להשוואת נתונים" : "השוואה בתלת־ממד"}
              </button>
            )}

            {compare3d && comparedModels.filter((model) => model.model3dUrl).length >= 2 ? (
              <ProductCompare3D models={comparedModels} />
            ) : (
              <>
                <label className="compare-differences">
                  <input
                    type="checkbox"
                    checked={differencesOnly}
                    onChange={(event) => setDifferencesOnly(event.target.checked)}
                  />{" "}
                  הצגת הבדלים בלבד במפרט
                </label>
                <div className="compare-table-scroll">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th>מאפיין</th>
                        {comparedModels.map((item) => {
                          const img = getPrimaryExhibitImage(item);
                          return (
                            <th key={item.id}>
                              <div className="compare-head-card">
                                {img && (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={img}
                                    alt=""
                                    aria-hidden
                                    className={isCoastalExhibitUrl(img) || isStudioCutoutImage(img) ? "is-studio-cutout" : undefined}
                                  />
                                )}
                                <strong>{item.name}</strong>
                                <small>{item.device}</small>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {showPrice && (
                        <tr>
                          <th>מחיר מומלץ</th>
                          {comparedModels.map((item) => (
                            <td key={item.id}><strong dir="ltr">{formatPrice(item.msrp) || "—"}</strong></td>
                          ))}
                        </tr>
                      )}
                      <tr>
                        <th>טווח מרבי</th>
                        {comparedModels.map((item) => {
                          const km = parseMetrics(item).rangeKm;
                          const win = Boolean(compareWinners.maxRange && km === compareWinners.maxRange);
                          return (
                            <td key={item.id} className={win ? "is-winner-cell" : undefined}>
                              <strong>{km ? `${km} ק״מ` : "—"}</strong>
                              {win && <span className="compare-winner-badge">מוביל</span>}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <th>קיבולת אנרגיה</th>
                        {comparedModels.map((item) => {
                          const wh = parseMetrics(item).batteryWh;
                          const win = Boolean(compareWinners.maxWh && wh === compareWinners.maxWh);
                          return (
                            <td key={item.id} className={win ? "is-winner-cell" : undefined}>
                              <strong dir="ltr">{wh ? `${wh.toLocaleString("he-IL")} Wh` : "—"}</strong>
                              {win && <span className="compare-winner-badge">מוביל</span>}
                            </td>
                          );
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
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

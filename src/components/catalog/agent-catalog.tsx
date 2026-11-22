"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Dialog } from "radix-ui";
import {
  Bike, Check, Compass, Eye, EyeOff, GitCompareArrows,
  Plus, Search, Share2, SlidersHorizontal, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogModel } from "@/lib/validation/models";
import { writeCatalogState, type CatalogState } from "@/lib/catalog/catalog-state";
import { getCoastalAsset, getPrimaryExhibitImage, isCoastalExhibitUrl, resolveModelVariants } from "@/lib/catalog/coastal-assets";
import {
  DEALER_URL,
  extractBatteryCapacityAh,
  extractBatteryVoltage,
  extractBrakeType,
  extractFolding,
  extractKeySpecs,
  extractModelYear,
  extractSuspensionType,
  extractTireSpec,
  filterCatalog,
  formatPrice,
  getFlagshipModels,
  is2027Model,
  isPremiumModel,
  isStudioCutoutImage,
  parseMetrics,
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
  const voltage = useMemo(() => extractBatteryVoltage(model), [model]);
  const capacityAh = useMemo(() => extractBatteryCapacityAh(model), [model]);
  const isNew2027 = is2027Model(model);
  const isPremium = isPremiumModel(model);
  const comingSoon = coastal?.availabilityStatus === "coming-soon";
  const priceText = showPrice ? formatPrice(pickedVariant?.price ?? model.msrp) : "";

  return (
    <article className="product-card showroom-card coastal-card">
      <div className="card-top showroom-card-top">
        <div className="showroom-badges">
          <span className="showroom-badge">{model.device}</span>
          {model.published === false && <span className="showroom-badge badge-red">טיוטה</span>}
          {comingSoon && <span className="showroom-badge badge-sand">בקרוב בישראל</span>}
          {isNew2027 && <span className="showroom-badge badge-red">2027</span>}
          {isPremium && <span className="showroom-badge badge-titanium">PREMIUM</span>}
        </div>
        <button
          type="button"
          className={"showroom-compare-btn" + (compared ? " is-active selected" : "")}
          onClick={onToggleCompare}
          aria-pressed={compared}
          title="הוספה להשוואת דגמים"
        >
          {compared ? <Check size={14} /> : <Plus size={14} />}
          <span>{compared ? "בהשוואה" : "השוואה"}</span>
        </button>
      </div>

      <button
        type="button"
        className="card-photo showroom-card-visual coastal-pedestal"
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
        <span className="card-status">
          {comingSoon ? "בקרוב בישראל" : isNew2027 ? "קולקציית 2027" : "CORTEZ COLLECTION"}
        </span>
        <div className="showroom-card-title-row">
          <h3 dir="ltr">{model.name}</h3>
        </div>
        {model.summary && <p className="showroom-card-summary">{model.summary}</p>}

        <div className="card-specs showroom-card-metrics" aria-label="נתוני ליבה">
          <div>
            <strong>{metrics.rangeKm ? `עד ${metrics.rangeKm} ק״מ` : (kpi.range ?? "—")}</strong>
            <span>טווח נסיעה</span>
          </div>
          <div>
            <strong dir="ltr">{voltage && capacityAh ? `${voltage}V / ${capacityAh}Ah` : (kpi.battery ?? "—")}</strong>
            <span>סוללה</span>
          </div>
          <div>
            <strong>{metrics.speedKmh ? `${metrics.speedKmh} קמ״ש` : (kpi.speed ?? (kpi.highlight?.value ?? "—"))}</strong>
            <span>{metrics.speedKmh || kpi.speed ? "מהירות" : (kpi.highlight?.label ?? "מאפיין")}</span>
          </div>
        </div>

        <div className="card-bottom showroom-card-actions">
          {priceText ? (
            <strong className="showroom-price" dir="ltr">{priceText}</strong>
          ) : (
            <span className="showroom-price-inquiry">מחיר בבירור</span>
          )}
          <button type="button" onClick={() => onOpen(pickedVariantId)} className="card-discover-link">
            לגלות את הדגם <span aria-hidden>↗</span>
          </button>
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
  const [minRange, setMinRange] = useState(0);
  const [voltage, setVoltage] = useState("");
  const [capacity, setCapacity] = useState("");
  const [brakes, setBrakes] = useState("");
  const [suspension, setSuspension] = useState("");
  const [tires, setTires] = useState("");
  const [year, setYear] = useState("");
  const [availability, setAvailability] = useState("");
  const [folding, setFolding] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [compare3d, setCompare3d] = useState(false);
  const [search, setSearch] = useState(initialState.search ?? "");
  const [sort, setSort] = useState<SortOrder>((initialState.sort as SortOrder) ?? "featured");
  const [showPrice, setShowPrice] = useState(true);
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
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const counts = useMemo(() => ({
    total: models.length,
    scooters: models.filter((m) => m.device === "קורקינט חשמלי").length,
    bikes: models.filter((m) => m.device === "אופניים חשמליים").length,
    series2027: models.filter(is2027Model).length,
  }), [models]);

  const filterOptions = useMemo(() => {
    const uniq = <T extends string | number>(arr: (T | null | undefined)[]) =>
      Array.from(new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== "")))
        .sort((a, b) => String(a).localeCompare(String(b), "he", { numeric: true }));
    return {
      voltages: uniq(models.map(extractBatteryVoltage)),
      capacities: uniq(models.map(extractBatteryCapacityAh)),
      brakes: uniq(models.map(extractBrakeType)),
      suspensions: uniq(models.map(extractSuspensionType)),
      tires: uniq(models.map(extractTireSpec)),
      years: uniq(models.map(extractModelYear)),
      hasFolding: models.some((m) => extractFolding(m) === true),
    };
  }, [models]);

  const filtered = useMemo(() => {
    const list = filterCatalog(models, {
      category,
      search,
      fits: fitFilters,
      maxPrice,
      minRange,
      voltage,
      capacity,
      brakes,
      suspension,
      tires,
      year,
      availability,
      folding,
    });
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      if (sort === "range-desc") return (parseMetrics(b).rangeKm ?? 0) - (parseMetrics(a).rangeKm ?? 0);
      if (sort === "price-asc") return (a.msrp ?? 999_999) - (b.msrp ?? 999_999);
      if (sort === "price-desc") return (b.msrp ?? 0) - (a.msrp ?? 0);
      const a27 = is2027Model(a) ? 1 : 0;
      const b27 = is2027Model(b) ? 1 : 0;
      if (b27 !== a27) return b27 - a27;
      const aPrem = isPremiumModel(a) ? 1 : 0;
      const bPrem = isPremiumModel(b) ? 1 : 0;
      if (bPrem !== aPrem) return bPrem - aPrem;
      return a.name.localeCompare(b.name, "he");
    });
  }, [models, category, search, fitFilters, maxPrice, minRange, voltage, capacity, brakes, suspension, tires, year, availability, folding, sort]);

  const flagships = useMemo(() => getFlagshipModels(models), [models]);
  const exhibitionItems = useMemo(() => {
    const anyFilter = category !== "all" || fitFilters.length > 0 || maxPrice > 0 || minRange > 0 || voltage || capacity || brakes || suspension || tires || year || availability || folding || search.trim().length > 0;
    if (anyFilter && filtered.length > 0) return filtered;
    return flagships.length > 0 ? flagships : models;
  }, [category, fitFilters, maxPrice, minRange, voltage, capacity, brakes, suspension, tires, year, availability, folding, search, filtered, flagships, models]);

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeId) ?? null,
    [models, activeId],
  );

  const comparedModels = useMemo(
    () => compareIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModel => Boolean(m)),
    [models, compareIds],
  );

  const compareWinners = useMemo(() => {
    if (comparedModels.length < 2) return { maxRange: 0, maxWh: 0 };
    const ranges = comparedModels.map((m) => parseMetrics(m).rangeKm ?? 0);
    const whs = comparedModels.map((m) => parseMetrics(m).batteryWh ?? 0);
    return {
      maxRange: Math.max(...ranges),
      maxWh: Math.max(...whs),
    };
  }, [comparedModels]);

  const compareSpecKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of comparedModels) {
      for (const spec of item.specs ?? []) keys.add(spec.label);
    }
    return Array.from(keys).filter((label) => {
      if (!differencesOnly) return true;
      const values = new Set(comparedModels.map((item) => item.specs?.find((spec) => spec.label === label)?.value ?? "—"));
      return values.size > 1;
    });
  }, [comparedModels, differencesOnly]);

  function openModel(model: CatalogModel, variantId?: string) {
    modalOpener.current = document.activeElement as HTMLElement;
    setActiveVariantSeed(variantId);
    setActiveId(model.id);
    const url = new URL(window.location.href);
    url.searchParams.set("model", model.id);
    if (variantId) url.searchParams.set("variant", variantId);
    window.history.replaceState(window.history.state, "", url);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 3) {
        setToast("אפשר להשוות עד שלושה דגמים. הסירו דגם כדי להוסיף אחר.");
        return prev;
      }
      return [...prev, id];
    });
  }

  function clearFilters() {
    setCategory("all");
    setFitFilters([]);
    setMaxPrice(0);
    setMinRange(0);
    setVoltage("");
    setCapacity("");
    setBrakes("");
    setSuspension("");
    setTires("");
    setYear("");
    setAvailability("");
    setFolding("");
    setSearch("");
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

  const anyFilterActive = Boolean(
    category !== "all" || fitFilters.length > 0 || maxPrice > 0 || minRange > 0
    || voltage || capacity || brakes || suspension || tires || year || availability || folding || search,
  );

  return (
    <div className={"showroom-root coastal-root" + (publicMode ? " is-public" : "")}>
      <header className="header cortez-header showroom-topbar no-print">
        <div className="showroom-brand-wrap">
          <div className="logo cortez-logo-btn">
            CORTEZ
            <span>URBAN MOTION · 3D BEACH</span>
          </div>
          <span className="cortez-header-meta">
            {counts.total} דגמים · {counts.series2027} דגמי 2027
          </span>
        </div>

        <div className="showroom-hero-controls">
          <button
            type="button"
            className="cortez-nav-link is-finder-trigger"
            onClick={() => setFinderOpen(true)}
          >
            <Compass size={14} aria-hidden />
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
          <a className="cortez-nav-link" href={DEALER_URL} target="_blank" rel="noreferrer">
            משווקים ↗
          </a>
        </div>
      </header>

      {toast && <div className="showroom-toast no-print" role="status"><Check size={16} /><span>{toast}</span></div>}

      <CoastalExhibition
        items={exhibitionItems}
        counts={counts}
        showPrice={showPrice}
        paused={Boolean(activeModel) || compareOpen || finderOpen}
        onOpenModel={(model) => openModel(model)}
        onOpenFinder={() => setFinderOpen(true)}
        onJumpToCatalog={() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <section className="showroom-toolbar coastal-toolbar no-print" id="catalog-controls" aria-label="סינון קטלוג" ref={gridRef}>
            <div className="toolbar-row">
              <div className="catalog-tabs showroom-categories" role="tablist" aria-label="קטגוריות כלים">
                {([
                  ["all", "כל הדגמים", counts.total],
                  ["קורקינט חשמלי", "קורקינטים חשמליים", counts.scooters],
                  ["אופניים חשמליים", "אופניים חשמליים", counts.bikes],
                  ["2027", "סדרת 2027", counts.series2027],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={category === key}
                    className={"showroom-cat-pill" + (category === key ? " is-active active" : "")}
                    onClick={() => setCategory(key)}
                  >
                    {label} <small>({count})</small>
                  </button>
                ))}
              </div>

              <div className="catalog-toolbar showroom-search-sort">
                <div className="search search-field">
                  <Search size={17} aria-hidden />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חפשו דגם, סדרה או מפרט (48V, Tektro, MAX)…"
                    aria-label="חיפוש בקטלוג הסוכנים"
                  />
                </div>
                <button
                  type="button"
                  className={"filter-button coastal-adv-toggle" + (advancedOpen ? " is-open active" : "")}
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
              <div className="filter-panel coastal-advanced-drawer">
                <label>
                  <span>תקציב מרבי · {maxPrice > 0 ? formatPrice(maxPrice) : "ללא הגבלה"}</span>
                  <input
                    type="range"
                    min={2000}
                    max={9500}
                    step={250}
                    value={maxPrice || 9500}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMaxPrice(val >= 9500 ? 0 : val);
                    }}
                  />
                </label>
                <label>
                  <span>טווח מפורסם מינימלי · {minRange} ק״מ</span>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={5}
                    value={minRange}
                    onChange={(e) => setMinRange(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>מתח סוללה (V)</span>
                  <select aria-label="מתח סוללה" value={voltage} onChange={(e) => setVoltage(e.target.value)}>
                    <option value="">הכול</option>
                    {filterOptions.voltages.map((v) => (
                      <option key={v} value={String(v)}>{v}V</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>קיבולת (Ah)</span>
                  <select aria-label="קיבולת סוללה" value={capacity} onChange={(e) => setCapacity(e.target.value)}>
                    <option value="">הכול</option>
                    {filterOptions.capacities.map((c) => (
                      <option key={c} value={String(c)}>{c}Ah</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>מערכת בלימה</span>
                  <select aria-label="מערכת בלימה" value={brakes} onChange={(e) => setBrakes(e.target.value)}>
                    <option value="">הכול</option>
                    {filterOptions.brakes.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>שיכוך</span>
                  <select aria-label="סוג שיכוך" value={suspension} onChange={(e) => setSuspension(e.target.value)}>
                    <option value="">הכול</option>
                    <option value="full">שיכוך מלא</option>
                    <option value="front">שיכוך קדמי</option>
                  </select>
                </label>
                <label>
                  <span>צמיגים</span>
                  <select aria-label="צמיגים" value={tires} onChange={(e) => setTires(e.target.value)}>
                    <option value="">הכול</option>
                    {filterOptions.tires.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>שנת דגם</span>
                  <select aria-label="שנת דגם" value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">הכול</option>
                    {filterOptions.years.map((y) => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>זמינות</span>
                  <select aria-label="זמינות" value={availability} onChange={(e) => setAvailability(e.target.value)}>
                    <option value="">הכול</option>
                    <option value="in-stock">מופיע במלאי באתר המקור</option>
                    <option value="coming-soon">בקרוב</option>
                  </select>
                </label>
                {filterOptions.hasFolding && (
                  <label>
                    <span>קיפול</span>
                    <select aria-label="קיפול" value={folding} onChange={(e) => setFolding(e.target.value)}>
                      <option value="">הכול</option>
                      <option value="yes">מתקפל לפי המפרט</option>
                    </select>
                  </label>
                )}
                <button type="button" className="text-button filter-reset-btn" onClick={clearFilters}>
                  <X size={15} /> ניקוי סינון
                </button>
              </div>
            )}
          </section>

          <div className="result-count catalog-results-heading">
            <h2>מצאו את הכלי שלכם</h2>
            <span>{filtered.length} מתוך {counts.total} דגמים · מחירים ומפרטים מהאתר הרשמי</span>
          </div>

          <section className="product-grid showroom-grid no-print" aria-label="דגמי קטלוג">
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
              <div className="empty showroom-empty">
                <Bike size={34} aria-hidden />
                <strong>הדרך שלכם עוד מחכה — לא נמצאו דגמים תואמים לסינון</strong>
                <Button variant="outline" onClick={clearFilters}>הצגת כל הדגמים</Button>
              </div>
            )}
          </section>

      <footer className="cortez-footer no-print">
        <div className="footer-brand" dir="ltr">CORTEZ</div>
        <div>
          הדרך שלכם. הקצב שלכם.
          <br />
          <small>נתוני המוצרים והמפרטים מהאתר הרשמי · CORTEZ URBAN MOTION</small>
        </div>
        <div className="cortez-footer-links">
          <button type="button" onClick={() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>הדגמים שלנו</button>
          <button type="button" onClick={() => setFinderOpen(true)}>מצאו את ה־CORTEZ שלכם</button>
          <a href={DEALER_URL} target="_blank" rel="noreferrer">משווקים ↗</a>
          <a href="https://cortez.co.il/" target="_blank" rel="noreferrer">האתר הרשמי ↗</a>
        </div>
      </footer>

      {compareIds.length > 0 && (
        <div className="compare-tray showroom-compare-dock no-print" role="region" aria-label="סרגל השוואה">
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
                  השוו את הנתונים וההבדלים בין הדגמים שבחרתם · הבדלים מסומנים בכתום
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
                <div className="comparison-scroll compare-table-scroll">
                  <table className="comparison compare-table">
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
                        <tr className={new Set(comparedModels.map((m) => m.msrp)).size > 1 ? "different" : undefined}>
                          <th>מחיר מומלץ</th>
                          {comparedModels.map((item) => (
                            <td key={item.id}><strong dir="ltr">{formatPrice(item.msrp) || "—"}</strong></td>
                          ))}
                        </tr>
                      )}
                      <tr className={new Set(comparedModels.map((m) => parseMetrics(m).rangeKm)).size > 1 ? "different" : undefined}>
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
                      <tr className={new Set(comparedModels.map((m) => parseMetrics(m).batteryWh)).size > 1 ? "different" : undefined}>
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
                      {compareSpecKeys.map((label) => {
                        const vals = comparedModels.map((item) => item.specs?.find((s) => s.label === label)?.value ?? "—");
                        const diff = new Set(vals).size > 1;
                        return (
                          <tr key={label} className={diff ? "different" : undefined}>
                            <th>{label}</th>
                            {comparedModels.map((item) => {
                              const found = item.specs?.find((s) => s.label === label);
                              return <td key={item.id}>{found?.value ?? "—"}</td>;
                            })}
                          </tr>
                        );
                      })}
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

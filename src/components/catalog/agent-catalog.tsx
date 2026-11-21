"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import {
  BatteryCharging, Bike, Check, Copy, ExternalLink, Eye, EyeOff, Gauge,
  GitCompareArrows, Maximize2, MessageCircle, Minimize2, Pencil, Printer,
  Route, Search, Share2, ShieldCheck, Sparkles, X, Zap,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { CatalogModel } from "@/lib/validation/models";
import {
  buildWhatsappSpecText, extractKeySpecs, formatPrice, getModelImages,
  is2027Model, isPremiumModel,
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
type SortOrder = "featured" | "name" | "price-asc" | "price-desc";

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
  const isNew2027 = is2027Model(model);
  const isPremium = isPremiumModel(model);
  const priceText = showPrice ? formatPrice(model.msrp) : "";

  function handleMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * 9;
    const ry = (px - 0.5) * 11;
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
        {isPremium && <span className="showroom-badge badge-gold">PREMIUM</span>}
      </div>
      <button type="button" className={"showroom-compare-btn" + (compared ? " is-active" : "")}
        onClick={onToggleCompare} aria-pressed={compared} title="הוספה להשוואת דגמים">
        {compared ? <Check size={14} /> : <GitCompareArrows size={14} />}
        <span>{compared ? "בהשוואה" : "השוואה"}</span>
      </button>
    </div>

    <button type="button" className="showroom-card-visual" onClick={onOpen} aria-label={"תצוגת 3D ומפרט עבור " + model.name}>
      <div className="showroom-pedestal-ring" aria-hidden />
      {images[0] ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={images[0]} alt={model.name} loading="lazy" />
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
      <div className="showroom-spec-pills">
        {kpi.battery && <span><BatteryCharging size={13} aria-hidden />{kpi.battery}</span>}
        {kpi.range && <span><Route size={13} aria-hidden />{kpi.range}</span>}
        {kpi.speed && <span><Gauge size={13} aria-hidden />{kpi.speed}</span>}
        {!kpi.speed && kpi.highlight && <span><Zap size={13} aria-hidden />{kpi.highlight.value}</span>}
      </div>
      <div className="showroom-card-actions">
        <Button onClick={onOpen} className="showroom-cta">
          <Sparkles size={16} /> תצוגת 3D ומפרט מלא
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("featured");
  const [showPrice, setShowPrice] = useState(true);
  const [presentation, setPresentation] = useState(false);
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
    function onFullscreenChange() {
      if (!document.fullscreenElement && presentation) {
        // Keep presentation mode usable even without native fullscreen; escape key handled below.
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && presentation && !activeId && !compareOpen) {
        setPresentation(false);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [presentation, activeId, compareOpen]);

  const counts = useMemo(() => ({
    total: models.length,
    scooters: models.filter((m) => m.device === "קורקינט חשמלי").length,
    bikes: models.filter((m) => m.device === "אופניים חשמליים").length,
    series2027: models.filter(is2027Model).length,
  }), [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("he");
    const list = models.filter((model) => {
      if (category === "2027" && !is2027Model(model)) return false;
      if ((category === "קורקינט חשמלי" || category === "אופניים חשמליים") && model.device !== category) return false;
      if (!q) return true;
      return [model.name, model.device, model.summary ?? "", model.notes ?? ""].some((v) => v.toLocaleLowerCase("he").includes(q))
        || (model.specs ?? []).some((s) => s.label.toLocaleLowerCase("he").includes(q) || s.value.toLocaleLowerCase("he").includes(q));
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      if (sort === "price-asc") return (a.msrp ?? 999_999) - (b.msrp ?? 999_999);
      if (sort === "price-desc") return (b.msrp ?? -1) - (a.msrp ?? -1);
      const aScore = (is2027Model(a) ? 4 : 0) + ((a.specs?.length ?? 0) > 0 ? 2 : 0) + (isPremiumModel(a) ? 1 : 0);
      const bScore = (is2027Model(b) ? 4 : 0) + ((b.specs?.length ?? 0) > 0 ? 2 : 0) + (isPremiumModel(b) ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.name.localeCompare(b.name, "he");
    });
  }, [models, category, search, sort]);

  const activeModel = useMemo(() => models.find((m) => m.id === activeId) ?? null, [models, activeId]);
  const activeImages = useMemo(() => (activeModel ? getModelImages(activeModel) : []), [activeModel]);
  const activeKpi = useMemo(() => (activeModel ? extractKeySpecs(activeModel) : {}), [activeModel]);
  const comparedModels = useMemo(() => compareIds.map((id) => models.find((m) => m.id === id)).filter((m): m is CatalogModel => Boolean(m)), [compareIds, models]);
  const compareSpecKeys = useMemo(() => {
    const keys: string[] = [];
    for (const model of comparedModels) {
      for (const spec of model.specs ?? []) {
        if (!keys.includes(spec.label)) keys.push(spec.label);
      }
    }
    return keys;
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

  return <div className={"showroom-root" + (presentation ? " is-presentation" : "") + (publicMode ? " is-public" : "")}>
    <section className="showroom-hero no-print">
      <ShowroomHero3D activeCategory={category} />
      <div className="showroom-hero-inner">
        <div className="showroom-hero-top">
          <div className="showroom-brand-wrap">
            <Brand />
            <span className="showroom-pill-live">3D WEBGL SHOWROOM</span>
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
            <button type="button" className="showroom-glass-btn" onClick={togglePresentation}>
              {presentation ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{presentation ? "יציאה ממצגת" : "מצב מצגת"}</span>
            </button>
          </div>
        </div>

        <div className="showroom-hero-copy">
          <h1>קטלוג סוכנים · אולם תצוגה תלת־ממדי</h1>
          <p>תצוגה אינטראקטיבית ומפרטים טכניים רשמיים של כל דגמי קורטז — מסונכרנים בזמן אמת ממאגר הדגמים של היבואן.</p>
        </div>

        <div className="showroom-stats">
          <div><strong>{counts.total}</strong><span>דגמים בקטלוג</span></div>
          <div><strong>{counts.scooters}</strong><span>קורקינטים חשמליים</span></div>
          <div><strong>{counts.bikes}</strong><span>אופניים חשמליים</span></div>
          <div><strong>{counts.series2027}</strong><span>דגמי סדרת 2027</span></div>
        </div>
      </div>
    </section>

    {toast && <div className="showroom-toast no-print" role="status"><Check size={16} /><span>{toast}</span></div>}

    <section className="showroom-toolbar no-print" aria-label="סינון קטלוג סוכנים">
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
            placeholder="חיפוש דגם או מפרט (למשל 48V, שיכוך, MAX)…" aria-label="חיפוש בקטלוג הסוכנים" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)} aria-label="מיון דגמים">
          <option value="featured">מומלצים וסדרת 2027</option>
          <option value="name">לפי שם דגם</option>
          <option value="price-asc">מחיר: מהנמוך לגבוה</option>
          <option value="price-desc">מחיר: מהגבוה לנמוך</option>
        </select>
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
          <strong>לא נמצאו דגמים תואמים לחיפוש</strong>
          <Button variant="outline" onClick={() => { setSearch(""); setCategory("all"); }}>הצגת כל הדגמים</Button>
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
                <ModelStage3D key={activeModel.id} imageUrl={currentStageImage} modelName={activeModel.name} deviceName={activeModel.device} />
                {activeImages.length > 1 && (
                  <div className="showroom-thumbs" role="list" aria-label="זוויות צילום">
                    {activeImages.map((src, idx) => (
                      <button key={src} type="button" className={"showroom-thumb" + (idx === activeImageIdx ? " is-active" : "")}
                        onClick={() => setActiveImageIdx(idx)} aria-label={"תמונה " + (idx + 1)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" aria-hidden loading="lazy" />
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
                {activeModel.summary && <p className="showroom-summary">{activeModel.summary}</p>}

                <div className="showroom-kpi-grid">
                  {activeKpi.battery && <div className="showroom-kpi"><BatteryCharging size={18} /><div><small>סוללה</small><strong>{activeKpi.battery}</strong></div></div>}
                  {activeKpi.range && <div className="showroom-kpi"><Route size={18} /><div><small>טווח נסיעה</small><strong>{activeKpi.range}</strong></div></div>}
                  {activeKpi.speed && <div className="showroom-kpi"><Gauge size={18} /><div><small>מהירות מרבית</small><strong>{activeKpi.speed}</strong></div></div>}
                  {activeKpi.highlight && <div className="showroom-kpi"><ShieldCheck size={18} /><div><small>{activeKpi.highlight.label}</small><strong>{activeKpi.highlight.value}</strong></div></div>}
                </div>

                {activeModel.specs && activeModel.specs.length > 0 ? (
                  <div className="showroom-specs-wrap">
                    <h3>מפרט טכני מלא</h3>
                    <dl className="showroom-specs-table">
                      {activeModel.specs.map((spec) => (
                        <div key={spec.label}>
                          <dt>{spec.label}</dt>
                          <dd>{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
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
              <Dialog.Description className="muted">השוואת מפרט טכני צד־לצד</Dialog.Description>
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
                          <img src={imgs[0]} alt="" aria-hidden />
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

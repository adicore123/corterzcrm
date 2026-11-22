"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowUpLeft, BatteryCharging, Check, ChevronLeft, ChevronRight, Copy, ImageIcon, Maximize2, MessageCircle, Printer, Route, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import type { CatalogModel, StudioFeature } from "@/lib/validation/models";
import { extractKeySpecs, formatPrice, getModelImages, getProductFeatures, groupModelSpecs, parseMetrics } from "./catalog-utils";

import { buildTour, decodeStudioPose, encodeStudioPose, resolveVariant, studioShareParams, studioViews, type CameraPose } from "./studio-state";
import { studioEnvironments, type StudioEnvironment } from "./studio-environments";
import { ProductTour, useProductTour } from "./product-tour";
import { ProductVariants } from "./product-variants";
import { ProductArEntry } from "./product-ar-entry";
export type InitialStudioState = { variant?: string; view?: string; environment?: string; mode?: string; pose?: string };

const ProductViewer3D = dynamic(() => import("./product-viewer-3d").then((module) => module.ProductViewer3D), { ssr: false, loading: () => <div className="product-viewer-status">טוען תצוגה…</div> });
const ModelStage3D = dynamic(() => import("./model-stage-3d").then((module) => module.ModelStage3D), { ssr: false, loading: () => <div className="product-viewer-status">טוען את במת התלת־ממד…</div> });

function Photo({ src, name, className = "" }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="product-photo-unavailable"><ImageIcon size={32} /><span>תמונה אינה זמינה</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className={className} onError={() => setFailed(true)} />;
}

export function ProductExperience({ model, showPrice = true, standalone = false, initialStudioState = {} }: { model: CatalogModel; showPrice?: boolean; standalone?: boolean; initialStudioState?: InitialStudioState }) {
  const [variantId, setVariantId] = useState<string | undefined>(() => resolveVariant(model.studio?.variants, initialStudioState.variant)?.id);
  const variant = resolveVariant(model.studio?.variants, variantId);
  const images = useMemo(() => [...new Set([...(variant?.imageUrl ? [variant.imageUrl] : []), ...getModelImages(model)])], [model, variant]);
  const modelUrl = variant?.model3dUrl || model.model3dUrl;
  const [environment, setEnvironment] = useState<StudioEnvironment>(() => Object.hasOwn(studioEnvironments, initialStudioState.environment ?? "") ? initialStudioState.environment as StudioEnvironment : "day");
  const [cameraView, setCameraView] = useState(() => Object.hasOwn(studioViews, initialStudioState.view ?? "") || model.studio?.cameras?.some((camera) => camera.id === initialStudioState.view) ? initialStudioState.view! : "signature");
  const [mediaReady, setMediaReady] = useState(false);
  const [sharedPose, setSharedPose] = useState<{ source: string; pose: CameraPose } | undefined>(() => {
    const pose = decodeStudioPose(initialStudioState.pose); return pose ? { source: "shared", pose } : undefined;
  });
  function changeView(next: string) { setSharedPose(undefined); setCameraView(next); }
  const specs = extractKeySpecs(model), metrics = parseMetrics(model), groups = groupModelSpecs(model.specs);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"studio" | "photos" | "3d" | "video">(() => initialStudioState.mode === "3d" && modelUrl ? "3d" : initialStudioState.mode === "photos" ? "photos" : "studio");
  const [zoomOpen, setZoomOpen] = useState(false), [zoom, setZoom] = useState(1);
  const [section, setSection] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const Heading = standalone ? "h1" : "h2";
  const [inspectionImage, setInspectionImage] = useState<string>();
  function openZoom() { zoomOpener.current = document.activeElement as HTMLElement; setInspectionImage(undefined); setZoom(1); setZoomOpen(true); }
  const [selectedFeature, setSelectedFeature] = useState<number | undefined>();
  const features: StudioFeature[] = useMemo(() => model.studio?.features?.length ? model.studio.features : getProductFeatures(model), [model]);
  const steps = useMemo(() => buildTour({ ...model, features }), [model, features]);
  const tour = useProductTour(steps, mediaReady);
  const activeFeature = tour.state.active ? tour.step?.featureIndex : selectedFeature;
  const selected = features[activeFeature ?? 0];
  const effectiveView = tour.state.active ? tour.step?.view ?? cameraView : cameraView;
  const effectiveIndex = tour.state.active && tour.step?.imageIndex !== undefined && images[tour.step.imageIndex] ? tour.step.imageIndex : index;
  const image = images[effectiveIndex];
  const sharedQuery = studioShareParams({ variant: variantId, view: effectiveView, environment, mode, pose: sharedPose && mode === "3d" ? encodeStudioPose(sharedPose.pose) : undefined });
  const sharePath = `/showroom/${model.id}?${sharedQuery}`;
  const returnMode = useRef(mode);
  const displayPrice = variant ? variant.price : model.msrp;
  function pauseTour() {
    if (!tour.state.active) return;
    setCameraView(effectiveView); setIndex(effectiveIndex); setSelectedFeature(activeFeature);
    tour.dispatch({ type: "exit" });
  }
  function startTour() { returnMode.current = mode; if (mode === "photos" || mode === "video") setMode(modelUrl ? "3d" : "studio"); tour.dispatch({ type: "start", total: steps.length }); }
  function exitTour() { if (!tour.state.active) return; tour.dispatch({ type: "exit" }); setMode(returnMode.current); }
  useEffect(() => {
    const current = new URL(window.location.href);
    for (const key of ["variant", "view", "environment", "mode", "pose"]) current.searchParams.delete(key);
    for (const [key, value] of studioShareParams({ variant: variantId, view: cameraView, environment, mode, pose: sharedPose && mode === "3d" ? encodeStudioPose(sharedPose.pose) : undefined })) current.searchParams.set(key, value);
    if (current.toString() !== window.location.href) window.history.replaceState(window.history.state, "", current);
  }, [variantId, cameraView, environment, mode, sharedPose]);
  function navigate(delta: number) { if (!images.length) return; setInspectionImage(undefined); pauseTour(); setIndex((effectiveIndex + delta + images.length) % images.length); setZoom(1); }
  function share() {
    const url = new URL(sharePath, window.location.origin).toString();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${model.name}\n${model.summary ?? ""}\n${url}`)}`, "_blank", "noopener,noreferrer");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).toString()); setCopied(true); }
    catch { setCopied(false); }
  }
  return <article className={"product-experience" + (standalone ? " is-standalone" : "")}>
    <div className="product-experience-top">
      <div className="product-media-column">
        <div className="product-media-tabs" aria-label="סוג תצוגת מוצר">
          <button aria-pressed={mode === "studio"} onClick={() => { pauseTour(); setMode("studio"); }}><Scan size={16} />סטודיו 3D</button>
          <button aria-pressed={mode === "photos"} onClick={() => { pauseTour(); setMode("photos"); setMediaReady(true); }}><ImageIcon size={16} />תמונות <span>{images.length}</span></button>
          {modelUrl && <button aria-pressed={mode === "3d"} onClick={() => { pauseTour(); setMode("3d"); }}><Scan size={16} />תלת־ממד</button>}
          {model.videoUrl && <button aria-pressed={mode === "video"} onClick={() => { pauseTour(); setMode("video"); }}>וידאו</button>}
        </div>
        {mode === "3d" && <div className="studio-shared-environments" aria-label="תאורת המודל">{(Object.keys(studioEnvironments) as StudioEnvironment[]).map((key) => <button key={key} aria-pressed={environment === key} onClick={() => setEnvironment(key)}>{studioEnvironments[key].title}</button>)}</div>}
        <div className="product-media-stage">
          {mode === "studio" && <ModelStage3D imageUrl={image} modelName={model.name} deviceName={model.device}
            hotspots={features.slice(0, 4).map((feature) => ({ label: feature.title, value: feature.description.split("\n")[0], description: feature.description.split("\n\n").slice(1).join("\n\n") || feature.description }))}
            activeHotspot={activeFeature} onHotspotSelect={(featureIndex) => { pauseTour(); setSelectedFeature(featureIndex); setSection("overview"); }} onInspectPhoto={image ? openZoom : undefined} environment={environment} view={effectiveView} onEnvironmentChange={setEnvironment} onViewChange={changeView} onInteraction={pauseTour} onReady={setMediaReady} />}
          {mode === "photos" && <>
            <Photo key={image} src={image} name={`${model.name} — תמונה ${index + 1}`} />
            <div className="product-photo-counter">{images.length ? `${String(index + 1).padStart(2, "0")} / ${String(images.length).padStart(2, "0")}` : "אין תמונות"}</div>
            {images.length > 1 && <div className="product-photo-nav"><button onClick={() => navigate(-1)} aria-label="תמונה קודמת"><ChevronRight /></button><button onClick={() => navigate(1)} aria-label="תמונה הבאה"><ChevronLeft /></button></div>}
            {image && <button className="product-expand" onClick={openZoom}><Maximize2 size={16} /> הגדלה ובדיקת פרטים</button>}
          </>}
          {mode === "3d" && modelUrl && <ProductViewer3D key={modelUrl} url={modelUrl} name={model.name} studio={model.studio} variant={variant} viewerId="product" synchronizedPose={sharedPose} onPoseChange={(pose) => setSharedPose({ source: "product", pose })} environment={environment} view={effectiveView} activeFeature={activeFeature} onFeatureSelect={(featureIndex) => { pauseTour(); setSelectedFeature(featureIndex); }} onViewChange={changeView} onInteraction={pauseTour} onReady={setMediaReady} />}
          {mode === "video" && model.videoUrl && (videoFailed ? <div className="product-viewer-status" role="status">הסרטון אינו זמין כרגע. אפשר להמשיך בגלריית התמונות.</div> : <video src={model.videoUrl} controls preload="metadata" onError={() => setVideoFailed(true)} aria-label={`סרטון ${model.name}`} />)}
        </div>
        {(mode === "photos" || mode === "studio") && images.length > 1 && <div className="product-filmstrip" aria-label="בחירת תמונת מוצר">
          {images.map((src, i) => <button key={src} aria-label={`הצגת תמונה ${i + 1}`} aria-pressed={effectiveIndex === i} onClick={() => { pauseTour(); setIndex(i); }}><Photo src={src} name={`תמונה ${i + 1}`} /><span>{String(i + 1).padStart(2, "0")}</span></button>)}
        </div>}
        <ProductTour tour={tour} steps={steps} ready={mode === "photos" || mode === "video" || mediaReady} onStart={startTour} onExit={exitTour} />
        <p className="product-media-caption">{mode === "studio" ? "במת צילום אינטראקטיבית ב־WebGL: סיבוב, תאורת יום ולילה ובחירת מאפיינים. בחרו צילום אחר כדי להחליף את התמונה על הבמה." : mode === "3d" ? "סובבו בגרירה או השתמשו בכפתורי הזוויות. הגלילה ממשיכה לפעול בעמוד." : mode === "video" ? "הפעילו את הסרטון לצפייה בכלי בפעולה." : "עברו בין הצילומים והגדילו כדי לבחון את הכלי מקרוב."}</p>
      </div>
      <div className="product-intro">
        <span className="product-category">{model.device}</span>
        <Heading>{model.name}</Heading>
        {showPrice && displayPrice != null && <div className="product-price">{formatPrice(displayPrice)}<small>מחיר מומלץ לצרכן</small></div>}
        {showPrice && variant && displayPrice == null && <p className="product-data-note">מחיר הגרסה לא צוין. יש לבדוק מול נציג.</p>}
        <ProductVariants variants={model.studio?.variants ?? []} selected={variantId} onSelect={(id) => { exitTour(); setVariantId(id); setSharedPose(undefined); setIndex(0); setSelectedFeature(undefined); }} />
        <p className="product-lead">{model.summary || "כל התמונות ופרטי הדגם, במקום אחד."}</p>
        <div className="product-key-facts">
          <div><Route size={19} /><span>טווח מוצהר עד</span><strong>{metrics.rangeKm ? `${metrics.rangeKm} ק״מ` : (model.metrics?.rangeKm === null ? "לא צוין" : specs.range || "לא צוין")}</strong></div>
          <div><BatteryCharging size={19} /><span>סוללה</span><strong>{specs.battery || "לא צוין"}</strong></div>
          <div><Scan size={19} /><span>{model.metrics?.weightKg ? "משקל" : "מהירות לפי המפרט"}</span><strong>{model.metrics?.weightKg ? `${model.metrics.weightKg} ק״ג` : metrics.speedKmh ? `${metrics.speedKmh} קמ״ש` : (model.metrics?.speedKmh === null ? "לא צוין" : specs.speed || "לא צוין")}</strong></div>
        </div>
        <p className="product-data-note">הנתונים לפי מפרט הדגם. טווח הנסיעה בפועל תלוי בתנאי הדרך, בעומס ובאופן הרכיבה.</p>
        {model.published !== false ? <><div className="product-primary-actions"><button onClick={share}><MessageCircle size={18} />שיתוף הדגם ב־WhatsApp</button><button onClick={copy} aria-label="העתקת קישור לדגם">{copied ? <Check size={18} /> : <Copy size={18} />}</button></div>
        {copied && <span role="status" className="product-copy-status">הקישור הועתק</span>}
        {!variant && <ProductArEntry studio={model.studio} modelUrl={modelUrl} poster={image} productUrl={sharePath} />}
        {!standalone && <Link className="product-full-link" href={sharePath}>פתיחת עמוד מוצר מלא <ArrowUpLeft size={17} /></Link>}</> : <p className="product-data-note">טיוטה פנימית — פרסמו את הדגם כדי לאפשר צפייה ושיתוף עם לקוחות.</p>}
      </div>
    </div>
    <nav className="product-section-nav" aria-label="מידע על הדגם">{[["overview", "מבט מקרוב"], ["specs", "מפרט מלא"], ["ownership", "מידע נוסף"]].map(([id, label]) => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
    <div className="product-details-content">
      {section === "overview" && <section className="product-explore-section">
        <div className="product-section-heading"><span>להכיר את הפרטים</span><h3>מה מרכיב את {model.name}?</h3><p>בחרו מאפיין לצפייה בנתון המופיע במפרט הדגם.</p></div>
        {features.length ? <div className="product-feature-explorer"><div className="product-feature-list">{features.map((feature, i) => <button key={feature.title + i} aria-pressed={activeFeature === i} onClick={() => { pauseTour(); setSelectedFeature(i); }}><span>{String(i + 1).padStart(2, "0")}</span>{feature.title}<ChevronLeft size={16} /></button>)}</div><div className="product-feature-detail"><span>פרטי הדגם</span><h4>{selected?.title}</h4><p>{selected?.description}</p><button onClick={() => { pauseTour(); setMode("photos"); if (selected?.imageUrl || image) { openZoom(); setInspectionImage(selected?.imageUrl); } }} disabled={!selected?.imageUrl && !image}><ZoomIn size={16} /> בדיקה בגלריה</button></div></div> : <p>מידע מפורט יתווסף לאחר אימות המפרט.</p>}
        {(model.dimensions || model.foldedDimensions) && <div className="product-dimensions"><h3>מידות וניידות</h3><dl>{model.dimensions && <div><dt>מידות הכלי</dt><dd>{model.dimensions}</dd></div>}{model.foldedDimensions && <div><dt>במצב מקופל</dt><dd>{model.foldedDimensions}</dd></div>}</dl></div>}
        {model.publicDescription && <div className="product-description"><h3>עוד על הדגם</h3><p>{model.publicDescription}</p></div>}
      </section>}
      {section === "specs" && <section className="product-spec-section"><div className="product-section-heading"><span>כל הנתונים</span><h3>מפרט טכני מלא</h3></div>{groups.length ? groups.map((group) => <div className="product-spec-group" key={group.id}><h4>{group.title}</h4><dl>{group.specs.map((spec) => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl></div>) : <p>מפרט מפורט טרם הוזן לדגם זה.</p>}</section>}
      {section === "ownership" && <section className="product-ownership"><div className="product-section-heading"><span>לפני הבחירה</span><h3>מידע שיעזור להשלים את התמונה</h3></div><p>לפרטי אחריות, זמינות, מידות שלא מופיעות במפרט והתאמה אישית, פנו לנציג עם שם הדגם המדויק.</p>{model.productUrl && <a href={model.productUrl} target="_blank" rel="noopener noreferrer">לפרטי הדגם באתר קורטז <ArrowUpLeft size={16} /></a>}<button onClick={() => window.print()}><Printer size={16} /> הדפסת דף המוצר</button></section>}
    </div>
    <div className="product-print-specs"><h2>{model.name}</h2><p>{showPrice ? formatPrice(displayPrice) : ""}</p>{model.specs?.map((spec) => <p key={spec.label}>{spec.label}: {spec.value}</p>)}</div>
    <Dialog.Root open={zoomOpen} onOpenChange={setZoomOpen}><Dialog.Portal><Dialog.Overlay className="product-zoom-overlay" /><Dialog.Content className="product-zoom-dialog" dir="rtl" onCloseAutoFocus={(event) => { event.preventDefault(); zoomOpener.current?.focus(); }}><div className="product-zoom-toolbar"><Dialog.Title>{model.name} — בדיקת פרטים</Dialog.Title><div><button onClick={() => setZoom((value) => Math.max(1, value - 0.5))} aria-label="הקטנת תמונה"><ZoomOut /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(4, value + 0.5))} aria-label="הגדלת תמונה"><ZoomIn /></button><Dialog.Close aria-label="סגירת הגדלה"><X /></Dialog.Close></div></div><Dialog.Description className="sr-only">הגדילו את התמונה וגללו לבדיקת פרטים. אפשר לעבור בין תמונות בעזרת הכפתורים.</Dialog.Description><div className="product-zoom-scroll"><div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><Photo key={inspectionImage ?? image} src={inspectionImage ?? image} name={model.name} /></div></div>{images.length > 1 && <div className="product-zoom-navigation"><button onClick={() => navigate(-1)}><ChevronRight size={18} />הקודמת</button><span>{index + 1} / {images.length}</span><button onClick={() => navigate(1)}>הבאה<ChevronLeft size={18} /></button></div>}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </article>;
}

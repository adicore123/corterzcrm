"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { CatalogModel } from "@/lib/validation/models";
import { isScaleAccurate, type CameraPose } from "./studio-state";
import type { StudioEnvironment } from "./studio-environments";
const Viewer = dynamic(() => import("./product-viewer-3d").then((module) => module.ProductViewer3D), { ssr: false });

export function ProductCompare3D({ models }: { models: CatalogModel[] }) {
  const items = models.filter((model) => model.model3dUrl).slice(0, 2);
  const [view, setView] = useState("front"), [environment, setEnvironment] = useState<StudioEnvironment>("day");
  const [sync, setSync] = useState<{ source: string; pose: CameraPose }>();
  const [radii, setRadii] = useState<Record<string, number>>({});
  const [measuredScale, setMeasuredScale] = useState<Record<string, boolean>>({});
  const consistentScale = items.length === 2 && items.every((model) => model.studio?.assetVerified && model.studio?.scaleVerified && model.studio.dimensions && measuredScale[model.id]);
  const framing = consistentScale && items.every((model) => radii[model.id]) ? Math.max(...Object.values(radii)) : undefined;
  return <section className="studio-compare" aria-label="השוואה תלת־ממדית">
    <div className="studio-compare-toolbar"><div>{[["front", "חזית"], ["side", "צד"], ["back", "אחור"]].map(([key, title]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</div><select aria-label="תאורת השוואה" value={environment} onChange={(event) => setEnvironment(event.target.value as StudioEnvironment)}><option value="day">סטודיו בהיר</option><option value="night">סטודיו לילה</option><option value="gallery">גלריית טיטניום</option></select></div>
    <p>{consistentScale ? "קנה מידה משותף לפי היחידות שאומתו במודלים." : "השוואת פרטים חזותיים. גודל התצוגה מותאם למסך ואינו השוואת מידות."} סיבוב כלי אחד מסנכרן את כיוון הצפייה בכלי השני.</p>
    <div className="studio-compare-grid">{items.map((model) => <div key={model.id}><h3>{model.name}</h3><div className="studio-compare-stage"><Viewer url={model.model3dUrl!} name={model.name} studio={model.studio} view={view} environment={environment} viewerId={model.id} synchronizedPose={sync} framingRadius={framing} onPoseChange={(pose) => setSync({ source: model.id, pose })} onAssetInfo={(info) => { setRadii((previous) => ({ ...previous, [model.id]: info.radius })); setMeasuredScale((previous) => ({ ...previous, [model.id]: isScaleAccurate(info.size, model.studio?.dimensions) })); }} /></div></div>)}</div>
  </section>;
}

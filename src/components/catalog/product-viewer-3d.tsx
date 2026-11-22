"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Focus, RotateCcw, Ruler, UserRound } from "lucide-react";
import type { StudioConfig, StudioFeature, StudioVariant } from "@/lib/validation/models";
import { cameraAt, createCameraMove, isScaleAccurate, studioViews, type CameraMove, type CameraPose, type Vec3 } from "./studio-state";
import { studioEnvironments, type StudioEnvironment } from "./studio-environments";

export type StudioAssetInfo = { clips: string[]; materials: string[]; size: Vec3; radius: number };
export type PickedAnchor = { nodePath: string; point: Vec3 };
type ViewerProps = {
  url: string; name: string; studio?: StudioConfig; variant?: StudioVariant;
  environment?: StudioEnvironment; view?: string; activeFeature?: number;
  onFeatureSelect?: (index: number) => void; onViewChange?: (view: string) => void;
  onInteraction?: () => void; onReady?: (ready: boolean) => void;
  onAssetInfo?: (info: StudioAssetInfo) => void; pickMode?: boolean; onPick?: (point: PickedAnchor) => void;
  synchronizedPose?: { source: string; pose: CameraPose }; viewerId?: string;
  onPoseChange?: (pose: CameraPose) => void; framingRadius?: number;
};

export function ProductViewer3D(props: ViewerProps) {
  const { url, name, studio, environment = "day", view = "signature", activeFeature, onReady } = props;
  const host = useRef<HTMLDivElement>(null), shell = useRef<HTMLDivElement>(null), overlays = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const runtime = useRef<{ sync: () => void; select: (view: string) => void; action: (id: string, progress: number, play?: boolean) => void; dimensions: (show: boolean) => void; reference: (show: boolean) => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading"), [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState<StudioAssetInfo | null>(null), [scaleValid, setScaleValid] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false), [showReference, setShowReference] = useState(false);
  const [actionId, setActionId] = useState(""), [actionProgress, setActionProgress] = useState(0);
  useEffect(() => { latest.current = props; runtime.current?.sync(); });
  useEffect(() => { onReady?.(status === "ready"); }, [status, onReady]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, contextUnavailable = false, raf = 0;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { queueMicrotask(() => setStatus("error")); return; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .01, 1000);
    camera.position.set(3, 1.4, 3);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", `מודל תלת־ממד של ${name}`); renderer.domElement.setAttribute("role", "img");
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    controls.enablePan = false; controls.enableZoom = false; controls.maxPolarAngle = Math.PI * .85;
    let pmrem: THREE.PMREMGenerator | null = null;
    let environmentMap: THREE.WebGLRenderTarget | null = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environmentMap = pmrem.fromScene(room, .04);
      room.dispose();
      scene.environment = environmentMap.texture;
    } catch {
      environmentMap?.dispose(); pmrem?.dispose(); environmentMap = null; pmrem = null;
    }
    const ambient = new THREE.HemisphereLight(0xffffff, 0x667080, 2);
    const keyLight = new THREE.DirectionalLight(0xffffff, 3); keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024);
    const rimLight = new THREE.DirectionalLight(0xbccfe4, 2); scene.add(ambient, keyLight, rimLight);
    let radius = 1, size = new THREE.Vector3(1, 1, 1), object: THREE.Group | undefined;
    let floor: THREE.Mesh | undefined, rulers: THREE.Group | undefined, reference: THREE.Group | undefined;
    let mixer: THREE.AnimationMixer | undefined, clips: THREE.AnimationClip[] = [], selectedAction: THREE.AnimationAction | undefined;
    let cameraMove: CameraMove | null = null, actionMove: { from: number; to: number; start: number; duration: number } | null = null;
    let currentProgress = 0, currentActionId = "", previousView = "", previousFeature: number | undefined, previousSync: object | undefined, variantKey = "";
    let previousFraming: number | undefined;
    const materialColors = new Map<THREE.Material, THREE.Color>();
    const raycaster = new THREE.Raycaster();
    const pointWorld = (feature: StudioFeature): THREE.Vector3 | null => {
      if (!object || !feature.point) return null;
      let node: THREE.Object3D = object;
      for (const index of feature.nodePath?.split("/").filter(Boolean) ?? []) {
        if (!node.children[Number(index)]) return null;
        node = node.children[Number(index)];
      }
      return node.localToWorld(new THREE.Vector3(...feature.point));
    };
    function updateOverlays() {
      if (!overlays.current || !object) return;
      object.updateWorldMatrix(true, true);
      for (const button of overlays.current.querySelectorAll<HTMLElement>("[data-feature-anchor]")) {
        const feature = latest.current.studio?.features?.[Number(button.dataset.featureAnchor)];
        const point = feature && pointWorld(feature);
        if (!point) { button.hidden = true; continue; }
        const projected = point.clone().project(camera);
        const direction = point.clone().sub(camera.position), distance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        const hit = raycaster.intersectObject(object, true)[0];
        const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98 && (!hit || hit.distance >= distance - radius * .035);
        button.hidden = !visible;
        button.style.transform = `translate(-50%, -50%) translate(${(projected.x + 1) * element!.clientWidth / 2}px, ${(1 - projected.y) * element!.clientHeight / 2}px)`;
      }
    }
    function draw() {
      if (disposed || contextUnavailable) return;
      try { renderer.render(scene, camera); updateOverlays(); }
      catch { contextUnavailable = true; setStatus("error"); }
    }
    function requestDraw() {
      if (disposed || raf || contextUnavailable) return;
      raf = requestAnimationFrame(frame);
    }
    function pose(): CameraPose { const framing = latest.current.framingRadius ?? radius; return { position: camera.position.clone().divideScalar(framing).toArray() as Vec3, target: controls.target.clone().divideScalar(framing).toArray() as Vec3 }; }
    function moveTo(next: CameraPose, instant = false) {
      const framing = latest.current.framingRadius ?? radius;
      cameraMove = createCameraMove({ position: camera.position.toArray() as Vec3, target: controls.target.toArray() as Vec3 }, { position: next.position.map((v) => v * framing) as Vec3, target: next.target.map((v) => v * framing) as Vec3 }, performance.now(), reducedMotion || instant);
      requestDraw();
    }
    function selectView(id: string, instant = false) {
      const authored = latest.current.studio?.cameras?.find((item) => item.id === id);
      moveTo(authored ?? (Object.hasOwn(studioViews, id) ? studioViews[id] : studioViews.signature), instant);
    }
    function focusFeature(index: number) {
      const feature = latest.current.studio?.features?.[index];
      if (!feature) return;
      if (feature.view) { selectView(feature.view); return; }
      const point = pointWorld(feature);
      if (!point) return;
      const framing = latest.current.framingRadius ?? radius;
      const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(radius * 1.7);
      moveTo({ position: point.clone().add(offset).divideScalar(framing).toArray() as Vec3, target: point.divideScalar(framing).toArray() as Vec3 });
    }
    function applyAction(id: string, progress: number, play = false) {
      if (!mixer) return;
      const binding = latest.current.studio?.actions?.find((item) => item.id === id);
      const clip = clips.find((item) => item.name === binding?.clip);
      if (!clip) return;
      if (currentActionId !== id) { mixer.stopAllAction(); selectedAction = mixer.clipAction(clip); selectedAction.reset().play(); selectedAction.paused = true; currentActionId = id; currentProgress = 0; }
      actionMove = play && !reducedMotion ? { from: currentProgress, to: progress, start: performance.now(), duration: 1600 } : null;
      if (!actionMove && selectedAction) { selectedAction.time = clip.duration * progress; mixer.update(0); currentProgress = progress; }
      requestDraw();
    }
    function frame(now: number) {
      raf = 0;
      if (disposed || contextUnavailable) return;
      if (cameraMove) {
        const next = cameraAt(cameraMove, now); camera.position.set(...next.position); controls.target.set(...next.target); controls.update();
        if (now >= cameraMove.start + cameraMove.duration) cameraMove = null;
      }
      if (actionMove && selectedAction && mixer) {
        const t = Math.min(1, (now - actionMove.start) / actionMove.duration);
        currentProgress = actionMove.from + (actionMove.to - actionMove.from) * (t * t * (3 - 2 * t));
        selectedAction.time = selectedAction.getClip().duration * currentProgress; mixer.update(0);
        if (t >= 1) actionMove = null;
      }
      draw();
      if (cameraMove || actionMove) requestDraw();
    }
    function sync() {
      const next = latest.current;
      const lighting = studioEnvironments[next.environment ?? "day"] ?? studioEnvironments.day;
      scene.background = new THREE.Color(lighting.background); ambient.intensity = lighting.ambient * 1.8; renderer.toneMappingExposure = lighting.exposure;
      if (floor && floor.material instanceof THREE.MeshStandardMaterial) floor.material.color.set(lighting.deck);
      if (object && next.framingRadius !== previousFraming) { previousFraming = next.framingRadius; selectView(next.view ?? "signature"); }
      if (object && next.view !== previousView) { previousView = next.view ?? "signature"; selectView(previousView); }
      if (object && next.activeFeature !== previousFeature) { previousFeature = next.activeFeature; if (next.activeFeature !== undefined) focusFeature(next.activeFeature); }
      if (next.synchronizedPose && next.synchronizedPose !== previousSync) { previousSync = next.synchronizedPose; if (next.synchronizedPose.source !== next.viewerId) moveTo(next.synchronizedPose.pose); }
      const newVariantKey = JSON.stringify(next.variant?.materials ?? []);
      if (object && newVariantKey !== variantKey) {
        variantKey = newVariantKey;
        for (const [material, original] of materialColors) if ("color" in material && material.color instanceof THREE.Color) {
          const replacement = next.variant?.materials?.find((item) => item.name === material.name);
          material.color.copy(replacement ? new THREE.Color(replacement.color) : original);
        }
      }
      requestDraw();
    }
    runtime.current = { sync, select: (id) => { cameraMove = null; if (id === "in" || id === "out") {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(id === "in" ? .8 : 1.25).clampLength(radius * 1.05, radius * 7);
      const framing = latest.current.framingRadius ?? radius;
      moveTo({ position: controls.target.clone().add(offset).divideScalar(framing).toArray() as Vec3, target: controls.target.clone().divideScalar(framing).toArray() as Vec3 });
    } else { previousView = id; selectView(id); } }, action: applyAction, dimensions: (show) => { if (rulers) rulers.visible = show; requestDraw(); }, reference: (show) => { if (reference) reference.visible = show; requestDraw(); } };
    const onControlsChange = () => requestDraw();
    const onControlsStart = () => { cameraMove = null; latest.current.onInteraction?.(); };
    const onControlsEnd = () => latest.current.onPoseChange?.(pose());
    controls.addEventListener("change", onControlsChange); controls.addEventListener("start", onControlsStart); controls.addEventListener("end", onControlsEnd);
    let pointerStart = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (!object || !latest.current.pickMode || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObject(object, true)[0]; if (!hit) return;
      const path: number[] = []; let node = hit.object;
      while (node !== object && node.parent) { path.unshift(node.parent.children.indexOf(node)); node = node.parent; }
      latest.current.onPick?.({ nodePath: path.join("/"), point: hit.object.worldToLocal(hit.point.clone()).toArray() as Vec3 });
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp);
    const observer = new ResizeObserver(() => {
      const width = Math.max(element.clientWidth, 1), height = Math.max(element.clientHeight, 1);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); requestDraw();
    }); observer.observe(element);
    const contextLost = (event: Event) => { event.preventDefault(); contextUnavailable = true; setStatus("error"); };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const disposeObject = (root: THREE.Object3D) => {
      const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
      root.traverse((node) => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) { geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) { materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); } } });
      textures.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); geometries.forEach((item) => item.dispose());
    };
    new GLTFLoader().load(url, (gltf) => {
      if (disposed || contextUnavailable) { disposeObject(gltf.scene); return; }
      object = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) { disposeObject(object); setStatus("error"); return; }
      size = bounds.getSize(new THREE.Vector3()); radius = Math.max(size.length() / 2, .01);
      object.position.sub(bounds.getCenter(new THREE.Vector3()));
      camera.near = radius / 100; camera.far = radius * 100; camera.updateProjectionMatrix();
      controls.minDistance = radius * 1.05; controls.maxDistance = radius * 7;
      object.traverse((node) => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; for (const material of Array.isArray(node.material) ? node.material : [node.material]) if ("color" in material && material.color instanceof THREE.Color) materialColors.set(material, material.color.clone()); } });
      scene.add(object); clips = gltf.animations; mixer = new THREE.AnimationMixer(object);
      const measured: StudioAssetInfo = { clips: clips.map((clip) => clip.name), materials: [...new Set([...materialColors.keys()].map((material) => material.name).filter(Boolean))], size: size.toArray() as Vec3, radius };
      setInfo(measured); latest.current.onAssetInfo?.(measured);
      const dimensions = latest.current.studio?.dimensions;
      const scaleMatches = !!latest.current.studio?.scaleVerified && isScaleAccurate(size.toArray() as Vec3, dimensions);
      setScaleValid(scaleMatches);
      keyLight.position.set(radius * 2, radius * 4, radius * 3); rimLight.position.set(-radius * 3, radius * 2, -radius * 2);
      Object.assign(keyLight.shadow.camera, { left: -radius * 3, right: radius * 3, top: radius * 3, bottom: -radius * 3, near: radius * .1, far: radius * 15 }); keyLight.shadow.camera.updateProjectionMatrix();
      floor = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.6, radius * 1.65, radius * .04, 64), new THREE.MeshStandardMaterial({ color: 0xf5f6f7, roughness: .75, metalness: .15 }));
      floor.position.y = -size.y / 2 - radius * .025; floor.receiveShadow = true; scene.add(floor);
      if (scaleMatches) {
        rulers = new THREE.Group(); const pad = radius * .12, bottom = -size.y / 2;
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xba1517 });
        for (const points of [[[-size.x / 2, bottom, size.z / 2 + pad], [size.x / 2, bottom, size.z / 2 + pad]], [[size.x / 2 + pad, bottom, -size.z / 2], [size.x / 2 + pad, bottom, size.z / 2]], [[size.x / 2 + pad, bottom, size.z / 2 + pad], [size.x / 2 + pad, size.y / 2, size.z / 2 + pad]]]) rulers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point))), lineMaterial));
        rulers.visible = false; scene.add(rulers);
        reference = new THREE.Group(); const silhouette = new THREE.MeshStandardMaterial({ color: 0x8995a5, roughness: .9 });
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.16, .5, 4, 12), silhouette); torso.position.y = 1.12; reference.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 12), silhouette); head.position.y = 1.63; reference.add(head);
        for (const x of [-.1, .1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .8, 8), silhouette); leg.position.set(x, .4, 0); reference.add(leg); }
        reference.position.set(size.x / 2 + .5, bottom, 0); reference.visible = false; scene.add(reference);
      }
      selectView(latest.current.view ?? "signature", true); previousView = latest.current.view ?? "signature"; sync(); setStatus("ready");
    }, undefined, () => { if (!disposed) setStatus("error"); });
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      mixer?.stopAllAction(); if (object) mixer?.uncacheRoot(object);
      disposeObject(scene); environmentMap?.dispose(); pmrem?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); runtime.current = null;
    };
  }, [url, name, attempt]);
  const actions = studio?.actions?.filter((action) => info?.clips.includes(action.clip)) ?? [];
  function select(id: string) { props.onInteraction?.(); if (id !== "in" && id !== "out") props.onViewChange?.(id); runtime.current?.select(id); }
  const cameras = studio?.cameras?.length ? studio.cameras.map((item) => [item.id, item.title]) : [["front", "חזית"], ["side", "צד"], ["back", "אחור"]];
  return <div ref={shell} className={"product-real-viewer environment-" + environment} data-viewer-status={status}>
    <div ref={host} className="product-real-canvas" />
    <div ref={overlays} className="product-anchor-layer">{studio?.features?.map((feature, index) => feature.point && <button key={index} hidden data-feature-anchor={index} aria-pressed={activeFeature === index} onClick={() => props.onFeatureSelect?.(index)}><span />{feature.title}</button>)}</div>
    {status !== "ready" && <div className="product-viewer-status" role="status">{status === "loading" ? "טוען את מודל המוצר…" : <>התלת־ממד אינו זמין כרגע. אפשר להמשיך לבדוק את המוצר בסטודיו או בגלריה.<button onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>ניסיון נוסף</button></>}</div>}
    {status === "ready" && <>
      <div className="studio-viewer-mark">CORTEZ · PRODUCT EXPLORER</div>
      {scaleValid && !actionId && <div className="studio-dimension-controls"><button aria-pressed={showDimensions} onClick={() => { setShowDimensions(!showDimensions); runtime.current?.dimensions(!showDimensions); }}><Ruler size={15} />מידות</button><button aria-pressed={showReference} onClick={() => { setShowReference(!showReference); runtime.current?.reference(!showReference); }}><UserRound size={15} />קנה מידה</button></div>}
      {showDimensions && scaleValid && studio?.dimensions && <div className="studio-dimension-labels">אורך {Math.round(studio.dimensions.length * 100)} ס״מ · רוחב {Math.round(studio.dimensions.width * 100)} ס״מ · גובה {Math.round(studio.dimensions.height * 100)} ס״מ</div>}
      {showReference && scaleValid && <span className="studio-reference-caption">דמות קנה מידה: 1.75 מ׳ · אינה בדיקת התאמת רכיבה</span>}
      {actions.length > 0 && <div className="studio-action-controls" aria-label="הדגמות פעולת המוצר"><div>{actions.map((action) => <button key={action.id} aria-pressed={actionId === action.id} onClick={() => { props.onInteraction?.(); setShowDimensions(false); setShowReference(false); runtime.current?.dimensions(false); runtime.current?.reference(false); setActionId(action.id); setActionProgress(0); runtime.current?.action(action.id, 0); }}>{action.title}</button>)}</div>{actionId && <><button onClick={() => { runtime.current?.action(actionId, 0); setActionId(""); setActionProgress(0); }}>סיום הדגמה</button><label>שלב ההדגמה<input aria-label="שלב ההדגמה" type="range" min={0} max={100} value={actionProgress * 100} onChange={(event) => { const value = Number(event.target.value) / 100; setActionProgress(value); runtime.current?.action(actionId, value); }} /></label><button onClick={() => { setActionProgress(actionProgress === 1 ? 0 : 1); runtime.current?.action(actionId, actionProgress === 1 ? 0 : 1, true); }}>{actionProgress === 1 ? "החזרה" : "הפעלה"}</button></>}</div>}
      <div className="product-viewer-controls" aria-label="זוויות צפייה ושליטה במודל">{cameras.map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => select(key)}>{label}</button>)}<button onClick={() => select("in")}>התקרבות</button><button onClick={() => select("out")}>התרחקות</button><button onClick={() => select("signature")} aria-label="איפוס זווית"><RotateCcw size={16} /></button><button aria-label="מסך מלא למודל" onClick={() => { void shell.current?.requestFullscreen().catch(() => {}); }}><Focus size={16} /></button></div>
    </>}
  </div>;
}

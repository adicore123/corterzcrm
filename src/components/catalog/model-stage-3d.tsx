"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Info, Moon, Pause, Play, RotateCcw, Sun, ZoomIn, ZoomOut } from "lucide-react";
import { toWebglTextureUrl } from "./catalog-utils";

export type StageHotspot = {
  label: string;
  value: string;
};

function makeShadowFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
    grad.addColorStop(0, "rgba(15, 16, 24, 0.22)");
    grad.addColorStop(0.42, "rgba(15, 16, 24, 0.09)");
    grad.addColorStop(0.75, "rgba(186, 21, 23, 0.04)");
    grad.addColorStop(1, "rgba(15, 16, 24, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePlateCanvasTexture(modelName: string, deviceName: string, img?: HTMLImageElement): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, 1000);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#f3f4f8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1400, 1000);

    // Subtle soft studio glow behind product
    const studioGlow = ctx.createRadialGradient(700, 470, 50, 700, 470, 520);
    studioGlow.addColorStop(0, "rgba(255, 255, 255, 1)");
    studioGlow.addColorStop(1, "rgba(241, 242, 246, 0)");
    ctx.fillStyle = studioGlow;
    ctx.fillRect(0, 0, 1400, 1000);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const pad = 56;
      const availW = 1400 - pad * 2;
      const availH = 1000 - pad * 2 - 40;
      const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const dx = (1400 - drawW) / 2;
      const dy = (1000 - drawH) / 2 - 14;

      // Soft contact shadow under wheels
      const shadowY = dy + drawH - 10;
      const shadowGrad = ctx.createRadialGradient(700, shadowY, 10, 700, shadowY, drawW * 0.44);
      shadowGrad.addColorStop(0, "rgba(15, 16, 20, 0.14)");
      shadowGrad.addColorStop(1, "rgba(15, 16, 20, 0)");
      ctx.save();
      ctx.translate(700, shadowY);
      ctx.scale(1, 0.16);
      ctx.translate(-700, -shadowY);
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(700 - drawW * 0.45, shadowY - drawW * 0.45, drawW * 0.9, drawW * 0.9);
      ctx.restore();

      ctx.drawImage(img, dx, dy, drawW, drawH);

      // Architectural hairline border
      ctx.strokeStyle = "rgba(15, 16, 20, 0.08)";
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, 1360, 960);
    } else {
      ctx.fillStyle = "#101116";
      ctx.font = "800 46px Heebo, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(modelName, 700, 480);
      ctx.fillStyle = "#ba1517";
      ctx.font = "600 26px Heebo, Arial, sans-serif";
      ctx.fillText(deviceName, 700, 535);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function ModelStage3D({
  imageUrl, modelName, deviceName, hotspots = [],
}: {
  imageUrl?: string;
  modelName: string;
  deviceName: string;
  hotspots?: StageHotspot[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [lightingMode, setLightingMode] = useState<"day" | "night">("day");
  const [showHotspots, setShowHotspots] = useState(true);
  const [webglFallback, setWebglFallback] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  const lightingModeRef = useRef(lightingMode);
  const initialImageRef = useRef(imageUrl);
  const orbitRef = useRef({ yaw: 0.32, pitch: 0.16, targetYaw: 0.32, targetPitch: 0.16, zoom: 6.15, targetZoom: 6.15 });
  const textureUpdateRef = useRef<((url?: string) => void) | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    lightingModeRef.current = lightingMode;
  }, [lightingMode]);

  useEffect(() => {
    initialImageRef.current = imageUrl;
    textureUpdateRef.current?.(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setWebglFallback(true));
      return;
    }

    const dayBg = new THREE.Color(0xf4f5f8);
    const nightBg = new THREE.Color(0x0d0e14);
    const dayDeck = new THREE.Color(0xfcfcfd);
    const nightDeck = new THREE.Color(0x1b1d25);
    const dayCollar = new THREE.Color(0xd7dbe4);
    const nightCollar = new THREE.Color(0x282a35);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(dayBg.getHex(), 0.032);
    scene.fog = fog;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();

    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 7, 5);
    const rim = new THREE.DirectionalLight(0xeef1f7, 1.1);
    rim.position.set(-5, 4, -5);
    const underglow = new THREE.PointLight(0xba1517, 2.2, 9, 1.5);
    underglow.position.set(0, 0.15, 0);
    scene.add(ambient, key, rim, underglow);

    const floorTex = makeShadowFloorTexture();
    const floorGeo = new THREE.CircleGeometry(5.6, 64);
    const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    scene.add(floor);

    const turntable = new THREE.Group();
    turntable.position.y = -1.1;
    scene.add(turntable);

    const podiumBaseGeo = new THREE.CylinderGeometry(2.15, 2.38, 0.18, 64);
    const podiumMat = new THREE.MeshPhysicalMaterial({
      color: dayCollar.clone(),
      metalness: 0.88,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const podiumBase = new THREE.Mesh(podiumBaseGeo, podiumMat);

    const podiumTopGeo = new THREE.CylinderGeometry(1.98, 2.06, 0.08, 64);
    const podiumTopMat = new THREE.MeshPhysicalMaterial({
      color: dayDeck.clone(),
      metalness: 0.15,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const podiumTop = new THREE.Mesh(podiumTopGeo, podiumTopMat);
    podiumTop.position.y = 0.12;

    const ledRingGeo = new THREE.TorusGeometry(2.1, 0.024, 16, 110);
    const ledRingMat = new THREE.MeshStandardMaterial({
      color: 0xd9191d,
      emissive: 0xba1517,
      emissiveIntensity: 1.5,
      metalness: 0.35,
      roughness: 0.2,
    });
    const ledRing = new THREE.Mesh(ledRingGeo, ledRingMat);
    ledRing.rotation.x = Math.PI / 2;
    ledRing.position.y = 0.08;

    turntable.add(podiumBase, podiumTop, ledRing);

    const showcaseGroup = new THREE.Group();
    showcaseGroup.position.y = 0.56;
    scene.add(showcaseGroup);

    // Ultra-slim brushed titanium architectural monolith
    const chassisGeo = new THREE.BoxGeometry(3.52, 2.52, 0.08);
    const chassisMat = new THREE.MeshPhysicalMaterial({
      color: 0xd0d4de,
      metalness: 0.9,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);

    const trimGeo = new THREE.BoxGeometry(3.56, 2.56, 0.025);
    const trimMat = new THREE.MeshPhysicalMaterial({
      color: 0xba1517,
      emissive: 0x5c080a,
      emissiveIntensity: 0.45,
      metalness: 0.72,
      roughness: 0.2,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);

    let activeTexture = makePlateCanvasTexture(modelName, deviceName);
    activeTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    const screenGeo = new THREE.PlaneGeometry(3.42, 2.42);
    const screenMat = new THREE.MeshBasicMaterial({ map: activeTexture });

    const frontScreen = new THREE.Mesh(screenGeo, screenMat);
    frontScreen.position.z = 0.044;

    const backScreen = new THREE.Mesh(screenGeo, screenMat);
    backScreen.rotation.y = Math.PI;
    backScreen.position.z = -0.044;

    showcaseGroup.add(chassis, trim, frontScreen, backScreen);

    let loadSeq = 0;
    function loadImageIntoStage(url?: string) {
      const seq = ++loadSeq;
      if (!url) {
        const nextTex = makePlateCanvasTexture(modelName, deviceName);
        nextTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        screenMat.map = nextTex;
        screenMat.needsUpdate = true;
        activeTexture.dispose();
        activeTexture = nextTex;
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (seq !== loadSeq) return;
        const nextTex = makePlateCanvasTexture(modelName, deviceName, img);
        nextTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        screenMat.map = nextTex;
        screenMat.needsUpdate = true;
        activeTexture.dispose();
        activeTexture = nextTex;
      };
      img.src = toWebglTextureUrl(url);
    }

    textureUpdateRef.current = loadImageIntoStage;
    loadImageIntoStage(initialImageRef.current);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 1);
      const h = Math.max(entry.contentRect.height, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(container);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      setAutoRotate(false);
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      orbitRef.current.targetYaw -= dx * 0.011;
      orbitRef.current.targetPitch = Math.max(0.05, Math.min(0.68, orbitRef.current.targetPitch + dy * 0.008));
    }

    function onPointerUp(event: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      orbitRef.current.targetZoom = Math.max(4.2, Math.min(8.6, orbitRef.current.targetZoom + event.deltaY * 0.003));
    }

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let rafId = 0;
    let lastTime = performance.now();
    let paused = document.hidden;

    function onVisibility() {
      paused = document.hidden;
      lastTime = performance.now();
    }
    document.addEventListener("visibilitychange", onVisibility);

    function applyTheme(instant = false) {
      const night = lightingModeRef.current === "night";
      const alpha = instant ? 1 : 0.08;
      fog.color.lerp(night ? nightBg : dayBg, alpha);
      podiumTopMat.color.lerp(night ? nightDeck : dayDeck, alpha);
      podiumMat.color.lerp(night ? nightCollar : dayCollar, alpha);
      ambient.intensity += ((night ? 0.55 : 1.15) - ambient.intensity) * alpha;
      underglow.intensity += ((night ? 5.2 : 2.0) - underglow.intensity) * alpha;
      ledRingMat.emissiveIntensity += ((night ? 2.4 : 1.35) - ledRingMat.emissiveIntensity) * alpha;
    }

    function animate(now: number) {
      if (!paused) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const orb = orbitRef.current;
        if (autoRotateRef.current && !reducedMotion && !dragging) {
          orb.targetYaw += dt * 0.42;
        }
        orb.yaw += (orb.targetYaw - orb.yaw) * 0.1;
        orb.pitch += (orb.targetPitch - orb.pitch) * 0.1;
        orb.zoom += (orb.targetZoom - orb.zoom) * 0.12;

        camera.position.x = Math.sin(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
        camera.position.z = Math.cos(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
        camera.position.y = Math.sin(orb.pitch) * orb.zoom + 0.35;
        camera.lookAt(0, 0.25, 0);

        if (!reducedMotion) {
          showcaseGroup.position.y = 0.56 + Math.sin(now * 0.002) * 0.045;
        }
        turntable.rotation.y = orb.yaw * 0.35;
        applyTheme(false);

        renderer.render(scene, camera);
      } else {
        lastTime = now;
      }
      if (!reducedMotion) {
        rafId = requestAnimationFrame(animate);
      }
    }

    if (reducedMotion) {
      applyTheme(true);
      const orb = orbitRef.current;
      camera.position.x = Math.sin(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
      camera.position.z = Math.cos(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
      camera.position.y = Math.sin(orb.pitch) * orb.zoom + 0.35;
      camera.lookAt(0, 0.25, 0);
      renderer.render(scene, camera);
    } else {
      rafId = requestAnimationFrame(animate);
    }

    return () => {
      loadSeq++;
      textureUpdateRef.current = null;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      activeTexture.dispose();
      floorTex.dispose();
      scene.traverse((object) => {
        if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) {
          object.geometry.dispose();
        }
        if ("material" in object) {
          const mat = object.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat instanceof THREE.Material) mat.dispose();
        }
      });
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      dom.remove();
    };
  }, [modelName, deviceName]);

  function zoomBy(delta: number) {
    orbitRef.current.targetZoom = Math.max(4.2, Math.min(8.6, orbitRef.current.targetZoom + delta));
  }

  function resetOrbit() {
    orbitRef.current.targetYaw = 0.32;
    orbitRef.current.targetPitch = 0.16;
    orbitRef.current.targetZoom = 6.15;
    setAutoRotate(true);
  }

  const visibleHotspots = showHotspots ? hotspots.slice(0, 4) : [];

  return <div className={"stage-3d-shell" + (lightingMode === "night" ? " is-night" : "")}>
    {webglFallback ? (
      <div className="stage-3d-fallback">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt={modelName} />
        ) : <span>{modelName}</span>}
      </div>
    ) : (
      <div ref={containerRef} className="stage-3d-canvas" />
    )}

    {visibleHotspots.length > 0 && (
      <div className="stage-hotspots no-print" aria-hidden>
        {visibleHotspots.map((spot, idx) => (
          <div key={spot.label} className={"stage-hotspot hotspot-" + idx}>
            <span className="hotspot-dot" />
            <div>
              <small>{spot.label}</small>
              <strong>{spot.value}</strong>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="stage-3d-hud no-print">
      <div className="stage-hud-left">
        <span className="stage-3d-hint">גררו לסיבוב 360°</span>
        <button type="button" className="stage-hud-pill" onClick={() => setLightingMode((m) => (m === "day" ? "night" : "day"))}
          aria-label={lightingMode === "day" ? "מעבר לסטודיו לילה" : "מעבר לסטודיו יום"}>
          {lightingMode === "day" ? <Moon size={14} /> : <Sun size={14} />}
          <span>{lightingMode === "day" ? "סטודיו לילה" : "סטודיו יום"}</span>
        </button>
        {hotspots.length > 0 && (
          <button type="button" className={"stage-hud-pill" + (showHotspots ? " is-active" : "")}
            onClick={() => setShowHotspots((v) => !v)} aria-pressed={showHotspots}>
            <Info size={14} />
            <span>נתונים</span>
          </button>
        )}
      </div>
      <div className="stage-3d-controls">
        <button type="button" className="stage-hud-btn" onClick={() => setAutoRotate((v) => !v)}
          aria-label={autoRotate ? "עצירת סיבוב אוטומטי" : "הפעלת סיבוב אוטומטי"} title={autoRotate ? "עצירת סיבוב" : "סיבוב אוטומטי"}>
          {autoRotate ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="stage-hud-btn" onClick={() => zoomBy(-0.7)} aria-label="התקרבות" title="התקרבות"><ZoomIn size={15} /></button>
        <button type="button" className="stage-hud-btn" onClick={() => zoomBy(0.7)} aria-label="התרחקות" title="התרחקות"><ZoomOut size={15} /></button>
        <button type="button" className="stage-hud-btn" onClick={resetOrbit} aria-label="איפוס זווית" title="איפוס זווית"><RotateCcw size={15} /></button>
      </div>
    </div>
  </div>;
}

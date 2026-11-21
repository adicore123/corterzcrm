"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { toWebglTextureUrl } from "./catalog-utils";

function makeFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, "rgba(186, 21, 23, 0.22)");
    grad.addColorStop(0.45, "rgba(28, 28, 36, 0.35)");
    grad.addColorStop(1, "rgba(11, 11, 16, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePlateCanvasTexture(modelName: string, deviceName: string, img?: HTMLImageElement): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 860;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, 0, 860);
    bg.addColorStop(0, "#17171f");
    bg.addColorStop(1, "#0d0d13");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 860);

    const glow = ctx.createRadialGradient(600, 410, 40, 600, 410, 480);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    glow.addColorStop(0.65, "rgba(186, 21, 23, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 860);

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const pad = 54;
      const boxW = 1200 - pad * 2;
      const boxH = 860 - pad * 2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(pad, pad, boxW, boxH, 28);
      ctx.fill();

      const innerPad = 24;
      const availW = boxW - innerPad * 2;
      const availH = boxH - innerPad * 2;
      const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const dx = pad + innerPad + (availW - drawW) / 2;
      const dy = pad + innerPad + (availH - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);

      ctx.strokeStyle = "rgba(186, 21, 23, 0.35)";
      ctx.lineWidth = 4;
      ctx.strokeRect(pad, pad, boxW, boxH);
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.font = "700 44px Heebo, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(modelName, 600, 415);
      ctx.fillStyle = "rgba(255, 110, 114, 0.92)";
      ctx.font = "600 24px Heebo, Arial, sans-serif";
      ctx.fillText(deviceName, 600, 465);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function ModelStage3D({ imageUrl, modelName, deviceName }: {
  imageUrl?: string; modelName: string; deviceName: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [webglFallback, setWebglFallback] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  const initialImageRef = useRef(imageUrl);
  const orbitRef = useRef({ yaw: 0.34, pitch: 0.18, targetYaw: 0.34, targetPitch: 0.18, zoom: 6.1, targetZoom: 6.1 });
  const textureUpdateRef = useRef<((url?: string) => void) | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

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

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b10, 0.055);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 6, 5);
    const rim = new THREE.DirectionalLight(0xff4246, 1.3);
    rim.position.set(-4, 4, -5);
    const underglow = new THREE.PointLight(0xe21b1e, 5.5, 10, 1.6);
    underglow.position.set(0, 0.3, 0);
    scene.add(ambient, key, rim, underglow);

    const floorTex = makeFloorTexture();
    const floorGeo = new THREE.CircleGeometry(5.5, 64);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.35, metalness: 0.45 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    scene.add(floor);

    const grid = new THREE.GridHelper(16, 24, 0xba1517, 0x22222d);
    grid.position.y = -1.26;
    scene.add(grid);

    const turntable = new THREE.Group();
    turntable.position.y = -1.1;
    scene.add(turntable);

    const podiumBaseGeo = new THREE.CylinderGeometry(2.15, 2.38, 0.22, 64);
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.82, roughness: 0.28 });
    const podiumBase = new THREE.Mesh(podiumBaseGeo, podiumMat);

    const podiumTopGeo = new THREE.CylinderGeometry(1.96, 2.05, 0.08, 64);
    const podiumTopMat = new THREE.MeshStandardMaterial({ color: 0x262632, metalness: 0.9, roughness: 0.16 });
    const podiumTop = new THREE.Mesh(podiumTopGeo, podiumTopMat);
    podiumTop.position.y = 0.14;

    const ledRingGeo = new THREE.TorusGeometry(2.09, 0.032, 16, 96);
    const ledRingMat = new THREE.MeshStandardMaterial({
      color: 0xff2a2d,
      emissive: 0xd91418,
      emissiveIntensity: 2.0,
      metalness: 0.3,
      roughness: 0.2,
    });
    const ledRing = new THREE.Mesh(ledRingGeo, ledRingMat);
    ledRing.rotation.x = Math.PI / 2;
    ledRing.position.y = 0.12;

    turntable.add(podiumBase, podiumTop, ledRing);

    const showcaseGroup = new THREE.Group();
    showcaseGroup.position.y = 0.6;
    scene.add(showcaseGroup);

    const chassisGeo = new THREE.BoxGeometry(3.45, 2.48, 0.12);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x24242f, metalness: 0.88, roughness: 0.22 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);

    const trimGeo = new THREE.BoxGeometry(3.52, 2.55, 0.04);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xba1517,
      emissive: 0x7c0b0e,
      emissiveIntensity: 0.85,
      metalness: 0.65,
      roughness: 0.25,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);

    let activeTexture = makePlateCanvasTexture(modelName, deviceName);
    activeTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    const screenGeo = new THREE.PlaneGeometry(3.32, 2.36);
    const screenMat = new THREE.MeshBasicMaterial({ map: activeTexture });

    const frontScreen = new THREE.Mesh(screenGeo, screenMat);
    frontScreen.position.z = 0.066;

    const backScreen = new THREE.Mesh(screenGeo, screenMat);
    backScreen.rotation.y = Math.PI;
    backScreen.position.z = -0.066;

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
      orbitRef.current.targetZoom = Math.max(4.1, Math.min(8.6, orbitRef.current.targetZoom + event.deltaY * 0.003));
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

    function animate(now: number) {
      if (!paused) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const orb = orbitRef.current;
        if (autoRotateRef.current && !reducedMotion && !dragging) {
          orb.targetYaw += dt * 0.45;
        }
        orb.yaw += (orb.targetYaw - orb.yaw) * 0.1;
        orb.pitch += (orb.targetPitch - orb.pitch) * 0.1;
        orb.zoom += (orb.targetZoom - orb.zoom) * 0.12;

        camera.position.x = Math.sin(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
        camera.position.z = Math.cos(orb.yaw) * Math.cos(orb.pitch) * orb.zoom;
        camera.position.y = Math.sin(orb.pitch) * orb.zoom + 0.35;
        camera.lookAt(0, 0.25, 0);

        if (!reducedMotion) {
          showcaseGroup.position.y = 0.58 + Math.sin(now * 0.002) * 0.05;
        }
        turntable.rotation.y = orb.yaw * 0.35;

        renderer.render(scene, camera);
      } else {
        lastTime = now;
      }
      if (!reducedMotion) {
        rafId = requestAnimationFrame(animate);
      }
    }

    if (reducedMotion) {
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
      renderer.dispose();
      dom.remove();
    };
  }, [modelName, deviceName]);

  function zoomBy(delta: number) {
    orbitRef.current.targetZoom = Math.max(4.1, Math.min(8.6, orbitRef.current.targetZoom + delta));
  }

  function resetOrbit() {
    orbitRef.current.targetYaw = 0.34;
    orbitRef.current.targetPitch = 0.18;
    orbitRef.current.targetZoom = 6.1;
    setAutoRotate(true);
  }

  return <div className="stage-3d-shell">
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
    <div className="stage-3d-hud no-print">
      <span className="stage-3d-hint">גררו לסיבוב 360°</span>
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

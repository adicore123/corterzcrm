"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { StudioEnvironment } from "./studio-environments";
import { toWebglTextureUrl } from "./catalog-utils";
import { COASTAL_SCENERY_URL, isCoastalExhibitUrl } from "@/lib/catalog/coastal-assets";
import {
  coastalBackdropFragment,
  coastalBackdropVertex,
  coastalProductFragment,
  coastalProductVertex,
  coastalShadowFragment,
  coastalShadowVertex,
  contactShadowFragment,
  contactShadowVertex,
} from "./coastal-shaders";

export type BeachStageMode = "exhibition" | "studio";
export type BeachSlot = { bay: number; image: string; key: string };

const BAY_SPACING = 12;

const VIEW_POSES: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  signature: { pos: [0.35, 2.45, 9.5], target: [0, 1.62, 0] },
  detail: { pos: [-0.48, 2.22, 7.25], target: [0, 1.82, 0] },
  angle: { pos: [1.15, 3.05, 12.1], target: [0, 1.52, 0] },
  hero: { pos: [0.3, 2.42, 10.1], target: [0, 1.86, 0] },
};

function createRemovedWhiteTexture(img: HTMLImageElement, prepared: boolean, maxAniso: number): { texture: THREE.Texture; hasCutoutAlpha: boolean } {
  if (prepared) {
    const map = new THREE.Texture(img);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(4, maxAniso);
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.needsUpdate = true;
    return { texture: map, hasCutoutAlpha: true };
  }

  const canvas = document.createElement("canvas");
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, 1600 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  let keyedWhite = false;

  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      const cw = canvas.width;
      const ch = canvas.height;
      const corners = [0, (cw - 1) * 4, (ch - 1) * cw * 4, (cw * ch - 1) * 4];
      const whiteCount = corners.filter((i) => Math.min(data[i], data[i + 1], data[i + 2]) > 218).length;
      if (whiteCount >= 3) {
        keyedWhite = true;
        for (let i = 0; i < data.length; i += 4) {
          const minRgb = Math.min(data[i], data[i + 1], data[i + 2]);
          const t = Math.max(0, Math.min(1, (minRgb - 205) / 40));
          const alpha = 1 - t * t * (3 - 2 * t);
          data[i + 3] = Math.round(data[i + 3] * alpha);
          if (alpha < 0.999) {
            for (let c = 0; c < 3; c++) {
              data[i + c] = alpha > 0.01
                ? Math.max(0, Math.min(255, Math.round((data[i + c] - 255 * (1 - alpha)) / alpha)))
                : 0;
            }
          }
        }
        ctx.putImageData(pixels, 0, 0);
      }
    } catch {
      // SecurityError on tainted canvas is prevented via proxy, but keep graceful photo draw if any occurs.
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  tex.needsUpdate = true;
  return { texture: tex, hasCutoutAlpha: keyedWhite };
}

function makeAirParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255, 248, 224, 0.9)");
    grad.addColorStop(0.5, "rgba(255, 240, 195, 0.35)");
    grad.addColorStop(1, "rgba(255, 240, 195, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function BeachStage3D({
  mode = "studio",
  imageUrl,
  alt,
  slots,
  bay = 0,
  environment = "day",
  view = "signature",
  zoom = 1,
  tour = false,
  interactive = false,
  resetKey = 0,
  paused = false,
  onReady,
  onUnavailable,
  onInteraction,
}: {
  mode?: BeachStageMode;
  imageUrl?: string;
  alt: string;
  slots?: BeachSlot[];
  bay?: number;
  environment?: StudioEnvironment;
  view?: string;
  zoom?: number;
  tour?: boolean;
  interactive?: boolean;
  resetKey?: number;
  paused?: boolean;
  onReady?: (ready: boolean) => void;
  onUnavailable?: () => void;
  onInteraction?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialAltRef = useRef(alt);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const propsRef = useRef({
    mode, imageUrl, slots, bay, environment, view, zoom, tour, interactive, resetKey, paused,
  });
  const callbacksRef = useRef({ onReady, onUnavailable, onInteraction });
  const syncStationsRef = useRef<(() => void) | null>(null);
  const resetPoseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    callbacksRef.current = { onReady, onUnavailable, onInteraction };
  });

  useEffect(() => {
    initialAltRef.current = alt;
    canvasRef.current?.setAttribute("aria-label", alt || "במת חוף הים התלת־ממדית של CORTEZ");
  }, [alt]);

  useEffect(() => {
    const prev = propsRef.current;
    propsRef.current = {
      mode, imageUrl, slots, bay, environment, view, zoom, tour, interactive, resetKey, paused,
    };
    if (prev.imageUrl !== imageUrl || prev.slots !== slots) {
      syncStationsRef.current?.();
    }
    if (
      prev.view !== view
      || prev.zoom !== zoom
      || prev.bay !== bay
      || prev.resetKey !== resetKey
      || prev.interactive !== interactive
    ) {
      resetPoseRef.current?.();
    }
  }, [mode, imageUrl, slots, bay, environment, view, zoom, tour, interactive, resetKey, paused]);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 760px)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => {
        setFailed(true);
        callbacksRef.current.onUnavailable?.();
        callbacksRef.current.onReady?.(false);
      });
      return;
    }

    const canvas = renderer.domElement;
    canvasRef.current = canvas;
    canvas.setAttribute("aria-label", initialAltRef.current || "במת חוף הים התלת־ממדית של CORTEZ");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = propsRef.current.interactive ? "none" : "pan-y";

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.75));
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0.35, 2.45, 9.5);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false; // Never trap vertical page scrolling.
    controls.enablePan = false;
    controls.minAzimuthAngle = -0.26;
    controls.maxAzimuthAngle = 0.26;
    controls.minPolarAngle = 1.28;
    controls.maxPolarAngle = 1.59;
    controls.minDistance = 5.5;
    controls.maxDistance = 14.5;
    controls.enabled = propsRef.current.mode === "studio" && propsRef.current.interactive;

    const handleControlStart = () => {
      callbacksRef.current.onInteraction?.();
    };
    controls.addEventListener("start", handleControlStart);

    // 1. Coastal Backdrop Quad
    const backdropUniforms = {
      uPlate: { value: null as THREE.Texture | null },
      uCrop: { value: new THREE.Vector2(1, 1) },
      uDrift: { value: new THREE.Vector2(0, 0) },
      uSeconds: { value: 0 },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    let backdropImgWidth = 1536;
    let backdropImgHeight = 1024;
    let backdropTexture: THREE.Texture | null = null;
    const backdropGeo = new THREE.PlaneGeometry(2, 2);
    const backdropMat = new THREE.ShaderMaterial({
      uniforms: backdropUniforms,
      vertexShader: coastalBackdropVertex,
      fragmentShader: coastalBackdropFragment,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const backdropMesh = new THREE.Mesh(backdropGeo, backdropMat);
    backdropMesh.frustumCulled = false;
    backdropMesh.renderOrder = -10;
    scene.add(backdropMesh);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    textureLoader.load(COASTAL_SCENERY_URL, (tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      backdropTexture = tex;
      backdropUniforms.uPlate.value = tex;
      const img = tex.image as HTMLImageElement | undefined;
      if (img?.width && img?.height) {
        backdropImgWidth = img.width;
        backdropImgHeight = img.height;
      }
    });

    // 2. Subtle Mediterranean breeze dust/sparkle particles in 3D space
    const particleCount = reducedMotion ? 0 : isMobile ? 28 : 56;
    const particlePositions = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 18;
      particlePositions[i * 3 + 1] = 0.4 + Math.random() * 4.4;
      particlePositions[i * 3 + 2] = -2.5 + Math.random() * 5.0;
      particlePhases[i] = Math.random() * Math.PI * 2;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleTex = makeAirParticleTexture();
    const particleMat = new THREE.PointsMaterial({
      size: 0.14,
      map: particleTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    particles.visible = particleCount > 0;
    scene.add(particles);

    // 3. Stations Map (exhibition supports multiple sliding bays along shoreline)
    type StationGpu = {
      key: string;
      image: string;
      group: THREE.Group;
      contactMesh: THREE.Mesh;
      contactMat: THREE.ShaderMaterial;
      shadowMesh: THREE.Mesh;
      shadowMat: THREE.ShaderMaterial;
      photoMesh: THREE.Mesh;
      photoMat: THREE.ShaderMaterial;
      texture: THREE.Texture | null;
      loaded: boolean;
    };

    const textureCache = new Map<string, { texture: THREE.Texture; width: number; height: number; hasCutoutAlpha: boolean }>();
    const pendingLoads = new Set<string>();
    const stationsGroup = new THREE.Group();
    scene.add(stationsGroup);
    const activeStations = new Map<string, StationGpu>();

    const sharedPlaneGeo = new THREE.PlaneGeometry(1, 1);
    const sharedContactGeo = new THREE.PlaneGeometry(6.1, 1.05);

    function applyTextureToStation(
      st: StationGpu,
      cached: { texture: THREE.Texture; width: number; height: number; hasCutoutAlpha: boolean },
    ) {
      const aspect = cached.width / Math.max(1, cached.height);
      const photoW = Math.min(5.65, 3.4 * aspect);
      const photoH = photoW / Math.max(0.25, aspect);

      st.photoMesh.scale.set(photoW, photoH, 1);
      st.photoMesh.position.set(0, photoH / 2 + 0.19, 0);
      st.photoMat.uniforms.uMap.value = cached.texture;
      st.photoMat.uniforms.uTexel.value.set(1 / Math.max(1, cached.width), 1 / Math.max(1, cached.height));
      st.photoMesh.visible = true;

      st.shadowMat.uniforms.uSilhouette.value = cached.texture;
      st.shadowMat.uniforms.uPhotoSize.value.set(photoW, photoH);
      st.shadowMesh.visible = cached.hasCutoutAlpha;

      st.texture = cached.texture;
      st.loaded = true;

      const currentSlots = propsRef.current.slots ?? (propsRef.current.imageUrl ? [{ bay: propsRef.current.bay, image: propsRef.current.imageUrl, key: `single-${propsRef.current.imageUrl}` }] : []);
      const activeSlot = currentSlots.find((slot) => slot.bay === propsRef.current.bay);
      if (!activeSlot || activeSlot.key === st.key) {
        setLoaded(true);
        callbacksRef.current.onReady?.(true);
      }
    }

    function ensureImageLoaded(imageSrc: string, st: StationGpu) {
      const cached = textureCache.get(imageSrc);
      if (cached) {
        applyTextureToStation(st, cached);
        return;
      }
      if (pendingLoads.has(imageSrc)) return;
      pendingLoads.add(imageSrc);

      const resolvedUrl = toWebglTextureUrl(imageSrc);
      const prepared = isCoastalExhibitUrl(imageSrc);
      const img = new Image();
      if (/^https?:\/\//i.test(resolvedUrl)) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        pendingLoads.delete(imageSrc);
        if (disposed) return;
        const { texture, hasCutoutAlpha } = createRemovedWhiteTexture(img, prepared, maxAniso);
        const record = {
          texture,
          width: img.naturalWidth || img.width || 1,
          height: img.naturalHeight || img.height || 1,
          hasCutoutAlpha,
        };
        textureCache.set(imageSrc, record);
        for (const item of activeStations.values()) {
          if (item.image === imageSrc) applyTextureToStation(item, record);
        }
      };
      img.onerror = () => {
        pendingLoads.delete(imageSrc);
        if (disposed) return;
        setLoaded(false);
        callbacksRef.current.onReady?.(false);
      };
      img.src = resolvedUrl;
    }

    function createStationGpu(key: string, image: string): StationGpu {
      const group = new THREE.Group();
      const contactMat = new THREE.ShaderMaterial({
        uniforms: { uWarmth: { value: 0 }, uDusk: { value: 0 } },
        vertexShader: contactShadowVertex,
        fragmentShader: contactShadowFragment,
        transparent: true,
        depthWrite: false,
      });
      const contactMesh = new THREE.Mesh(sharedContactGeo, contactMat);
      contactMesh.position.set(0, 0.19, 0.04);
      contactMesh.rotation.x = -Math.PI / 2;
      contactMesh.renderOrder = 1;
      group.add(contactMesh);

      const shadowMat = new THREE.ShaderMaterial({
        uniforms: {
          uSilhouette: { value: null as THREE.Texture | null },
          uPhotoSize: { value: new THREE.Vector2(4.6, 3.4) },
          uWarmth: { value: 0 },
          uDusk: { value: 0 },
        },
        vertexShader: coastalShadowVertex,
        fragmentShader: coastalShadowFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      });
      const shadowMesh = new THREE.Mesh(sharedPlaneGeo, shadowMat);
      shadowMesh.renderOrder = 2;
      shadowMesh.visible = false;
      group.add(shadowMesh);

      const photoMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uTexel: { value: new THREE.Vector2(1 / 1200, 1 / 800) },
          uWarmth: { value: 0 },
          uDusk: { value: 0 },
        },
        vertexShader: coastalProductVertex,
        fragmentShader: coastalProductFragment,
        side: THREE.DoubleSide,
        transparent: true,
        toneMapped: false,
      });
      const photoMesh = new THREE.Mesh(sharedPlaneGeo, photoMat);
      photoMesh.renderOrder = 3;
      photoMesh.visible = false;
      group.add(photoMesh);

      stationsGroup.add(group);
      return {
        key,
        image,
        group,
        contactMesh,
        contactMat,
        shadowMesh,
        shadowMat,
        photoMesh,
        photoMat,
        texture: null,
        loaded: false,
      };
    }

    function disposeStation(st: StationGpu) {
      stationsGroup.remove(st.group);
      st.contactMat.dispose();
      st.shadowMat.dispose();
      st.photoMat.dispose();
    }

    function syncStations() {
      const current = propsRef.current;
      const desired: BeachSlot[] = current.slots?.length
        ? current.slots
        : current.imageUrl
          ? [{ bay: current.bay, image: current.imageUrl, key: `single-${current.imageUrl}` }]
          : [];

      const desiredKeys = new Set(desired.map((s) => s.key));
      for (const [k, st] of activeStations.entries()) {
        if (!desiredKeys.has(k)) {
          disposeStation(st);
          activeStations.delete(k);
        }
      }

      for (const slot of desired) {
        let st = activeStations.get(slot.key);
        if (!st || st.image !== slot.image) {
          if (st) {
            disposeStation(st);
            activeStations.delete(slot.key);
          }
          st = createStationGpu(slot.key, slot.image);
          activeStations.set(slot.key, st);
        }
        st.group.position.set(slot.bay * BAY_SPACING, 0, 0);
        if (slot.image && !st.loaded) {
          ensureImageLoaded(slot.image, st);
        } else if (st.loaded && slot.bay === current.bay) {
          setLoaded(true);
          callbacksRef.current.onReady?.(true);
        }
      }
    }
    syncStationsRef.current = syncStations;

    // 4. Camera Pose & Parallax state
    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerCurrent = new THREE.Vector2(0, 0);

    function computeGoalPose() {
      const p = propsRef.current;
      const aspect = Math.max(0.3, camera.aspect);
      const poseKey = p.mode === "exhibition" ? "hero" : (VIEW_POSES[p.view] ? p.view : "signature");
      const base = VIEW_POSES[poseKey];
      const aspectScale = aspect < 1 ? Math.min(1.75, 1 / aspect) : 1;
      const centerX = p.bay * BAY_SPACING;
      const z = (base.pos[2] * aspectScale) / Math.max(0.5, p.zoom);
      return {
        pos: new THREE.Vector3(centerX + base.pos[0], base.pos[1], z),
        target: new THREE.Vector3(centerX + base.target[0], base.target[1], base.target[2]),
      };
    }

    const initialGoal = computeGoalPose();
    camera.position.copy(initialGoal.pos);
    controls.target.copy(initialGoal.target);
    camera.lookAt(initialGoal.target);
    const camCurrentPos = initialGoal.pos.clone();
    const camCurrentTarget = initialGoal.target.clone();
    const camGoalPos = initialGoal.pos.clone();
    const camGoalTarget = initialGoal.target.clone();

    function refreshGoal() {
      const next = computeGoalPose();
      camGoalPos.copy(next.pos);
      camGoalTarget.copy(next.target);
      controls.enabled = propsRef.current.mode === "studio" && propsRef.current.interactive;
      canvas.style.touchAction = propsRef.current.interactive ? "none" : "pan-y";
      if (controls.enabled) {
        controls.target.copy(next.target);
        camera.position.copy(next.pos);
      }
    }
    resetPoseRef.current = refreshGoal;

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerTarget.set(
        (e.clientX - rect.left) / rect.width - 0.5,
        (e.clientY - rect.top) / rect.height - 0.5,
      );
    };
    const handlePointerLeave = () => pointerTarget.set(0, 0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!propsRef.current.interactive || propsRef.current.mode !== "studio") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -0.16 : 0.16;
        camera.position.x = Math.max(-2.5, Math.min(2.5, camera.position.x + delta));
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? -0.35 : 0.35;
        camera.position.z = Math.max(5.5, Math.min(13.5, camera.position.z + delta));
      }
    };
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("keydown", handleKeyDown);

    syncStations();

    // 5. Intersection & Visibility lifecycle + ResizeObserver + Context Lost
    let isVisible = true;
    let isHidden = document.hidden;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = Boolean(entry?.isIntersecting ?? true);
    });
    observer.observe(container);
    const onVisibility = () => {
      isHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const resize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      refreshGoal();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (disposed) return;
      setFailed(true);
      callbacksRef.current.onUnavailable?.();
      callbacksRef.current.onReady?.(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    // 6. Main Render Loop (with smooth environment transition & coastal animation)
    let warmthCurrent = propsRef.current.environment === "night" ? 1 : 0;
    let duskCurrent = propsRef.current.environment === "gallery" ? 1 : 0;
    let waveTime = 0;
    let tourPhase = 0;
    let lastNow = performance.now();

    const animate = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(animate);
      const rawDt = Math.min(0.08, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const cur = propsRef.current;
      if (!isVisible || isHidden || cur.paused) return;

      const animateWater = !reducedMotion;
      if (animateWater) waveTime += rawDt;

      // Smooth interpolation between Day, Golden Hour (night), and Twilight (gallery)
      const targetWarmth = cur.environment === "night" ? 1 : 0;
      const targetDusk = cur.environment === "gallery" ? 1 : 0;
      const gradeLerp = reducedMotion ? 1 : Math.min(1, rawDt * 4.5);
      warmthCurrent += (targetWarmth - warmthCurrent) * gradeLerp;
      duskCurrent += (targetDusk - duskCurrent) * gradeLerp;

      backdropUniforms.uSeconds.value = waveTime;
      backdropUniforms.uWarmth.value = warmthCurrent;
      backdropUniforms.uDusk.value = duskCurrent;

      const aspect = Math.max(0.25, camera.aspect);
      const sourceAspect = backdropImgWidth / Math.max(1, backdropImgHeight);
      backdropUniforms.uCrop.value.set(
        Math.min(1, aspect / sourceAspect) * 0.965,
        Math.min(1, sourceAspect / aspect) * 0.965,
      );

      // Update particles gently
      if (particleCount > 0) {
        const attr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
        const bayCenterX = cur.bay * BAY_SPACING;
        for (let i = 0; i < particleCount; i++) {
          const ph = particlePhases[i];
          attr.setY(i, attr.getY(i) + Math.sin(waveTime * 0.9 + ph) * 0.0018);
          let x = attr.getX(i) + rawDt * 0.16;
          if (x > bayCenterX + 9 || x < bayCenterX - 9) {
            x = bayCenterX - 9 + (((x - (bayCenterX - 9)) % 18) + 18) % 18;
          }
          attr.setX(i, x);
        }
        attr.needsUpdate = true;
        particleMat.color.setHex(targetDusk ? 0xdbeafe : targetWarmth ? 0xfed7aa : 0xfffbeb);
        particleMat.opacity = targetDusk ? 0.3 : 0.48;
      }

      // Camera rig update
      const ptrLerp = reducedMotion ? 1 : Math.min(1, rawDt * 5);
      pointerCurrent.lerp(pointerTarget, ptrLerp);

      if (cur.mode === "studio" && cur.interactive) {
        controls.update();
      } else {
        const camLerp = reducedMotion ? 1 : Math.min(1, rawDt * 5.2);
        if (cur.tour && !reducedMotion) {
          tourPhase += rawDt;
          const swayX = Math.sin(tourPhase * 0.42) * 0.95;
          const swayY = Math.sin(tourPhase * 0.56) * 0.16;
          const swayZ = -0.35 * (1 - Math.cos(tourPhase * 0.48));
          camCurrentPos.lerp(new THREE.Vector3(camGoalPos.x + swayX, camGoalPos.y + swayY, camGoalPos.z + swayZ), camLerp);
        } else {
          const pOffX = cur.mode === "exhibition" ? pointerCurrent.x * 0.9 : pointerCurrent.x * 0.45;
          const pOffY = cur.mode === "exhibition" ? -pointerCurrent.y * 0.22 : -pointerCurrent.y * 0.12;
          camCurrentPos.lerp(new THREE.Vector3(camGoalPos.x + pOffX, camGoalPos.y + pOffY, camGoalPos.z), camLerp);
        }
        camCurrentTarget.lerp(camGoalTarget, camLerp);
        camera.position.copy(camCurrentPos);
        camera.lookAt(camCurrentTarget);
      }

      backdropUniforms.uDrift.value.set(
        Math.sin(camera.position.x / 28) * 0.016 + (camera.position.x - camGoalTarget.x) * 0.008,
        (camera.position.y - 2.45) * 0.009,
      );

      for (const st of activeStations.values()) {
        st.photoMat.uniforms.uWarmth.value = warmthCurrent;
        st.photoMat.uniforms.uDusk.value = duskCurrent;
        st.shadowMat.uniforms.uWarmth.value = warmthCurrent;
        st.shadowMat.uniforms.uDusk.value = duskCurrent;
        st.contactMat.uniforms.uWarmth.value = warmthCurrent;
        st.contactMat.uniforms.uDusk.value = duskCurrent;
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.removeEventListener("start", handleControlStart);
      controls.dispose();

      for (const st of activeStations.values()) disposeStation(st);
      activeStations.clear();
      for (const item of textureCache.values()) item.texture.dispose();
      textureCache.clear();
      backdropTexture?.dispose();
      backdropGeo.dispose();
      backdropMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      particleTex.dispose();
      sharedPlaneGeo.dispose();
      sharedContactGeo.dispose();
      renderer.dispose();
      canvasRef.current = null;
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={
        "beach-stage-root"
        + (mode === "exhibition" ? " is-exhibition" : " is-studio")
        + (interactive ? " is-interactive" : "")
        + (loaded ? " is-ready" : "")
      }
    >
      {imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt={alt}
          className={"beach-stage-poster" + (isCoastalExhibitUrl(imageUrl) ? " is-cutout" : "") + (failed ? " is-forced" : "")}
        />
      )}
    </div>
  );
}

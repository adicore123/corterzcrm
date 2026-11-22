"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { isCoastalExhibitUrl } from "@/lib/catalog/coastal-assets";
import { toWebglTextureUrl } from "./catalog-utils";
import {
  beachTerrainFragment,
  beachTerrainVertex,
  cliffFragment,
  cliffVertex,
  coastalProductFragment,
  coastalProductVertex,
  coastalShadowFragment,
  coastalShadowVertex,
  contactShadowFragment,
  contactShadowVertex,
  oceanGerstnerFragment,
  oceanGerstnerVertex,
  skyDomeFragment,
  skyDomeVertex,
} from "./coastal-shaders";
import type { StudioEnvironment } from "./studio-environments";

export const BAY_SPACING = 12;

export type BeachSlot = {
  bay: number;
  image: string;
  key: string;
};

export type BeachStageMode = "exhibition" | "studio";

type CameraPose = {
  pos: [number, number, number];
  target: [number, number, number];
};

const VIEW_POSES: Record<string, CameraPose> = {
  hero: { pos: [0.35, 2.45, 9.95], target: [0, 1.82, 0] },
  stage: { pos: [0.35, 2.45, 9.5], target: [0, 1.65, 0] },
  signature: { pos: [0.35, 2.45, 9.5], target: [0, 1.65, 0] },
  close: { pos: [-0.48, 2.22, 7.25], target: [0, 1.8, 0] },
  detail: { pos: [-0.48, 2.22, 7.25], target: [0, 1.8, 0] },
  wide: { pos: [1.18, 3.08, 12.4], target: [0, 1.55, -1.2] },
  angle: { pos: [1.18, 3.08, 12.4], target: [0, 1.55, -1.2] },
  front: { pos: [-0.88, 2.32, 8.6], target: [-0.15, 1.68, 0] },
  side: { pos: [0.05, 2.38, 9.2], target: [0, 1.65, 0] },
  back: { pos: [0.92, 2.35, 8.7], target: [0.15, 1.68, 0] },
  cockpit: { pos: [-0.38, 2.52, 6.95], target: [-0.18, 2.02, 0] },
  drivetrain: { pos: [0.42, 1.88, 7.15], target: [0.18, 1.25, 0] },
};

/**
 * Keys out near-white studio backgrounds before mipmap generation so non-cutout
 * CRM models and color variants sit cleanly on the 3D beach stage without white halos.
 */
function createRemovedWhiteTexture(
  img: HTMLImageElement,
  isPreparedCutout: boolean,
  maxAnisotropy: number,
): { texture: THREE.Texture; hasCutoutAlpha: boolean } {
  const width = img.naturalWidth || img.width || 1;
  const height = img.naturalHeight || img.height || 1;

  if (isPreparedCutout) {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, maxAnisotropy);
    tex.needsUpdate = true;
    return { texture: tex, hasCutoutAlpha: true };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return { texture: tex, hasCutoutAlpha: false };
  }

  ctx.drawImage(img, 0, 0);
  let hasCutoutAlpha = false;
  try {
    const pixels = ctx.getImageData(0, 0, width, height);
    const data = pixels.data;
    const corners = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      (width * height - 1) * 4,
    ];
    const transparentCorners = corners.filter((i) => data[i + 3] < 40).length;
    const whiteCorners = corners.filter(
      (i) => data[i + 3] > 200 && Math.min(data[i], data[i + 1], data[i + 2]) > 218,
    ).length;

    if (transparentCorners >= 3) {
      hasCutoutAlpha = true;
    } else if (whiteCorners >= 3) {
      hasCutoutAlpha = true;
      for (let i = 0; i < data.length; i += 4) {
        const white = Math.min(data[i], data[i + 1], data[i + 2]);
        const t = Math.max(0, Math.min(1, (white - 205) / 40));
        const alpha = 1 - t * t * (3 - 2 * t);
        data[i + 3] = Math.round(data[i + 3] * alpha);
        if (alpha < 0.999) {
          for (let c = 0; c < 3; c++) {
            data[i + c] =
              alpha > 0.01
                ? Math.max(0, Math.min(255, (data[i + c] - 255 * (1 - alpha)) / alpha))
                : 0;
          }
        }
      }
      ctx.putImageData(pixels, 0, 0);
    }
  } catch {
    // Tainted canvas fallback
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return { texture: tex, hasCutoutAlpha };
}

function makeAirParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, "rgba(255, 250, 235, 1)");
    grad.addColorStop(0.45, "rgba(255, 240, 210, 0.45)");
    grad.addColorStop(1, "rgba(255, 240, 210, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Builds a sculpted 3D Mediterranean Date Palm tree that frames the upper corners and sways in the sea breeze. */
function buildMediterraneanPalm(
  trunkMat: THREE.Material,
  frondMat: THREE.Material,
  leanX: number,
  scale: number,
): { root: THREE.Group; crown: THREE.Group } {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  const segments = 8;
  const segHeight = 0.56;
  let curX = 0;
  let curY = 0;
  let curZ = 0;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const rBottom = 0.14 * (1 - t * 0.44);
    const rTop = 0.125 * (1 - (t + 1 / segments) * 0.44);
    const segGeo = new THREE.CylinderGeometry(rTop, rBottom, segHeight * 1.06, 10);
    const segMesh = new THREE.Mesh(segGeo, trunkMat);
    const tiltX = leanX * (0.12 + t * 0.24);
    const tiltZ = -0.05 * (1 - t * 0.5);
    segMesh.position.set(curX + tiltX * 0.5, curY + segHeight * 0.5, curZ + tiltZ * 0.5);
    segMesh.rotation.z = -tiltX * 0.65;
    segMesh.rotation.x = tiltZ * 0.65;
    root.add(segMesh);
    curX += tiltX;
    curY += segHeight * 0.95;
    curZ += tiltZ;
  }

  const crown = new THREE.Group();
  crown.position.set(curX, curY, curZ);
  const frondCount = 11;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.16;
    const frondHolder = new THREE.Group();
    frondHolder.rotation.y = angle;

    const frondGeo = new THREE.PlaneGeometry(0.52, 2.25, 2, 7);
    const pos = frondGeo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const py = pos.getY(v) + 1.125; // 0 at base, 2.25 at tip
      const normY = py / 2.25;
      const archY = Math.sin(normY * Math.PI * 0.78) * 0.58 - normY * normY * 0.52;
      const taper = Math.sin(normY * Math.PI);
      pos.setX(v, pos.getX(v) * (0.22 + 0.88 * taper));
      pos.setY(v, archY);
      pos.setZ(v, py);
    }
    frondGeo.computeVertexNormals();
    const frondMesh = new THREE.Mesh(frondGeo, frondMat);
    frondMesh.rotation.x = 0.14 + (i % 3) * 0.12;
    frondHolder.add(frondMesh);
    crown.add(frondHolder);
  }

  root.add(crown);
  return { root, crown };
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
        alpha: false,
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
    renderer.toneMappingExposure = 1.0;
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5fa4c8);
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 360);
    camera.position.set(0.35, 2.45, 9.5);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minAzimuthAngle = -0.28;
    controls.maxAzimuthAngle = 0.28;
    controls.minPolarAngle = 1.26;
    controls.maxPolarAngle = 1.59;
    controls.minDistance = 5.5;
    controls.maxDistance = 14.5;
    controls.enabled = propsRef.current.mode === "studio" && propsRef.current.interactive;

    const handleControlStart = () => {
      callbacksRef.current.onInteraction?.();
    };
    controls.addEventListener("start", handleControlStart);

    // 1. Real 3D Lights (In-Frame Sun Vector + Sky/Sand Hemisphere)
    const sunDir = new THREE.Vector3(-0.16, 0.18, -0.97).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff5e4, 2.25);
    sunLight.position.copy(sunDir).multiplyScalar(60);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x88c9eb, 0xd8bd96, 1.15);
    scene.add(hemiLight);

    // 2. Real 3D Sky Dome (360° Sphere with In-Frame Sun Disc, God-Rays & Sculptural 3D Clouds)
    const skyUniforms = {
      uSunDir: { value: sunDir.clone() },
      uSeconds: { value: 0 },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    const skyGeo = new THREE.SphereGeometry(240, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: skyDomeVertex,
      fragmentShader: skyDomeFragment,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -20;
    scene.add(skyMesh);

    // 3. Real 3D Gerstner Wave Ocean Surface (Vertex-Displaced 3D Ocean Mesh reaching z = -0.65m right behind bike!)
    const oceanUniforms = {
      uSunDir: { value: sunDir.clone() },
      uSeconds: { value: 0 },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    const oceanSegX = isMobile ? 110 : 180;
    const oceanSegZ = isMobile ? 68 : 112;
    const oceanGeo = new THREE.PlaneGeometry(300, 145, oceanSegX, oceanSegZ);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      vertexShader: oceanGerstnerVertex,
      fragmentShader: oceanGerstnerFragment,
      transparent: true,
      depthWrite: true,
      toneMapped: false,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, 0.0, -73.1);
    oceanMesh.renderOrder = -2;
    scene.add(oceanMesh);

    // 4. Real 3D Sculpted Beach Terrain (Seabed + Wet Sand Mirror + Dry Rippled Sand with Dappled Palm Shadows)
    const terrainUniforms = {
      uSunDir: { value: sunDir.clone() },
      uSeconds: { value: 0 },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    const terrainSegX = isMobile ? 96 : 150;
    const terrainSegZ = isMobile ? 48 : 72;
    const terrainGeo = new THREE.PlaneGeometry(300, 82, terrainSegX, terrainSegZ);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.ShaderMaterial({
      uniforms: terrainUniforms,
      vertexShader: beachTerrainVertex,
      fragmentShader: beachTerrainFragment,
      toneMapped: false,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.set(0, 0, 29);
    terrainMesh.renderOrder = -3;
    scene.add(terrainMesh);

    // 5. Real 3D In-Frame Mediterranean Kurkar Sandstone Headland Cliffs & Sea Stacks
    const cliffsGroup = new THREE.Group();
    const cliffUniforms = {
      uSunDir: { value: sunDir.clone() },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    const cliffMat = new THREE.ShaderMaterial({
      uniforms: cliffUniforms,
      vertexShader: cliffVertex,
      fragmentShader: cliffFragment,
      toneMapped: false,
    });
    const cliffSpecs: [number, number, number, number, number, number][] = [
      [11.5, -0.6, -28, 7.2, 3.8, 6.5],
      [17.5, -0.5, -33, 11.5, 5.8, 9.2],
      [7.2, -0.8, -23, 2.8, 1.45, 2.5],
      [5.1, -0.85, -20, 1.35, 0.72, 1.2],
      [-11.8, -0.7, -32, 6.4, 2.9, 5.4],
      [-16.5, -0.6, -38, 10.2, 4.6, 8.2],
    ];
    const cliffGeos: THREE.BufferGeometry[] = [];
    for (const [cx, cy, cz, sx, sy, sz] of cliffSpecs) {
      const geo = new THREE.DodecahedronGeometry(1, 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const terrace = Math.round(vy * 4.0) / 4.0;
        pos.setXYZ(
          i,
          vx * (1 + 0.22 * Math.sin(vz * 3.8)),
          Math.max(-0.35, terrace * 0.85 + 0.16 * Math.cos(vx * 3.5)),
          vz * (1 + 0.18 * Math.cos(vx * 3.1)),
        );
      }
      geo.computeVertexNormals();
      cliffGeos.push(geo);
      const mesh = new THREE.Mesh(geo, cliffMat);
      mesh.position.set(cx, cy + sy * 0.35, cz);
      mesh.scale.set(sx, sy, sz);
      cliffsGroup.add(mesh);
    }
    scene.add(cliffsGroup);

    // 6. 3D Sea-Breeze Sunlight Dust & Mist Particles
    const particleCount = reducedMotion ? 0 : isMobile ? 32 : 64;
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

    // 7. 3D Swaying Mediterranean Palm Tree Materials
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x8f6e4f,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true,
    });
    const palmFrondMat = new THREE.MeshStandardMaterial({
      color: 0x3b6e38,
      roughness: 0.62,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    // 8. Stations Map (each bay has in-frame 3D swaying palms, sun-vector cast shadow, wet-sand reflection & vehicle)
    type StationGpu = {
      key: string;
      image: string;
      group: THREE.Group;
      palmCrowns: THREE.Group[];
      contactMesh: THREE.Mesh;
      contactMat: THREE.ShaderMaterial;
      shadowMesh: THREE.Mesh;
      shadowMat: THREE.ShaderMaterial;
      reflectionMesh: THREE.Mesh;
      reflectionMat: THREE.MeshBasicMaterial;
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

      // Soft vertical mirror reflection of the bike on the wet shoreline sand
      st.reflectionMesh.scale.set(photoW, -photoH * 0.45, 1);
      st.reflectionMesh.position.set(0, 0.18 - photoH * 0.22, -0.05);
      st.reflectionMat.map = cached.texture;
      st.reflectionMat.needsUpdate = true;
      st.reflectionMesh.visible = cached.hasCutoutAlpha;

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

      // 3D Swaying Mediterranean Date Palms positioned inside the camera frame corners
      const palmRight = buildMediterraneanPalm(palmTrunkMat, palmFrondMat, -0.34, 0.88);
      palmRight.root.position.set(3.85, 0.02, -2.15);
      group.add(palmRight.root);

      const palmLeft = buildMediterraneanPalm(palmTrunkMat, palmFrondMat, 0.32, 0.82);
      palmLeft.root.position.set(-4.05, 0.02, -2.65);
      group.add(palmLeft.root);

      const contactMat = new THREE.ShaderMaterial({
        uniforms: { uWarmth: { value: 0 }, uDusk: { value: 0 } },
        vertexShader: contactShadowVertex,
        fragmentShader: contactShadowFragment,
        transparent: true,
        depthWrite: false,
      });
      const contactMesh = new THREE.Mesh(sharedContactGeo, contactMat);
      contactMesh.position.set(0, 0.192, 0.04);
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

      const reflectionMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const reflectionMesh = new THREE.Mesh(sharedPlaneGeo, reflectionMat);
      reflectionMesh.renderOrder = 1;
      reflectionMesh.visible = false;
      group.add(reflectionMesh);

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
        palmCrowns: [palmRight.crown, palmLeft.crown],
        contactMesh,
        contactMat,
        shadowMesh,
        shadowMat,
        reflectionMesh,
        reflectionMat,
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
      st.reflectionMat.dispose();
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

    // 9. Camera Pose & Parallax State
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
        const delta = e.key === "ArrowLeft" ? -0.18 : 0.18;
        camera.position.x = Math.max(-3.0, Math.min(3.0, camera.position.x + delta));
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

    // 10. Lifecycle, Intersection, Visibility & Resize Observers
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

    // 11. Real-Time 3D Render Loop
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

      if (!reducedMotion) waveTime += rawDt;

      // Smooth interpolation between Day, Golden Hour (night), and Twilight (gallery)
      const targetWarmth = cur.environment === "night" ? 1 : 0;
      const targetDusk = cur.environment === "gallery" ? 1 : 0;
      const gradeLerp = reducedMotion ? 1 : Math.min(1, rawDt * 4.5);
      warmthCurrent += (targetWarmth - warmthCurrent) * gradeLerp;
      duskCurrent += (targetDusk - duskCurrent) * gradeLerp;

      // In-frame 3D Sun Direction Vector (visible in upper-left sky & casting golden path on waves)
      const sunElev = THREE.MathUtils.lerp(0.175, 0.082, warmthCurrent) * (1 - duskCurrent * 0.82);
      const sunAzimX = THREE.MathUtils.lerp(-0.155, -0.175, warmthCurrent);
      sunDir.set(sunAzimX, sunElev, -0.97).normalize();

      skyUniforms.uSunDir.value.copy(sunDir);
      skyUniforms.uSeconds.value = waveTime;
      skyUniforms.uWarmth.value = warmthCurrent;
      skyUniforms.uDusk.value = duskCurrent;

      oceanUniforms.uSunDir.value.copy(sunDir);
      oceanUniforms.uSeconds.value = waveTime;
      oceanUniforms.uWarmth.value = warmthCurrent;
      oceanUniforms.uDusk.value = duskCurrent;

      terrainUniforms.uSunDir.value.copy(sunDir);
      terrainUniforms.uSeconds.value = waveTime;
      terrainUniforms.uWarmth.value = warmthCurrent;
      terrainUniforms.uDusk.value = duskCurrent;

      cliffUniforms.uSunDir.value.copy(sunDir);
      cliffUniforms.uWarmth.value = warmthCurrent;
      cliffUniforms.uDusk.value = duskCurrent;

      sunLight.position.copy(sunDir).multiplyScalar(60);
      sunLight.color.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.96, 0.72, warmthCurrent) * (1 - duskCurrent * 0.35),
        THREE.MathUtils.lerp(0.88, 0.46, warmthCurrent) * (1 - duskCurrent * 0.15),
      );
      sunLight.intensity = THREE.MathUtils.lerp(2.2, 1.85, warmthCurrent) * (1 - duskCurrent * 0.62);
      hemiLight.intensity = THREE.MathUtils.lerp(1.15, 0.95, warmthCurrent) * (1 - duskCurrent * 0.45);

      // Sway 3D Mediterranean palm crowns gently in the sea breeze
      if (!reducedMotion) {
        const breezeA = Math.sin(waveTime * 1.35) * 0.055;
        const breezeB = Math.cos(waveTime * 0.95) * 0.038;
        for (const st of activeStations.values()) {
          st.palmCrowns.forEach((crown, idx) => {
            crown.rotation.z = breezeA * (idx === 0 ? 1 : -0.85);
            crown.rotation.x = breezeB;
          });
        }
      }

      // Update sea-breeze particles
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

      // Update 3D Camera Rig
      const ptrLerp = reducedMotion ? 1 : Math.min(1, rawDt * 5);
      pointerCurrent.lerp(pointerTarget, ptrLerp);

      if (cur.mode === "studio" && cur.interactive) {
        controls.update();
      } else {
        const camLerp = reducedMotion ? 1 : Math.min(1, rawDt * 5.2);
        if (cur.tour && !reducedMotion) {
          tourPhase += rawDt;
          const swayX = Math.sin(tourPhase * 0.42) * 1.15;
          const swayY = Math.sin(tourPhase * 0.56) * 0.2;
          const swayZ = -0.42 * (1 - Math.cos(tourPhase * 0.48));
          camCurrentPos.lerp(new THREE.Vector3(camGoalPos.x + swayX, camGoalPos.y + swayY, camGoalPos.z + swayZ), camLerp);
        } else {
          const pOffX = cur.mode === "exhibition" ? pointerCurrent.x * 0.96 : pointerCurrent.x * 0.48;
          const pOffY = cur.mode === "exhibition" ? -pointerCurrent.y * 0.24 : -pointerCurrent.y * 0.14;
          camCurrentPos.lerp(new THREE.Vector3(camGoalPos.x + pOffX, camGoalPos.y + pOffY, camGoalPos.z), camLerp);
        }
        camCurrentTarget.lerp(camGoalTarget, camLerp);
        camera.position.copy(camCurrentPos);
        camera.lookAt(camCurrentTarget);
      }

      // Keep infinite 3D sky, ocean, terrain & cliffs anchored around the active coastal region
      skyMesh.position.x = camera.position.x;
      const anchorX = Math.round(camera.position.x / 24) * 24;
      oceanMesh.position.x = anchorX;
      terrainMesh.position.x = anchorX;
      cliffsGroup.position.x = camera.position.x * 0.82;

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

      skyGeo.dispose();
      skyMat.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      for (const g of cliffGeos) g.dispose();
      cliffMat.dispose();
      palmTrunkMat.dispose();
      palmFrondMat.dispose();
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

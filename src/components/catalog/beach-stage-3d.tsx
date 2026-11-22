"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COASTAL_SCENERY_URL, isCoastalExhibitUrl } from "@/lib/catalog/coastal-assets";
import { toWebglTextureUrl } from "./catalog-utils";
import {
  coastalBackdropFragment,
  coastalBackdropVertex,
  coastalProductFragment,
  coastalProductVertex,
  coastalShadowFragment,
  coastalShadowVertex,
  contactShadowFragment,
  contactShadowVertex,
  shorelineGroundFragment,
  shorelineGroundVertex,
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
  wide: { pos: [1.18, 3.08, 12.4], target: [0, 1.55, 0] },
  angle: { pos: [1.18, 3.08, 12.4], target: [0, 1.55, 0] },
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

/**
 * Synthesizes a high-resolution (1024x512) botanical palm frond texture with
 * 140+ individual tapered pinnae (leaflets), central woody rachis, and sunlit subsurface variation.
 */
function makePhotorealisticPalmFrondTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 1024);

    // Draw 72 pairs of individual tapered palm leaflets (pinnae) radiating from the central rachis
    const numPairs = 72;
    for (let i = 3; i < numPairs; i++) {
      const t = i / numPairs; // 0 near base (bottom y=1000), 1 near tip (top y=24)
      const y = 1000 - t * 965;
      const envelope = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const maxSpan = 238 * envelope * (1 - t * 0.14);
      if (maxSpan < 8) continue;

      for (const side of [-1, 1]) {
        const jitter = Math.sin(i * 17.3 + side * 4.1) * 0.08;
        const span = maxSpan * (0.92 + jitter);
        const angleUp = (0.36 + t * 0.48 + jitter * 0.2) * 165;
        const droop = (0.22 + (1 - t) * 0.35) * 62;

        const x0 = 256 + side * 3 * (1 - t * 0.65);
        const y0 = y;
        const cx = x0 + side * span * 0.54;
        const cy = y0 - angleUp * 0.58;
        const tipX = x0 + side * span;
        const tipY = y0 - angleUp + droop;

        const baseWidth = (8.2 - t * 3.8) * (0.92 + 0.18 * Math.cos(i * 5.7));

        const grad = ctx.createLinearGradient(x0, y0, tipX, tipY);
        const sunHit = 0.5 + 0.5 * Math.sin(i * 0.45 + side * 0.8);
        grad.addColorStop(0, "#1f3b16");
        grad.addColorStop(0.25, sunHit > 0.52 ? "#3e6924" : "#2f531c");
        grad.addColorStop(0.68, sunHit > 0.52 ? "#5e8a34" : "#446e27");
        grad.addColorStop(0.92, "#789e42");
        grad.addColorStop(1, "#6b8e3a");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - baseWidth * 0.5);
        ctx.quadraticCurveTo(cx, cy - baseWidth * 0.44, tipX, tipY);
        ctx.quadraticCurveTo(cx, cy + baseWidth * 0.36, x0, y0 + baseWidth * 0.5);
        ctx.closePath();
        ctx.fill();

        // Central leaflet vein highlight
        ctx.strokeStyle = "rgba(182, 212, 110, 0.42)";
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy - 0.5, tipX, tipY);
        ctx.stroke();
      }
    }

    // Draw the central woody rachis (stem/midrib) tapering from petiole base to frond tip
    const stemGrad = ctx.createLinearGradient(246, 1024, 266, 20);
    stemGrad.addColorStop(0, "#5e4b32");
    stemGrad.addColorStop(0.35, "#6b7338");
    stemGrad.addColorStop(1, "#7b9442");
    ctx.fillStyle = stemGrad;
    ctx.beginPath();
    ctx.moveTo(249, 1020);
    ctx.lineTo(255.2, 22);
    ctx.lineTo(256.8, 22);
    ctx.lineTo(263, 1020);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/** Synthesizes a fibrous diamond-scarred Mediterranean date palm trunk bark texture. */
function makePhotorealisticPalmBarkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const baseGrad = ctx.createLinearGradient(0, 0, 256, 0);
    baseGrad.addColorStop(0, "#4a3a2a");
    baseGrad.addColorStop(0.35, "#826952");
    baseGrad.addColorStop(0.65, "#6e5742");
    baseGrad.addColorStop(1, "#3d2f22");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 256, 512);

    // Horizontal leaf-base scar rings & diamond weave
    for (let y = 0; y < 512; y += 14) {
      ctx.fillStyle = y % 28 === 0 ? "rgba(32, 22, 14, 0.45)" : "rgba(165, 138, 108, 0.25)";
      ctx.fillRect(0, y, 256, 3);
      for (let x = (y % 28 === 0 ? 0 : 16); x < 256; x += 32) {
        ctx.strokeStyle = "rgba(42, 30, 20, 0.42)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 16, y + 12);
        ctx.lineTo(x + 32, y);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/** Builds a photorealistic 3D Mediterranean Date Palm with 18 double-curved botanical fronds and coconuts. */
function buildPhotorealisticPalm(
  trunkMat: THREE.Material,
  frondMat: THREE.Material,
  coconutMat: THREE.Material,
  leanX: number,
  scale: number,
): { root: THREE.Group; crown: THREE.Group } {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  // Smooth curved 12-segment trunk rising from foreground shore below camera frame
  const segments = 12;
  const segHeight = 0.48;
  let curX = 0;
  let curY = 0;
  let curZ = 0;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const rBottom = 0.175 * (1 - t * 0.44);
    const rTop = 0.16 * (1 - (t + 1 / segments) * 0.44);
    const segGeo = new THREE.CylinderGeometry(rTop, rBottom, segHeight * 1.08, 14);
    const segMesh = new THREE.Mesh(segGeo, trunkMat);
    const curve = Math.pow(t, 1.2);
    const tiltX = leanX * (0.09 + curve * 0.24);
    const tiltZ = -0.03 * (1 - t * 0.5);
    segMesh.position.set(curX + tiltX * 0.5, curY + segHeight * 0.5, curZ + tiltZ * 0.5);
    segMesh.rotation.z = -tiltX * 0.75;
    segMesh.rotation.x = tiltZ * 0.75;
    root.add(segMesh);
    curX += tiltX;
    curY += segHeight * 0.95;
    curZ += tiltZ;
  }

  const crown = new THREE.Group();
  crown.position.set(curX, curY, curZ);
  crown.rotation.x = 0.24;
  crown.rotation.z = -leanX * 0.22;

  // Coconut cluster at the heart of the palm crown
  const cocoGeo = new THREE.SphereGeometry(0.105, 10, 10);
  for (let c = 0; c < 6; c++) {
    const ca = (c / 6) * Math.PI * 2;
    const coco = new THREE.Mesh(cocoGeo, coconutMat);
    coco.position.set(Math.cos(ca) * 0.15, -0.07 - (c % 2) * 0.05, Math.sin(ca) * 0.15);
    coco.scale.set(1, 1.22, 1);
    crown.add(coco);
  }

  // 22 double-curved 3D botanical fronds across 4 natural tiers (upright plume, upper fan, wide canopy, drooping skirt)
  const tiers: { count: number; pitch: number; length: number; width: number; droop: number; yOffset: number }[] = [
    { count: 5, pitch: -0.58, length: 2.05, width: 0.92, droop: 0.34, yOffset: 0.14 },
    { count: 6, pitch: -0.22, length: 2.55, width: 1.12, droop: 0.56, yOffset: 0.07 },
    { count: 6, pitch: 0.12, length: 2.65, width: 1.15, droop: 0.78, yOffset: 0.0 },
    { count: 5, pitch: 0.42, length: 2.35, width: 1.04, droop: 0.98, yOffset: -0.06 },
  ];

  tiers.forEach((tier, tierIdx) => {
    for (let i = 0; i < tier.count; i++) {
      const azimuth = (i / tier.count) * Math.PI * 2 + tierIdx * 0.48 + Math.sin(i * 3.1) * 0.08;
      const holder = new THREE.Group();
      holder.position.y = tier.yOffset;
      holder.rotation.y = azimuth;

      const frondGeo = new THREE.PlaneGeometry(tier.width, tier.length, 4, 10);
      const pos = frondGeo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v);
        const vy = pos.getY(v) + tier.length * 0.5; // 0 at stem base, tier.length at frond tip
        const normY = vy / tier.length;
        // Natural V-keel fold across leaflets + graceful parabolic arch along rachis
        const vKeel = -Math.abs(vx) * 0.24 * Math.sin(normY * Math.PI);
        const archY = Math.sin(normY * Math.PI * 0.72) * 0.68 - normY * normY * tier.droop + vKeel;
        const forwardZ = vy * (1 - normY * 0.14);
        pos.setXYZ(v, vx, archY, forwardZ);
      }
      frondGeo.computeVertexNormals();
      frondGeo.computeBoundingBox();
      frondGeo.computeBoundingSphere();

      const frondMesh = new THREE.Mesh(frondGeo, frondMat);
      frondMesh.frustumCulled = false;
      frondMesh.rotation.x = tier.pitch;
      frondMesh.rotation.z = ((i % 2 === 0 ? 1 : -1) * 0.22);
      holder.add(frondMesh);
      crown.add(holder);
    }
  });

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
    renderer.toneMappingExposure = 1.02;
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 140);
    camera.position.set(0.35, 2.45, 9.5);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
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

    // 1. Real 3D Lights (Sun Directional + Warm Sand/Sky Hemisphere)
    const sunLight = new THREE.DirectionalLight(0xfff5e2, 2.4);
    sunLight.position.set(-18, 22, 16);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xa6dcf5, 0xe0c59c, 1.35);
    scene.add(hemiLight);

    // 2. Photorealistic Coastal Horizon & Sea Backdrop with Multi-Layer 3D Parallax & Wave Refraction
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

    // 3. Real 3D Ground Shoreline Swash & Dappled Palm Shadow Plane
    const groundUniforms = {
      uSeconds: { value: 0 },
      uWarmth: { value: 0 },
      uDusk: { value: 0 },
    };
    const groundGeo = new THREE.PlaneGeometry(240, 14);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.ShaderMaterial({
      uniforms: groundUniforms,
      vertexShader: shorelineGroundVertex,
      fragmentShader: shorelineGroundFragment,
      transparent: true,
      depthWrite: false,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(0, 0.188, -0.4);
    groundMesh.renderOrder = 0;
    scene.add(groundMesh);

    // 4. Photorealistic Botanical 3D Palm Tree Textures & Materials
    const frondTexture = makePhotorealisticPalmFrondTexture(maxAniso);
    const barkTexture = makePhotorealisticPalmBarkTexture(maxAniso);

    const palmTrunkMat = new THREE.MeshStandardMaterial({
      map: barkTexture,
      bumpMap: barkTexture,
      bumpScale: 0.035,
      roughness: 0.88,
      metalness: 0.02,
    });
    const palmFrondMat = new THREE.MeshStandardMaterial({
      map: frondTexture,
      transparent: true,
      alphaTest: 0.14,
      roughness: 0.48,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });
    const coconutMat = new THREE.MeshStandardMaterial({
      color: 0x4b3621,
      roughness: 0.72,
      metalness: 0.03,
    });

    // 5. 3D Sea-Breeze Sunlight Dust & Mist Particles
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

    // 6. Stations Map (each bay has photorealistic 3D swaying palm trees, sun shadow, wet-sand reflection & vehicle)
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

      // Soft vertical wet-sand reflection under the wheels
      st.reflectionMesh.scale.set(photoW, -photoH * 0.38, 1);
      st.reflectionMesh.position.set(0, 0.18 - photoH * 0.19, -0.04);
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

      // Photorealistic 3D Date Palm Trees rising from the foreground shore corners
      const palmRight = buildPhotorealisticPalm(palmTrunkMat, palmFrondMat, coconutMat, -0.36, 0.96);
      palmRight.root.position.set(4.55, -1.75, 0.25);
      group.add(palmRight.root);

      const palmLeft = buildPhotorealisticPalm(palmTrunkMat, palmFrondMat, coconutMat, 0.34, 0.92);
      palmLeft.root.position.set(-4.65, -1.75, 0.15);
      group.add(palmLeft.root);

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

      const reflectionMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.09,
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

    // 7. Camera Pose & Parallax State
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
        camera.position.x = Math.max(-2.6, Math.min(2.6, camera.position.x + delta));
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

    // 8. Lifecycle, Intersection, Visibility & Resize Observers
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

    // 9. Real-Time 3D Render Loop
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

      backdropUniforms.uSeconds.value = waveTime;
      backdropUniforms.uWarmth.value = warmthCurrent;
      backdropUniforms.uDusk.value = duskCurrent;

      groundUniforms.uSeconds.value = waveTime;
      groundUniforms.uWarmth.value = warmthCurrent;
      groundUniforms.uDusk.value = duskCurrent;

      const aspect = Math.max(0.25, camera.aspect);
      const sourceAspect = backdropImgWidth / Math.max(1, backdropImgHeight);
      backdropUniforms.uCrop.value.set(
        Math.min(1, aspect / sourceAspect) * 0.965,
        Math.min(1, sourceAspect / aspect) * 0.965,
      );

      sunLight.color.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.97, 0.74, warmthCurrent) * (1 - duskCurrent * 0.35),
        THREE.MathUtils.lerp(0.90, 0.48, warmthCurrent) * (1 - duskCurrent * 0.15),
      );
      sunLight.intensity = THREE.MathUtils.lerp(2.4, 2.0, warmthCurrent) * (1 - duskCurrent * 0.55);
      hemiLight.intensity = THREE.MathUtils.lerp(1.35, 1.05, warmthCurrent) * (1 - duskCurrent * 0.45);

      // Sway 3D photorealistic palm crowns gently in the Mediterranean sea breeze
      if (!reducedMotion) {
        const breezeA = Math.sin(waveTime * 1.25) * 0.045;
        const breezeB = Math.cos(waveTime * 0.88) * 0.032;
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
          const swayX = Math.sin(tourPhase * 0.42) * 1.05;
          const swayY = Math.sin(tourPhase * 0.56) * 0.18;
          const swayZ = -0.38 * (1 - Math.cos(tourPhase * 0.48));
          camCurrentPos.lerp(new THREE.Vector3(camGoalPos.x + swayX, camGoalPos.y + swayY, camGoalPos.z + swayZ), camLerp);
        } else {
          const pOffX = cur.mode === "exhibition" ? pointerCurrent.x * 0.92 : pointerCurrent.x * 0.46;
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
      groundMesh.position.x = Math.round(camera.position.x / 24) * 24;

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
      groundGeo.dispose();
      groundMat.dispose();
      frondTexture.dispose();
      barkTexture.dispose();
      palmTrunkMat.dispose();
      palmFrondMat.dispose();
      coconutMat.dispose();
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

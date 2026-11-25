"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  AdaptiveQualityManager,
  detectInitialQualityProfile,
  type GraphicsQualityProfile,
} from "./AdaptiveQualityManager";
import { createAtmosphericSky, type CoastalLightingMode } from "./AtmosphericSky";
import { createSunLighting } from "./SunLighting";
import { createOceanSurface } from "./OceanSurface";
import { createShorelineSystem } from "./ShorelineSystem";
import { createSandTerrain } from "./SandTerrain";
import { createProductModel } from "./ProductModel";
import { createCameraController, type CoastalCameraPreset } from "./CameraController";
import { SceneFallback } from "./SceneFallback";

export interface BeachSceneProps {
  productName: string;
  productMode: "3d" | "photo";
  model3dUrl?: string;
  productImageUrl?: string;
  motionPaused?: boolean;
  cameraPreset?: CoastalCameraPreset;
  lightingMode?: CoastalLightingMode;
  centerStage?: boolean;
  interactiveDrag?: boolean;
  onQualityChange?: (profile: GraphicsQualityProfile) => void;
}

/**
 * Real-Time WebGL 2 Mediterranean Coastal Environment + Authentic Product Stage (V2).
 * Combines visible HDR Sun Disc & Corona, multi-directional Gerstner ocean waves with seabed caustics
 * and solar shimmer highway, 3-tier breaking surf foam, wet/dry PBR golden sand with tire tracks
 * and wet-sand product mirror reflection, plus interactive camera presets and drag orbit.
 */
export function BeachScene({
  productName,
  productMode,
  model3dUrl,
  productImageUrl,
  motionPaused = false,
  cameraPreset = "wide",
  lightingMode = "daylight",
  centerStage = false,
  interactiveDrag = false,
  onQualityChange,
}: BeachSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const motionPausedRef = useRef(motionPaused);

  const controlsRef = useRef<{
    setCameraPreset?: (preset: CoastalCameraPreset) => void;
    setLightingMode?: (mode: CoastalLightingMode) => void;
    triggerFrame?: () => void;
  }>({});

  useEffect(() => {
    motionPausedRef.current = motionPaused;
    controlsRef.current.triggerFrame?.();
  }, [motionPaused]);

  useEffect(() => {
    controlsRef.current.setCameraPreset?.(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    controlsRef.current.setLightingMode?.(lightingMode);
  }, [lightingMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;
    let inViewport = true;
    let tabVisible = typeof document !== "undefined" ? document.visibilityState !== "hidden" : true;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = reducedMotionQuery.matches;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const initialMobile = width <= 860;
    const initialProfile = detectInitialQualityProfile(initialMobile);
    const qualityManager = new AdaptiveQualityManager(initialProfile);
    onQualityChange?.(initialProfile);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: initialProfile !== "LITE",
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const settings = qualityManager.getSettings();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.className = "proposal-beach-canvas";
    canvas.setAttribute("aria-label", `סביבת חוף הים של קורטז עבור ${productName}`);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.pointerEvents = interactiveDrag ? "auto" : "none";
    canvas.style.touchAction = "pan-y";
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d9e8ef");

    const cameraCtrl = createCameraController(width, height, initialMobile, centerStage);
    const skyHandle = createAtmosphericSky(scene, renderer, "daylight");
    const sunHandle = createSunLighting(scene, skyHandle.sunDirection);
    const sandHandle = createSandTerrain(scene, skyHandle.sunDirection, settings);
    const oceanHandle = createOceanSurface(scene, skyHandle.sunDirection, settings);
    const shorelineHandle = createShorelineSystem(scene, skyHandle.sunDirection, settings.shaderQuality);

    const productHandle = createProductModel(scene, renderer, {
      mode: productMode,
      model3dUrl,
      imageUrl: productImageUrl,
      isMobile: initialMobile,
      sunDirection: skyHandle.sunDirection,
      centerStage,
      onFootprintChange(centerXZ, span) {
        sandHandle.uniforms.uProductXZ.value.copy(centerXZ);
        sandHandle.uniforms.uProductSpan.value = span;
      },
      onStatusChange(st) {
        if (disposed) return;
        if (st === "ready" || st === "error") {
          setReady(true);
          renderSingleFrame(performance.now());
        }
      },
    });

    const startTime = performance.now();
    let lastFrameTime = startTime;
    let simSeconds = 18.4; // Start at an active incoming wave phase

    function renderSingleFrame(nowMs: number) {
      if (disposed) return;
      const dtMs = Math.min(nowMs - lastFrameTime, 100);
      lastFrameTime = nowMs;
      const animated = !prefersReducedMotion && !motionPausedRef.current;
      if (animated) {
        simSeconds += dtMs * 0.001;
        const switched = qualityManager.recordFrame(dtMs, nowMs);
        if (switched) {
          const nextSettings = qualityManager.getSettings();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nextSettings.maxPixelRatio));
          oceanHandle.updateQuality(nextSettings);
          sandHandle.updateQuality(nextSettings);
          shorelineHandle.uniforms.uQuality.value = nextSettings.shaderQuality;
          onQualityChange?.(switched);
        }
      }

      const elapsedSec = (nowMs - startTime) * 0.001;
      cameraCtrl.tick(dtMs * 0.001, elapsedSec, animated);
      skyHandle.tick(simSeconds, cameraCtrl.camera.position);

      oceanHandle.uniforms.uTime.value = simSeconds;
      oceanHandle.uniforms.uCameraPos.value.copy(cameraCtrl.camera.position);

      sandHandle.uniforms.uTime.value = simSeconds;
      sandHandle.uniforms.uCameraPos.value.copy(cameraCtrl.camera.position);

      shorelineHandle.uniforms.uTime.value = simSeconds;
      productHandle.tick(simSeconds);

      try {
        renderer.render(scene, cameraCtrl.camera);
      } catch {
        setWebglFailed(true);
      }
    }

    function loop(nowMs: number) {
      rafId = 0;
      if (disposed) return;
      renderSingleFrame(nowMs);
      const shouldKeepAnimating = inViewport && tabVisible && !prefersReducedMotion && !motionPausedRef.current;
      if (shouldKeepAnimating) {
        rafId = window.requestAnimationFrame(loop);
      }
    }

    function scheduleLoop() {
      if (disposed || rafId) return;
      rafId = window.requestAnimationFrame(loop);
    }

    controlsRef.current = {
      setCameraPreset(preset: CoastalCameraPreset) {
        cameraCtrl.setPreset(preset);
        renderSingleFrame(performance.now());
        scheduleLoop();
      },
      setLightingMode(mode: CoastalLightingMode) {
        skyHandle.setLightingMode(mode);
        sunHandle.syncSunDirection(skyHandle.sunDirection, mode);
        oceanHandle.uniforms.uSunDir.value.copy(skyHandle.sunDirection);
        sandHandle.uniforms.uSunDir.value.copy(skyHandle.sunDirection);
        shorelineHandle.uniforms.uSunDir.value.copy(skyHandle.sunDirection);
        productHandle.syncSunDirection(skyHandle.sunDirection);
        renderer.toneMappingExposure = mode === "golden" ? 1.12 : 1.06;
        renderSingleFrame(performance.now());
        scheduleLoop();
      },
      triggerFrame() {
        lastFrameTime = performance.now();
        renderSingleFrame(lastFrameTime);
        scheduleLoop();
      },
    };

    // Render initial frame immediately
    renderSingleFrame(performance.now());
    queueMicrotask(() => {
      if (!disposed) setReady(true);
    });
    scheduleLoop();

    let isDragging = false;
    let lastDragX = 0;
    let lastDragY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (!interactiveDrag) return;
      isDragging = true;
      lastDragX = event.clientX;
      lastDragY = event.clientY;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (isDragging && interactiveDrag) {
        const dx = ((event.clientX - lastDragX) / Math.max(rect.width, 1)) * 2.4;
        const dy = -((event.clientY - lastDragY) / Math.max(rect.height, 1)) * 1.4;
        lastDragX = event.clientX;
        lastDragY = event.clientY;
        cameraCtrl.addDragOffset(dx, dy);
      }

      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      cameraCtrl.setPointerOffset(nx, ny);
      if (prefersReducedMotion || motionPausedRef.current) {
        renderSingleFrame(performance.now());
      }
    };

    const onScroll = () => {
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(window.innerHeight, 500)));
      cameraCtrl.setScrollProgress(progress);
    };

    const onVisibilityChange = () => {
      tabVisible = document.visibilityState !== "hidden";
      lastFrameTime = performance.now();
      if (tabVisible) scheduleLoop();
    };

    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (!prefersReducedMotion) scheduleLoop();
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (!disposed) setWebglFailed(true);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      const mobile = w <= 860;
      renderer.setSize(w, h);
      cameraCtrl.resize(w, h, mobile);
      productHandle.updateLayout(mobile);
      renderSingleFrame(performance.now());
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = Boolean(entry?.isIntersecting);
        lastFrameTime = performance.now();
        if (inViewport) scheduleLoop();
      },
      { threshold: 0.02 },
    );
    intersectionObserver.observe(container);

    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      controlsRef.current = {};
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);

      productHandle.dispose();
      shorelineHandle.dispose();
      oceanHandle.dispose();
      sandHandle.dispose();
      sunHandle.dispose();
      skyHandle.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [productName, productMode, model3dUrl, productImageUrl, centerStage, interactiveDrag, onQualityChange]);

  if (webglFailed) {
    return <SceneFallback productName={productName} imageUrl={productImageUrl} />;
  }

  return (
    <div
      ref={containerRef}
      className={"proposal-beach-stage" + (ready ? " is-ready" : "")}
      data-quality-ready={ready ? "true" : "false"}
    />
  );
}

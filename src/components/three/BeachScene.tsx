"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  AdaptiveQualityManager,
  detectInitialQualityProfile,
  type GraphicsQualityProfile,
} from "./AdaptiveQualityManager";
import { createAtmosphericSky } from "./AtmosphericSky";
import { createSunLighting } from "./SunLighting";
import { createOceanSurface } from "./OceanSurface";
import { createShorelineSystem } from "./ShorelineSystem";
import { createSandTerrain } from "./SandTerrain";
import { createProductModel } from "./ProductModel";
import { createCameraController } from "./CameraController";
import { SceneFallback } from "./SceneFallback";

export interface BeachSceneProps {
  productName: string;
  productMode: "3d" | "photo";
  model3dUrl?: string;
  productImageUrl?: string;
  motionPaused?: boolean;
  onQualityChange?: (profile: GraphicsQualityProfile) => void;
}

/**
 * Real-Time WebGL 2 Mediterranean Coastal Environment + Authentic Product Stage.
 * Combines multi-directional Gerstner ocean waves, bathymetric shoreline swash & lacy foam,
 * wet/dry PBR golden sand terrain, Preetham atmospheric sky & PMREM reflections, and
 * authentic product presentation (Mode A GLB or Mode B transparent cutout with cast shadow).
 */
export function BeachScene({
  productName,
  productMode,
  model3dUrl,
  productImageUrl,
  motionPaused = false,
  onQualityChange,
}: BeachSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const motionPausedRef = useRef(motionPaused);

  useEffect(() => {
    motionPausedRef.current = motionPaused;
  }, [motionPaused]);

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
    renderer.toneMappingExposure = 1.04;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.className = "proposal-beach-canvas";
    canvas.setAttribute("aria-label", `סביבת חוף הים של קורטז עבור ${productName}`);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d9e8ef");

    const cameraCtrl = createCameraController(width, height, initialMobile);
    const skyHandle = createAtmosphericSky(scene, renderer);
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

    // Render initial frame immediately
    renderSingleFrame(performance.now());
    queueMicrotask(() => {
      if (!disposed) setReady(true);
    });
    scheduleLoop();

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
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

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
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
  }, [productName, productMode, model3dUrl, productImageUrl, onQualityChange]);

  // Trigger a fresh frame or resume loop when motionPaused toggles
  useEffect(() => {
    window.dispatchEvent(new Event("scroll"));
  }, [motionPaused]);

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

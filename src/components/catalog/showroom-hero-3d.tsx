"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function ShowroomHero3D({ activeCategory, paused: externalPaused = false }: { activeCategory: string; paused?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const categoryRef = useRef(activeCategory);
  const externalPausedRef = useRef(externalPaused);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    categoryRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    externalPausedRef.current = externalPaused;
  }, [externalPaused]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setFallback(true));
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf6f7fa, 0.03);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
    camera.position.set(0, 2.35, 9.5);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    let pmrem: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.dispose();
    } catch {
      envRT?.dispose();
      pmrem?.dispose();
      envRT = null;
      pmrem = null;
    }

    const ambient = new THREE.AmbientLight(0xffffff, 1.35);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(6, 10, 7);
    const accentLight = new THREE.PointLight(0xba1517, 3.0, 20, 1.4);
    accentLight.position.set(-4.2, 2.6, 2.2);
    scene.add(ambient, keyLight, accentLight);

    // Titanium Silk Architectural Wave
    const waveGeo = new THREE.PlaneGeometry(28, 16, 48, 32);
    waveGeo.rotateX(-Math.PI * 0.44);
    const basePos = Float32Array.from(waveGeo.attributes.position.array);
    const waveMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f5f9,
      metalness: 0.14,
      roughness: 0.24,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
    });
    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    waveMesh.position.set(0, -1.78, -2.5);
    scene.add(waveMesh);

    // Sculptural Brushed Titanium & Surgical Crimson Halos
    const ringGroup = new THREE.Group();
    ringGroup.position.set(-2.6, 0.32, -1.5);
    scene.add(ringGroup);

    const titaniumMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9dce3,
      metalness: 0.92,
      roughness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const platinumMat = new THREE.MeshPhysicalMaterial({
      color: 0xbec3ce,
      metalness: 0.88,
      roughness: 0.2,
      clearcoat: 0.85,
    });
    const crimsonMat = new THREE.MeshPhysicalMaterial({
      color: 0xc81619,
      emissive: 0x700a0c,
      emissiveIntensity: 0.35,
      metalness: 0.58,
      roughness: 0.18,
      clearcoat: 1,
    });

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.026, 20, 128), titaniumMat);
    outerRing.rotation.set(Math.PI * 0.36, 0.28, 0);

    const midRing = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.02, 18, 120), platinumMat);
    midRing.rotation.set(-Math.PI * 0.28, -0.35, 0.42);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.015, 16, 110), crimsonMat);
    innerRing.rotation.set(Math.PI * 0.2, 0.48, 0);

    ringGroup.add(outerRing, midRing, innerRing);

    // Subtle Pearl-Silver & Soft-Crimson Studio Motes
    const particleCount = 140;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const cSilver = new THREE.Color(0xc5c9d4);
    const cRed = new THREE.Color(0xc81619);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = (Math.random() - 0.3) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
      const picked = i % 5 === 0 ? cRed : cSilver;
      colors[i * 3] = picked.r;
      colors[i * 3 + 1] = picked.g;
      colors[i * 3 + 2] = picked.b;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    let pointerX = 0;
    let pointerY = 0;
    function onPointerMove(event: PointerEvent) {
      const rect = container?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return;
      pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

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

    let rafId = 0;
    let contextLost = false;
    let intersecting = true;
    let paused = document.hidden;
    let lastTime = performance.now();
    let waveTime = 0;

    const visibilityObserver = new IntersectionObserver((entries) => {
      intersecting = entries[0]?.isIntersecting ?? true;
      paused = document.hidden || !intersecting;
      lastTime = performance.now();
    });
    visibilityObserver.observe(container);

    function onVisibility() {
      paused = document.hidden || !intersecting;
      lastTime = performance.now();
    }
    document.addEventListener("visibilitychange", onVisibility);

    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(rafId);
      setFallback(true);
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    function updateWave(t: number) {
      const pos = waveGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const bx = basePos[i * 3];
        const by = basePos[i * 3 + 1];
        const bz = basePos[i * 3 + 2];
        const ripple = Math.sin(bx * 0.34 + t * 0.85) * 0.3 + Math.cos(bz * 0.42 - t * 0.65) * 0.22;
        pos.setY(i, by + ripple);
      }
      pos.needsUpdate = true;
      waveGeo.computeVertexNormals();
    }

    function renderFrame(now: number) {
      if (contextLost) return;
      if (!paused && !externalPausedRef.current) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const cat = categoryRef.current;
        const speedBoost = cat === "2027" ? 1.4 : cat === "קורקינט חשמלי" ? 1.2 : 1.0;

        waveTime += dt * speedBoost;
        updateWave(waveTime);

        outerRing.rotation.z += dt * 0.16 * speedBoost;
        midRing.rotation.x += dt * 0.24 * speedBoost;
        midRing.rotation.y -= dt * 0.18 * speedBoost;
        innerRing.rotation.y += dt * 0.32 * speedBoost;
        particles.rotation.y += dt * 0.025;

        const targetX = pointerX * 0.45 + (cat === "אופניים חשמליים" ? 0.35 : cat === "קורקינט חשמלי" ? -0.35 : 0);
        const targetY = 2.3 - pointerY * 0.25;
        camera.position.x += (targetX - camera.position.x) * 0.045;
        camera.position.y += (targetY - camera.position.y) * 0.045;
        camera.lookAt(-0.5, 0.1, -1.5);

        try {
          renderer.render(scene, camera);
        } catch {
          contextLost = true;
          cancelAnimationFrame(rafId);
          setFallback(true);
          return;
        }
      } else {
        lastTime = now;
      }
      if (!reducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    }

    if (reducedMotion) {
      updateWave(0.6);
      try {
        renderer.render(scene, camera);
      } catch {
        queueMicrotask(() => setFallback(true));
      }
    } else {
      rafId = requestAnimationFrame(renderFrame);
    }

    return () => {
      contextLost = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
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
      envRT?.dispose();
      pmrem?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className={"showroom-hero-canvas" + (fallback ? " is-fallback" : "")} aria-hidden />;
}

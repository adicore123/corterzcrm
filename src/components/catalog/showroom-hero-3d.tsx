"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function ShowroomHero3D({ activeCategory }: { activeCategory: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const categoryRef = useRef(activeCategory);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    categoryRef.current = activeCategory;
  }, [activeCategory]);

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
    scene.fog = new THREE.FogExp2(0x0b0b10, 0.048);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 80);
    camera.position.set(0, 2.2, 8.6);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(4, 8, 6);
    const crimsonLight = new THREE.PointLight(0xe5191c, 8, 22, 1.5);
    crimsonLight.position.set(-2.5, 1.8, 1.5);
    const rimLight = new THREE.PointLight(0xff4448, 5, 18, 1.6);
    rimLight.position.set(3.5, 2.5, -2);
    scene.add(ambient, keyLight, crimsonLight, rimLight);

    const gridA = new THREE.GridHelper(34, 34, 0xba1517, 0x24242f);
    gridA.position.y = -1.6;
    const gridB = new THREE.GridHelper(34, 34, 0xba1517, 0x24242f);
    gridB.position.set(0, -1.6, -34);
    scene.add(gridA, gridB);

    const ringGroup = new THREE.Group();
    ringGroup.position.set(-2.2, 0.35, -0.5);
    scene.add(ringGroup);

    const outerGeo = new THREE.TorusGeometry(2.55, 0.045, 20, 96);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x3b3b48, metalness: 0.9, roughness: 0.22 });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.rotation.set(Math.PI * 0.38, 0.25, 0);

    const midGeo = new THREE.TorusGeometry(2.05, 0.032, 16, 96);
    const midMat = new THREE.MeshStandardMaterial({
      color: 0xd9191d,
      emissive: 0x9e0d11,
      emissiveIntensity: 1.4,
      metalness: 0.65,
      roughness: 0.2,
    });
    const midRing = new THREE.Mesh(midGeo, midMat);
    midRing.rotation.set(-Math.PI * 0.28, -0.35, 0.4);

    const innerGeo = new THREE.TorusGeometry(1.5, 0.018, 14, 80);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xff5a5e,
      emissive: 0xba1517,
      emissiveIntensity: 1.8,
      metalness: 0.4,
      roughness: 0.18,
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    innerRing.rotation.set(Math.PI * 0.18, 0.5, 0);

    const coreGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      emissive: 0x7c0b0e,
      emissiveIntensity: 0.85,
      metalness: 0.85,
      roughness: 0.18,
      wireframe: true,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    ringGroup.add(outerRing, midRing, innerRing, coreMesh);

    const particleCount = 240;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const cRed = new THREE.Color(0xff2c30);
    const cWarm = new THREE.Color(0xf6edea);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.3) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 2;
      const picked = i % 3 === 0 ? cRed : cWarm;
      colors[i * 3] = picked.r;
      colors[i * 3 + 1] = picked.g;
      colors[i * 3 + 2] = picked.b;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
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
    let paused = document.hidden;
    let lastTime = performance.now();

    function onVisibility() {
      paused = document.hidden;
      lastTime = performance.now();
    }
    document.addEventListener("visibilitychange", onVisibility);

    function renderFrame(now: number) {
      if (!paused) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const cat = categoryRef.current;
        const speedBoost = cat === "2027" ? 1.55 : cat === "קורקינט חשמלי" ? 1.25 : 1.0;

        gridA.position.z += dt * 2.2 * speedBoost;
        gridB.position.z += dt * 2.2 * speedBoost;
        if (gridA.position.z >= 34) gridA.position.z -= 68;
        if (gridB.position.z >= 34) gridB.position.z -= 68;

        outerRing.rotation.z += dt * 0.25 * speedBoost;
        midRing.rotation.x += dt * 0.42 * speedBoost;
        midRing.rotation.y -= dt * 0.3 * speedBoost;
        innerRing.rotation.y += dt * 0.58 * speedBoost;
        coreMesh.rotation.x += dt * 0.35;
        coreMesh.rotation.y += dt * 0.48;

        particles.rotation.y += dt * 0.04;
        crimsonLight.intensity = 7.5 + Math.sin(now * 0.0022) * 1.4;

        const targetX = pointerX * 0.65 + (cat === "אופניים חשמליים" ? 0.35 : cat === "קורקינט חשמלי" ? -0.35 : 0);
        const targetY = 2.15 - pointerY * 0.35;
        camera.position.x += (targetX - camera.position.x) * 0.05;
        camera.position.y += (targetY - camera.position.y) * 0.05;
        camera.lookAt(-0.4, 0.2, -1);

        renderer.render(scene, camera);
      } else {
        lastTime = now;
      }
      if (!reducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    }

    if (reducedMotion) {
      renderer.render(scene, camera);
    } else {
      rafId = requestAnimationFrame(renderFrame);
    }

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
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
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className={"showroom-hero-canvas" + (fallback ? " is-fallback" : "")} aria-hidden />;
}

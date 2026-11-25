import * as THREE from "three";
import { oceanVertexShader } from "@/shaders/ocean.vert.glsl";
import { oceanFragmentShader } from "@/shaders/ocean.frag.glsl";
import type { QualitySettings } from "./AdaptiveQualityManager";

export interface OceanSurfaceHandle {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uQuality: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uCameraPos: { value: THREE.Vector3 };
  };
  updateQuality: (settings: QualitySettings) => void;
  dispose: () => void;
}

/**
 * Real-time GPU Gerstner wave ocean surface extending from the breaking shoreline to the distant Mediterranean horizon.
 */
export function createOceanSurface(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
  initialQuality: QualitySettings,
): OceanSurfaceHandle {
  const uniforms = {
    uTime: { value: 0 },
    uQuality: { value: initialQuality.shaderQuality },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, 1.6, 7.5) },
  };

  const buildGeometry = (segs: [number, number]) => {
    const geo = new THREE.PlaneGeometry(220, 128, segs[0], segs[1]);
    geo.rotateX(-Math.PI / 2);
    // Position so z spans from -127 (horizon) up to +1.0 (overlapping the swash run-up zone on the beach)
    geo.translate(0, 0, -63.0);
    return geo;
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(buildGeometry(initialQuality.oceanSegments), material);
  mesh.renderOrder = 2;
  scene.add(mesh);

  return {
    mesh,
    uniforms,
    updateQuality(settings: QualitySettings) {
      uniforms.uQuality.value = settings.shaderQuality;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

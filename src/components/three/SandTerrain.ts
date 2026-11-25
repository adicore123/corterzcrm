import * as THREE from "three";
import { sandVertexShader, sandFragmentShader } from "@/shaders/sand.glsl";
import type { QualitySettings } from "./AdaptiveQualityManager";

export interface SandTerrainHandle {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uQuality: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uCameraPos: { value: THREE.Vector3 };
    uProductXZ: { value: THREE.Vector2 };
    uProductSpan: { value: number };
  };
  updateQuality: (settings: QualitySettings) => void;
  dispose: () => void;
}

/**
 * Continuous 3D coastal sand terrain sloping from the dry upper presentation terrace
 * through the wet reflective swash zone into the submerged seabed.
 */
export function createSandTerrain(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
  initialQuality: QualitySettings,
): SandTerrainHandle {
  const uniforms = {
    uTime: { value: 0 },
    uQuality: { value: initialQuality.shaderQuality },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, 1.6, 7.5) },
    uProductXZ: { value: new THREE.Vector2(-1.15, 2.05) },
    uProductSpan: { value: 2.35 },
  };

  const geometry = new THREE.PlaneGeometry(
    180,
    46,
    initialQuality.sandSegments[0],
    initialQuality.sandSegments[1],
  );
  geometry.rotateX(-Math.PI / 2);
  // Spans Z from -32 (submerged shallow seabed) to +14 (dry foreground beach terrace)
  geometry.translate(0, 0, -9.0);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    side: THREE.FrontSide,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);

  return {
    mesh,
    uniforms,
    updateQuality(settings: QualitySettings) {
      uniforms.uQuality.value = settings.shaderQuality;
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

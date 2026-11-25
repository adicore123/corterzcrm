import * as THREE from "three";
import { sandVertexShader, sandFragmentShader } from "@/shaders/sand.glsl";
import type { QualitySettings } from "./AdaptiveQualityManager";
import type { CoastalLightingMode } from "./AtmosphericSky";
import { SCENE_CONFIG, srgbToLinearVec3 } from "./scene.config";

export interface SandTerrainHandle {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uQuality: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uCameraPos: { value: THREE.Vector3 };
    uProductXZ: { value: THREE.Vector2 };
    uProductSpan: { value: number };
    uDrySandColor: { value: THREE.Vector3 };
    uDryCrestColor: { value: THREE.Vector3 };
    uWetSandColor: { value: THREE.Vector3 };
    uWetSaturatedColor: { value: THREE.Vector3 };
    uSkyZenith: { value: THREE.Vector3 };
    uSkyMid: { value: THREE.Vector3 };
    uSkyHorizon: { value: THREE.Vector3 };
  };
  updateQuality: (settings: QualitySettings) => void;
  setMood: (mode: CoastalLightingMode) => void;
  dispose: () => void;
}

function buildSandGeometry(segX: number, segZ: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(185, 86, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -25);
  return geo;
}

export function createSandTerrain(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
  initialSettings: QualitySettings,
  initialMood: CoastalLightingMode = "daylight",
): SandTerrainHandle {
  const moodCfg = SCENE_CONFIG.moods[initialMood];
  const uniforms = {
    uTime: { value: 0 },
    uQuality: { value: initialSettings.shaderQuality },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, 1.45, 6.8) },
    uProductXZ: { value: new THREE.Vector2(-1.08, 1.85) },
    uProductSpan: { value: 1.85 },
    uDrySandColor: { value: srgbToLinearVec3(SCENE_CONFIG.sand.dryHex) },
    uDryCrestColor: { value: srgbToLinearVec3(SCENE_CONFIG.sand.dryCrestHex) },
    uWetSandColor: { value: srgbToLinearVec3(SCENE_CONFIG.sand.wetHex) },
    uWetSaturatedColor: { value: srgbToLinearVec3(SCENE_CONFIG.sand.wetSaturatedHex) },
    uSkyZenith: { value: srgbToLinearVec3(moodCfg.skyZenithHex) },
    uSkyMid: { value: srgbToLinearVec3(moodCfg.skyMidHex) },
    uSkyHorizon: { value: srgbToLinearVec3(moodCfg.skyHorizonHex) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    side: THREE.FrontSide,
  });

  const [segX, segZ] = initialSettings.sandSegments;
  const geometry = buildSandGeometry(segX, segZ);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);

  let currentSegX = segX;
  let currentSegZ = segZ;

  return {
    mesh,
    uniforms,
    updateQuality(settings: QualitySettings) {
      uniforms.uQuality.value = settings.shaderQuality;
      const [nextX, nextZ] = settings.sandSegments;
      if (nextX !== currentSegX || nextZ !== currentSegZ) {
        currentSegX = nextX;
        currentSegZ = nextZ;
        const oldGeo = mesh.geometry;
        mesh.geometry = buildSandGeometry(nextX, nextZ);
        oldGeo.dispose();
      }
    },
    setMood(mode: CoastalLightingMode) {
      const m = SCENE_CONFIG.moods[mode];
      uniforms.uSkyZenith.value.copy(srgbToLinearVec3(m.skyZenithHex));
      uniforms.uSkyMid.value.copy(srgbToLinearVec3(m.skyMidHex));
      uniforms.uSkyHorizon.value.copy(srgbToLinearVec3(m.skyHorizonHex));
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

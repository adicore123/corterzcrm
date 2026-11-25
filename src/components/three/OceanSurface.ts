import * as THREE from "three";
import { oceanVertexShader } from "@/shaders/ocean.vert.glsl";
import { oceanFragmentShader } from "@/shaders/ocean.frag.glsl";
import type { QualitySettings } from "./AdaptiveQualityManager";
import type { CoastalLightingMode } from "./AtmosphericSky";
import { SCENE_CONFIG, srgbToLinearVec3 } from "./scene.config";

export interface OceanSurfaceHandle {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uQuality: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uCameraPos: { value: THREE.Vector3 };
    uWaterlineColor: { value: THREE.Vector3 };
    uShallowNearColor: { value: THREE.Vector3 };
    uShallowFarColor: { value: THREE.Vector3 };
    uMidColor: { value: THREE.Vector3 };
    uDeepNearColor: { value: THREE.Vector3 };
    uDeepFarColor: { value: THREE.Vector3 };
    uCrestSssColor: { value: THREE.Vector3 };
    uSubmergedSandColor: { value: THREE.Vector3 };
    uSkyZenith: { value: THREE.Vector3 };
    uSkyMid: { value: THREE.Vector3 };
    uSkyHorizon: { value: THREE.Vector3 };
  };
  updateQuality: (settings: QualitySettings) => void;
  setMood: (mode: CoastalLightingMode) => void;
  dispose: () => void;
}

function buildOceanGeometry(segX: number, segZ: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(185, 130, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -61.5);
  return geo;
}

export function createOceanSurface(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
  initialSettings: QualitySettings,
  initialMood: CoastalLightingMode = "daylight",
): OceanSurfaceHandle {
  const moodCfg = SCENE_CONFIG.moods[initialMood];
  const uniforms = {
    uTime: { value: 0 },
    uQuality: { value: initialSettings.shaderQuality },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, 1.45, 6.8) },
    uWaterlineColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.waterlineHex) },
    uShallowNearColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.shallowNearHex) },
    uShallowFarColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.shallowFarHex) },
    uMidColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.midHex) },
    uDeepNearColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.deepNearHex) },
    uDeepFarColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.deepFarHex) },
    uCrestSssColor: { value: srgbToLinearVec3(SCENE_CONFIG.water.crestSssHex) },
    uSubmergedSandColor: { value: srgbToLinearVec3(SCENE_CONFIG.sand.dryHex) },
    uSkyZenith: { value: srgbToLinearVec3(moodCfg.skyZenithHex) },
    uSkyMid: { value: srgbToLinearVec3(moodCfg.skyMidHex) },
    uSkyHorizon: { value: srgbToLinearVec3(moodCfg.skyHorizonHex) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const [segX, segZ] = initialSettings.oceanSegments;
  const geometry = buildOceanGeometry(segX, segZ);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  scene.add(mesh);

  let currentSegX = segX;
  let currentSegZ = segZ;

  return {
    mesh,
    uniforms,
    updateQuality(settings: QualitySettings) {
      uniforms.uQuality.value = settings.shaderQuality;
      const [nextX, nextZ] = settings.oceanSegments;
      if (nextX !== currentSegX || nextZ !== currentSegZ) {
        currentSegX = nextX;
        currentSegZ = nextZ;
        const oldGeo = mesh.geometry;
        mesh.geometry = buildOceanGeometry(nextX, nextZ);
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

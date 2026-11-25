import * as THREE from "three";
import type { CoastalLightingMode } from "./AtmosphericSky";

export interface SunLightingHandle {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fillLight: THREE.DirectionalLight;
  syncSunDirection: (sunDirection: THREE.Vector3, mode: CoastalLightingMode) => void;
  dispose: () => void;
}

/**
 * Physically coherent sun & environmental fill lighting aligned with the AtmosphericSky sun vector.
 */
export function createSunLighting(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
): SunLightingHandle {
  const sunLight = new THREE.DirectionalLight(0xfff3dc, 3.05);
  sunLight.position.copy(sunDirection).multiplyScalar(28);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.bias = -0.0005;
  Object.assign(sunLight.shadow.camera, {
    left: -6,
    right: 6,
    top: 6,
    bottom: -6,
    near: 1,
    far: 60,
  });
  sunLight.shadow.camera.updateProjectionMatrix();

  // Sky-to-warm-sand hemisphere fill
  const hemiLight = new THREE.HemisphereLight(0xbbe2f5, 0xe8d5b5, 1.48);

  // Soft sea-breeze rim/fill light from the water side
  const fillLight = new THREE.DirectionalLight(0x9bd7e8, 0.88);
  fillLight.position.set(-sunDirection.x * 14, 7, 14);

  scene.add(sunLight, hemiLight, fillLight);

  return {
    sunLight,
    hemiLight,
    fillLight,
    syncSunDirection(nextSunDir: THREE.Vector3, mode: CoastalLightingMode) {
      sunLight.position.copy(nextSunDir).multiplyScalar(28);
      if (mode === "golden") {
        sunLight.color.setHex(0xffd79e);
        sunLight.intensity = 3.25;
        hemiLight.color.setHex(0xffdfba);
        hemiLight.groundColor.setHex(0xdcb88e);
      } else {
        sunLight.color.setHex(0xfff3dc);
        sunLight.intensity = 3.05;
        hemiLight.color.setHex(0xbbe2f5);
        hemiLight.groundColor.setHex(0xe8d5b5);
      }
    },
    dispose() {
      scene.remove(sunLight, hemiLight, fillLight);
      sunLight.dispose();
      hemiLight.dispose();
      fillLight.dispose();
    },
  };
}

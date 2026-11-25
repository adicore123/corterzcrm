import * as THREE from "three";

export interface SunLightingHandle {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fillLight: THREE.DirectionalLight;
  dispose: () => void;
}

/**
 * Physically coherent sun & environmental fill lighting aligned with the AtmosphericSky sun vector.
 */
export function createSunLighting(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
): SunLightingHandle {
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.85);
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
  const hemiLight = new THREE.HemisphereLight(0xbbe2f5, 0xe8d5b5, 1.45);

  // Soft sea-breeze rim/fill light from the water side
  const fillLight = new THREE.DirectionalLight(0x9bd7e8, 0.85);
  fillLight.position.set(-sunDirection.x * 14, 7, 14);

  scene.add(sunLight, hemiLight, fillLight);

  return {
    sunLight,
    hemiLight,
    fillLight,
    dispose() {
      scene.remove(sunLight, hemiLight, fillLight);
      sunLight.dispose();
      hemiLight.dispose();
      fillLight.dispose();
    },
  };
}

import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export interface AtmosphericSkyHandle {
  sky: Sky;
  sunDirection: THREE.Vector3;
  envTarget: THREE.WebGLRenderTarget | null;
  dispose: () => void;
}

/**
 * Physically coherent Mediterranean late-afternoon daylight sky using Three.js Preetham Sky shader
 * + PMREM environment map generation for physically based reflections on the product and wet sand.
 */
export function createAtmosphericSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): AtmosphericSkyHandle {
  const sky = new Sky();
  sky.scale.setScalar(420);
  scene.add(sky);

  // Sun positioned in the warm Mediterranean afternoon sky (elevation 14 deg, azimuth -26 deg)
  const elevationDeg = 14.0;
  const azimuthDeg = -26.0;
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(180 + azimuthDeg);

  const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();

  const uniforms = sky.material.uniforms;
  uniforms["turbidity"].value = 3.2;
  uniforms["rayleigh"].value = 1.75;
  uniforms["mieCoefficient"].value = 0.0042;
  uniforms["mieDirectionalG"].value = 0.84;
  uniforms["sunPosition"].value.copy(sunDirection);

  // Subtle distant Mediterranean coastal headland silhouette along the far western horizon
  const headlandGeo = new THREE.BufferGeometry();
  const points: number[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = -150 + t0 * 115;
    const x1 = -150 + t1 * 115;
    const h0 = Math.max(0, Math.sin(t0 * Math.PI) * (2.6 + 1.1 * Math.sin(t0 * 9.0) + 0.5 * Math.cos(t0 * 17.0)));
    const h1 = Math.max(0, Math.sin(t1 * Math.PI) * (2.6 + 1.1 * Math.sin(t1 * 9.0) + 0.5 * Math.cos(t1 * 17.0)));
    const z = -118;
    points.push(x0, -0.3, z, x1, -0.3, z, x0, h0, z);
    points.push(x1, -0.3, z, x1, h1, z, x0, h0, z);
  }
  headlandGeo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  headlandGeo.computeVertexNormals();
  const headlandMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#7f97a3"),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const headlandMesh = new THREE.Mesh(headlandGeo, headlandMat);
  scene.add(headlandMesh);

  let pmrem: THREE.PMREMGenerator | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    const envScene = new THREE.Scene();
    const skyClone = new Sky();
    skyClone.scale.setScalar(100);
    skyClone.material.uniforms["turbidity"].value = 3.2;
    skyClone.material.uniforms["rayleigh"].value = 1.75;
    skyClone.material.uniforms["mieCoefficient"].value = 0.0042;
    skyClone.material.uniforms["mieDirectionalG"].value = 0.84;
    skyClone.material.uniforms["sunPosition"].value.copy(sunDirection);
    envScene.add(skyClone);
    envTarget = pmrem.fromScene(envScene, 0.03);
    scene.environment = envTarget.texture;
    skyClone.geometry.dispose();
    skyClone.material.dispose();
    pmrem.dispose();
    pmrem = null;
  } catch {
    envTarget?.dispose();
    pmrem?.dispose();
    envTarget = null;
  }

  return {
    sky,
    sunDirection,
    envTarget,
    dispose() {
      scene.remove(sky, headlandMesh);
      sky.geometry.dispose();
      sky.material.dispose();
      headlandGeo.dispose();
      headlandMat.dispose();
      envTarget?.dispose();
    },
  };
}

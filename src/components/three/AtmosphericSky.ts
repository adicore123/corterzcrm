import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type CoastalLightingMode = "daylight" | "golden";

export interface AtmosphericSkyHandle {
  sky: Sky;
  sunDirection: THREE.Vector3;
  envTarget: THREE.WebGLRenderTarget | null;
  setLightingMode: (mode: CoastalLightingMode) => void;
  tick: (timeSec: number, cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

const sunCoronaVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const sunCoronaFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uGolden;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Distinct warm golden sun disc + rich amber aureole + radial sunbeams
  float core = smoothstep(0.13, 0.025, r);
  float discEdge = smoothstep(0.19, 0.09, r);
  float innerHalo = exp(-r * 5.2) * 0.95;
  float outerCorona = exp(-r * 2.4) * 0.58 * smoothstep(1.0, 0.12, r);

  float angle = atan(p.y, p.x);
  float raysA = pow(max(0.0, 0.5 + 0.5 * cos(angle * 10.0 + uTime * 0.08)), 3.5);
  float raysB = pow(max(0.0, 0.5 + 0.5 * sin(angle * 16.0 - uTime * 0.05 + 1.2)), 4.5);
  float godRays = (raysA * 0.55 + raysB * 0.45) * exp(-r * 2.8) * smoothstep(0.05, 0.22, r) * 0.45;

  // Warm golden horizon glow bar
  float horizonStreak = exp(-abs(p.y) * 12.0) * exp(-abs(p.x) * 1.9) * 0.42;

  vec3 coreColor = vec3(1.0, 0.98, 0.88);
  vec3 discColor = mix(vec3(1.0, 0.84, 0.42), vec3(1.0, 0.65, 0.22), uGolden);
  vec3 haloColor = mix(vec3(1.0, 0.76, 0.34), vec3(0.98, 0.52, 0.18), uGolden);
  vec3 coronaColor = mix(vec3(0.98, 0.68, 0.28), vec3(0.95, 0.42, 0.14), uGolden);

  vec3 color = mix(haloColor, discColor, discEdge);
  color = mix(color, coreColor, core);
  color += coronaColor * (outerCorona + godRays + horizonStreak);

  float alpha = clamp(
    core * 0.98 + discEdge * 0.88 + innerHalo * 0.76 + outerCorona * 0.62 + godRays + horizonStreak,
    0.0,
    1.0
  ) * smoothstep(1.0, 0.68, r);

  gl_FragColor = vec4(color, alpha);
}
`;

function computeSunDirection(mode: CoastalLightingMode, target = new THREE.Vector3()): THREE.Vector3 {
  // Visible in the open upper-left sky above the ocean horizon (theta > 180 deg => negative X in Three.js spherical coords)
  const elevationDeg = mode === "golden" ? 4.6 : 5.8;
  const azimuthDeg = mode === "golden" ? 15.0 : 13.0;
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(180 + azimuthDeg);
  return target.setFromSphericalCoords(1, phi, theta).normalize();
}

/**
 * Physically coherent Mediterranean sky using Three.js Preetham Sky shader tuned for rich
 * azure sky saturation so the visible Golden Sun Disc & God-Ray Corona stand out clearly.
 */
export function createAtmosphericSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialMode: CoastalLightingMode = "daylight",
): AtmosphericSkyHandle {
  const sky = new Sky();
  sky.scale.setScalar(450);
  scene.add(sky);

  const sunDirection = computeSunDirection(initialMode);

  const skyUniforms = sky.material.uniforms;
  const applySkyParams = (mode: CoastalLightingMode) => {
    computeSunDirection(mode, sunDirection);
    // Keep Preetham Mie haze low so the upper sky stays a rich Mediterranean azure blue
    skyUniforms["turbidity"].value = mode === "golden" ? 3.4 : 2.1;
    skyUniforms["rayleigh"].value = mode === "golden" ? 1.85 : 1.18;
    skyUniforms["mieCoefficient"].value = mode === "golden" ? 0.0024 : 0.0011;
    skyUniforms["mieDirectionalG"].value = mode === "golden" ? 0.82 : 0.76;
    // Offset Preetham's internal sun slightly higher so the sky zenith is deep blue while our custom sunMesh renders the crisp golden sun orb
    const skySunPos = sunDirection.clone();
    skySunPos.y = mode === "golden" ? 0.22 : 0.34;
    skySunPos.normalize();
    skyUniforms["sunPosition"].value.copy(skySunPos);
  };
  applySkyParams(initialMode);

  // Visible Golden Sun Disc, Corona & Crepuscular Rays positioned in the sky along sunDirection
  const sunGeo = new THREE.PlaneGeometry(58, 58, 1, 1);
  const sunUniforms = {
    uTime: { value: 0 },
    uGolden: { value: initialMode === "golden" ? 1.0 : 0.0 },
  };
  const sunMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: sunCoronaVertexShader,
    fragmentShader: sunCoronaFragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.copy(sunDirection).multiplyScalar(195);
  sunMesh.lookAt(0, 1.4, 6.5);
  sunMesh.renderOrder = 1;
  scene.add(sunMesh);

  let pmrem: THREE.PMREMGenerator | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    const envScene = new THREE.Scene();
    const skyClone = new Sky();
    skyClone.scale.setScalar(100);
    skyClone.material.uniforms["turbidity"].value = 2.4;
    skyClone.material.uniforms["rayleigh"].value = 1.35;
    skyClone.material.uniforms["mieCoefficient"].value = 0.0018;
    skyClone.material.uniforms["mieDirectionalG"].value = 0.80;
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
    setLightingMode(mode: CoastalLightingMode) {
      applySkyParams(mode);
      sunUniforms.uGolden.value = mode === "golden" ? 1.0 : 0.0;
      sunMesh.position.copy(sunDirection).multiplyScalar(195);
    },
    tick(timeSec: number, cameraPos: THREE.Vector3) {
      sunUniforms.uTime.value = timeSec;
      sunMesh.lookAt(cameraPos);
    },
    dispose() {
      scene.remove(sky, sunMesh);
      sky.geometry.dispose();
      sky.material.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      envTarget?.dispose();
    },
  };
}

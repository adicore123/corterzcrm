import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { SCENE_CONFIG } from "./scene.config";

export type CoastalLightingMode = "daylight" | "golden";

export interface AtmosphericSkyHandle {
  sky: Sky;
  sunDirection: THREE.Vector3;
  envTarget: THREE.WebGLRenderTarget | null;
  setLightingMode: (mode: CoastalLightingMode) => void;
  tick: (timeSec: number, deltaSec: number, cameraPos: THREE.Vector3, animated: boolean) => void;
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

  // Distinct warm golden sun disc + rich amber aureole + subtle radial sunbeams
  float core = smoothstep(0.125, 0.022, r);
  float discEdge = smoothstep(0.185, 0.085, r);
  float innerHalo = exp(-r * 5.2) * 0.94;
  float outerCorona = exp(-r * 2.45) * 0.56 * smoothstep(1.0, 0.12, r);

  float angle = atan(p.y, p.x);
  float raysA = pow(max(0.0, 0.5 + 0.5 * cos(angle * 10.0 + uTime * 0.07)), 3.5);
  float raysB = pow(max(0.0, 0.5 + 0.5 * sin(angle * 16.0 - uTime * 0.05 + 1.2)), 4.5);
  float godRays = (raysA * 0.55 + raysB * 0.45) * exp(-r * 2.85) * smoothstep(0.05, 0.22, r) * 0.42;

  // Warm golden horizon glow bar
  float horizonStreak = exp(-abs(p.y) * 12.5) * exp(-abs(p.x) * 1.95) * 0.40;

  vec3 coreColor = vec3(1.0, 0.985, 0.90);
  vec3 discColor = mix(vec3(1.0, 0.85, 0.44), vec3(1.0, 0.66, 0.24), uGolden);
  vec3 haloColor = mix(vec3(1.0, 0.77, 0.36), vec3(0.98, 0.53, 0.18), uGolden);
  vec3 coronaColor = mix(vec3(0.98, 0.69, 0.28), vec3(0.95, 0.43, 0.15), uGolden);

  vec3 color = mix(haloColor, discColor, discEdge);
  color = mix(color, coreColor, core);
  color += coronaColor * (outerCorona + godRays + horizonStreak);

  float alpha = clamp(
    core * 0.98 + discEdge * 0.88 + innerHalo * 0.75 + outerCorona * 0.60 + godRays + horizonStreak,
    0.0,
    1.0
  ) * smoothstep(1.0, 0.68, r);

  gl_FragColor = vec4(color, alpha);
}
`;

function computeSunVec(elevDeg: number, azimDeg: number, target = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevDeg);
  const theta = THREE.MathUtils.degToRad(180 + azimDeg);
  return target.setFromSphericalCoords(1, phi, theta).normalize();
}

/**
 * Builds subtle horizon life elements (Section C):
 * 1. One small sailboat silhouette on the far horizon
 * 2. Two distant gulls gliding high over the sea
 * 3. A subtle tuft of Mediterranean beach grass at the far foreground frame edge
 */
function createCoastalLifeElements(scene: THREE.Scene) {
  const lifeGroup = new THREE.Group();
  scene.add(lifeGroup);

  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Small distant sailboat on the western horizon (x = -19, z = -66)
  const sailboatGroup = new THREE.Group();
  sailboatGroup.position.set(-19.5, 0.02, -66.0);
  lifeGroup.add(sailboatGroup);

  const hullShape = new THREE.BufferGeometry();
  hullShape.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.75, 0.0, 0.0,
        0.75, 0.0, 0.0,
        0.55, -0.18, 0.0,
        -0.75, 0.0, 0.0,
        0.55, -0.18, 0.0,
        -0.52, -0.18, 0.0,
      ],
      3,
    ),
  );
  const hullMat = new THREE.MeshBasicMaterial({
    color: 0x3a5468,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
  });
  const hullMesh = new THREE.Mesh(hullShape, hullMat);

  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        // Main sail
        -0.05, 0.04, 0.0,
        -0.05, 1.48, 0.0,
        0.62, 0.10, 0.0,
        // Jib sail
        -0.11, 0.06, 0.0,
        -0.58, 0.08, 0.0,
        -0.11, 1.24, 0.0,
      ],
      3,
    ),
  );
  const sailMat = new THREE.MeshBasicMaterial({
    color: 0xf7f3ea,
    transparent: true,
    opacity: 0.74,
    side: THREE.DoubleSide,
  });
  const sailMesh = new THREE.Mesh(sailGeo, sailMat);
  sailboatGroup.add(hullMesh, sailMesh);
  disposables.push(hullShape, hullMat, sailGeo, sailMat);

  // 2. Two distant gulls far off over the sea
  const gullMat = new THREE.MeshBasicMaterial({
    color: 0x4b6375,
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
  });
  disposables.push(gullMat);

  const createGull = () => {
    const g = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry();
    // Graceful arched V-chevron gull wing profile
    wingGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          0.0, 0.0, 0.0,
          0.18, 0.07, 0.02,
          0.16, 0.04, -0.02,
          0.18, 0.07, 0.02,
          0.38, -0.02, 0.04,
          0.16, 0.04, -0.02,
        ],
        3,
      ),
    );
    const leftWing = new THREE.Mesh(wingGeo, gullMat);
    const rightWing = new THREE.Mesh(wingGeo, gullMat);
    rightWing.scale.x = -1;
    g.add(leftWing, rightWing);
    disposables.push(wingGeo);
    return { group: g, leftWing, rightWing };
  };

  const gull1 = createGull();
  gull1.group.position.set(-7.5, 4.2, -36.0);
  const gull2 = createGull();
  gull2.group.position.set(-5.8, 4.75, -41.0);
  gull2.group.scale.setScalar(0.82);
  lifeGroup.add(gull1.group, gull2.group);

  // 3. Subtle tuft of Mediterranean beach grass (Ammophila) at the left foreground dune edge
  const grassGroup = new THREE.Group();
  grassGroup.position.set(-3.15, 0.25, 2.75);
  lifeGroup.add(grassGroup);

  const bladeMat = new THREE.MeshBasicMaterial({
    color: 0x8a9268,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  disposables.push(bladeMat);

  const blades: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const h = 0.26 + (i % 3) * 0.07;
    const bladeGeo = new THREE.PlaneGeometry(0.018, h, 1, 3);
    bladeGeo.translate(0, h * 0.5, 0);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set((i - 4) * 0.04, 0, ((i * 7) % 5) * 0.03);
    blade.rotation.z = -0.18 - (i - 4) * 0.06;
    blade.rotation.y = (i - 4) * 0.14;
    grassGroup.add(blade);
    blades.push(blade);
    disposables.push(bladeGeo);
  }

  return {
    tick(timeSec: number, animated: boolean) {
      if (!animated) return;
      sailboatGroup.position.x = -19.5 + Math.sin(timeSec * 0.04) * 1.2;
      sailboatGroup.rotation.z = Math.sin(timeSec * 0.75) * 0.035;

      const flap1 = Math.sin(timeSec * 3.4) * 0.32;
      gull1.leftWing.rotation.z = flap1;
      gull1.rightWing.rotation.z = -flap1;
      gull1.group.position.x = -7.5 + Math.sin(timeSec * 0.18) * 1.8;
      gull1.group.position.y = 4.2 + Math.cos(timeSec * 0.24) * 0.22;

      const flap2 = Math.sin(timeSec * 3.1 + 1.3) * 0.28;
      gull2.leftWing.rotation.z = flap2;
      gull2.rightWing.rotation.z = -flap2;
      gull2.group.position.x = -5.8 + Math.sin(timeSec * 0.16 + 0.7) * 1.6;
      gull2.group.position.y = 4.75 + Math.cos(timeSec * 0.21 + 0.7) * 0.18;

      const breeze = Math.sin(timeSec * 1.45) * 0.06;
      for (let i = 0; i < blades.length; i++) {
        blades[i].rotation.z = -0.18 - (i - 4) * 0.06 + breeze;
      }
    },
    dispose() {
      scene.remove(lifeGroup);
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Physically coherent Mediterranean sky with 1.6s smooth mood transitions,
 * visible Golden Sun Disc & Corona, and subtle horizon life details.
 */
export function createAtmosphericSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialMode: CoastalLightingMode = "daylight",
): AtmosphericSkyHandle {
  const sky = new Sky();
  sky.scale.setScalar(450);
  scene.add(sky);

  let targetBlend = initialMode === "golden" ? 1.0 : 0.0;
  let currentBlend = targetBlend;

  const dayCfg = SCENE_CONFIG.moods.daylight;
  const goldCfg = SCENE_CONFIG.moods.golden;

  const sunDirection = computeSunVec(
    THREE.MathUtils.lerp(5.8, 4.5, currentBlend),
    THREE.MathUtils.lerp(dayCfg.sunAzimuthDeg, goldCfg.sunAzimuthDeg, currentBlend),
  );

  // Visible Golden Sun Disc, Corona & Crepuscular Rays positioned in the sky along sunDirection
  const sunGeo = new THREE.PlaneGeometry(58, 58, 1, 1);
  const sunUniforms = {
    uTime: { value: 0 },
    uGolden: { value: currentBlend },
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
  sunMesh.renderOrder = 1;
  scene.add(sunMesh);

  const skyUniforms = sky.material.uniforms;
  const applyBlendedSky = (blend: number) => {
    const elev = THREE.MathUtils.lerp(5.8, 4.5, blend);
    const azim = THREE.MathUtils.lerp(dayCfg.sunAzimuthDeg, goldCfg.sunAzimuthDeg, blend);
    computeSunVec(elev, azim, sunDirection);

    skyUniforms["turbidity"].value = THREE.MathUtils.lerp(dayCfg.turbidity, goldCfg.turbidity, blend);
    skyUniforms["rayleigh"].value = THREE.MathUtils.lerp(dayCfg.rayleigh, goldCfg.rayleigh, blend);
    skyUniforms["mieCoefficient"].value = THREE.MathUtils.lerp(dayCfg.mieCoefficient, goldCfg.mieCoefficient, blend);
    skyUniforms["mieDirectionalG"].value = THREE.MathUtils.lerp(dayCfg.mieDirectionalG, goldCfg.mieDirectionalG, blend);

    const skySunPos = sunDirection.clone();
    skySunPos.y = THREE.MathUtils.lerp(0.34, 0.22, blend);
    skySunPos.normalize();
    skyUniforms["sunPosition"].value.copy(skySunPos);

    sunUniforms.uGolden.value = blend;
    sunMesh.position.copy(sunDirection).multiplyScalar(195);
  };
  applyBlendedSky(currentBlend);
  sunMesh.lookAt(0, 1.4, 6.5);

  const lifeElements = createCoastalLifeElements(scene);

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
      targetBlend = mode === "golden" ? 1.0 : 0.0;
    },
    tick(timeSec: number, deltaSec: number, cameraPos: THREE.Vector3, animated: boolean) {
      if (Math.abs(targetBlend - currentBlend) > 0.001) {
        const step = Math.min(1, deltaSec / SCENE_CONFIG.camera.moodTransitionSec);
        currentBlend += (targetBlend - currentBlend) * Math.max(step * 2.4, 0.08);
        applyBlendedSky(currentBlend);
      }
      sunUniforms.uTime.value = timeSec;
      sunMesh.lookAt(cameraPos);
      lifeElements.tick(timeSec, animated);
    },
    dispose() {
      scene.remove(sky, sunMesh);
      sky.geometry.dispose();
      sky.material.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      lifeElements.dispose();
      envTarget?.dispose();
    },
  };
}

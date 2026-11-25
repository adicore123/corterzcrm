import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { toWebglTextureUrl } from "@/components/catalog/catalog-utils";
import { shorelineCommonGlsl } from "@/shaders/shoreline.glsl";
import { createProceduralCortezVehicle } from "./ProceduralCortezVehicle";

export interface ProductModelConfig {
  mode: "3d" | "photo";
  productName?: string;
  model3dUrl?: string;
  imageUrl?: string;
  isMobile: boolean;
  sunDirection: THREE.Vector3;
  centerStage?: boolean;
  onStatusChange?: (status: "loading" | "ready" | "error") => void;
  onFootprintChange?: (centerXZ: THREE.Vector2, span: number) => void;
}

export interface ProductModelHandle {
  group: THREE.Group;
  updateLayout: (isMobile: boolean) => void;
  syncSunDirection: (sunDirection: THREE.Vector3) => void;
  addRotationImpulse: (deltaYawRad: number) => void;
  setScrollProgress: (progress: number) => void;
  resetRotation: () => void;
  tick: (timeSec: number, deltaSec: number, cameraPos?: THREE.Vector3) => void;
  dispose: () => void;
}

function evalCoastalHeightJS(x: number, z: number): number {
  const shoreZ = -1.45
    + 0.38 * Math.sin(x * 0.11 + 0.4)
    + 0.19 * Math.sin(x * 0.27 - 1.1)
    + 0.08 * Math.cos(x * 0.61 + 2.0);
  const d = z - shoreZ;
  if (d < 0) return -5.4 * (1.0 - Math.exp(d * 0.16)) + 0.055 * d;
  const duneUndulation = Math.sin(x * 0.22 + 0.8) * Math.cos(z * 0.31 - 0.4) * 0.028 * Math.min(1, Math.max(0, d / 2.5));
  return 0.31 * (1.0 - Math.exp(-d * 0.68)) + duneUndulation;
}

const cutoutProductVertex = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasAlpha;

varying vec2 vUv;
varying vec3 vWorldPos;

float sampleAlpha(vec2 uv) {
  vec4 s = texture2D(uMap, clamp(uv, 0.001, 0.999));
  if (uHasAlpha > 0.5) return s.a;
  float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  return 1.0 - smoothstep(0.90, 0.985, lum);
}

void main() {
  vUv = uv;
  float aC = sampleAlpha(uv);
  float aN = sampleAlpha(uv + vec2(0.0, 0.025));
  float aS = sampleAlpha(uv - vec2(0.0, 0.025));
  float aE = sampleAlpha(uv + vec2(0.025, 0.0));
  float aW = sampleAlpha(uv - vec2(0.025, 0.0));
  float thickness = clamp((aC + aN + aS + aE + aW) * 0.2, 0.0, 1.0);

  vec3 displaced = position + vec3(0.0, 0.0, thickness * 0.075);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const cutoutProductFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uTexel;
uniform float uHasAlpha;
uniform float uOpacity;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;

varying vec2 vUv;
varying vec3 vWorldPos;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float studioBackdropAlpha(vec4 s, vec2 uv) {
  if (uHasAlpha > 0.5) return s.a;
  float maxC = max(s.r, max(s.g, s.b));
  float minC = min(s.r, min(s.g, s.b));
  float sat = (maxC - minC) / max(maxC, 0.001);
  float lum = luma(s.rgb);
  float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float paperWhite = smoothstep(0.89, 0.985, lum) * (1.0 - smoothstep(0.02, 0.14, sat));
  float borderBoost = 1.0 - smoothstep(0.0, 0.12, edgeDist);
  return s.a * (1.0 - clamp(paperWhite * (0.85 + 0.15 * borderBoost), 0.0, 1.0));
}

void main() {
  if (uOpacity <= 0.01) discard;
  vec4 center = texture2D(uMap, vUv);
  float alpha = studioBackdropAlpha(center, vUv);
  if (alpha < 0.03) discard;

  vec4 sN = texture2D(uMap, vUv + vec2(0.0, uTexel.y * 1.8));
  vec4 sS = texture2D(uMap, vUv - vec2(0.0, uTexel.y * 1.8));
  vec4 sE = texture2D(uMap, vUv + vec2(uTexel.x * 1.8, 0.0));
  vec4 sW = texture2D(uMap, vUv - vec2(uTexel.x * 1.8, 0.0));

  float aN = studioBackdropAlpha(sN, vUv);
  float aS = studioBackdropAlpha(sS, vUv);
  float aE = studioBackdropAlpha(sE, vUv);
  float aW = studioBackdropAlpha(sW, vUv);
  float smoothAlpha = clamp(alpha * 0.56 + (aN + aS + aE + aW) * 0.11, 0.0, 1.0);

  float bevelX = (aW - aE) * 0.65 + (luma(sW.rgb) - luma(sE.rgb)) * 0.35;
  float bevelY = (aS - aN) * 0.65 + (luma(sS.rgb) - luma(sN.rgb)) * 0.35;
  vec3 N = normalize(vec3(bevelX * 1.35, bevelY * 1.35, 1.0));

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);

  float sunKey = max(0.0, dot(N, L));
  float skyTop = clamp(0.5 + 0.5 * N.y, 0.0, 1.0);
  float sandBounceMask = smoothstep(0.42, 0.02, vUv.y) * clamp(0.5 - 0.5 * N.y, 0.2, 1.0);

  vec3 gradedColor = center.rgb * (0.91 + 0.14 * sunKey);
  float sunRim = clamp((smoothAlpha - aW) * 0.62 + (smoothAlpha - aN) * 0.42, 0.0, 1.0);
  gradedColor += vec3(0.16, 0.12, 0.07) * sunRim;
  gradedColor += vec3(0.02, 0.035, 0.05) * skyTop * 0.45;
  gradedColor = mix(gradedColor, gradedColor * vec3(1.06, 0.99, 0.88) + vec3(0.05, 0.04, 0.025), sandBounceMask * 0.55);

  float clearcoatSpec = pow(max(0.0, dot(N, H)), 36.0) * 0.09 * smoothstep(0.15, 0.75, luma(center.rgb));
  gradedColor += vec3(1.0, 0.94, 0.84) * clearcoatSpec;

  float tireGroundAO = smoothstep(0.0, 0.048, vUv.y);
  gradedColor *= mix(0.68, 1.0, tireGroundAO);

  gl_FragColor = vec4(gradedColor, smoothAlpha * uOpacity);
}
`;

const wetSandReflectionFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasAlpha;
uniform float uTime;

varying vec2 vUv;

void main() {
  if (vUv.y > 0.58) discard;
  float ripple = sin(vUv.y * 42.0 + uTime * 2.2) * 0.0045 * vUv.y;
  vec2 sampleUv = clamp(vec2(vUv.x + ripple, vUv.y), 0.001, 0.999);
  vec4 s = texture2D(uMap, sampleUv);
  float a = uHasAlpha > 0.5 ? s.a : (1.0 - smoothstep(0.90, 0.985, dot(s.rgb, vec3(0.299, 0.587, 0.114))));
  if (a < 0.05) discard;

  float fade = exp(-vUv.y * 5.0) * (1.0 - smoothstep(0.0, 0.58, vUv.y));
  vec3 tinted = mix(s.rgb * 0.75, vec3(0.42, 0.35, 0.25), 0.32);
  gl_FragColor = vec4(tinted, a * fade * 0.28);
}
`;

const shadowProjectionVertex = /* glsl */ `
uniform vec2 uPhotoSize;
uniform vec3 uSunDir;

varying vec2 vUv;

${shorelineCommonGlsl}

void main() {
  vUv = uv;
  float heightOnPlane = (uv.y - 0.055) * uPhotoSize.y;
  float localX = (uv.x - 0.5) * uPhotoSize.x;

  vec4 rotatedLocal = modelMatrix * vec4(localX, 0.0, 0.0, 1.0);
  vec3 sun = normalize(uSunDir);
  float cotElev = 1.0 / max(sun.y, 0.22);

  vec2 projectedXZ = rotatedLocal.xz + vec2(
    -sun.x * heightOnPlane * cotElev * 0.52,
    -sun.z * heightOnPlane * cotElev * 0.45
  );
  float sandY = coastalTerrainHeight(projectedXZ) + 0.013;
  gl_Position = projectionMatrix * viewMatrix * vec4(projectedXZ.x, sandY, projectedXZ.y, 1.0);
}
`;

const shadowProjectionFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasAlpha;
varying vec2 vUv;

void main() {
  vec4 s = texture2D(uMap, vUv);
  float a = uHasAlpha > 0.5 ? s.a : (1.0 - smoothstep(0.90, 0.985, dot(s.rgb, vec3(0.299, 0.587, 0.114))));
  if (a < 0.08) discard;
  float distanceSoftness = 1.0 - smoothstep(0.0, 0.95, vUv.y) * 0.58;
  gl_FragColor = vec4(vec3(0.06, 0.08, 0.12), a * 0.46 * distanceSoftness);
}
`;

export function createProductModel(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  config: ProductModelConfig,
): ProductModelHandle {
  const group = new THREE.Group();
  scene.add(group);

  let disposed = false;
  let glbObject: THREE.Group | null = null;
  let pbrVehicle: ReturnType<typeof createProceduralCortezVehicle> | null = null;
  let photoMesh: THREE.Mesh | null = null;
  let shadowMesh: THREE.Mesh | null = null;
  let reflectionMesh: THREE.Mesh | null = null;
  let loadedTexture: THREE.Texture | null = null;
  let draco: DRACOLoader | null = null;
  let ktx2: KTX2Loader | null = null;

  // 360-degree interactive drag-to-rotate state with smooth physical inertia
  let currentYawRad = 0;
  let angularVelocityRad = 0;
  let scrollProgress = 0;
  let smoothedScroll = 0;

  const isScooter = Boolean(
    config.productName
      && /10X|NUX|XMAX|EMOVE|GMAX|SHARK|TANK|M41|MAX 36/i.test(config.productName),
  );

  const targetAnchor = (isMobile: boolean) => {
    const x = config.centerStage || isMobile ? 0.0 : -1.08;
    const z = isMobile ? 1.72 : 1.82;
    const y = evalCoastalHeightJS(x, z);
    return new THREE.Vector3(x, y, z);
  };

  const applyAnchor = (isMobile: boolean, span = 1.82) => {
    const pos = targetAnchor(isMobile);
    group.position.copy(pos);
    config.onFootprintChange?.(new THREE.Vector2(pos.x, pos.z), span);
  };

  applyAnchor(config.isMobile, 1.82);

  if (config.mode === "3d" && config.model3dUrl) {
    config.onStatusChange?.("loading");
    draco = new DRACOLoader().setDecoderPath("/3d/decoders/draco/");
    ktx2 = new KTX2Loader().setTranscoderPath("/3d/decoders/basis/");
    ktx2.detectSupport(renderer);
    const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      config.model3dUrl,
      (gltf) => {
        if (disposed) return;
        glbObject = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(glbObject);
        if (bounds.isEmpty()) {
          config.onStatusChange?.("error");
          return;
        }
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const targetSpan = config.isMobile ? 1.42 : 1.66;
        const scale = targetSpan / maxDim;

        glbObject.scale.setScalar(scale);
        glbObject.position.set(
          -center.x * scale,
          (-bounds.min.y) * scale - 0.015,
          -center.z * scale,
        );
        glbObject.rotation.y = -0.34;
        glbObject.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        group.add(glbObject);
        applyAnchor(config.isMobile, targetSpan);
        config.onStatusChange?.("ready");
      },
      undefined,
      () => {
        if (!disposed) config.onStatusChange?.("error");
      },
    );
  } else {
    // Build the 3D PBR Vehicle Assembly (Clearcoat paint, matte rubber fat tires, suspension & brake rotors)
    // Enables true 360-degree drag-to-rotate with inertia and real-time shadows on the sand!
    pbrVehicle = createProceduralCortezVehicle({ isScooter });
    const pbrScale = config.isMobile ? 1.05 : 1.22;
    pbrVehicle.root.scale.setScalar(pbrScale);
    pbrVehicle.root.position.set(0, -0.016, 0);
    pbrVehicle.root.visible = false; // Crossfades in seamlessly when rotating in 360 deg
    group.add(pbrVehicle.root);

    if (config.imageUrl) {
      config.onStatusChange?.("loading");
      const resolvedSrc = toWebglTextureUrl(config.imageUrl);
      const hasCutoutAlpha = resolvedSrc.includes("/catalog/exhibits/")
        || resolvedSrc.includes("/catalog/variants/")
        || resolvedSrc.toLowerCase().endsWith(".png");

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (disposed) return;
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.needsUpdate = true;
        loadedTexture = tex;

        const w = img.naturalWidth || img.width || 4;
        const h = img.naturalHeight || img.height || 3;
        const aspect = Math.max(0.65, Math.min(2.1, w / h));
        const baseHeight = config.isMobile ? 1.44 : 1.66;
        const baseWidth = baseHeight * aspect;

        const reliefGeo = new THREE.PlaneGeometry(baseWidth, baseHeight, 48, 36);
        const photoMat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
            uHasAlpha: { value: hasCutoutAlpha ? 1.0 : 0.0 },
            uOpacity: { value: 1.0 },
            uSunDir: { value: config.sunDirection.clone() },
            uCameraPos: { value: new THREE.Vector3(0, 1.4, 6.5) },
          },
          vertexShader: cutoutProductVertex,
          fragmentShader: cutoutProductFragment,
          transparent: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        });

        photoMesh = new THREE.Mesh(reliefGeo, photoMat);
        photoMesh.position.set(0, baseHeight * 0.452, 0.01);
        photoMesh.renderOrder = 6;
        group.add(photoMesh);

        // Sun-projected silhouette shadow on the 3D sand
        const shadowGeo = new THREE.PlaneGeometry(1, 1, 24, 24);
        const shadowMat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uPhotoSize: { value: new THREE.Vector2(baseWidth, baseHeight) },
            uSunDir: { value: config.sunDirection.clone() },
            uHasAlpha: { value: hasCutoutAlpha ? 1.0 : 0.0 },
          },
          vertexShader: shadowProjectionVertex,
          fragmentShader: shadowProjectionFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.renderOrder = 4;
        group.add(shadowMesh);

        // Wet-sand vertical mirror reflection beneath the wheels
        const reflGeo = new THREE.PlaneGeometry(baseWidth, baseHeight, 1, 1);
        const reflMat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uHasAlpha: { value: hasCutoutAlpha ? 1.0 : 0.0 },
            uTime: { value: 0 },
          },
          vertexShader: cutoutProductVertex,
          fragmentShader: wetSandReflectionFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        reflectionMesh = new THREE.Mesh(reflGeo, reflMat);
        reflectionMesh.scale.y = -0.38;
        reflectionMesh.position.set(0, -baseHeight * 0.16, 0.03);
        reflectionMesh.renderOrder = 5;
        group.add(reflectionMesh);

        applyAnchor(config.isMobile, baseWidth);
        config.onStatusChange?.("ready");
      };
      img.onerror = () => {
        if (!disposed) {
          if (pbrVehicle) pbrVehicle.root.visible = true;
          config.onStatusChange?.("ready");
        }
      };
      img.src = resolvedSrc;
    } else {
      if (pbrVehicle) pbrVehicle.root.visible = true;
      config.onStatusChange?.("ready");
    }
  }

  return {
    group,
    updateLayout(isMobile: boolean) {
      applyAnchor(isMobile, isMobile ? 1.48 : 1.78);
      if (pbrVehicle) {
        pbrVehicle.root.scale.setScalar(isMobile ? 1.05 : 1.22);
      }
    },
    syncSunDirection(nextSunDir: THREE.Vector3) {
      if (photoMesh) {
        const mat = photoMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uSunDir.value.copy(nextSunDir);
      }
      if (shadowMesh) {
        const mat = shadowMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uSunDir.value.copy(nextSunDir);
      }
    },
    addRotationImpulse(deltaYawRad: number) {
      currentYawRad += deltaYawRad;
      angularVelocityRad = deltaYawRad * 14.0;
    },
    setScrollProgress(progress: number) {
      scrollProgress = Math.max(0, Math.min(1, progress));
    },
    resetRotation() {
      currentYawRad = 0;
      angularVelocityRad = 0;
    },
    tick(timeSec: number, deltaSec: number, cameraPos?: THREE.Vector3) {
      const dt = Math.min(deltaSec, 0.1);
      // Apply smooth rotational inertia (damped exponential decay)
      if (Math.abs(angularVelocityRad) > 0.0005) {
        currentYawRad += angularVelocityRad * dt;
        angularVelocityRad *= Math.exp(-dt * 4.2);
      } else {
        angularVelocityRad = 0;
      }

      // Smooth scroll-linked path rotation & forward roll
      smoothedScroll += (scrollProgress - smoothedScroll) * (1 - Math.exp(-dt * 5.0));
      const totalYaw = currentYawRad + smoothedScroll * 0.26;
      group.rotation.y = totalYaw;

      // Subtle forward glide along the sand tracks as the user scrolls
      const basePos = targetAnchor(config.isMobile);
      const scrollAdvanceX = smoothedScroll * 0.18;
      group.position.x = basePos.x + scrollAdvanceX;
      group.position.y = evalCoastalHeightJS(group.position.x, basePos.z);

      if (pbrVehicle) {
        for (const w of pbrVehicle.wheels) {
          w.rotation.z = -scrollAdvanceX * 3.8 - totalYaw * 0.4;
        }
      }

      if (glbObject) {
        glbObject.position.y = -0.015 + Math.sin(timeSec * 0.9) * 0.003;
      }

      if (photoMesh && cameraPos) {
        const mat = photoMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uCameraPos.value.copy(cameraPos);

        // Normalize angle to [-PI, PI]
        const wrappedYaw = Math.atan2(Math.sin(totalYaw), Math.cos(totalYaw));
        const absAngle = Math.abs(wrappedYaw);

        // When rotating beyond ±20 deg in 360-degree spin, seamlessly reveal the 3D PBR vehicle
        // with clearcoat reflections, matte rubber fat tires, and real-time 3D shadows!
        const pbrBlend = THREE.MathUtils.smoothstep(absAngle, 0.26, 0.48);
        mat.uniforms.uOpacity.value = 1.0 - pbrBlend;
        photoMesh.visible = pbrBlend < 0.99;
        if (pbrVehicle) {
          pbrVehicle.root.visible = pbrBlend > 0.04;
        }
      }

      if (reflectionMesh) {
        const mat = reflectionMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = timeSec;
      }
    },
    dispose() {
      disposed = true;
      scene.remove(group);
      if (glbObject) {
        glbObject.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
              mat.dispose();
            }
          }
        });
      }
      pbrVehicle?.dispose();
      if (photoMesh) {
        photoMesh.geometry.dispose();
        (photoMesh.material as THREE.Material).dispose();
      }
      if (shadowMesh) {
        shadowMesh.geometry.dispose();
        (shadowMesh.material as THREE.Material).dispose();
      }
      if (reflectionMesh) {
        reflectionMesh.geometry.dispose();
        (reflectionMesh.material as THREE.Material).dispose();
      }
      loadedTexture?.dispose();
      draco?.dispose();
      ktx2?.dispose();
    },
  };
}

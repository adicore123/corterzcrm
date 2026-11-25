import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { toWebglTextureUrl } from "@/components/catalog/catalog-utils";
import { shorelineCommonGlsl } from "@/shaders/shoreline.glsl";

export interface ProductModelConfig {
  mode: "3d" | "photo";
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
  tick: (timeSec: number) => void;
  dispose: () => void;
}

function evalCoastalHeightJS(x: number, z: number): number {
  const shoreZ = -1.45
    + 0.38 * Math.sin(x * 0.11 + 0.4)
    + 0.19 * Math.sin(x * 0.27 - 1.1)
    + 0.08 * Math.cos(x * 0.61 + 2.0);
  const d = z - shoreZ;
  if (d < 0) return -4.8 * (1.0 - Math.exp(d * 0.22)) + 0.06 * d;
  return 0.30 * (1.0 - Math.exp(-d * 0.72));
}

const cutoutProductVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Mode B Product Cutout Shader:
 * Preserves authentic manufacturer colors & details from transparent WebP exhibit assets
 * (or cleanly removes studio white paper backdrops on custom uploads), while adding subtle
 * directional sun rim lighting so the product sits naturally in the Mediterranean daylight.
 */
const cutoutProductFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uTexel;
uniform float uHasAlpha;

varying vec2 vUv;

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
  vec4 center = texture2D(uMap, vUv);
  float alpha = studioBackdropAlpha(center, vUv);
  if (alpha < 0.03) discard;

  // Soft 4-tap edge anti-aliasing
  float aN = studioBackdropAlpha(texture2D(uMap, vUv + vec2(0.0, uTexel.y)), vUv);
  float aS = studioBackdropAlpha(texture2D(uMap, vUv - vec2(0.0, uTexel.y)), vUv);
  float aE = studioBackdropAlpha(texture2D(uMap, vUv + vec2(uTexel.x, 0.0)), vUv);
  float aW = studioBackdropAlpha(texture2D(uMap, vUv - vec2(uTexel.x, 0.0)), vUv);
  float smoothAlpha = clamp(alpha * 0.6 + (aN + aS + aE + aW) * 0.1, 0.0, 1.0);

  // Subtle warm Mediterranean sunlight rim on upper/sunward silhouette edges
  float rim = clamp((smoothAlpha - aW) * 0.58 + (smoothAlpha - aN) * 0.46, 0.0, 1.0);
  vec3 color = center.rgb + vec3(0.13, 0.10, 0.06) * rim;

  gl_FragColor = vec4(color, smoothAlpha);
}
`;

/**
 * Wet-sand vertical mirror reflection shader beneath the product tires:
 * Adds subtle water-ripple horizontal shimmer and smooth vertical attenuation.
 */
const wetSandReflectionFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasAlpha;
uniform float uTime;

varying vec2 vUv;

void main() {
  // Only reflect the lower 58% of the vehicle onto the damp sand
  if (vUv.y > 0.58) discard;
  float ripple = sin(vUv.y * 42.0 + uTime * 2.2) * 0.0045 * vUv.y;
  vec2 sampleUv = clamp(vec2(vUv.x + ripple, vUv.y), 0.001, 0.999);
  vec4 s = texture2D(uMap, sampleUv);
  float a = uHasAlpha > 0.5 ? s.a : (1.0 - smoothstep(0.90, 0.985, dot(s.rgb, vec3(0.299, 0.587, 0.114))));
  if (a < 0.05) discard;

  float fade = exp(-vUv.y * 5.2) * (1.0 - smoothstep(0.0, 0.58, vUv.y));
  vec3 tinted = mix(s.rgb * 0.72, vec3(0.45, 0.38, 0.28), 0.35);
  gl_FragColor = vec4(tinted, a * fade * 0.26);
}
`;

const shadowProjectionVertex = /* glsl */ `
uniform vec2 uPhotoSize;
uniform vec3 uSunDir;

varying vec2 vUv;

${shorelineCommonGlsl}

void main() {
  vUv = uv;
  // Project vertical product plane onto the sloped 3D sand along the sun direction
  float heightOnPlane = (uv.y - 0.06) * uPhotoSize.y;
  float localX = (uv.x - 0.5) * uPhotoSize.x;

  vec4 rootWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 sun = normalize(uSunDir);
  float cotElev = 1.0 / max(sun.y, 0.22);

  vec2 projectedXZ = rootWorld.xz + vec2(
    localX - sun.x * heightOnPlane * cotElev * 0.52,
    -sun.z * heightOnPlane * cotElev * 0.45
  );
  float sandY = coastalTerrainHeight(projectedXZ) + 0.014;
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
  // Shadow softens with distance from the tire contact line (vUv.y = 0)
  float distanceSoftness = 1.0 - smoothstep(0.0, 0.95, vUv.y) * 0.56;
  gl_FragColor = vec4(vec3(0.07, 0.05, 0.03), a * 0.46 * distanceSoftness);
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
  let photoMesh: THREE.Mesh | null = null;
  let shadowMesh: THREE.Mesh | null = null;
  let reflectionMesh: THREE.Mesh | null = null;
  let loadedTexture: THREE.Texture | null = null;
  let draco: DRACOLoader | null = null;
  let ktx2: KTX2Loader | null = null;

  const targetAnchor = (isMobile: boolean) => {
    // When centerStage is true (Section 02 Showroom) or on mobile, center the product horizontally
    // On Desktop Hero (RTL split), position at x = -1.08 on the open left-center beach terrace
    const x = config.centerStage || isMobile ? 0.0 : -1.08;
    const z = isMobile ? 1.72 : 1.85;
    const y = evalCoastalHeightJS(x, z);
    return new THREE.Vector3(x, y, z);
  };

  const applyAnchor = (isMobile: boolean, span = 1.85) => {
    const pos = targetAnchor(isMobile);
    group.position.copy(pos);
    config.onFootprintChange?.(new THREE.Vector2(pos.x, pos.z), span);
  };

  applyAnchor(config.isMobile, 1.85);

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
        const targetSpan = config.isMobile ? 1.42 : 1.68;
        const scale = targetSpan / maxDim;

        glbObject.scale.setScalar(scale);
        glbObject.position.set(
          -center.x * scale,
          (-bounds.min.y) * scale,
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
  } else if (config.imageUrl) {
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

      const planeGeo = new THREE.PlaneGeometry(baseWidth, baseHeight, 1, 1);
      const photoMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
          uHasAlpha: { value: hasCutoutAlpha ? 1.0 : 0.0 },
        },
        vertexShader: cutoutProductVertex,
        fragmentShader: cutoutProductFragment,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });

      photoMesh = new THREE.Mesh(planeGeo, photoMat);
      photoMesh.position.set(0, baseHeight * 0.465, 0);
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
      reflectionMesh = new THREE.Mesh(planeGeo, reflMat);
      reflectionMesh.scale.y = -0.38;
      reflectionMesh.position.set(0, -baseHeight * 0.16, 0.03);
      reflectionMesh.renderOrder = 5;
      group.add(reflectionMesh);

      applyAnchor(config.isMobile, baseWidth);
      config.onStatusChange?.("ready");
    };
    img.onerror = () => {
      if (!disposed) config.onStatusChange?.("error");
    };
    img.src = resolvedSrc;
  } else {
    config.onStatusChange?.("ready");
  }

  return {
    group,
    updateLayout(isMobile: boolean) {
      applyAnchor(isMobile, isMobile ? 1.56 : 1.85);
    },
    syncSunDirection(nextSunDir: THREE.Vector3) {
      if (shadowMesh) {
        const mat = shadowMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uSunDir.value.copy(nextSunDir);
      }
    },
    tick(timeSec: number) {
      if (glbObject) {
        glbObject.position.y = Math.sin(timeSec * 0.9) * 0.004;
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
      if (photoMesh) {
        photoMesh.geometry.dispose();
        (photoMesh.material as THREE.Material).dispose();
      }
      if (shadowMesh) {
        shadowMesh.geometry.dispose();
        (shadowMesh.material as THREE.Material).dispose();
      }
      if (reflectionMesh) {
        (reflectionMesh.material as THREE.Material).dispose();
      }
      loadedTexture?.dispose();
      draco?.dispose();
      ktx2?.dispose();
    },
  };
}

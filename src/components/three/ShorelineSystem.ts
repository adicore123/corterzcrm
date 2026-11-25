import * as THREE from "three";
import { shorelineCommonGlsl } from "@/shaders/shoreline.glsl";
import { foamGlsl } from "@/shaders/foam.glsl";

export interface ShorelineSystemHandle {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uQuality: { value: number };
    uSunDir: { value: THREE.Vector3 };
  };
  dispose: () => void;
}

const shorelineRibbonVertex = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying float vShoreD;

${shorelineCommonGlsl}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;
  float h = coastalTerrainHeight(xz) + 0.012;
  vWorldPos = vec3(xz.x, h, xz.y);
  vShoreD = signedShoreDistance(xz);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

const shorelineRibbonFragment = /* glsl */ `
uniform float uTime;
uniform float uQuality;
uniform vec3 uSunDir;

varying vec3 vWorldPos;
varying float vShoreD;

${shorelineCommonGlsl}
${foamGlsl}

void main() {
  float surge = swashSurgeOffset(vWorldPos.x, uTime);
  // Active swash front rib where incoming water breaks over the wet sand
  float frontDist = vShoreD - (surge * 0.76 - 0.12);
  float leadBand = exp(-pow(frontDist / 0.24, 2.0));
  // Secondary trailing foam line left by previous wave cycle
  float trailBand = exp(-pow((vShoreD - (surge * 0.32 - 0.45)) / 0.34, 2.0)) * 0.65;

  int oct = uQuality >= 1.0 ? 4 : 3;
  float foam = organicFoamWeb(vWorldPos.xz * 1.4, uTime * 0.85, max(leadBand, trailBand), oct);
  if (foam < 0.02) discard;

  float sunLit = clamp(uSunDir.y * 1.8 + 0.55, 0.6, 1.0);
  vec3 foamCol = vec3(0.95, 0.96, 0.94) * sunLit;
  gl_FragColor = vec4(foamCol, foam * 0.86);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Dedicated shoreline swash-bore & dissolving lacy foam system bridging OceanSurface and SandTerrain.
 */
export function createShorelineSystem(
  scene: THREE.Scene,
  sunDirection: THREE.Vector3,
  shaderQuality: number,
): ShorelineSystemHandle {
  const uniforms = {
    uTime: { value: 0 },
    uQuality: { value: shaderQuality },
    uSunDir: { value: sunDirection.clone() },
  };

  const geometry = new THREE.PlaneGeometry(110, 7.5, 140, 28);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -1.1);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shorelineRibbonVertex,
    fragmentShader: shorelineRibbonFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  scene.add(mesh);

  return {
    mesh,
    uniforms,
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

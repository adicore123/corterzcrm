import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Sand Terrain Shaders (Dry Golden Sand + Dynamic Wet Swash Zone).
 * Includes:
 * - Continuous 3D terrain slope matching ocean bathymetry
 * - Wind-formed sand ripples & multi-scale mineral grain normal perturbation
 * - Dynamic wetness persistence based on receding shoreline waves
 * - Mirror sky/sun reflections on wet sand & quartz micro-sparkles on dry sand
 * - Integrated ground contact ambient occlusion under the vehicle wheels
 */
export const sandVertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vTerrainNormal;

${shorelineCommonGlsl}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;
  float h = coastalTerrainHeight(xz);

  // Finite-difference terrain normal
  float eps = 0.08;
  float hx = coastalTerrainHeight(xz + vec2(eps, 0.0));
  float hz = coastalTerrainHeight(xz + vec2(0.0, eps));
  vTerrainNormal = normalize(vec3(h - hx, eps, h - hz));

  vec3 displaced = vec3(xz.x, h, xz.y);
  vWorldPos = displaced;
  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
`;

export const sandFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uQuality;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform vec2 uProductXZ;
uniform float uProductSpan;

varying vec3 vWorldPos;
varying vec3 vTerrainNormal;

${shorelineCommonGlsl}
${foamGlsl}

vec3 sampleSandSky(vec3 dir, vec3 sunDir) {
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 zenith = vec3(0.09, 0.28, 0.56);
  vec3 horizon = vec3(0.76, 0.74, 0.68);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.65, elev));
  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.25, 0.92, 0.58) * pow(sunCos, 28.0) * 0.45;
  return sky;
}

void main() {
  vec2 xz = vWorldPos.xz;
  float shoreDist = signedShoreDistance(xz);
  float wetReach = swashWetnessReach(xz.x, uTime);

  // Organic shoreline wetness boundary perturbed by fine noise
  float edgeNoise = (valueNoise(xz * 1.8) - 0.5) * 0.22;
  float wetness = 1.0 - smoothstep(wetReach - 0.45, wetReach + 0.55, shoreDist + edgeNoise);
  wetness = clamp(wetness, 0.0, 1.0);

  // Multi-scale procedural sand grain & wind-ripple bump
  float windRipple = sin(xz.x * 5.2 + xz.y * 14.5 + sin(xz.x * 1.7) * 1.8) * 0.5 + 0.5;
  float grainFine = valueNoise(xz * 42.0);
  float grainMed = fbmFoam(xz * 6.5, uQuality >= 1.0 ? 3 : 2);

  // Wet sand smooths out fine wind ripples due to water surface tension
  float rippleFactor = (1.0 - wetness * 0.78);
  vec3 N = normalize(vTerrainNormal + vec3(
    (grainFine - 0.5) * 0.09 * rippleFactor,
    0.0,
    (windRipple - 0.5) * 0.08 * rippleFactor + (grainMed - 0.5) * 0.05
  ));

  vec3 L = normalize(uSunDir);
  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);

  // Base albedo: warm Mediterranean golden sand (#E9D8BD in linear ~= 0.79, 0.67, 0.49)
  vec3 dryAlbedo = vec3(0.76, 0.63, 0.45) * (0.91 + 0.16 * grainMed + 0.05 * windRipple);
  // Wet sand darkens physically due to interstitial water index of refraction
  vec3 wetAlbedo = vec3(0.31, 0.24, 0.16) * (0.93 + 0.12 * grainMed);
  vec3 albedo = mix(dryAlbedo, wetAlbedo, wetness);

  // Diffuse lighting (warm direct sun + sky hemisphere bounce)
  float NdotL = max(dot(N, L), 0.0);
  vec3 sunRadiance = vec3(1.22, 1.05, 0.86);
  vec3 skyFill = vec3(0.24, 0.31, 0.39);
  vec3 diffuse = albedo * (sunRadiance * NdotL * 0.88 + skyFill * 0.46);

  // Specular & Fresnel sky/sun reflection on wet sand film
  float roughness = mix(0.88, 0.10, pow(wetness, 1.25));
  float NdotV = max(dot(N, V), 0.02);
  float wetFresnel = (0.02 + 0.98 * pow(1.0 - NdotV, 5.0)) * smoothstep(0.15, 0.85, wetness);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.04;
  vec3 wetSkyRefl = sampleSandSky(normalize(R), L);

  vec3 H = normalize(L + V);
  float specPower = mix(12.0, 260.0, wetness);
  float spec = pow(max(dot(N, H), 0.0), specPower) * mix(0.03, 1.15, wetness);

  // Subtle quartz crystal micro-glints on sunlit dry sand
  float spark = uQuality >= 1.0
    ? smoothstep(0.965, 0.998, hash21(floor(xz * 95.0))) * (1.0 - wetness) * NdotL * 0.45
    : 0.0;

  vec3 color = mix(diffuse, wetSkyRefl, wetFresnel * 0.62) + vec3(1.2, 0.98, 0.74) * (spec + spark);

  // Residual dissolving foam bubbles left behind on freshly wetted sand
  float residualZone = exp(-pow((shoreDist - wetReach * 0.55) / 0.32, 2.0)) * wetness * 0.52;
  float residualFoam = organicFoamWeb(xz * 1.3, uTime * 0.35, residualZone, 3);
  color = mix(color, vec3(0.88, 0.89, 0.87), residualFoam * 0.65);

  // Realistic Ground Contact Shadow (Dual Wheel + Chassis AO) under the product
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.33;
  float wheelRear = exp(-pow((rel.x + halfWheelbase) / 0.46, 2.0) - pow(rel.y / 0.24, 2.0));
  float wheelFront = exp(-pow((rel.x - halfWheelbase) / 0.46, 2.0) - pow(rel.y / 0.24, 2.0));
  float chassisAO = exp(-pow(rel.x / (uProductSpan * 0.52), 2.0) - pow(rel.y / 0.38, 2.0));
  float contactShadow = clamp(wheelRear * 0.62 + wheelFront * 0.62 + chassisAO * 0.28, 0.0, 0.72);
  color *= (1.0 - contactShadow);

  // Distance horizon haze
  float haze = smoothstep(32.0, 125.0, dist);
  color = mix(color, sampleSandSky(normalize(vec3(V.x, 0.03, V.z)), L), haze * 0.82);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Sand Terrain Shaders (V2 Photorealistic Edition).
 * Includes:
 * - Continuous 3D terrain slope matching ocean bathymetry + tire-contact sand indentation
 * - Multi-scale wind-formed dune ripples, mineral shell specks & normal perturbation
 * - Dynamic wetness persistence & glossy receding water-film sheet
 * - Mirror sky/sun reflections on wet sand & crisp quartz crystal micro-sparkles on dry sand
 * - Dual-wheel sand compression rim & ground contact ambient occlusion
 */
export const sandVertexShader = /* glsl */ `
uniform vec2 uProductXZ;
uniform float uProductSpan;

varying vec3 vWorldPos;
varying vec3 vTerrainNormal;

${shorelineCommonGlsl}

float sandSurfaceHeight(vec2 xz) {
  float h = coastalTerrainHeight(xz);
  // Subtle physical tire-track depression & rim under front and rear wheels
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.32;
  float dRear = length(vec2((rel.x + halfWheelbase) * 1.4, rel.y * 3.2));
  float dFront = length(vec2((rel.x - halfWheelbase) * 1.4, rel.y * 3.2));
  float sink = (exp(-dRear * dRear * 9.0) + exp(-dFront * dFront * 9.0)) * 0.016;
  float rim = (exp(-pow(dRear - 0.34, 2.0) * 28.0) + exp(-pow(dFront - 0.34, 2.0) * 28.0)) * 0.007;
  return h - sink + rim;
}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;
  float h = sandSurfaceHeight(xz);

  // Finite-difference terrain normal
  float eps = 0.06;
  float hx = sandSurfaceHeight(xz + vec2(eps, 0.0));
  float hz = sandSurfaceHeight(xz + vec2(0.0, eps));
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
  vec3 zenith = vec3(0.08, 0.27, 0.56);
  vec3 horizon = vec3(0.84, 0.78, 0.66);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.65, elev));
  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.35, 0.96, 0.58) * pow(sunCos, 22.0) * 0.58;
  sky += vec3(1.80, 1.35, 0.85) * pow(sunCos, 140.0) * 1.25;
  return sky;
}

void main() {
  vec2 xz = vWorldPos.xz;
  float shoreDist = signedShoreDistance(xz);
  float wetReach = swashWetnessReach(xz.x, uTime) + 0.32;

  // Organic shoreline wetness boundary perturbed by fine FBM noise
  float edgeNoise = (fbmFoam(xz * 1.45, 2) - 0.5) * 0.28;
  float wetness = 1.0 - smoothstep(wetReach - 0.52, wetReach + 0.65, shoreDist + edgeNoise);
  wetness = clamp(wetness, 0.0, 1.0);

  // Glossy thin water-sheet film near the active swash edge
  float waterFilm = smoothstep(0.32, 0.92, wetness);

  // Multi-scale procedural wind-blown sand ripples & mineral grain micro-relief
  float ripplePhase = xz.x * 4.8 + xz.y * 15.2 + sin(xz.x * 1.9 + xz.y * 0.8) * 1.95;
  float windRipple = sin(ripplePhase) * 0.5 + 0.5;
  float windRippleDx = cos(ripplePhase) * 4.8;
  float windRippleDz = cos(ripplePhase) * 15.2;

  float grainFine = valueNoise(xz * 48.0);
  float grainMicro = valueNoise(xz * 115.0);
  float grainMed = fbmFoam(xz * 7.2, uQuality >= 1.0 ? 3 : 2);

  // Wet sand smooths out fine wind ripples due to water surface tension
  float rippleFactor = (1.0 - wetness * 0.82);
  vec3 N = normalize(vTerrainNormal + vec3(
    ((grainFine - 0.5) * 0.095 + (grainMicro - 0.5) * 0.045 - windRippleDx * 0.0045) * rippleFactor,
    0.0,
    ((grainMed - 0.5) * 0.065 - windRippleDz * 0.0048) * rippleFactor
  ));

  vec3 L = normalize(uSunDir);
  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);

  // Base albedo: warm Mediterranean golden silica & shell sand
  vec3 dryWarm = vec3(0.78, 0.64, 0.46);
  vec3 dryCrest = vec3(0.84, 0.71, 0.53);
  vec3 dryAlbedo = mix(dryWarm, dryCrest, windRipple * 0.45) * (0.90 + 0.17 * grainMed + 0.05 * grainFine);

  // Wet sand darkens physically due to interstitial water index of refraction
  vec3 dampAlbedo = vec3(0.42, 0.33, 0.22) * (0.93 + 0.12 * grainMed);
  vec3 saturatedAlbedo = vec3(0.27, 0.21, 0.14) * (0.94 + 0.10 * grainMed);
  vec3 wetAlbedo = mix(dampAlbedo, saturatedAlbedo, waterFilm);
  vec3 albedo = mix(dryAlbedo, wetAlbedo, wetness);

  // Diffuse lighting (warm direct sun + sky hemisphere bounce)
  float NdotL = max(dot(N, L), 0.0);
  vec3 sunRadiance = vec3(1.26, 1.06, 0.85);
  vec3 skyFill = vec3(0.24, 0.32, 0.40);
  vec3 diffuse = albedo * (sunRadiance * NdotL * 0.90 + skyFill * 0.46);

  // Specular & Fresnel sky/sun reflection on wet sand water film
  float NdotV = max(dot(N, V), 0.02);
  float wetFresnel = (0.02 + 0.98 * pow(1.0 - NdotV, 5.0)) * smoothstep(0.10, 0.82, wetness);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.035;
  vec3 wetSkyRefl = sampleSandSky(normalize(R), L);

  vec3 H = normalize(L + V);
  float specPower = mix(14.0, 320.0, waterFilm);
  float spec = pow(max(dot(N, H), 0.0), specPower) * mix(0.035, 1.55, wetness);

  // Multi-tier quartz crystal micro-glints on sunlit dry sand
  float sparkA = uQuality >= 1.0
    ? smoothstep(0.958, 0.996, hash21(floor(xz * 92.0))) * (1.0 - wetness * 0.85) * NdotL * 0.55
    : 0.0;
  float sparkB = uQuality >= 1.8
    ? smoothstep(0.972, 0.999, hash21(floor(xz * 168.0 + 17.3))) * (1.0 - wetness) * NdotL * 0.72
    : 0.0;

  vec3 color = mix(diffuse, wetSkyRefl, wetFresnel * 0.68)
    + vec3(1.32, 1.04, 0.74) * (spec + sparkA + sparkB);

  // Residual dissolving foam lace left behind on freshly wetted sand
  float residualZone = exp(-pow((shoreDist - wetReach * 0.52) / 0.36, 2.0)) * wetness * 0.58;
  float residualFoam = organicFoamWeb(xz * 1.35, uTime * 0.35, residualZone, 3);
  color = mix(color, vec3(0.92, 0.92, 0.90), residualFoam * 0.72);

  // Realistic Ground Contact Shadow (Dual Wheel + Chassis AO) under the product
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.32;
  float wheelRear = exp(-pow((rel.x + halfWheelbase) / 0.44, 2.0) - pow(rel.y / 0.22, 2.0));
  float wheelFront = exp(-pow((rel.x - halfWheelbase) / 0.44, 2.0) - pow(rel.y / 0.22, 2.0));
  float chassisAO = exp(-pow(rel.x / (uProductSpan * 0.52), 2.0) - pow(rel.y / 0.36, 2.0));
  float contactShadow = clamp(wheelRear * 0.66 + wheelFront * 0.66 + chassisAO * 0.30, 0.0, 0.76);
  color *= (1.0 - contactShadow);

  // Distance horizon haze
  float haze = smoothstep(32.0, 125.0, dist);
  color = mix(color, sampleSandSky(normalize(vec3(V.x, 0.03, V.z)), L), haze * 0.82);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

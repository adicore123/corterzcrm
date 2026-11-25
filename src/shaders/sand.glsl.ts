import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Sand Terrain Shaders (V3 — Pale Warm Sand & Fat-Tire Trail Edition).
 * Features:
 * - Linear RGB uniforms from scene.config.ts:
 *   * Dry sand: #E9D5AE (roughness 0.92), crest #F1E1C2
 *   * Wet sand: #B79B6E (roughness 0.28, sky-reflective), waterline film #9A7E54
 * - Gentle dunes sloping to the water + stochastic domain-warped wind ripples (zero tiling)
 * - Fat-tire tracks (~7.8 cm wide herringbone tread) leading across the sand right into the bike's tires
 * - Tires sunk 1.6 cm into the sand with a displaced sand rim
 * - Tide line of small shells, pebbles, and subtle seaweed strands along the high-water mark
 * - Faint quartz glints at low sun
 */
export const sandVertexShader = /* glsl */ `
uniform vec2 uProductXZ;
uniform float uProductSpan;

varying vec3 vWorldPos;
varying vec3 vTerrainNormal;
varying float vTireDepression;

${shorelineCommonGlsl}

// Evaluates fat-tire track groove (-sink) and displaced rim (+rim) leading up to the bike's wheels
float computeTireTrackRelief(vec2 xz, out float trackMaskOut) {
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.32;

  // 1) Tire contact sink (1.6 cm) & displaced sand rim (0.7 cm) directly under rear & front tires
  float dRear = length(vec2((rel.x + halfWheelbase) * 1.45, rel.y * 3.4));
  float dFront = length(vec2((rel.x - halfWheelbase) * 1.45, rel.y * 3.4));
  float wheelSink = (exp(-dRear * dRear * 9.5) + exp(-dFront * dFront * 9.5)) * 0.017;
  float wheelRim = (exp(-pow(dRear - 0.33, 2.0) * 32.0) + exp(-pow(dFront - 0.33, 2.0) * 32.0)) * 0.0075;

  // 2) Rolling fat-tire trail (~7.8 cm wide) leading from the left beach up to the front wheel
  float trailProgress = clamp((uProductXZ.x + halfWheelbase - xz.x) / 6.5, 0.0, 1.0);
  float inTrailX = smoothstep(uProductXZ.x + halfWheelbase + 0.12, uProductXZ.x + halfWheelbase - 0.15, xz.x)
    * (1.0 - smoothstep(4.8, 7.2, uProductXZ.x - xz.x));

  // Slight natural steering arc in the incoming tire tracks
  float curveY1 = uProductXZ.y - 0.04 * sin(trailProgress * 3.14159) + 0.12 * trailProgress * trailProgress;
  float curveY2 = curveY1 + 0.055 * sin(trailProgress * 4.2);

  float dist1 = abs(xz.y - curveY1);
  float dist2 = abs(xz.y - curveY2);

  // 7.8 cm track width => half-width ~0.042m
  float groove1 = exp(-pow(dist1 / 0.048, 2.0)) * inTrailX;
  float groove2 = exp(-pow(dist2 / 0.046, 2.0)) * inTrailX * 0.85;
  float rim1 = exp(-pow((dist1 - 0.068) / 0.028, 2.0)) * inTrailX;
  float rim2 = exp(-pow((dist2 - 0.066) / 0.028, 2.0)) * inTrailX * 0.85;

  float trailGroove = max(groove1, groove2);
  float trailRim = max(rim1, rim2);

  trackMaskOut = clamp(trailGroove + (wheelSink / 0.017), 0.0, 1.0);
  return -wheelSink + wheelRim - trailGroove * 0.012 + trailRim * 0.0045;
}

float sandSurfaceHeight(vec2 xz, out float trackMask) {
  float h = coastalTerrainHeight(xz);
  return h + computeTireTrackRelief(xz, trackMask);
}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;
  float trackMask = 0.0;
  float dummy = 0.0;
  float h = sandSurfaceHeight(xz, trackMask);

  // Finite-difference terrain normal including tire depression & rim
  float eps = 0.045;
  float hx = sandSurfaceHeight(xz + vec2(eps, 0.0), dummy);
  float hz = sandSurfaceHeight(xz + vec2(0.0, eps), dummy);
  vTerrainNormal = normalize(vec3(h - hx, eps, h - hz));
  vTireDepression = trackMask;

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

// Linear RGB uniforms from scene.config.ts
uniform vec3 uDrySandColor;
uniform vec3 uDryCrestColor;
uniform vec3 uWetSandColor;
uniform vec3 uWetSaturatedColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;

varying vec3 vWorldPos;
varying vec3 vTerrainNormal;
varying float vTireDepression;

${shorelineCommonGlsl}
${foamGlsl}

vec3 sampleSandSky(vec3 dir, vec3 sunDir) {
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.25, elev));
  sky = mix(sky, uSkyZenith, smoothstep(0.22, 0.78, elev));
  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.30, 0.94, 0.58) * pow(sunCos, 22.0) * 0.52;
  sky += vec3(1.75, 1.32, 0.85) * pow(sunCos, 140.0) * 1.15;
  return sky;
}

// Re-evaluates fat-tire herringbone tread pattern in the fragment shader for crisp normal & AO detail
float computeTireTreadPattern(vec2 xz) {
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.32;
  float inTrailX = smoothstep(uProductXZ.x + halfWheelbase + 0.10, uProductXZ.x + halfWheelbase - 0.12, xz.x)
    * (1.0 - smoothstep(4.8, 7.2, uProductXZ.x - xz.x));
  if (inTrailX <= 0.001) return 0.0;

  float trailProgress = clamp((uProductXZ.x + halfWheelbase - xz.x) / 6.5, 0.0, 1.0);
  float curveY1 = uProductXZ.y - 0.04 * sin(trailProgress * 3.14159) + 0.12 * trailProgress * trailProgress;
  float curveY2 = curveY1 + 0.055 * sin(trailProgress * 4.2);

  float dy1 = xz.y - curveY1;
  float dy2 = xz.y - curveY2;
  float g1 = exp(-pow(abs(dy1) / 0.042, 2.4));
  float g2 = exp(-pow(abs(dy2) / 0.040, 2.4)) * 0.85;

  // Blocky V-shaped herringbone fat-tire knob blocks (~3.5 cm spacing)
  float lug1 = smoothstep(-0.2, 0.45, sin(xz.x * 86.0 + abs(dy1) * 52.0));
  float lug2 = smoothstep(-0.2, 0.45, sin(xz.x * 86.0 + abs(dy2) * 52.0 + 1.4));
  return clamp(max(g1 * lug1, g2 * lug2) * inTrailX, 0.0, 1.0);
}

void main() {
  vec2 xz = vWorldPos.xz;
  float shoreDist = signedShoreDistance(xz);
  float wetReach = swashWetnessReach(xz.x, uTime);

  // Stochastic macro domain warp breaks any procedural repetition
  vec2 macroWarp = vec2(
    fbmFoam(xz * 0.38, 2) - 0.5,
    fbmFoam(xz * 0.41 + 11.7, 2) - 0.5
  ) * 0.45;

  // Wet/dry boundary synced to 7.6s swash cycle
  float edgeNoise = (fbmFoam((xz + macroWarp) * 1.4, 2) - 0.5) * 0.26;
  float wetness = 1.0 - smoothstep(wetReach - 0.48, wetReach + 0.58, shoreDist + edgeNoise);
  wetness = clamp(wetness, 0.0, 1.0);
  float waterFilm = smoothstep(0.34, 0.92, wetness);

  // Wind-formed sand ripples (broken with macro warp so they never tile)
  vec2 warpedXZ = xz + macroWarp * 0.55;
  float ripplePhase = warpedXZ.x * 4.4 + warpedXZ.y * 14.8 + sin(warpedXZ.x * 1.7 + warpedXZ.y * 0.9) * 2.1;
  float windRipple = sin(ripplePhase) * 0.5 + 0.5;
  float windRippleDx = cos(ripplePhase) * 4.4;
  float windRippleDz = cos(ripplePhase) * 14.8;

  // Multi-scale stochastic mineral grain
  mat2 rotStoc = mat2(0.819, -0.573, 0.573, 0.819);
  float grainFine = valueNoise(xz * 46.0) * 0.6 + valueNoise((rotStoc * xz) * 74.0) * 0.4;
  float grainMicro = valueNoise(xz * 124.0);
  float grainMed = fbmFoam((xz + macroWarp) * 5.8, uQuality >= 1.0 ? 3 : 2);

  // Fat-tire herringbone tread pattern in the sand
  float treadBlocks = computeTireTreadPattern(xz);

  // Wet sand smooths out wind ripples; tire tracks press down wind ripples
  float rippleFactor = (1.0 - wetness * 0.84) * (1.0 - clamp(vTireDepression, 0.0, 1.0) * 0.75);
  vec3 N = normalize(vTerrainNormal + vec3(
    ((grainFine - 0.5) * 0.085 + (grainMicro - 0.5) * 0.04 - windRippleDx * 0.0042) * rippleFactor + (treadBlocks - 0.5) * 0.08 * vTireDepression,
    0.0,
    ((grainMed - 0.5) * 0.055 - windRippleDz * 0.0045) * rippleFactor
  ));

  vec3 L = normalize(uSunDir);
  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);

  // Fine pale warm Mediterranean sand (#E9D5AE dry, #B79B6E wet)
  vec3 dryAlbedo = mix(uDrySandColor, uDryCrestColor, windRipple * 0.42)
    * (0.93 + 0.12 * grainMed + 0.04 * grainFine);
  vec3 wetAlbedo = mix(uWetSandColor, uWetSaturatedColor, waterFilm)
    * (0.94 + 0.10 * grainMed);
  vec3 albedo = mix(dryAlbedo, wetAlbedo, wetness);

  // Compressed sand inside the fat-tire tracks is slightly darker due to grain compaction & tread shadow
  float trackCompaction = clamp(vTireDepression * 0.11 + treadBlocks * 0.09, 0.0, 0.18);
  albedo *= (1.0 - trackCompaction);

  // Tide line detail along the high-water swash boundary: small cream shells, pebbles & dark seaweed wisps
  float tideBand = exp(-pow((shoreDist - (wetReach + 0.18)) / 0.34, 2.0));
  float shellCell = hash21(floor(xz * 36.0));
  float shellMask = smoothstep(0.945, 0.992, shellCell) * tideBand;
  float pebbleMask = smoothstep(0.935, 0.985, hash21(floor(xz * 24.0 + 7.1))) * tideBand;
  float seaweedNoise = fbmFoam(vec2(xz.x * 2.4, xz.y * 9.5), 3);
  float seaweedStrand = smoothstep(0.76, 0.88, seaweedNoise) * exp(-pow((shoreDist - (wetReach + 0.08)) / 0.14, 2.0)) * 0.35;

  albedo = mix(albedo, vec3(0.92, 0.89, 0.82), shellMask * 0.78);
  albedo = mix(albedo, vec3(0.38, 0.35, 0.31), pebbleMask * 0.55);
  albedo = mix(albedo, vec3(0.18, 0.21, 0.14), seaweedStrand);

  // Diffuse lighting (warm direct sun + sky fill)
  float NdotL = max(dot(N, L), 0.0);
  vec3 sunRadiance = vec3(1.20, 1.04, 0.88);
  vec3 skyFill = vec3(0.24, 0.32, 0.40);
  vec3 diffuse = albedo * (sunRadiance * NdotL * 0.88 + skyFill * 0.46);

  // Wet sand sky & sun reflection (roughness 0.92 dry -> 0.28 wet)
  float NdotV = max(dot(N, V), 0.02);
  float wetFresnel = (0.02 + 0.98 * pow(1.0 - NdotV, 5.0)) * smoothstep(0.12, 0.85, wetness);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.035;
  vec3 wetSkyRefl = sampleSandSky(normalize(R), L);

  vec3 H = normalize(L + V);
  float specPower = mix(12.0, 280.0, waterFilm);
  float spec = pow(max(dot(N, H), 0.0), specPower) * mix(0.025, 1.35, wetness);

  // Faint quartz glints at low sun on dry sand
  float sparkA = uQuality >= 1.0
    ? smoothstep(0.964, 0.997, hash21(floor(xz * 94.0))) * (1.0 - wetness * 0.88) * NdotL * 0.42
    : 0.0;
  float sparkB = uQuality >= 1.8
    ? smoothstep(0.976, 0.999, hash21(floor(xz * 172.0 + 19.3))) * (1.0 - wetness) * NdotL * 0.58
    : 0.0;

  vec3 color = mix(diffuse, wetSkyRefl, wetFresnel * 0.62)
    + vec3(1.28, 1.02, 0.74) * (spec + sparkA + sparkB);

  // Residual dissolving swash foam lace on freshly wetted sand
  float residualZone = exp(-pow((shoreDist - wetReach * 0.50) / 0.34, 2.0)) * wetness * 0.52;
  float residualFoam = organicFoamWeb(xz * 1.35, uTime * 0.32, residualZone, 3);
  color = mix(color, vec3(0.94, 0.94, 0.92), residualFoam * 0.68);

  // Ground Contact Shadow & Dual-Wheel AO under the bike (slightly blue-tinted shadow from sky fill)
  vec2 rel = xz - uProductXZ;
  float halfWheelbase = uProductSpan * 0.32;
  float wheelRear = exp(-pow((rel.x + halfWheelbase) / 0.42, 2.0) - pow(rel.y / 0.21, 2.0));
  float wheelFront = exp(-pow((rel.x - halfWheelbase) / 0.42, 2.0) - pow(rel.y / 0.21, 2.0));
  float chassisAO = exp(-pow(rel.x / (uProductSpan * 0.50), 2.0) - pow(rel.y / 0.34, 2.0));
  float contactShadow = clamp(wheelRear * 0.68 + wheelFront * 0.68 + chassisAO * 0.28, 0.0, 0.76);
  vec3 coolShadowTint = mix(vec3(1.0), vec3(0.18, 0.24, 0.32), contactShadow);
  color *= coolShadowTint;

  // Exponential aerial perspective matched to sky horizon
  float haze = 1.0 - exp(-max(0.0, dist - 22.0) * 0.018);
  color = mix(color, sampleSandSky(normalize(vec3(V.x, 0.02, V.z)), L), clamp(haze, 0.0, 0.88));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Ocean Fragment Shader (V2 Photorealistic Edition).
 * Features:
 * - Multi-scale animated capillary normal ripples
 * - Refracted shallow-water seabed sunlight caustics
 * - Schlick view-dependent Fresnel reflection
 * - Beer-Lambert depth-dependent absorption (deep sapphire #07576D -> coastal turquoise #38B8B4 -> crystal-clear shallow water)
 * - Backlit emerald-turquoise wave-crest subsurface scattering (SSS)
 * - Dual-lobe GGX sun specular highway & high-frequency dancing solar micro-glints
 * - 3-tier organic breaking-wave & shoreline swash foam lace
 */
export const oceanFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uQuality;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;

varying vec3 vWorldPos;
varying vec3 vMacroNormal;
varying float vWaterDepth;
varying float vCrestFactor;
varying float vSwashEdge;

${shorelineCommonGlsl}
${foamGlsl}

// Multi-scale procedural capillary normal detail
vec3 computeFineWaterNormal(vec2 xz, vec3 macroN, float depthMask, float quality) {
  float eps = 0.05;
  int oct = quality >= 1.8 ? 4 : (quality >= 0.9 ? 3 : 2);
  vec2 p1 = xz * 3.1 + vec2(uTime * 0.36, uTime * 0.52);
  vec2 p2 = xz * 7.8 + vec2(-uTime * 0.45, uTime * 0.31);
  vec2 p3 = xz * 16.5 + vec2(uTime * 0.62, -uTime * 0.48);

  float h0 = fbmFoam(p1, oct) * 0.58 + valueNoise(p2) * 0.28 + valueNoise(p3) * 0.14;
  float hx = fbmFoam(p1 + vec2(eps, 0.0), oct) * 0.58 + valueNoise(p2 + vec2(eps * 2.2, 0.0)) * 0.28 + valueNoise(p3 + vec2(eps * 3.5, 0.0)) * 0.14;
  float hz = fbmFoam(p1 + vec2(0.0, eps), oct) * 0.58 + valueNoise(p2 + vec2(0.0, eps * 2.2)) * 0.28 + valueNoise(p3 + vec2(0.0, eps * 3.5)) * 0.14;

  float rippleStrength = mix(0.035, 0.165, depthMask);
  vec3 detail = normalize(vec3((h0 - hx) * rippleStrength / eps, 1.0, (h0 - hz) * rippleStrength / eps));
  return normalize(vec3(macroN.x + detail.x, macroN.y * detail.y, macroN.z + detail.z));
}

// Refracted shallow-water sunlight caustics on the sandy seabed
float computeSeabedCaustics(vec2 xz, vec3 N, vec3 L, float time) {
  vec2 refractedUV = xz + N.xz * 0.42 - L.xz * 0.18;
  vec2 c1 = refractedUV * 3.4 + vec2(time * 0.42, -time * 0.31);
  vec2 c2 = refractedUV * 4.7 + vec2(-time * 0.36, time * 0.48);
  float r1 = 1.0 - abs(valueNoise(c1) * 2.0 - 1.0);
  float r2 = 1.0 - abs(valueNoise(c2) * 2.0 - 1.0);
  float net = pow(clamp(r1 * r2, 0.0, 1.0), 2.2);
  return smoothstep(0.16, 0.76, net);
}

// Coherent sky & horizon color matching AtmosphericSky + visible solar corona
vec3 sampleSkyColor(vec3 dir, vec3 sunDir) {
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 zenith = vec3(0.08, 0.27, 0.56);
  vec3 midSky = vec3(0.26, 0.53, 0.74);
  vec3 horizon = vec3(0.84, 0.78, 0.66);
  vec3 sky = mix(horizon, midSky, smoothstep(0.0, 0.24, elev));
  sky = mix(sky, zenith, smoothstep(0.20, 0.78, elev));

  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.15, 0.76, 0.42) * pow(sunCos, 9.0) * 0.48;
  sky += vec3(1.85, 1.38, 0.88) * pow(sunCos, 140.0) * 1.65;
  return sky;
}

void main() {
  if (vWaterDepth <= 0.002) discard;

  float depth = max(vWaterDepth, 0.0);
  float shoreAlpha = smoothstep(0.002, 0.055, depth);

  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);
  vec3 L = normalize(uSunDir);

  float depthRippleMask = smoothstep(0.02, 0.85, depth) * (1.0 - smoothstep(30.0, 105.0, dist) * 0.62);
  vec3 N = computeFineWaterNormal(vWorldPos.xz, normalize(vMacroNormal), depthRippleMask, uQuality);

  // Schlick Fresnel
  float NdotV = max(dot(N, V), 0.02);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  fresnel = clamp(fresnel, 0.02, 0.93);

  // Sky reflection vector
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.86 + 0.025;
  vec3 skyReflection = sampleSkyColor(normalize(R), L);

  // Depth-dependent Beer-Lambert water absorption & shallow seabed refraction
  vec3 deepColor = vec3(0.005, 0.082, 0.155);
  vec3 midTurquoise = vec3(0.028, 0.395, 0.420);
  vec3 shallowEmerald = vec3(0.11, 0.56, 0.52);
  vec3 shallowSandBed = vec3(0.54, 0.45, 0.31);

  // Refracted sunlight caustics on the shallow seabed
  float causticVisibility = exp(-depth * 1.65) * smoothstep(0.01, 0.14, depth);
  float caustics = computeSeabedCaustics(vWorldPos.xz, N, L, uTime);
  vec3 sunlitSeabed = shallowSandBed + vec3(0.38, 0.34, 0.20) * caustics * causticVisibility;

  float shallowFactor = exp(-depth * 1.55);
  float midFactor = exp(-depth * 0.36);
  vec3 waterBody = mix(deepColor, midTurquoise, midFactor);
  waterBody = mix(waterBody, shallowEmerald, exp(-depth * 0.85) * 0.42);
  waterBody = mix(waterBody, sunlitSeabed, shallowFactor * 0.74);

  // Subsurface scattering (SSS) glow inside backlit wave crests
  float backLight = pow(max(0.0, dot(V, -L + N * 0.58)), 2.6);
  float crestThickness = clamp(vCrestFactor * 1.85 + shallowFactor * 0.38, 0.0, 1.0);
  vec3 sss = vec3(0.08, 0.64, 0.55) * backLight * crestThickness * 0.65;

  vec3 color = mix(waterBody + sss, skyReflection, fresnel);

  // Solar Shimmer Highway: dual-lobe GGX specular path + high-frequency dancing micro-facet glints
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float sunPathEnvelope = pow(NdotH, 28.0) * 0.32;
  float broadSpec = pow(NdotH, 125.0) * 1.05;
  float sharpSunGlint = pow(NdotH, 680.0) * 3.85;

  // High-frequency sparkle facets along the sun path
  float sparkleNoise = valueNoise(vWorldPos.xz * 26.0 + vec2(uTime * 1.9, -uTime * 1.5));
  float microSparkle = smoothstep(0.76, 0.96, sparkleNoise) * pow(NdotH, 55.0) * 2.4;

  color += vec3(1.45, 1.12, 0.74) * (sunPathEnvelope + broadSpec + sharpSunGlint + microSparkle) * smoothstep(0.02, 0.20, depth);

  // 3-Tier Organic Breaking-Wave & Shoreline Swash Foam
  int foamOctaves = uQuality >= 1.8 ? 4 : 3;
  // 1) Leading surf bore where shallow depth compresses incoming waves
  float surfZone = exp(-pow((depth - 0.14) / 0.16, 2.0)) * 0.88;
  // 2) Thin swash lip advancing up the wet sand
  float swashLip = smoothstep(0.12, 0.006, depth) * 0.94;
  // 3) Offshore whitecaps on steep wave crests
  float crestFoamDrive = smoothstep(0.22, 0.50, vCrestFactor) * 0.64;

  float foamDensity = clamp(max(surfZone, swashLip) + crestFoamDrive, 0.0, 1.0);
  float foamMask = organicFoamWeb(vWorldPos.xz, uTime, foamDensity, foamOctaves);

  // Sunlit warm-white sea foam with subtle ambient shadow in thicker pockets
  float sunN = max(dot(N, L), 0.28);
  vec3 foamColor = mix(vec3(0.70, 0.77, 0.80), vec3(0.98, 0.97, 0.94), sunN);
  color = mix(color, foamColor, foamMask * 0.93);

  // Atmospheric distance haze toward the horizon so sea & sky fuse naturally
  float haze = smoothstep(32.0, 135.0, dist);
  vec3 horizonHaze = sampleSkyColor(normalize(vec3(V.x, 0.02, V.z)), L);
  color = mix(color, horizonHaze, haze * 0.86);

  float finalAlpha = clamp(max(shoreAlpha, foamMask * 0.96), 0.0, 1.0);
  gl_FragColor = vec4(color, finalAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

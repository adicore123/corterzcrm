import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Ocean Fragment Shader.
 * Features:
 * - Multi-scale animated capillary normal ripples
 * - Schlick view-dependent Fresnel reflection
 * - Beer-Lambert depth-dependent absorption (deep sapphire #07576D -> coastal turquoise #38B8B4 -> clear shallow water over sand)
 * - Backlit wave-crest subsurface scattering (SSS)
 * - GGX sun specular path & dancing solar micro-glints
 * - Organic breaking-wave & shoreline swash foam lace
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
  float eps = 0.06;
  int oct = quality >= 1.8 ? 4 : (quality >= 0.9 ? 3 : 2);
  vec2 p1 = xz * 2.8 + vec2(uTime * 0.34, uTime * 0.48);
  vec2 p2 = xz * 6.7 + vec2(-uTime * 0.41, uTime * 0.29);

  float h0 = fbmFoam(p1, oct) * 0.65 + valueNoise(p2) * 0.35;
  float hx = fbmFoam(p1 + vec2(eps, 0.0), oct) * 0.65 + valueNoise(p2 + vec2(eps * 2.1, 0.0)) * 0.35;
  float hz = fbmFoam(p1 + vec2(0.0, eps), oct) * 0.65 + valueNoise(p2 + vec2(0.0, eps * 2.1)) * 0.35;

  float rippleStrength = mix(0.03, 0.14, depthMask);
  vec3 detail = normalize(vec3((h0 - hx) * rippleStrength / eps, 1.0, (h0 - hz) * rippleStrength / eps));
  return normalize(vec3(macroN.x + detail.x, macroN.y * detail.y, macroN.z + detail.z));
}

// Coherent sky & horizon color matching AtmosphericSky
vec3 sampleSkyColor(vec3 dir, vec3 sunDir) {
  float elev = clamp(dir.y, 0.0, 1.0);
  // Linear RGB sky colors (zenith azure -> warm golden-ivory Mediterranean horizon)
  vec3 zenith = vec3(0.09, 0.28, 0.56);
  vec3 midSky = vec3(0.28, 0.52, 0.72);
  vec3 horizon = vec3(0.76, 0.74, 0.68);
  vec3 sky = mix(horizon, midSky, smoothstep(0.0, 0.24, elev));
  sky = mix(sky, zenith, smoothstep(0.20, 0.78, elev));

  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.05, 0.72, 0.42) * pow(sunCos, 12.0) * 0.38;
  sky += vec3(1.60, 1.25, 0.85) * pow(sunCos, 180.0) * 1.35;
  return sky;
}

void main() {
  // Smooth shoreline feathering where thin swash meets sand
  if (vWaterDepth <= 0.002) discard;

  float depth = max(vWaterDepth, 0.0);
  float shoreAlpha = smoothstep(0.002, 0.065, depth);

  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);
  vec3 L = normalize(uSunDir);

  float depthRippleMask = smoothstep(0.03, 0.9, depth) * (1.0 - smoothstep(28.0, 95.0, dist) * 0.65);
  vec3 N = computeFineWaterNormal(vWorldPos.xz, normalize(vMacroNormal), depthRippleMask, uQuality);

  // Schlick Fresnel
  float NdotV = max(dot(N, V), 0.02);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  fresnel = clamp(fresnel, 0.02, 0.92);

  // Sky reflection vector
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.88 + 0.03;
  vec3 skyReflection = sampleSkyColor(normalize(R), L);

  // Depth-dependent Beer-Lambert water absorption & shallow sand refraction
  // Deep ocean (#07576D in linear ~= 0.004, 0.095, 0.155), Mediterranean turquoise (#38B8B4 in linear ~= 0.042, 0.475, 0.450)
  vec3 deepColor = vec3(0.006, 0.088, 0.158);
  vec3 midTurquoise = vec3(0.036, 0.365, 0.385);
  vec3 shallowSandTint = vec3(0.46, 0.40, 0.28);

  float shallowFactor = exp(-depth * 1.45);
  float midFactor = exp(-depth * 0.34);
  vec3 waterBody = mix(deepColor, midTurquoise, midFactor);
  waterBody = mix(waterBody, shallowSandTint, shallowFactor * 0.68);

  // Subsurface scattering (SSS) glow inside sunlit wave crests
  float backLight = pow(max(0.0, dot(V, -L + N * 0.55)), 3.0);
  float crestThickness = clamp(vCrestFactor * 1.6 + shallowFactor * 0.35, 0.0, 1.0);
  vec3 sss = vec3(0.06, 0.54, 0.48) * backLight * crestThickness * 0.52;

  vec3 color = mix(waterBody + sss, skyReflection, fresnel);

  // Sun specular reflection path + dancing micro-glints
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float broadSpec = pow(NdotH, 110.0) * 0.85;
  float sharpSunGlint = pow(NdotH, 720.0) * 3.2;
  color += vec3(1.35, 1.04, 0.72) * (broadSpec + sharpSunGlint) * smoothstep(0.03, 0.25, depth);

  // Organic Breaking-Wave & Shoreline Swash Foam
  int foamOctaves = uQuality >= 1.8 ? 4 : 3;
  // 1) Leading surf bore where shallow depth compresses incoming waves
  float surfZone = exp(-pow((depth - 0.14) / 0.16, 2.0)) * 0.85;
  // 2) Thin swash lip advancing up the wet sand
  float swashLip = smoothstep(0.11, 0.008, depth) * 0.92;
  // 3) Offshore whitecaps on steep wave crests
  float crestFoamDrive = smoothstep(0.24, 0.52, vCrestFactor) * 0.58;

  float foamDensity = clamp(max(surfZone, swashLip) + crestFoamDrive, 0.0, 1.0);
  float foamMask = organicFoamWeb(vWorldPos.xz, uTime, foamDensity, foamOctaves);

  // Sunlit warm-white sea foam with subtle ambient shadow in thicker pockets
  float sunN = max(dot(N, L), 0.25);
  vec3 foamColor = mix(vec3(0.68, 0.75, 0.78), vec3(0.96, 0.95, 0.92), sunN);
  color = mix(color, foamColor, foamMask * 0.92);

  // Atmospheric distance haze toward the horizon so sea & sky fuse naturally
  float haze = smoothstep(32.0, 135.0, dist);
  vec3 horizonHaze = sampleSkyColor(normalize(vec3(V.x, 0.02, V.z)), L);
  color = mix(color, horizonHaze, haze * 0.86);

  float finalAlpha = clamp(max(shoreAlpha, foamMask * 0.95), 0.0, 1.0);
  gl_FragColor = vec4(color, finalAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

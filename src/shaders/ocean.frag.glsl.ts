import { shorelineCommonGlsl } from "./shoreline.glsl";
import { foamGlsl } from "./foam.glsl";

/**
 * Physically Based Mediterranean Ocean Fragment Shader (V3 — Depth-Driven Beer-Lambert Edition).
 * Features:
 * - Linear RGB uniforms converted via THREE.Color().convertSRGBToLinear():
 *   * 0.0–0.2m waterline: crystal clear over sand, faint aqua (#BFEDE6)
 *   * 0.2–1.5m shallows: turquoise (#46C6C2 -> #22A9B5)
 *   * 1.5–6.0m mid: Mediterranean cyan-blue (#1688A8)
 *   * >6.0m deep/far: deep navy (#0B5D86 -> #0A4466) dissolving into horizon haze
 * - Dual counter-scrolling normal ripple maps with domain warping (zero visible tiling)
 * - Refracted underwater sand seabed with animated projected sunlight caustics
 * - Schlick Fresnel (F0 = 0.02)
 * - Backlit turquoise wave-crest subsurface scattering (SSS)
 * - Tight solar glitter specular lobe on noisy normals + 7.6s swash foam cycle
 */
export const oceanFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uQuality;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;

// Linear RGB color uniforms supplied from scene.config.ts
uniform vec3 uWaterlineColor;
uniform vec3 uShallowNearColor;
uniform vec3 uShallowFarColor;
uniform vec3 uMidColor;
uniform vec3 uDeepNearColor;
uniform vec3 uDeepFarColor;
uniform vec3 uCrestSssColor;
uniform vec3 uSubmergedSandColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;

varying vec3 vWorldPos;
varying vec3 vMacroNormal;
varying float vWaterDepth;
varying float vCrestFactor;
varying float vSwashEdge;

${shorelineCommonGlsl}
${foamGlsl}

// Dual counter-scrolling normal ripple layers at non-harmonic scales & directions (zero tiling)
vec3 computeDualScrollingNormal(vec2 xz, vec3 macroN, float depthMask, float quality) {
  float eps = 0.045;
  int oct = quality >= 1.8 ? 4 : (quality >= 0.9 ? 3 : 2);

  // Domain warp prevents any grid repetition
  vec2 warp = vec2(
    valueNoise(xz * 0.42 + vec2(0.0, uTime * 0.06)),
    valueNoise(xz * 0.37 - vec2(uTime * 0.05, 0.0))
  ) * 0.35;

  // Map 1: medium capillary swell scrolling shoreward-east
  vec2 uv1 = (xz + warp) * 2.65 + vec2(uTime * 0.24, uTime * 0.38);
  // Map 2: finer cross-breeze ripples scrolling shoreward-west at 37 deg rotation
  mat2 rot = mat2(0.7986, -0.6018, 0.6018, 0.7986);
  vec2 uv2 = (rot * (xz - warp)) * 6.85 + vec2(-uTime * 0.33, uTime * 0.27);

  float h0 = fbmFoam(uv1, oct) * 0.62 + fbmFoam(uv2, max(2, oct - 1)) * 0.38;
  float hx = fbmFoam(uv1 + vec2(eps, 0.0), oct) * 0.62 + fbmFoam(uv2 + vec2(eps * 1.8, 0.0), max(2, oct - 1)) * 0.38;
  float hz = fbmFoam(uv1 + vec2(0.0, eps), oct) * 0.62 + fbmFoam(uv2 + vec2(0.0, eps * 1.8), max(2, oct - 1)) * 0.38;

  float rippleStrength = mix(0.025, 0.145, depthMask);
  vec3 detail = normalize(vec3((h0 - hx) * rippleStrength / eps, 1.0, (h0 - hz) * rippleStrength / eps));
  return normalize(vec3(macroN.x + detail.x, macroN.y * detail.y, macroN.z + detail.z));
}

// Animated sunlight caustics projected onto the refracted underwater sand bed
float computeProjectedCaustics(vec2 refractedXZ, float time) {
  mat2 rotA = mat2(0.866, -0.5, 0.5, 0.866);
  mat2 rotB = mat2(0.5, 0.866, -0.866, 0.5);
  vec2 p1 = (rotA * refractedXZ) * 3.2 + vec2(time * 0.34, -time * 0.26);
  vec2 p2 = (rotB * refractedXZ) * 4.5 + vec2(-time * 0.29, time * 0.39);
  vec2 p3 = refractedXZ * 2.1 + vec2(time * 0.18, time * 0.22);

  float c1 = 1.0 - abs(valueNoise(p1) * 2.0 - 1.0);
  float c2 = 1.0 - abs(valueNoise(p2) * 2.0 - 1.0);
  float c3 = 1.0 - abs(valueNoise(p3) * 2.0 - 1.0);
  float lattice = pow(clamp(c1 * c2 * 0.7 + c2 * c3 * 0.3, 0.0, 1.0), 2.1);
  return smoothstep(0.18, 0.78, lattice);
}

// Physical sky & solar reflection matching AtmosphericSky mood uniforms
vec3 sampleSkyColor(vec3 dir, vec3 sunDir) {
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.24, elev));
  sky = mix(sky, uSkyZenith, smoothstep(0.20, 0.80, elev));

  float sunCos = max(dot(dir, sunDir), 0.0);
  sky += vec3(1.18, 0.78, 0.42) * pow(sunCos, 10.0) * 0.45;
  sky += vec3(1.85, 1.40, 0.90) * pow(sunCos, 150.0) * 1.55;
  return sky;
}

void main() {
  if (vWaterDepth <= 0.0015) discard;

  float depth = max(vWaterDepth, 0.0);
  // Waterline 0-0.06m feathers smoothly without any hard edge
  float shoreAlpha = smoothstep(0.0015, 0.06, depth);

  vec3 viewVec = uCameraPos - vWorldPos;
  float dist = length(viewVec);
  vec3 V = viewVec / max(dist, 0.001);
  vec3 L = normalize(uSunDir);

  float depthRippleMask = smoothstep(0.02, 0.85, depth) * (1.0 - smoothstep(28.0, 110.0, dist) * 0.65);
  vec3 N = computeDualScrollingNormal(vWorldPos.xz, normalize(vMacroNormal), depthRippleMask, uQuality);

  // Schlick Fresnel (F0 = 0.02): clear when looking down, mirrors sky at grazing angles
  float NdotV = max(dot(N, V), 0.02);
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  // Reduce Fresnel in the 0-0.25m thin waterline sheet so the submerged sand shows clearly
  fresnel *= smoothstep(0.01, 0.28, depth);
  fresnel = clamp(fresnel, 0.015, 0.92);

  // Sky reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.86 + 0.025;
  vec3 skyReflection = sampleSkyColor(normalize(R), L);

  // Refracted underwater sand seabed + animated projected sunlight caustics
  vec2 refractedXZ = vWorldPos.xz + N.xz * clamp(depth * 0.38, 0.02, 0.45);
  float sandMicroGrain = valueNoise(refractedXZ * 18.0) * 0.12 + 0.94;
  float sandRipples = sin(refractedXZ.x * 4.5 + refractedXZ.y * 14.0) * 0.04;
  vec3 seabedSand = uSubmergedSandColor * (sandMicroGrain + sandRipples);

  // Caustics strongest in the 0.06m - 1.5m shallows, fading exponentially with depth
  float causticStrength = smoothstep(0.02, 0.16, depth) * exp(-depth * 1.15);
  float caustics = computeProjectedCaustics(refractedXZ, uTime);
  seabedSand += vec3(0.46, 0.42, 0.26) * caustics * causticStrength;

  // Depth-zone water volume color (Section A palette in Linear RGB):
  // 0.0–0.2m: uWaterlineColor (#BFEDE6)
  // 0.2–1.5m: uShallowNearColor (#46C6C2) -> uShallowFarColor (#22A9B5)
  // 1.5–6.0m: uMidColor (#1688A8)
  // >6.0m:    uDeepNearColor (#0B5D86) -> uDeepFarColor (#0A4466)
  vec3 waterVolume = uWaterlineColor;
  waterVolume = mix(waterVolume, uShallowNearColor, smoothstep(0.04, 0.35, depth));
  waterVolume = mix(waterVolume, uShallowFarColor, smoothstep(0.30, 1.45, depth));
  waterVolume = mix(waterVolume, uMidColor, smoothstep(1.30, 3.80, depth));
  waterVolume = mix(waterVolume, uDeepNearColor, smoothstep(3.50, 6.20, depth));
  waterVolume = mix(waterVolume, uDeepFarColor, smoothstep(5.80, 10.50, depth));

  // Beer-Lambert transmittance: mix(seabedSand, waterVolume, 1 - exp(-depth * k))
  float absorption = 1.0 - exp(-depth * 1.28);
  vec3 transmitted = mix(seabedSand, waterVolume, absorption);

  // Backlit turquoise wave-crest subsurface scattering (SSS)
  float backLight = pow(max(0.0, dot(V, -L + N * 0.55)), 2.8);
  float crestThickness = clamp(vCrestFactor * 1.75 + (1.0 - absorption) * 0.32, 0.0, 1.0);
  vec3 sss = uCrestSssColor * backLight * crestThickness * 0.52;

  vec3 color = mix(transmitted + sss, skyReflection, fresnel);

  // Sun glitter: tight specular lobe + dancing micro-facet sparkles toward the sun
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float sunSheen = pow(NdotH, 36.0) * 0.26;
  float tightGlitter = pow(NdotH, 165.0) * 1.15;
  float pinGlint = pow(NdotH, 740.0) * 4.20;

  float facetNoise = valueNoise(vWorldPos.xz * 28.0 + vec2(uTime * 1.7, -uTime * 1.4));
  float microSparkle = smoothstep(0.75, 0.96, facetNoise) * pow(NdotH, 60.0) * 2.65;

  color += vec3(1.48, 1.16, 0.78) * (sunSheen + tightGlitter + pinGlint + microSparkle) * smoothstep(0.02, 0.22, depth);

  // Noise-broken shoreline foam at real water-sand intersection
  int foamOctaves = uQuality >= 1.8 ? 4 : 3;
  float surfBore = exp(-pow((depth - 0.13) / 0.14, 2.0)) * 0.84;
  float swashLip = smoothstep(0.10, 0.005, depth) * 0.92;
  float crestWhitecap = smoothstep(0.26, 0.54, vCrestFactor) * 0.52;

  float foamDensity = clamp(max(surfBore, swashLip) + crestWhitecap, 0.0, 1.0);
  float foamMask = organicFoamWeb(vWorldPos.xz, uTime, foamDensity, foamOctaves);

  float sunN = max(dot(N, L), 0.30);
  vec3 foamColor = mix(vec3(0.72, 0.80, 0.83), vec3(0.98, 0.97, 0.95), sunN);
  color = mix(color, foamColor, foamMask * 0.90);

  // Exponential aerial perspective matched to the sky's horizon color
  float haze = 1.0 - exp(-max(0.0, dist - 22.0) * 0.018);
  vec3 horizonHaze = sampleSkyColor(normalize(vec3(V.x, 0.015, V.z)), L);
  color = mix(color, horizonHaze, clamp(haze, 0.0, 0.92));

  float finalAlpha = clamp(max(shoreAlpha, foamMask * 0.94), 0.0, 1.0);
  gl_FragColor = vec4(color, finalAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

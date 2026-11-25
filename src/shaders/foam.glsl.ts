/**
 * Procedural multi-scale FBM & organic cellular foam lace functions in GLSL.
 * Produces natural dissolving sea foam and surf lace without geometric lines or tiling.
 */
export const foamGlsl = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbmFoam(vec2 p, int octaves) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += amp * valueNoise(p);
    p = rot * p * 2.07 + vec2(13.1, 7.7);
    amp *= 0.5;
  }
  return v;
}

// Dissolving bubble-lace pattern for breaking waves and receding swash
float organicFoamWeb(vec2 worldXZ, float time, float density, int octaves) {
  vec2 driftA = worldXZ * 2.35 + vec2(time * 0.16, -time * 0.24);
  vec2 driftB = worldXZ * 5.60 + vec2(-time * 0.12, time * 0.18);
  float n1 = fbmFoam(driftA, octaves);
  float n2 = valueNoise(driftB);
  float lace = n1 * 0.72 + n2 * 0.28;
  float web = 1.0 - abs(n1 * 2.0 - 1.0);
  float combined = mix(lace, web, 0.40);
  float threshold = mix(0.78, 0.22, clamp(density, 0.0, 1.0));
  return smoothstep(threshold, threshold + 0.24, combined) * clamp(density * 1.25, 0.0, 1.0);
}
`;

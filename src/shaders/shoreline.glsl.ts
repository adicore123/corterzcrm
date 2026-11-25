/**
 * Shared GLSL Coastal Bathymetry & Shoreline Swash Physics (V3).
 * Used identically by the Gerstner Ocean, Shoreline Swash System, and 3D Sand Terrain
 * so depth = waterLevel - sandHeight(x,z) is mathematically continuous across all passes.
 */
export const shorelineCommonGlsl = /* glsl */ `
// Curving Mediterranean shoreline profile along X (in world meters)
float shorelineCurveZ(float x) {
  return -1.45
    + 0.38 * sin(x * 0.11 + 0.4)
    + 0.19 * sin(x * 0.27 - 1.1)
    + 0.08 * cos(x * 0.61 + 2.0);
}

// Signed distance from the mean shoreline (+ toward dry beach, - toward open sea)
float signedShoreDistance(vec2 xz) {
  return xz.y - shorelineCurveZ(xz.x);
}

// Continuous 3D terrain elevation (seabed -> shallow shelf -> gently sloped dune beach)
float coastalTerrainHeight(vec2 xz) {
  float d = signedShoreDistance(xz);
  if (d < 0.0) {
    // Gradual Mediterranean sandy shelf: 0 -> -1.5m in the first 7m, descending to -8.5m offshore
    return -5.4 * (1.0 - exp(d * 0.16)) + 0.055 * d;
  }
  // Gentle beach berm and soft background dunes sloping toward the water
  float duneUndulation = sin(xz.x * 0.22 + 0.8) * cos(xz.y * 0.31 - 0.4) * 0.028 * smoothstep(0.0, 2.5, d);
  return 0.31 * (1.0 - exp(-d * 0.68)) + duneUndulation;
}

// Asymmetric swash run-up cycle (7.6s period: surge up the sand, pause, slow backwash)
float swashSurgeOffset(float x, float time) {
  float period = 7.6;
  float omega = 6.2831853 / period;
  float phase = time * omega + sin(x * 0.19) * 1.15 + cos(x * 0.43) * 0.55;
  float raw = sin(phase);
  // Steep incoming run-up, elongated receding backwash
  float asymmetric = raw + 0.28 * sin(2.0 * phase - 0.65);
  return asymmetric * 0.68;
}

// Wet sand persistence boundary: stays dark/glossy after wave recedes and dries gradually
float swashWetnessReach(float x, float time) {
  float current = swashSurgeOffset(x, time);
  float trail1 = swashSurgeOffset(x, time - 1.35);
  float trail2 = swashSurgeOffset(x, time - 2.80);
  float trail3 = swashSurgeOffset(x, time - 4.20);
  return max(max(current, trail1 * 0.94), max(trail2 * 0.86, trail3 * 0.76)) + 0.52;
}
`;

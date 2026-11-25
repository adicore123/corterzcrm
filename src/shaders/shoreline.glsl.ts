/**
 * Shared coastal bathymetry & shoreline curve functions in GLSL.
 * Coordinate system:
 *   X: along-shore (-left to +right)
 *   Y: vertical elevation
 *   Z: cross-shore (-deep ocean toward horizon, +dry beach terrace toward viewer)
 *
 * The dry product terrace sits around Z in [1.2 .. 5.5], Y ~= 0.0.
 * The natural curving shoreline sits around Z ~= -1.35 + curve(X).
 * For Z < shorelineZ, the seabed slopes smoothly downward into the Mediterranean.
 */
export const shorelineCommonGlsl = /* glsl */ `
float shorelineCurve(float x) {
  return -1.45
    + 0.38 * sin(x * 0.11 + 0.4)
    + 0.19 * sin(x * 0.27 - 1.1)
    + 0.08 * cos(x * 0.61 + 2.0);
}

// Signed cross-shore distance: positive on land (toward viewer), negative seaward
float signedShoreDistance(vec2 xz) {
  return xz.y - shorelineCurve(xz.x);
}

// Continuous coastal seabed-to-terrace elevation y(x, z)
float coastalTerrainHeight(vec2 xz) {
  float d = signedShoreDistance(xz);
  // Seaward slope: gently deepens from 0 at shoreline to -4.8m offshore
  float seaSlope = d < 0.0 ? -4.8 * (1.0 - exp(d * 0.22)) + 0.06 * d : 0.0;
  // Landward beach face -> levels onto the dry product presentation terrace around y = 0.28
  float landRise = d >= 0.0 ? 0.30 * (1.0 - exp(-d * 0.72)) : 0.0;
  // Subtle wind-formed macro sand undulation on the dry upper beach (fades near wheel contact zone)
  float productZoneMask = smoothstep(0.9, 2.8, length(xz - vec2(0.0, 2.15)));
  float dune = (sin(xz.x * 0.42 + xz.y * 0.31) * 0.022 + cos(xz.x * 0.85 - xz.y * 0.55) * 0.011)
    * smoothstep(0.3, 2.4, d) * productZoneMask;
  return seaSlope + landRise + dune;
}

// Asymmetric swash surge cycle: fast incoming wave run-up, slower gravity backwash
float swashSurgeOffset(float x, float time) {
  float p1 = fract(time * 0.145 + sin(x * 0.09) * 0.18);
  // Fast rise (0..0.32), slow recession (0.32..1.0)
  float w1 = p1 < 0.32
    ? smoothstep(0.0, 0.32, p1)
    : pow(1.0 - (p1 - 0.32) / 0.68, 1.45);

  float p2 = fract(time * 0.093 + 0.47 - cos(x * 0.13 + 1.2) * 0.15);
  float w2 = p2 < 0.30
    ? smoothstep(0.0, 0.30, p2)
    : pow(1.0 - (p2 - 0.30) / 0.70, 1.55);

  return (w1 * 0.68 + w2 * 0.42) * 1.35;
}

// Wetness persistence memory: lags behind the receding swash so exposed sand stays dark & reflective
float swashWetnessReach(float x, float time) {
  float currentReach = swashSurgeOffset(x, time);
  float delayed1 = swashSurgeOffset(x, time - 1.35) * 0.94;
  float delayed2 = swashSurgeOffset(x, time - 2.85) * 0.86;
  return max(currentReach, max(delayed1, delayed2)) + 0.28;
}
`;

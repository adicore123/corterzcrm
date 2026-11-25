import * as THREE from "three";

/**
 * Centralized 3D Scene Configuration (scene.config.ts)
 * Every tunable parameter for the CORTEZ Mediterranean Launch Edition 3D stage lives here:
 * - Linear-converted sRGB color palettes for water depth zones, dry/wet sand, sky, and fog
 * - Calm Mediterranean Gerstner wave spectrum (3-12 cm amplitude, 2-10 m wavelength)
 * - Swash cycle timing (7.5 s period)
 * - Lighting moods ("daylight" = שמש ים־תיכונית, "golden" = זווית שמש וים / Golden Hour)
 * - Camera presets, FOV, azimuth limits (±18 deg for cutout rig), and idle auto-orbit timing
 */

export function srgbToLinearVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return new THREE.Vector3(c.r, c.g, c.b);
}

export function srgbToLinearColor(hex: string): THREE.Color {
  return new THREE.Color(hex).convertSRGBToLinear();
}

export const SCENE_CONFIG = {
  brand: {
    primaryRed: "#bf1619",
    deepSeaInk: "#0B2433",
    warmIvory: "#FAF6EE",
    warmSandSurface: "#F2EADB",
  },

  /**
   * A. WATER — Clear Mediterranean, calm day
   * Depth-driven Beer-Lambert absorption colors (sRGB hex, converted to Linear RGB for GLSL uniforms):
   * - waterline 0–0.2 m: nearly transparent, faint aqua #BFEDE6
   * - shallows 0.2–1.5 m: turquoise #46C6C2 -> #22A9B5
   * - mid 1.5–6 m: #1688A8
   * - deep/far: #0B5D86 -> #0A4466
   */
  water: {
    waterlineHex: "#BFEDE6",
    shallowNearHex: "#46C6C2",
    shallowFarHex: "#22A9B5",
    midHex: "#1688A8",
    deepNearHex: "#0B5D86",
    deepFarHex: "#0A4466",
    crestSssHex: "#36C9BE",
    foamBrightHex: "#FCFBF7",
    foamShadowHex: "#C9DCE0",
    fresnelF0: 0.02,
    swashPeriodSec: 7.6,
    absorptionK: 0.68,
    /**
     * 4 calm Mediterranean Gerstner waves + 4 fine cross-swell harmonics
     * Amplitudes in meters (0.03m - 0.11m), wavelengths 2.2m - 10.5m
     */
    gerstnerWaves: [
      { dir: [0.06, 0.998], steepness: 0.24, wavelength: 9.8, amplitude: 0.105 },
      { dir: [-0.18, 0.984], steepness: 0.21, wavelength: 6.4, amplitude: 0.072 },
      { dir: [0.22, 0.975], steepness: 0.18, wavelength: 4.1, amplitude: 0.046 },
      { dir: [-0.09, 0.996], steepness: 0.16, wavelength: 2.6, amplitude: 0.030 },
    ],
  },

  /**
   * B. SAND — Fine, pale, warm Mediterranean sand
   * - Dry: #E9D5AE (light warm beige, roughness 0.92)
   * - Wet: #B79B6E (darker, more saturated, roughness 0.28, reflecting sky)
   * - Saturated waterline film: #9C8056
   */
  sand: {
    dryHex: "#E9D5AE",
    dryCrestHex: "#F1E1C2",
    wetHex: "#B79B6E",
    wetSaturatedHex: "#9A7E54",
    dryRoughness: 0.92,
    wetRoughness: 0.28,
    tireTrackWidthM: 0.078, // ~7.8 cm fat-tire tread width
    tireSinkDepthM: 0.016, // 1.6 cm sink into sand
    tireRimHeightM: 0.007, // displaced sand rim
  },

  /**
   * C. SKY, SUN & LIGHT MOODS
   * Smoothly interpolated over 1.6 seconds when switching presets/moods.
   * On the Israeli Mediterranean coast, the sun sets westward over the sea.
   */
  moods: {
    daylight: {
      id: "daylight" as const,
      label: "שמש ים־תיכונית",
      sunElevationDeg: 13.5,
      sunAzimuthDeg: 14.0, // West-northwest over the open sea (left side of frame)
      turbidity: 2.1,
      rayleigh: 1.15,
      mieCoefficient: 0.0011,
      mieDirectionalG: 0.78,
      exposure: 1.02,
      sunLightColor: "#FFF6E5",
      sunLightIntensity: 3.1,
      skyFillColor: "#BFE4F7",
      sandBounceColor: "#E9D5AE",
      hemiIntensity: 1.5,
      skyZenithHex: "#2F78B8",
      skyMidHex: "#6EB5DC",
      skyHorizonHex: "#E6EFF2",
      sunHaloHex: "#FFE6A3",
      sunCoronaHex: "#FFB95E",
    },
    golden: {
      id: "golden" as const,
      label: "שעת שקיעה זהובה",
      sunElevationDeg: 9.2,
      sunAzimuthDeg: 16.5,
      turbidity: 3.5,
      rayleigh: 1.92,
      mieCoefficient: 0.0024,
      mieDirectionalG: 0.84,
      exposure: 1.06,
      sunLightColor: "#FFD89E",
      sunLightIntensity: 3.35,
      skyFillColor: "#C8DCF0",
      sandBounceColor: "#DFBE8F",
      hemiIntensity: 1.45,
      skyZenithHex: "#275E96",
      skyMidHex: "#7DA4C8",
      skyHorizonHex: "#F4DEC0",
      sunHaloHex: "#FFC470",
      sunCoronaHex: "#F78838",
    },
  },

  /**
   * D & E. CAMERA, MOTION & BIKE RIG LIMITS
   */
  camera: {
    desktopFov: 29,
    mobilePortraitFov: 34,
    near: 0.1,
    far: 520,
    minHeightAboveSand: 0.38,
    // Limit cutout azimuth orbit to ±18 deg (~0.31 rad) so the 2.5D plane is never viewed edge-on
    maxCutoutAzimuthRad: THREE.MathUtils.degToRad(18),
    entranceDurationSec: 2.2,
    presetTransitionSec: 1.45,
    idleAutoOrbitDelaySec: 6.0,
    idleAutoOrbitSpeedRad: 0.28,
    moodTransitionSec: 1.6,
  },
} as const;

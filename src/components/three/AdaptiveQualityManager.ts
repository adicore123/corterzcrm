export type GraphicsQualityProfile = "ULTRA" | "BALANCED" | "LITE";

export interface QualitySettings {
  profile: GraphicsQualityProfile;
  shaderQuality: number; // 2.0 = ULTRA, 1.0 = BALANCED, 0.0 = LITE
  maxPixelRatio: number;
  oceanSegments: [number, number];
  sandSegments: [number, number];
}

export const QUALITY_PROFILES: Record<GraphicsQualityProfile, QualitySettings> = {
  ULTRA: {
    profile: "ULTRA",
    shaderQuality: 2.0,
    maxPixelRatio: 1.65,
    oceanSegments: [160, 140],
    sandSegments: [120, 96],
  },
  BALANCED: {
    profile: "BALANCED",
    shaderQuality: 1.0,
    maxPixelRatio: 1.3,
    oceanSegments: [112, 96],
    sandSegments: [84, 68],
  },
  LITE: {
    profile: "LITE",
    shaderQuality: 0.0,
    maxPixelRatio: 1.0,
    oceanSegments: [72, 64],
    sandSegments: [56, 48],
  },
};

export function detectInitialQualityProfile(isMobileViewport: boolean): GraphicsQualityProfile {
  if (typeof window === "undefined") return "BALANCED";
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory || 4;
  if (isMobileViewport) {
    return cores >= 6 && memory >= 4 ? "BALANCED" : "LITE";
  }
  if (cores >= 8 && memory >= 8) return "ULTRA";
  if (cores >= 4) return "BALANCED";
  return "LITE";
}

/**
 * Rolling frame-time monitor with hysteresis cooldown to prevent constant quality switching.
 */
export class AdaptiveQualityManager {
  private current: GraphicsQualityProfile;
  private frameTimes: number[] = [];
  private lastSwitchTime = 0;
  private readonly cooldownMs = 4500;
  private readonly sampleSize = 45;

  constructor(initial: GraphicsQualityProfile) {
    this.current = initial;
  }

  getProfile(): GraphicsQualityProfile {
    return this.current;
  }

  getSettings(): QualitySettings {
    return QUALITY_PROFILES[this.current];
  }

  recordFrame(deltaMs: number, nowMs: number): GraphicsQualityProfile | null {
    if (deltaMs <= 0 || deltaMs > 250) return null;
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length < this.sampleSize) return null;

    const avgMs = this.frameTimes.reduce((sum, v) => sum + v, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;

    if (nowMs - this.lastSwitchTime < this.cooldownMs) return null;

    // Downgrade if average frame time exceeds threshold (~28 FPS / 35ms for ULTRA, ~22 FPS / 45ms for BALANCED)
    if (this.current === "ULTRA" && avgMs > 34) {
      this.current = "BALANCED";
      this.lastSwitchTime = nowMs;
      return this.current;
    }
    if (this.current === "BALANCED" && avgMs > 44) {
      this.current = "LITE";
      this.lastSwitchTime = nowMs;
      return this.current;
    }
    // Upgrade cautiously only if sustained frame time is well under budget
    if (this.current === "BALANCED" && avgMs < 15.2 && this.lastSwitchTime > 0) {
      this.current = "ULTRA";
      this.lastSwitchTime = nowMs;
      return this.current;
    }
    return null;
  }
}

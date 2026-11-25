import { shorelineCommonGlsl } from "./shoreline.glsl";

/**
 * Multi-directional Trochoidal Gerstner Ocean Vertex Shader with Bathymetric Shoaling.
 * Combines up to 8 independent wave trains (large swells, medium wind waves, short chop)
 * with depth-dependent amplitude attenuation and shallow-water wavelength compression.
 */
export const oceanVertexShader = /* glsl */ `
uniform float uTime;
uniform float uQuality; // 2.0 = ULTRA (8 waves), 1.0 = BALANCED (6 waves), 0.0 = LITE (4 waves)

varying vec3 vWorldPos;
varying vec3 vMacroNormal;
varying float vWaterDepth;
varying float vCrestFactor;
varying float vSwashEdge;

${shorelineCommonGlsl}

struct WaveTrain {
  vec2 dir;
  float steepness;
  float wavelength;
  float speedScale;
};

void accumulateGerstner(
  WaveTrain w,
  vec2 sampleXZ,
  float depthAtten,
  float shoalCompress,
  inout vec3 disp,
  inout vec3 tangent,
  inout vec3 binormal,
  inout float crestSum
) {
  vec2 d = normalize(w.dir);
  float k = (6.2831853 / w.wavelength) * shoalCompress;
  float c = sqrt(9.81 / max(k, 0.05)) * w.speedScale;
  float a = (w.steepness / k) * depthAtten;
  float phase = k * (dot(d, sampleXZ) - c * uTime);
  float s = sin(phase);
  float co = cos(phase);

  disp.x += d.x * (a * co);
  disp.y += a * s;
  disp.z += d.y * (a * co);

  float wa = k * a;
  tangent += vec3(
    -d.x * d.x * wa * s,
    d.x * wa * co,
    -d.x * d.y * wa * s
  );
  binormal += vec3(
    -d.x * d.y * wa * s,
    d.y * wa * co,
    -d.y * d.y * wa * s
  );
  crestSum += max(0.0, s) * wa;
}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;

  float bedY = coastalTerrainHeight(xz);
  float surgeReach = swashSurgeOffset(xz.x, uTime);
  // Mean water level rises slightly at the active swash front so water advances up the beach slope
  float shoreDist = signedShoreDistance(xz);
  float swashLift = smoothstep(surgeReach + 0.55, -0.6, shoreDist) * 0.16;
  float baseWaterY = 0.02 + swashLift;
  float rawDepth = baseWaterY - bedY;

  // Depth-based wave attenuation: waves calm smoothly as water thins to zero on the beach
  float depthAtten = smoothstep(0.01, 1.35, rawDepth);
  // Shallow-water wave compression (waves shorten and align toward shore as depth decreases)
  float shoalCompress = mix(1.55, 1.0, smoothstep(0.15, 2.8, rawDepth));

  vec3 disp = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crestSum = 0.0;

  // Large offshore Mediterranean swells (incommensurate wavelengths prevent loop repetition)
  accumulateGerstner(WaveTrain(vec2(0.16, 0.98), 0.14, 15.7, 1.00), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
  accumulateGerstner(WaveTrain(vec2(-0.24, 0.97), 0.12, 11.3, 0.94), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
  accumulateGerstner(WaveTrain(vec2(0.35, 0.93), 0.09, 7.9, 1.05), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
  accumulateGerstner(WaveTrain(vec2(-0.11, 0.99), 0.08, 5.3, 0.98), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);

  if (uQuality >= 0.9) {
    // Medium wind-driven coastal waves
    accumulateGerstner(WaveTrain(vec2(0.46, 0.89), 0.07, 3.4, 1.08), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
    accumulateGerstner(WaveTrain(vec2(-0.39, 0.92), 0.06, 2.3, 1.03), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
  }
  if (uQuality >= 1.8) {
    // Fine surface chop
    accumulateGerstner(WaveTrain(vec2(0.62, 0.78), 0.045, 1.45, 1.12), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
    accumulateGerstner(WaveTrain(vec2(-0.55, 0.83), 0.040, 0.97, 1.15), xz, depthAtten, shoalCompress, disp, tangent, binormal, crestSum);
  }

  vec3 finalWorld = vec3(xz.x + disp.x, baseWaterY + disp.y, xz.y + disp.z);
  vWorldPos = finalWorld;
  vMacroNormal = normalize(cross(binormal, tangent));
  vWaterDepth = finalWorld.y - coastalTerrainHeight(finalWorld.xz);
  vCrestFactor = crestSum;
  // Leading edge of the advancing swash sheet
  vSwashEdge = 1.0 - smoothstep(-0.15, 0.42, shoreDist - surgeReach * 0.72);

  gl_Position = projectionMatrix * viewMatrix * vec4(finalWorld, 1.0);
}
`;

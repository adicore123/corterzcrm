import { shorelineCommonGlsl } from "./shoreline.glsl";

/**
 * Calm Mediterranean Gerstner Ocean Vertex Shader (V3).
 * - 4 primary Gerstner swells (amplitude 3-11 cm, wavelength 2.6-9.8 m) + 2 fine harmonics
 * - Exact bathymetric depth = waterSurfaceY - coastalTerrainHeight(xz)
 * - Shoaling attenuation as waves approach the 0-0.2m waterline
 */
export const oceanVertexShader = /* glsl */ `
uniform float uTime;
uniform float uQuality;

varying vec3 vWorldPos;
varying vec3 vMacroNormal;
varying float vWaterDepth;
varying float vCrestFactor;
varying float vSwashEdge;

${shorelineCommonGlsl}

struct GerstnerWave {
  vec2 dir;
  float steepness;
  float wavelength;
  float amplitude;
  float speed;
};

void accumulateGerstner(
  GerstnerWave w,
  vec2 posXZ,
  float time,
  float atten,
  inout vec3 offset,
  inout vec3 tangent,
  inout vec3 binormal,
  inout float crestAccum
) {
  float k = 6.2831853 / w.wavelength;
  float c = sqrt(9.81 / k) * w.speed;
  vec2 d = normalize(w.dir);
  float a = w.amplitude * atten;
  float q = clamp(w.steepness, 0.0, 0.45);

  float theta = k * dot(d, posXZ) - c * k * time;
  float s = sin(theta);
  float co = cos(theta);

  offset.x += d.x * (q * a * co);
  offset.y += a * s;
  offset.z += d.y * (q * a * co);

  float wa = k * a;
  tangent += vec3(
    -d.x * d.x * (q * wa * s),
    d.x * (wa * co),
    -d.x * d.y * (q * wa * s)
  );
  binormal += vec3(
    -d.x * d.y * (q * wa * s),
    d.y * (wa * co),
    -d.y * d.y * (q * wa * s)
  );

  crestAccum += max(0.0, s) * a;
}

void main() {
  vec4 worldBase = modelMatrix * vec4(position, 1.0);
  vec2 xz = worldBase.xz;

  float sandY = coastalTerrainHeight(xz);
  float swashZ = swashSurgeOffset(xz.x, uTime);
  float meanWaterLevel = 0.035 + max(0.0, swashZ) * 0.075 * exp(-abs(signedShoreDistance(xz)) * 0.45);
  float rawDepth = max(0.0, meanWaterLevel - sandY);

  // Smooth wave attenuation in the 0-0.5m shallows
  float depthAtten = smoothstep(0.015, 0.95, rawDepth);
  float shoalBoost = 1.0 + 0.25 * exp(-pow((rawDepth - 0.42) / 0.32, 2.0));
  float atten = depthAtten * shoalBoost;

  vec3 offset = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crestAccum = 0.0;

  // 4 calm Mediterranean Gerstner waves (3cm - 10.5cm amplitude, 2.6m - 9.8m wavelength)
  GerstnerWave w0 = GerstnerWave(vec2(0.06, 0.998), 0.22, 9.8, 0.088, 0.72);
  GerstnerWave w1 = GerstnerWave(vec2(-0.18, 0.984), 0.19, 6.4, 0.058, 0.68);
  GerstnerWave w2 = GerstnerWave(vec2(0.22, 0.975), 0.17, 4.1, 0.036, 0.74);
  GerstnerWave w3 = GerstnerWave(vec2(-0.09, 0.996), 0.15, 2.6, 0.024, 0.70);

  accumulateGerstner(w0, xz, uTime, atten, offset, tangent, binormal, crestAccum);
  accumulateGerstner(w1, xz, uTime, atten, offset, tangent, binormal, crestAccum);
  accumulateGerstner(w2, xz, uTime, atten, offset, tangent, binormal, crestAccum);
  accumulateGerstner(w3, xz, uTime, atten, offset, tangent, binormal, crestAccum);

  if (uQuality >= 0.9) {
    GerstnerWave w4 = GerstnerWave(vec2(0.32, 0.94), 0.13, 1.85, 0.014, 0.80);
    GerstnerWave w5 = GerstnerWave(vec2(-0.28, 0.96), 0.12, 1.35, 0.010, 0.82);
    accumulateGerstner(w4, xz, uTime, atten, offset, tangent, binormal, crestAccum);
    accumulateGerstner(w5, xz, uTime, atten, offset, tangent, binormal, crestAccum);
  }

  vec3 displaced = vec3(xz.x + offset.x, meanWaterLevel + offset.y, xz.y + offset.z);
  vec3 macroN = normalize(cross(binormal, tangent));
  if (macroN.y < 0.0) macroN = -macroN;

  vWorldPos = displaced;
  vMacroNormal = macroN;
  vWaterDepth = displaced.y - sandY;
  vCrestFactor = clamp(crestAccum * 5.2, 0.0, 1.0);
  vSwashEdge = swashZ;

  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
`;

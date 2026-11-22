// Real-time 3D Procedural Mediterranean Beach Shaders
// Includes: 3D Sky Dome with In-Frame Sun & God-Rays, 3D Gerstner Ocean Waves & Surf Foam,
// 3D Sculpted Wet/Dry Sand Terrain with Palm Frond Shadows, 3D Kurkar Sandstone Cliffs,
// Wet-Sand Vehicle Mirror Reflection, Sun-Vector Projected Silhouette Shadow & Rim-Lit Product Shader.

export const skyDomeVertex = `
varying vec3 vWorldPos;
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const skyDomeFragment = `
uniform vec3 uSunDir;
uniform float uSeconds;
uniform float uWarmth;
uniform float uDusk;
varying vec3 vWorldPos;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbmClouds(vec2 p) {
  float v = 0.0;
  float a = 0.52;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p = rot * p * 2.05;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 sunDir = normalize(uSunDir);
  float sunCos = clamp(dot(dir, sunDir), 0.0, 1.0);

  // 1. Rich Mediterranean Atmospheric Sky Palette (Controlled Exposure - Never Blown Out)
  vec3 dayZenith = vec3(0.08, 0.36, 0.64);
  vec3 dayMid = vec3(0.22, 0.56, 0.80);
  vec3 dayHorizon = vec3(0.64, 0.84, 0.92);

  vec3 goldZenith = vec3(0.14, 0.22, 0.44);
  vec3 goldMid = vec3(0.62, 0.34, 0.28);
  vec3 goldHorizon = vec3(0.96, 0.56, 0.26);

  vec3 duskZenith = vec3(0.03, 0.06, 0.16);
  vec3 duskMid = vec3(0.11, 0.16, 0.32);
  vec3 duskHorizon = vec3(0.28, 0.22, 0.38);

  vec3 zenith = mix(mix(dayZenith, goldZenith, uWarmth), duskZenith, uDusk);
  vec3 midSky = mix(mix(dayMid, goldMid, uWarmth), duskMid, uDusk);
  vec3 horizon = mix(mix(dayHorizon, goldHorizon, uWarmth), duskHorizon, uDusk);

  vec3 sky = mix(horizon, midSky, smoothstep(0.0, 0.18, elev));
  sky = mix(sky, zenith, smoothstep(0.15, 0.58, elev));

  // Warm solar horizon scatter around the sun azimuth
  float sunHorizGlow = pow(max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z)))), 3.0);
  vec3 scatterColor = mix(vec3(0.95, 0.88, 0.68), vec3(1.0, 0.46, 0.14), uWarmth);
  scatterColor = mix(scatterColor, vec3(0.45, 0.22, 0.36), uDusk);
  sky += scatterColor * sunHorizGlow * exp(-elev * 7.5) * mix(0.22, 0.48, uWarmth);

  // 2. Sculptural 3D Cumulus & Cirrus Clouds in the Sky Dome
  if (dir.y > 0.01) {
    vec2 cloudUv = dir.xz / (dir.y + 0.14) * 1.35;
    cloudUv.x += uSeconds * 0.014;
    cloudUv.y -= uSeconds * 0.006;
    float cBase = fbmClouds(cloudUv);
    float cDetail = fbmClouds(cloudUv * 2.35 + vec2(4.2, -1.8));
    float density = smoothstep(0.46, 0.76, cBase * 0.72 + cDetail * 0.28);
    float cloudBand = smoothstep(0.015, 0.12, elev) * (1.0 - smoothstep(0.32, 0.62, elev));
    float cloudMask = density * cloudBand;

    vec3 cloudTop = mix(vec3(0.98, 0.97, 0.94), vec3(1.0, 0.72, 0.42), uWarmth);
    cloudTop = mix(cloudTop, vec3(0.34, 0.38, 0.55), uDusk);

    vec3 cloudBase = mix(vec3(0.54, 0.68, 0.80), vec3(0.48, 0.26, 0.28), uWarmth);
    cloudBase = mix(cloudBase, vec3(0.10, 0.13, 0.24), uDusk);

    float silverLining = pow(sunCos, 5.0) * 0.55;
    vec3 cloudCol = mix(cloudBase, cloudTop, smoothstep(0.42, 0.74, cBase) + silverLining);
    sky = mix(sky, cloudCol, cloudMask * 0.78);
  }

  // 3. Distinct In-Frame Solar Disc, Inner Corona & Crepuscular God-Rays
  float angleToSun = acos(clamp(sunCos, -1.0, 1.0));
  float sunDisc = 1.0 - smoothstep(0.018, 0.026, angleToSun);
  float innerCorona = exp(-angleToSun * 18.0) * 0.52;
  float outerGlow = exp(-angleToSun * 4.8) * 0.22;

  // Subtle volumetric crepuscular rays radiating from the 3D sun
  vec2 sunScreenDelta = dir.xy - sunDir.xy;
  float rayAngle = atan(sunScreenDelta.y, sunScreenDelta.x);
  float godRays = pow(max(0.0, sin(rayAngle * 7.0 + uSeconds * 0.18)), 4.0) * exp(-angleToSun * 5.5) * smoothstep(0.0, 0.28, elev) * 0.16;

  vec3 coronaColor = mix(vec3(1.0, 0.92, 0.70), vec3(1.0, 0.52, 0.16), uWarmth);
  coronaColor = mix(coronaColor, vec3(0.52, 0.66, 0.95), uDusk);
  vec3 discColor = mix(vec3(1.0, 0.99, 0.92), vec3(1.0, 0.86, 0.58), uWarmth);

  float duskVis = 1.0 - uDusk * 0.78;
  sky += (coronaColor * (innerCorona + outerGlow + godRays) + discColor * sunDisc * 0.95) * duskVis;

  // Soft filmic shoulder so sky highlights never clip to flat white
  sky = sky / (1.0 + sky * 0.22);

  gl_FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export const oceanGerstnerVertex = `
uniform float uSeconds;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoamCrest;
varying float vShoal;

vec3 gerstnerWave(vec4 wave, vec3 p, float time, float shoal, inout vec3 tangent, inout vec3 binormal) {
  float steepness = wave.z * shoal;
  float wavelength = wave.w;
  float k = 6.2831853 / wavelength;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(wave.xy);
  float f = k * (dot(d, p.xz) - c * time);
  float a = steepness / k;

  tangent += vec3(
    -d.x * d.x * (steepness * sin(f)),
    d.x * (steepness * cos(f)),
    -d.x * d.y * (steepness * sin(f))
  );
  binormal += vec3(
    -d.x * d.y * (steepness * sin(f)),
    d.y * (steepness * cos(f)),
    -d.y * d.y * (steepness * sin(f))
  );
  return vec3(
    d.x * (a * cos(f)),
    a * sin(f),
    d.y * (a * cos(f))
  );
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 gridPoint = wp.xyz;

  // Shoreline sits right behind the bike at z = -0.85m
  float distFromShore = max(0.0, -0.75 - gridPoint.z);
  float shoal = smoothstep(0.0, 6.5, distFromShore);
  vShoal = shoal;

  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 p = gridPoint;

  // 4 layered directional 3D Gerstner waves rolling toward the beach (+z)
  p += gerstnerWave(vec4(0.10, 0.99, 0.18, 10.5), gridPoint, uSeconds * 1.08, shoal, tangent, binormal);
  p += gerstnerWave(vec4(-0.22, 0.96, 0.14, 6.2), gridPoint, uSeconds * 1.22, shoal, tangent, binormal);
  p += gerstnerWave(vec4(0.28, 0.94, 0.10, 3.6), gridPoint, uSeconds * 1.35, shoal, tangent, binormal);
  p += gerstnerWave(vec4(-0.14, 0.98, 0.07, 2.0), gridPoint, uSeconds * 1.48, shoal, tangent, binormal);

  // Rhythmic 3D shoreline breaker surge
  float breakerZone = exp(-pow((distFromShore - 1.65) * 1.1, 2.0));
  float breakerLift = max(0.0, sin(uSeconds * 1.55 - distFromShore * 2.1 + gridPoint.x * 0.18)) * 0.14 * breakerZone;
  p.y += breakerLift;

  vNormal = normalize(cross(binormal, tangent));
  vWorldPos = p;
  vFoamCrest = clamp((p.y - gridPoint.y) * 3.6 + breakerLift * 4.5, 0.0, 1.0);

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const oceanGerstnerFragment = `
uniform vec3 uSunDir;
uniform float uSeconds;
uniform float uWarmth;
uniform float uDusk;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoamCrest;
varying float vShoal;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.17);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 sunDir = normalize(uSunDir);

  // Multi-octave 3D water surface ripple normals
  vec2 uvA = vWorldPos.xz * 0.72 + vec2(uSeconds * 0.24, -uSeconds * 0.52);
  vec2 uvB = vWorldPos.xz * 1.55 + vec2(-uSeconds * 0.34, -uSeconds * 0.68);
  float nA = noise2(uvA) - 0.5;
  float nB = noise2(uvB) - 0.5;
  float swellRipple = sin(vWorldPos.x * 2.2 + vWorldPos.z * 6.4 - uSeconds * 3.4) * 0.18;

  vec3 microNormal = normalize(vec3(nA * 0.22 + nB * 0.14, 1.0, nA * 0.28 + nB * 0.18 + swellRipple));
  vec3 N = normalize(mix(vNormal, microNormal, 0.52));

  // Curved natural shoreline distance
  float shoreCurve = -0.75 + sin(vWorldPos.x * 0.16) * 0.32 + sin(vWorldPos.x * 0.42 + uSeconds * 1.2) * 0.22;
  float distFromShore = max(0.0, shoreCurve - vWorldPos.z);
  float depthFactor = clamp(distFromShore / 22.0, 0.0, 1.0);

  // Beer-Lambert Mediterranean color palette (Vibrant Turquoise Shallows -> Deep Teal -> Cobalt Horizon)
  vec3 shallowDay = vec3(0.11, 0.72, 0.70);
  vec3 midDay = vec3(0.03, 0.40, 0.56);
  vec3 deepDay = vec3(0.02, 0.15, 0.30);

  vec3 shallowGold = vec3(0.18, 0.54, 0.52);
  vec3 midGold = vec3(0.08, 0.26, 0.38);
  vec3 deepGold = vec3(0.04, 0.10, 0.22);

  vec3 shallowDusk = vec3(0.06, 0.24, 0.34);
  vec3 midDusk = vec3(0.03, 0.12, 0.23);
  vec3 deepDusk = vec3(0.01, 0.05, 0.12);

  vec3 shallow = mix(mix(shallowDay, shallowGold, uWarmth), shallowDusk, uDusk);
  vec3 mid = mix(mix(midDay, midGold, uWarmth), midDusk, uDusk);
  vec3 deep = mix(mix(deepDay, deepGold, uWarmth), deepDusk, uDusk);

  vec3 waterBase = mix(shallow, mid, smoothstep(0.0, 0.30, depthFactor));
  waterBase = mix(waterBase, deep, smoothstep(0.25, 1.0, depthFactor));

  // Subsurface scattering inside curling turquoise wave crests
  float sss = pow(max(0.0, dot(viewDir, -sunDir + vec3(0.0, 0.35, 0.0))), 2.5) * (0.35 + 0.65 * vFoamCrest) * (1.0 - uDusk * 0.7);
  vec3 sssColor = mix(vec3(0.16, 0.85, 0.72), vec3(0.95, 0.55, 0.22), uWarmth * 0.6);
  waterBase += sssColor * sss * 0.38;

  // Schlick Fresnel Reflection
  float NoV = max(0.001, dot(N, viewDir));
  float fresnel = pow(1.0 - NoV, 3.6);
  vec3 skyReflDay = vec3(0.46, 0.74, 0.88);
  vec3 skyReflGold = vec3(0.92, 0.54, 0.28);
  vec3 skyReflDusk = vec3(0.14, 0.20, 0.36);
  vec3 skyRefl = mix(mix(skyReflDay, skyReflGold, uWarmth), skyReflDusk, uDusk);

  vec3 color = mix(waterBase, skyRefl, clamp(fresnel * 0.68, 0.0, 0.76));

  // Sparkling 3D Sun Path across the Gerstner Waves
  vec3 H = normalize(sunDir + viewDir);
  float NoH = max(0.0, dot(N, H));
  float specBroad = pow(NoH, 36.0) * 0.42;
  float specSparkle = pow(NoH, 240.0) * 2.4;
  vec3 sunGlint = mix(vec3(1.0, 0.94, 0.76), vec3(1.0, 0.56, 0.18), uWarmth);
  sunGlint = mix(sunGlint, vec3(0.50, 0.66, 0.96), uDusk);
  color += sunGlint * (specBroad + specSparkle);

  // 3D Breaking Surf Rollers & Shoreline Seafoam Lace
  float foamNoise = noise2(vWorldPos.xz * 2.6 + vec2(0.0, -uSeconds * 0.9)) * 0.6 + noise2(vWorldPos.xz * 6.8 + uSeconds * 0.45) * 0.4;
  float shoreSwash = 1.0 - smoothstep(0.0, 1.35, distFromShore);
  float roller1 = exp(-pow((distFromShore - (1.45 + sin(uSeconds * 1.5 + vWorldPos.x * 0.22) * 0.55)) * 2.5, 2.0));
  float roller2 = exp(-pow((distFromShore - (3.9 + cos(uSeconds * 1.2 - vWorldPos.x * 0.16) * 0.75)) * 1.7, 2.0));
  float roller3 = exp(-pow((distFromShore - (7.4 + sin(uSeconds * 0.95 + vWorldPos.x * 0.12) * 0.9)) * 1.2, 2.0));
  float crestFoam = smoothstep(0.42, 0.85, vFoamCrest * foamNoise * 1.55);

  float totalFoam = clamp(
    shoreSwash * smoothstep(0.20, 0.68, foamNoise + 0.30)
    + roller1 * smoothstep(0.28, 0.72, foamNoise + 0.12) * 0.95
    + roller2 * smoothstep(0.32, 0.76, foamNoise + 0.05) * 0.72
    + roller3 * smoothstep(0.38, 0.82, foamNoise) * 0.48
    + crestFoam * 0.68,
    0.0,
    1.0
  );

  vec3 foamColor = mix(vec3(0.96, 0.98, 0.99), vec3(0.99, 0.82, 0.64), uWarmth * 0.72);
  foamColor = mix(foamColor, vec3(0.48, 0.58, 0.76), uDusk);
  color = mix(color, foamColor, totalFoam * 0.92);

  // Distant horizon mist
  float horizonFog = smoothstep(38.0, 125.0, abs(vWorldPos.z));
  color = mix(color, skyRefl, horizonFog * 0.75);

  // Soft shoreline alpha blending onto the wet 3D sand
  float shoreAlpha = smoothstep(-0.25, 0.65, distFromShore + totalFoam * 0.45);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), shoreAlpha);
  #include <colorspace_fragment>
}
`;

export const beachTerrainVertex = `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

float sandElevation(vec2 xz) {
  // Smoothly slopes into the shallow sea for z < -0.7, level firm beach terrace at z = -0.3 .. +2.5, coastal dunes behind
  float seaSlope = smoothstep(-8.0, -0.4, xz.y) * 1.38 - 1.19;
  float microDune = sin(xz.x * 0.35 + xz.y * 0.45) * 0.014 * smoothstep(-0.2, 2.0, xz.y);
  float backDune = smoothstep(3.2, 22.0, xz.y) * (0.85 + 0.42 * sin(xz.x * 0.14) + 0.28 * cos(xz.x * 0.27 - xz.y * 0.11)) * 1.65;
  return seaSlope + microDune + backDune;
}

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = sandElevation(wp.xz);
  wp.y = h;

  float eps = 0.22;
  float hx = sandElevation(wp.xz + vec2(eps, 0.0)) - h;
  float hz = sandElevation(wp.xz + vec2(0.0, eps)) - h;
  vNormal = normalize(vec3(-hx / eps, 1.0, -hz / eps));
  vWorldPos = wp.xyz;

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const beachTerrainFragment = `
uniform vec3 uSunDir;
uniform float uSeconds;
uniform float uWarmth;
uniform float uDusk;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(234.12, 543.89));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// Procedural dappled 3D palm frond shadow projected onto the beach sand
float palmShadowMask(vec2 xz, float time) {
  float bayX = mod(xz.x + 6.0, 12.0) - 6.0;
  float mask = 0.0;
  // Left & right framing palm canopy shadow projections on the foreground sand
  for (int side = 0; side < 2; side++) {
    vec2 center = side == 0 ? vec2(-2.95, 0.85) : vec2(3.15, 0.65);
    vec2 rel = vec2(bayX, xz.y) - center;
    float r = length(rel);
    if (r < 2.35) {
      float ang = atan(rel.y, rel.x) + sin(time * 1.25 + float(side) * 2.0) * 0.04;
      float fronds = smoothstep(0.25, 0.75, sin(ang * 9.0 + r * 2.2));
      float leaflets = smoothstep(0.1, 0.8, sin(r * 26.0 - ang * 4.0));
      float falloff = (1.0 - smoothstep(0.35, 2.25, r)) * smoothstep(0.08, 0.32, r);
      mask = max(mask, fronds * (0.65 + 0.35 * leaflets) * falloff);
    }
  }
  return mask * 0.28;
}

void main() {
  vec3 sunDir = normalize(uSunDir);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // Sculpted wind-rippled sand normals & fine quartz grain
  float ripplePhase = vWorldPos.x * 2.8 + vWorldPos.z * 9.5 + noise2(vWorldPos.xz * 0.85) * 2.8;
  float ripple = sin(ripplePhase) * 0.048;
  float grain = (noise2(vWorldPos.xz * 22.0) - 0.5) * 0.055;
  vec3 N = normalize(vNormal + vec3(ripple + grain, 0.0, ripple * 1.45 - grain));

  // Wetness gradient right behind the vehicle (z = -1.6 .. +0.75)
  float swashLine = -0.68 + sin(vWorldPos.x * 0.16) * 0.28 + sin(vWorldPos.x * 0.42 + uSeconds * 1.2) * 0.20;
  float wetness = 1.0 - smoothstep(swashLine - 0.15, swashLine + 1.45, vWorldPos.z);
  float waterEdgeFoam = exp(-pow((vWorldPos.z - (swashLine + 0.18)) * 5.5, 2.0)) * smoothstep(0.32, 0.78, noise2(vWorldPos.xz * 4.5 + uSeconds * 0.5));

  vec3 drySandDay = vec3(0.88, 0.76, 0.60);
  vec3 wetSandDay = vec3(0.52, 0.42, 0.32);

  vec3 drySandGold = vec3(0.90, 0.62, 0.40);
  vec3 wetSandGold = vec3(0.45, 0.28, 0.19);

  vec3 drySandDusk = vec3(0.28, 0.31, 0.42);
  vec3 wetSandDusk = vec3(0.14, 0.17, 0.25);

  vec3 drySand = mix(mix(drySandDay, drySandGold, uWarmth), drySandDusk, uDusk);
  vec3 wetSand = mix(mix(wetSandDay, wetSandGold, uWarmth), wetSandDusk, uDusk);
  vec3 baseSand = mix(drySand, wetSand, wetness);

  // Directional Sun + Sky Lighting + Dappled Palm Frond Shadows
  float NoL = max(0.2, dot(N, sunDir));
  float palmShade = 1.0 - palmShadowMask(vWorldPos.xz, uSeconds) * (1.0 - uDusk * 0.6);
  vec3 sunLight = mix(vec3(1.04, 0.98, 0.90), vec3(1.16, 0.74, 0.44), uWarmth);
  sunLight = mix(sunLight, vec3(0.52, 0.64, 0.90), uDusk);

  vec3 sandLit = baseSand * (0.40 + 0.64 * NoL * palmShade) * sunLight;

  // Wet sand mirror reflection of sky, turquoise water & sun path
  vec3 H = normalize(sunDir + viewDir);
  float wetSpec = pow(max(0.0, dot(N, H)), 56.0) * wetness * 0.75;
  float wetFresnel = pow(1.0 - max(0.0, dot(N, viewDir)), 3.2) * wetness * 0.55;
  vec3 skyMirror = mix(mix(vec3(0.45, 0.76, 0.88), vec3(0.95, 0.56, 0.30), uWarmth), vec3(0.16, 0.22, 0.40), uDusk);

  // Dry sand silica micro-sparkles in sunlight
  float sparkleNoise = hash21(floor(vWorldPos.xz * 46.0));
  float sparkle = step(0.985, sparkleNoise) * (1.0 - wetness) * pow(max(0.0, dot(N, H)), 10.0) * 0.42 * (1.0 - uDusk);

  vec3 color = mix(sandLit, skyMirror, wetFresnel) + sunLight * (wetSpec + sparkle);

  // Residual white foam trace on the wet sand swash line
  vec3 traceFoam = mix(vec3(0.94, 0.96, 0.98), vec3(0.96, 0.78, 0.60), uWarmth);
  color = mix(color, traceFoam, waterEdgeFoam * 0.55 * (1.0 - uDusk * 0.5));

  // Warm twilight coastal ambient glow around the vehicle bay
  float bayX = mod(vWorldPos.x + 6.0, 12.0) - 6.0;
  float distToBike = length(vec2(bayX * 0.55, vWorldPos.z - 0.1));
  float warmPool = exp(-distToBike * 0.65) * max(uWarmth * 0.25, uDusk * 0.75);
  color += vec3(1.0, 0.64, 0.26) * warmPool * 0.28;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export const cliffVertex = `
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const cliffFragment = `
uniform vec3 uSunDir;
uniform float uWarmth;
uniform float uDusk;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec3 N = normalize(vNormal);
  vec3 sunDir = normalize(uSunDir);
  float NoL = max(0.18, dot(N, sunDir));

  // Stratified Mediterranean kurkar sandstone layers + coastal scrub on flat tops
  float strata = 0.5 + 0.5 * sin(vWorldPos.y * 5.2 + vWorldPos.x * 0.45);
  vec3 rockA = vec3(0.76, 0.62, 0.44);
  vec3 rockB = vec3(0.62, 0.48, 0.34);
  vec3 scrub = vec3(0.32, 0.44, 0.26);

  vec3 base = mix(rockB, rockA, strata);
  float topMask = smoothstep(0.62, 0.88, N.y) * smoothstep(1.2, 3.2, vWorldPos.y);
  base = mix(base, scrub, topMask * 0.65);

  vec3 lightTint = mix(vec3(1.0, 0.96, 0.88), vec3(1.15, 0.72, 0.42), uWarmth);
  lightTint = mix(lightTint, vec3(0.42, 0.52, 0.76), uDusk);

  vec3 color = base * (0.36 + 0.68 * NoL) * lightTint;

  // Atmospheric distance haze blending cliff into the Mediterranean horizon
  float dist = length(vWorldPos.xz);
  float fog = smoothstep(16.0, 68.0, dist);
  vec3 fogCol = mix(mix(vec3(0.58, 0.80, 0.90), vec3(0.92, 0.58, 0.34), uWarmth), vec3(0.20, 0.24, 0.40), uDusk);
  color = mix(color, fogCol, fog * 0.58);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export const coastalProductVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const coastalProductFragment = `
uniform sampler2D uMap;
uniform vec2 uTexel;
uniform float uWarmth;
uniform float uDusk;
varying vec2 vUv;

void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.015) discard;

  // Detect sun-facing upper-left silhouette edge for realistic 3D coastal rim lighting
  vec2 sunStep = vec2(-2.6 * uTexel.x, 2.6 * uTexel.y);
  float outerAlpha = texture2D(uMap, clamp(vUv + sunStep, 0.0, 1.0)).a;
  float rim = clamp(texel.a - outerAlpha, 0.0, 1.0) * smoothstep(0.16, 0.88, vUv.y);

  // Warm sand bounce light on the lower 18% of tires and frame
  float sandBounce = (1.0 - smoothstep(0.0, 0.18, vUv.y)) * smoothstep(0.15, 0.8, texel.a);

  vec3 envTint = mix(vec3(1.0), vec3(1.07, 0.95, 0.85), uWarmth * 0.74);
  envTint = mix(envTint, vec3(0.84, 0.90, 1.05), uDusk * 0.72);

  vec3 rimColor = mix(vec3(0.12, 0.10, 0.065), vec3(0.30, 0.15, 0.05), uWarmth);
  rimColor = mix(rimColor, vec3(0.10, 0.16, 0.28), uDusk);

  vec3 bounceColor = mix(vec3(0.055, 0.044, 0.024), vec3(0.095, 0.058, 0.026), uWarmth);
  bounceColor = mix(bounceColor, vec3(0.04, 0.03, 0.02), uDusk);

  vec3 rgb = texel.rgb * envTint + rim * rimColor + sandBounce * bounceColor;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), texel.a);
  #include <colorspace_fragment>
}
`;

export const coastalShadowVertex = `
uniform vec2 uPhotoSize;
uniform float uWarmth;
uniform float uDusk;
varying vec2 vUv;
void main() {
  vUv = uv;
  float elevation = uv.y * uPhotoSize.y;
  // Project vehicle silhouette along the 3D sun vector onto the 3D beach sand plane (y = 0.195)
  float stretchX = mix(0.46, 0.88, uWarmth) + 0.14 * uDusk;
  float stretchZ = mix(0.52, 0.70, uWarmth) + 0.08 * uDusk;
  vec3 ground = vec3(position.x * uPhotoSize.x + stretchX * elevation, 0.195, stretchZ * elevation);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(ground, 1.0);
}
`;

export const coastalShadowFragment = `
uniform sampler2D uSilhouette;
uniform float uWarmth;
uniform float uDusk;
varying vec2 vUv;
void main() {
  float softness = mix(0.0018, 0.0044, max(uWarmth, uDusk));
  vec2 blur = vec2(softness + 0.0075 * vUv.y);
  float a = texture2D(uSilhouette, vUv).a * 0.36;
  a += texture2D(uSilhouette, vUv + blur).a * 0.16;
  a += texture2D(uSilhouette, vUv - blur).a * 0.16;
  a += texture2D(uSilhouette, vUv + vec2(blur.x, -blur.y)).a * 0.16;
  a += texture2D(uSilhouette, vUv + vec2(-blur.x, blur.y)).a * 0.16;

  vec3 dayShadow = vec3(0.12, 0.095, 0.068);
  vec3 warmShadow = vec3(0.16, 0.088, 0.048);
  vec3 duskShadow = vec3(0.05, 0.075, 0.13);
  vec3 color = mix(dayShadow, warmShadow, uWarmth);
  color = mix(color, duskShadow, uDusk);

  float opacity = mix(0.32, 0.27, uWarmth);
  opacity = mix(opacity, 0.20, uDusk);
  gl_FragColor = vec4(color, a * (opacity - 0.13 * vUv.y));
}
`;

export const contactShadowVertex = `
varying vec2 vPos;
void main() {
  vPos = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const contactShadowFragment = `
uniform float uWarmth;
uniform float uDusk;
varying vec2 vPos;
void main() {
  float s = exp(-4.0 * dot(vPos, vPos)) * (1.0 - smoothstep(0.68, 1.0, length(vPos)));
  vec3 color = mix(vec3(0.14, 0.10, 0.072), vec3(0.18, 0.095, 0.052), uWarmth);
  color = mix(color, vec3(0.05, 0.07, 0.12), uDusk);
  gl_FragColor = vec4(color, mix(0.28, 0.20, uDusk) * s);
}
`;

// Photorealistic Hybrid 3D Mediterranean Beach Shaders
// Combines depth-parallax photographic Mediterranean horizon & sea with real 3D Gerstner shoreline surf waves,
// 3D wet-sand mirror reflections, dappled 3D botanical palm frond shadows, directional sun rim lighting, and projected vehicle shadows.

export const coastalBackdropVertex = `
varying vec2 vScreenUv;
void main() {
  vScreenUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

export const coastalBackdropFragment = `
uniform sampler2D uPlate;
uniform vec2 uCrop;
uniform vec2 uDrift;
uniform float uSeconds;
uniform float uWarmth;
uniform float uDusk;
varying vec2 vScreenUv;

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
  vec2 p = (vScreenUv - 0.5) * uCrop + 0.5;
  // Multi-layer depth parallax: foreground sand shifts faster than mid-ocean and distant horizon
  float foreground = 1.0 - smoothstep(0.08, 0.62, p.y);
  p += uDrift * (0.16 + 0.84 * foreground);
  p.x -= (1.0 - uCrop.x) * 0.06;

  // Dynamic Mediterranean shoreline curve (~y=0.255 left rising to ~0.405 right)
  float shore = 0.255 + 0.15 * p.x + 0.009 * sin(p.x * 8.5 + uSeconds * 0.55);
  float waterBand = smoothstep(shore - 0.015, shore + 0.045, p.y) * (1.0 - smoothstep(0.575, 0.602, p.y));

  // Multi-octave 3D Gerstner-like wave refraction inside the turquoise sea
  float phaseA = p.x * 28.0 + p.y * 124.0 - uSeconds * 1.35;
  float phaseB = p.x * 46.0 - p.y * 72.0 - uSeconds * 0.95;
  float phaseC = p.x * 18.0 + p.y * 210.0 - uSeconds * 1.85;
  vec2 waveOffset = vec2(
    0.00088 * sin(phaseA * 0.74 + uSeconds * 0.32) + 0.00048 * cos(phaseB),
    0.00215 * sin(phaseA) + 0.00095 * sin(phaseB * 1.35) + 0.00055 * cos(phaseC)
  );

  vec3 scene = texture2D(uPlate, clamp(p + waveOffset * waterBand, 0.001, 0.999)).rgb;
  float luma = dot(scene, vec3(0.2126, 0.7152, 0.0722));

  // Rolling breaking surf foam lines & shoreline swash lace
  float foamNoise = noise2(vec2(p.x * 38.0, p.y * 95.0 - uSeconds * 0.75)) * 0.65 + noise2(vec2(p.x * 82.0 + uSeconds * 0.3, p.y * 160.0)) * 0.35;
  float foamEdge = smoothstep(shore - 0.014, shore + 0.015, p.y) * (1.0 - smoothstep(shore + 0.015, shore + 0.068, p.y));
  float swash = 0.5 + 0.5 * sin(uSeconds * 1.15 + p.x * 6.0);
  float breakerLine = exp(-pow((p.y - (shore + 0.055 + 0.012 * sin(uSeconds * 1.25 + p.x * 11.0))) * 78.0, 2.0)) * waterBand;
  float foamMask = (foamEdge * (0.45 + 0.55 * swash) + breakerLine * 0.55) * smoothstep(0.28, 0.74, foamNoise + 0.18);
  scene += foamMask * vec3(0.065, 0.064, 0.058);

  // Wet sand mirror sheen right below the breaking surf line
  float wetSandZone = smoothstep(shore - 0.065, shore - 0.005, p.y) * (1.0 - smoothstep(shore - 0.005, shore + 0.025, p.y));
  vec3 skyReflectTint = mix(vec3(0.03, 0.055, 0.075), vec3(0.075, 0.042, 0.018), uWarmth);
  scene += wetSandZone * swash * skyReflectTint;

  // Sparkling solar path & dancing water glints beneath the sun (~x=0.315)
  float sunTrack = exp(-abs(p.x - 0.315) * 6.5);
  float glintA = pow(max(0.0, sin(phaseA * 2.6 + sin(p.x * 142.0))), 6.0);
  float glintB = pow(max(0.0, cos(phaseB * 3.2 + p.y * 58.0)), 8.0);
  vec3 glintColor = mix(vec3(0.068, 0.054, 0.028), vec3(0.105, 0.058, 0.022), uWarmth);
  glintColor = mix(glintColor, vec3(0.042, 0.058, 0.095), uDusk);
  scene += waterBand * (glintA * 0.85 + glintB * 0.72) * (0.45 + 0.85 * sunTrack) * smoothstep(0.30, 0.88, luma) * glintColor;

  // Volumetric sun disc halo + subtle crepuscular light rays in the upper sky
  vec2 sunUv = vec2(0.315, 0.755);
  vec2 toSun = p - sunUv;
  float aspectComp = uCrop.y / max(uCrop.x, 0.001);
  float sunDist = length(vec2(toSun.x * 1.15, toSun.y * aspectComp));
  float sunGlow = exp(-sunDist * 3.4);
  float rayAngle = atan(toSun.y, toSun.x);
  float rays = pow(max(0.0, sin(rayAngle * 7.0 + uSeconds * 0.16)), 3.0) * smoothstep(0.34, 0.95, p.y) * exp(-sunDist * 2.1);

  vec3 dayHalo = vec3(0.055, 0.045, 0.025) * sunGlow + vec3(0.028, 0.024, 0.014) * rays;
  vec3 goldenHalo = vec3(0.22, 0.105, 0.028) * sunGlow + vec3(0.08, 0.042, 0.012) * rays;
  vec3 duskHalo = vec3(0.065, 0.045, 0.105) * sunGlow + vec3(0.02, 0.025, 0.05) * rays;

  // Color grade across Mediterranean Daylight, Golden Hour Sunset, and Coastal Twilight
  vec3 dayGrade = scene + dayHalo;
  vec3 goldenGrade = scene * vec3(1.15, 0.84, 0.63) + goldenHalo;
  goldenGrade.r += smoothstep(0.45, 0.92, p.y) * 0.045;
  vec3 duskGrade = scene * vec3(0.54, 0.65, 0.88) + duskHalo;
  duskGrade += smoothstep(0.42, 0.68, p.y) * (1.0 - smoothstep(0.68, 0.95, p.y)) * vec3(0.09, 0.038, 0.068);

  vec3 finalColor = mix(dayGrade, goldenGrade, uWarmth);
  finalColor = mix(finalColor, duskGrade, uDusk);

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

// Real 3D Ground Shoreline Surf, Wet Sand Reflection & Dappled Palm Frond Shadow Plane in 3D World Space
export const shorelineGroundVertex = `
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const shorelineGroundFragment = `
uniform float uSeconds;
uniform float uWarmth;
uniform float uDusk;
varying vec3 vWorldPos;
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

void main() {
  // Local coordinates relative to each 12m beach bay
  float bayX = mod(vWorldPos.x + 6.0, 12.0) - 6.0;
  float z = vWorldPos.z;

  // 1. Dappled 3D botanical palm frond shadows projected onto the foreground sand from the 3D palm trees
  float palmShadow = 0.0;
  for (int side = 0; side < 2; side++) {
    vec2 center = side == 0 ? vec2(-3.2, 0.55) : vec2(3.35, 0.45);
    vec2 rel = vec2(bayX, z) - center;
    float r = length(rel);
    if (r < 2.65) {
      float ang = atan(rel.y, rel.x) + sin(uSeconds * 1.15 + float(side) * 2.1) * 0.038;
      float frondRib = smoothstep(0.15, 0.72, sin(ang * 10.0 + r * 1.85));
      float pinnae = smoothstep(0.05, 0.85, sin(r * 28.0 - ang * 5.0));
      float radialFade = (1.0 - smoothstep(0.45, 2.55, r)) * smoothstep(0.08, 0.35, r);
      palmShadow = max(palmShadow, frondRib * (0.55 + 0.45 * pinnae) * radialFade);
    }
  }

  // 2. 3D Shoreline Swash Foam & Wet Sand Specular Shimmer right behind the vehicle (z = -2.4 .. -0.35)
  float swashZ = -0.95 + 0.14 * bayX + 0.22 * sin(uSeconds * 1.15 + bayX * 0.65);
  float foamBand = exp(-pow((z - swashZ) * 4.2, 2.0)) * smoothstep(2.8, 0.2, abs(bayX));
  float lace = noise2(vec2(bayX * 3.8, z * 6.5 - uSeconds * 0.6)) * 0.65 + noise2(vec2(bayX * 9.5 + uSeconds * 0.3, z * 14.0)) * 0.35;
  float foamAlpha = foamBand * smoothstep(0.32, 0.76, lace) * 0.38 * (1.0 - uDusk * 0.5);

  vec3 shadowCol = mix(vec3(0.14, 0.10, 0.065), vec3(0.18, 0.09, 0.045), uWarmth);
  shadowCol = mix(shadowCol, vec3(0.05, 0.07, 0.13), uDusk);
  float shadowAlpha = palmShadow * 0.24 * (1.0 - uDusk * 0.55);

  vec3 foamCol = mix(vec3(0.98, 0.99, 1.0), vec3(0.99, 0.84, 0.66), uWarmth);
  vec3 finalRgb = mix(shadowCol, foamCol, foamAlpha / max(0.001, shadowAlpha + foamAlpha));
  float finalAlpha = clamp(shadowAlpha + foamAlpha, 0.0, 0.48);

  if (finalAlpha < 0.004) discard;
  gl_FragColor = vec4(finalRgb, finalAlpha);
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
  vec2 sunStep = vec2(-2.5 * uTexel.x, 2.5 * uTexel.y);
  float outerAlpha = texture2D(uMap, clamp(vUv + sunStep, 0.0, 1.0)).a;
  float rim = clamp(texel.a - outerAlpha, 0.0, 1.0) * smoothstep(0.18, 0.86, vUv.y);

  // Subtle warm sand bounce on the lowest 17% of the tires & frame
  float sandBounce = (1.0 - smoothstep(0.0, 0.17, vUv.y)) * smoothstep(0.15, 0.8, texel.a);

  vec3 envTint = mix(vec3(1.0), vec3(1.06, 0.95, 0.86), uWarmth * 0.72);
  envTint = mix(envTint, vec3(0.84, 0.90, 1.05), uDusk * 0.72);

  vec3 rimColor = mix(vec3(0.11, 0.092, 0.060), vec3(0.26, 0.135, 0.048), uWarmth);
  rimColor = mix(rimColor, vec3(0.08, 0.13, 0.22), uDusk);

  vec3 bounceColor = mix(vec3(0.048, 0.038, 0.022), vec3(0.082, 0.052, 0.024), uWarmth);
  bounceColor = mix(bounceColor, vec3(0.018, 0.028, 0.042), uDusk);

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
  float stretchX = mix(0.48, 0.88, uWarmth) + 0.12 * uDusk;
  float stretchZ = mix(0.56, 0.72, uWarmth) + 0.08 * uDusk;
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
  float softness = mix(0.0018, 0.0042, max(uWarmth, uDusk));
  vec2 blur = vec2(softness + 0.0075 * vUv.y);
  float a = texture2D(uSilhouette, vUv).a * 0.36;
  a += texture2D(uSilhouette, vUv + blur).a * 0.16;
  a += texture2D(uSilhouette, vUv - blur).a * 0.16;
  a += texture2D(uSilhouette, vUv + vec2(blur.x, -blur.y)).a * 0.16;
  a += texture2D(uSilhouette, vUv + vec2(-blur.x, blur.y)).a * 0.16;

  vec3 dayShadow = vec3(0.11, 0.095, 0.072);
  vec3 warmShadow = vec3(0.15, 0.092, 0.055);
  vec3 duskShadow = vec3(0.06, 0.085, 0.14);
  vec3 color = mix(dayShadow, warmShadow, uWarmth);
  color = mix(color, duskShadow, uDusk);

  float opacity = mix(0.31, 0.26, uWarmth);
  opacity = mix(opacity, 0.19, uDusk);
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
  vec3 color = mix(vec3(0.14, 0.10, 0.075), vec3(0.18, 0.10, 0.06), uWarmth);
  color = mix(color, vec3(0.07, 0.09, 0.15), uDusk);
  gl_FragColor = vec4(color, mix(0.26, 0.18, uDusk) * s);
}
`;

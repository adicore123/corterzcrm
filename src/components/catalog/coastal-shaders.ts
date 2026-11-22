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

void main() {
  vec2 p = (vScreenUv - 0.5) * uCrop + 0.5;
  // Foreground wet sand shifts faster than distant sea & sky for natural camera parallax.
  float foreground = 1.0 - smoothstep(0.10, 0.62, p.y);
  p += uDrift * (0.18 + 0.82 * foreground);
  p.x -= (1.0 - uCrop.x) * 0.06;

  // Angled Mediterranean shoreline curve (~y=0.255 left rising to ~0.405 right).
  float shore = 0.255 + 0.15 * p.x + 0.008 * sin(p.x * 9.0 + uSeconds * 0.45);
  float waterBand = smoothstep(shore - 0.01, shore + 0.045, p.y) * (1.0 - smoothstep(0.575, 0.60, p.y));

  // Multi-octave organic waves inside the turquoise Mediterranean surf.
  float phaseA = p.x * 26.0 + p.y * 118.0 - uSeconds * 1.15;
  float phaseB = p.x * 41.0 - p.y * 64.0 - uSeconds * 0.82;
  vec2 waveOffset = vec2(
    0.00072 * sin(phaseA * 0.72 + uSeconds * 0.27) + 0.00038 * cos(phaseB),
    0.00175 * sin(phaseA) + 0.00075 * sin(phaseB * 1.35)
  );

  vec3 scene = texture2D(uPlate, clamp(p + waveOffset * waterBand, 0.001, 0.999)).rgb;
  float luma = dot(scene, vec3(0.2126, 0.7152, 0.0722));

  // Soft breathing shoreline seafoam shimmer at the water edge.
  float foamEdge = smoothstep(shore - 0.012, shore + 0.016, p.y) * (1.0 - smoothstep(shore + 0.016, shore + 0.065, p.y));
  float swash = 0.5 + 0.5 * sin(uSeconds * 0.95 + p.x * 5.5);
  scene += foamEdge * swash * vec3(0.036, 0.035, 0.030);

  // Sparkling solar path & water glints centered beneath the sun (~x=0.315).
  float sunTrack = exp(-abs(p.x - 0.315) * 7.0);
  float glintA = pow(max(0.0, sin(phaseA * 2.5 + sin(p.x * 138.0))), 6.0);
  float glintB = pow(max(0.0, cos(phaseB * 3.1 + p.y * 55.0)), 8.0);
  vec3 glintColor = mix(vec3(0.055, 0.042, 0.022), vec3(0.085, 0.048, 0.018), uWarmth);
  glintColor = mix(glintColor, vec3(0.038, 0.052, 0.085), uDusk);
  scene += waterBand * (glintA * 0.8 + glintB * 0.65) * (0.45 + 0.75 * sunTrack) * smoothstep(0.32, 0.88, luma) * glintColor;

  // Sun disc atmospheric halo + subtle crepuscular light rays in upper sky.
  vec2 sunUv = vec2(0.315, 0.755);
  vec2 toSun = p - sunUv;
  float aspectComp = uCrop.y / max(uCrop.x, 0.001);
  float sunDist = length(vec2(toSun.x * 1.15, toSun.y * aspectComp));
  float sunGlow = exp(-sunDist * 3.4);
  float rayAngle = atan(toSun.y, toSun.x);
  float rays = pow(max(0.0, sin(rayAngle * 7.0 + uSeconds * 0.14)), 3.0) * smoothstep(0.34, 0.95, p.y) * exp(-sunDist * 2.1);

  vec3 dayHalo = vec3(0.055, 0.045, 0.025) * sunGlow + vec3(0.028, 0.024, 0.014) * rays;
  vec3 goldenHalo = vec3(0.22, 0.105, 0.028) * sunGlow + vec3(0.08, 0.042, 0.012) * rays;
  vec3 duskHalo = vec3(0.065, 0.045, 0.105) * sunGlow + vec3(0.02, 0.025, 0.05) * rays;

  // Color grade across Mediterranean Daylight, Golden Hour Sunset, and Coastal Twilight.
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

  // Detect sun-facing upper-left silhouette edge for realistic coastal rim lighting.
  vec2 sunStep = vec2(-2.5 * uTexel.x, 2.5 * uTexel.y);
  float outerAlpha = texture2D(uMap, clamp(vUv + sunStep, 0.0, 1.0)).a;
  float rim = clamp(texel.a - outerAlpha, 0.0, 1.0) * smoothstep(0.18, 0.85, vUv.y);

  // Subtle warm sand bounce on the lowest 16% of the tires & frame.
  float sandBounce = (1.0 - smoothstep(0.0, 0.17, vUv.y)) * smoothstep(0.15, 0.8, texel.a);

  vec3 envTint = mix(vec3(1.0), vec3(1.06, 0.95, 0.86), uWarmth * 0.72);
  envTint = mix(envTint, vec3(0.84, 0.90, 1.05), uDusk * 0.72);

  vec3 rimColor = mix(vec3(0.10, 0.085, 0.055), vec3(0.24, 0.125, 0.045), uWarmth);
  rimColor = mix(rimColor, vec3(0.08, 0.13, 0.22), uDusk);

  vec3 bounceColor = mix(vec3(0.045, 0.036, 0.020), vec3(0.075, 0.048, 0.022), uWarmth);
  bounceColor = mix(bounceColor, vec3(0.015, 0.025, 0.040), uDusk);

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
  // Shadow stretches rightward & forward on Golden Hour sunset, stays tighter at noon.
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

  float opacity = mix(0.30, 0.25, uWarmth);
  opacity = mix(opacity, 0.18, uDusk);
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
  gl_FragColor = vec4(color, mix(0.25, 0.18, uDusk) * s);
}
`;

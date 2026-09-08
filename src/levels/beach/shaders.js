// GLSL for the view beyond the glass (art doc 03 section 4): sky dome, animated ocean, sloped sand.
// All three write linear color, then run three's tone mapping + output color space chunks so they
// match the lit interior; the scene fog chunk runs last (same order as the built-in materials).

export const WATER_LEVEL = -1.10;

// Sand height in world space, shared by the water and sand shaders. Ported to JS below.
export const SAND_H_GLSL = /* glsl */`
float sandH(vec2 xz){
  float s = -0.4 - (-6.0 - xz.y) * 0.033;
  s += 0.12 * sin(xz.x * 0.045) + 0.05 * sin(xz.x * 0.13 + 1.7);
  return s;
}
`;

export function sandH(x, z) {
  let s = -0.4 - (-6.0 - z) * 0.033;
  s += 0.12 * Math.sin(x * 0.045) + 0.05 * Math.sin(x * 0.13 + 1.7);
  return s;
}

// ---- sky dome ---------------------------------------------------------------------------------
export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SKY_FRAG = /* glsl */`
uniform vec3 uZenith, uMid, uHorizon, uHaze, uSunDir, uSunColor;
uniform float uDisk;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.9, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col = mix(col, uHaze, pow(sd, 3.0) * 0.35 * (1.0 - h));
  col += uSunColor * (pow(sd, 1200.0) * uDisk + pow(sd, 40.0) * 0.35 + pow(sd, 8.0) * 0.06);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.9, clamp(-d.y * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---- ocean -------------------------------------------------------------------------------------
export const WATER_VERT = /* glsl */`
uniform float uTime, uWaveScale;
varying vec3 vWorldPos, vNormal;
#include <fog_pars_vertex>
${SAND_H_GLSL}
// (dir.x, dir.z, amplitude m, wavelength m)
const vec4 W0 = vec4( 0.80, 0.60, 0.12, 14.0);
const vec4 W1 = vec4(-0.35, 0.94, 0.06,  6.5);
const vec4 W2 = vec4( 0.55,-0.83, 0.03,  2.8);
float wave(vec4 w, vec2 p, float t, out vec2 grad){
  float k = 6.28318 / w.w;
  float c = sqrt(9.81 / k);
  float ph = k * dot(w.xy, p) - k * c * t;
  grad = w.xy * (w.z * k * cos(ph));
  return w.z * sin(ph);
}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 g0, g1, g2;
  float h = wave(W0, wp.xz, uTime, g0) + wave(W1, wp.xz, uTime, g1) + wave(W2, wp.xz, uTime, g2);
  float depth = clamp((-1.10 - sandH(wp.xz)) * 0.5, 0.0, 1.0);
  float k = uWaveScale * depth;
  wp.y += h * k;
  vec2 g = (g0 + g1 + g2) * k;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vWorldPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const WATER_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunColor, uNear, uMid, uFar, uSky, uFoam, uHazeColor;
uniform sampler2D uNoise;
uniform float uTime, uHazeNear, uHazeFar, uBright;
varying vec3 vWorldPos, vNormal;
#include <fog_pars_fragment>
${SAND_H_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vWorldPos);
  float d = length(cameraPosition.xz - vWorldPos.xz);
  float detail = 0.18 * (1.0 - 0.75 * smoothstep(40.0, uHazeFar, d));
  vec2 n1 = texture2D(uNoise, vWorldPos.xz * 0.08 + uTime * vec2(0.020, 0.013)).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(uNoise, vWorldPos.xz * 0.21 - uTime * vec2(0.017, 0.024)).rg * 2.0 - 1.0;
  vec3 N = normalize(vNormal + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * detail);
  float depth = -1.10 - sandH(vWorldPos.xz);
  vec3 base = mix(uNear, uMid, smoothstep(0.3, 3.0, depth));
  base = mix(base, uFar, smoothstep(40.0, uHazeFar, d));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(base, uSky, fres * 0.85) * uBright;
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 220.0);
  vec2 toFrag = normalize(vWorldPos.xz - cameraPosition.xz);
  float path = pow(max(dot(toFrag, normalize(uSunDir.xz)), 0.0), 40.0);
  col += uSunColor * (spec * 2.5 + path * fres * 0.30);
  float foam = (1.0 - smoothstep(0.0, 0.35, depth)) * texture2D(uNoise, vWorldPos.xz * 0.5 + uTime * 0.05).b;
  col = mix(col, uFoam, foam * 0.8);
  float alpha = clamp(depth / 0.9, 0.15, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Dissolve into the horizon color before the camera far plane (the dome sits just inside it).
  float haze = smoothstep(uHazeNear, uHazeFar, d);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, haze);
  gl_FragColor.a = max(gl_FragColor.a, haze);
  #include <fog_fragment>
}
`;

// ---- sand --------------------------------------------------------------------------------------
export const SAND_VERT = /* glsl */`
varying vec3 vWorldPos, vNormal;
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const SAND_FRAG = /* glsl */`
uniform vec3 uDry, uWet, uFoam, uSunDir, uSandNorm;
uniform sampler2D uSand, uNoise;
uniform float uTime, uBright;
varying vec3 vWorldPos, vNormal;
#include <fog_pars_fragment>
${SAND_H_GLSL}
void main(){
  float h = sandH(vWorldPos.xz);
  float swash = -1.10 + 0.10 * sin(uTime * 0.45)
              + 0.06 * (texture2D(uNoise, vec2(vWorldPos.x * 0.01, uTime * 0.03)).r - 0.5);
  vec3 tex = texture2D(uSand, vWorldPos.xz * 0.125).rgb;
  float wet = 1.0 - smoothstep(swash + 0.02, swash + 0.30, h);
  vec3 col = mix(uDry, uWet, wet) * (tex / uSandNorm);
  float foamBand = 1.0 - smoothstep(0.0, 0.045, abs(h - swash));
  foamBand *= 0.6 + 0.4 * texture2D(uNoise, vWorldPos.xz * 0.35 + uTime * 0.02).g;
  col = mix(col, uFoam, foamBand);
  float light = 0.55 + 0.45 * max(dot(normalize(vNormal), uSunDir), 0.0);
  gl_FragColor = vec4(col * light * uBright, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

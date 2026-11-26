// glShaders.js — every GLSL program the renderer runs, in one place.
// One job: hold the shader sources — the lit world shader with its water
// ripple, specular sun and night rim light; the sky dome with sun, stars
// and aurora curtains; the billboard sprite shader; and the flat shader
// for thermal spirals and gulls. renderWorld.js compiles and drives them.

import { WORLD_HALF } from "./terrainSvarra.js";

export const FOG_NEAR = 950;
export const FOG_FAR = 8200;

export const LIT_VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aSpec;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vSpec;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormalW = mat3(uModel) * aNormal;
  vColor = aColor;
  vSpec = aSpec;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

export const LIT_FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vSpec;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
uniform float uEmissive;
uniform float uAlpha;
uniform float uTime;
uniform float uRim;
uniform vec3 uTint;
void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  if (vSpec > 0.6) {
    // Open water: a slow, broad ripple walks the normal so the fjord
    // glitters in swells, not in a checkerboard — with a second, finer
    // octave on top so the surface sparkles instead of smearing.
    n = normalize(n + vec3(
      sin(vWorld.x * 0.045 + uTime * 1.3) * 0.035 + sin(vWorld.x * 0.33 + uTime * 2.3) * 0.012, 0.0,
      cos(vWorld.z * 0.038 + uTime * 1.7) * 0.035 + cos(vWorld.z * 0.29 + uTime * 2.9) * 0.012));
  }
  float diff = clamp((dot(n, uSunDir) + 0.38) / 1.38, 0.0, 1.0);
  vec3 col = vColor * uTint * (uAmbient + uSunColor * diff);
  // A whisper of saturation on the lit surface: arctic colour reads
  // richer, edges between biomes stay decisive.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.07);
  vec3 vdir = normalize(uCamPos - vWorld);
  vec3 hv = normalize(vdir + uSunDir);
  col += uSunColor * pow(max(dot(n, hv), 0.0), 28.0) * vSpec * 0.55;
  // Rim light: at dusk and under the aurora every edge catches a cold
  // sheen, so the airframe never vanishes against dark ground.
  float fres = pow(1.0 - abs(dot(n, vdir)), 2.6);
  col += vec3(0.36, 0.72, 0.92) * fres * uRim;
  col += vColor * uTint * uEmissive;
  float dist = length(uCamPos - vWorld);
  float f = smoothstep(${FOG_NEAR}.0, ${FOG_FAR}.0, dist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uAlpha);
}`;

export const SKY_VERT = `
attribute vec2 aNDC;
varying vec2 vNDC;
void main() {
  vNDC = aNDC;
  gl_Position = vec4(aNDC, 0.9999, 1.0);
}`;

export const SKY_FRAG = `
precision mediump float;
varying vec2 vNDC;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTanF;
uniform float uAspect;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunTint;
uniform float uSunI;
uniform float uAurora;
uniform float uTime;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
void main() {
  vec3 dir = normalize(uFwd + uRight * (vNDC.x * uTanF * uAspect) + uUp * (vNDC.y * uTanF));
  float y = dir.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.58));
  col = mix(uFog, col, smoothstep(0.0, 0.14, y));
  if (y < 0.0) col = mix(uFog, uFog * 0.9, clamp(-y * 3.0, 0.0, 1.0));
  float sd = dot(dir, uSunDir);
  col += uSunTint * pow(max(sd, 0.0), 220.0) * 0.6 * uSunI;
  col += uSunTint * smoothstep(0.9993, 0.9999, sd) * 2.6 * uSunI;
  col += uSunTint * pow(max(sd, 0.0), 7.0) * 0.1 * uSunI;
  if (uSunI < 0.5 && y > 0.0) {
    vec3 cell = floor(dir * 220.0);
    float h = hash13(cell);
    float star = step(0.9975, h) * (0.5 - uSunI) * 2.0;
    float tw = 0.75 + 0.25 * sin(uTime * 2.0 + h * 40.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * smoothstep(0.02, 0.2, y);
  }
  if (uAurora > 0.01 && y > 0.0) {
    // Curtains, not a blot: a sharp lower hem, vertical rays that bunch
    // and thin, and a violet fringe along the top.
    float band = sin(dir.x * 5.0 + uTime * 0.11 + sin(dir.z * 3.0 + uTime * 0.05) * 1.7);
    float band2 = sin(dir.x * 11.0 - uTime * 0.07 + dir.y * 6.0);
    float curtain = smoothstep(0.02, 0.10, y) * smoothstep(0.95, 0.32, y);
    float rays = 0.25 + 0.75 * pow(0.5 + 0.5 * band * band2, 1.6);
    col += vec3(0.16, 0.95, 0.45) * curtain * rays * uAurora * 0.62;
    col += vec3(0.45, 0.2, 0.8) * curtain * (0.5 + 0.5 * band2) * uAurora * 0.2;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const SPRITE_VERT = `
attribute vec3 aPos;
attribute vec2 aCorner;
attribute vec2 aSize;
attribute vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec4 uTint;
uniform float uDrift;
uniform float uWrap;
varying vec2 vUv;
varying vec4 vColor;
varying float vFogF;
void main() {
  vec3 centre = aPos;
  centre.x = mix(centre.x, mod(centre.x + uDrift + ${WORLD_HALF}.0, ${WORLD_HALF * 2}.0) - ${WORLD_HALF}.0, uWrap);
  vec3 wp = centre + uRight * (aCorner.x * aSize.x) + uUp * (aCorner.y * aSize.y);
  vec4 vp = uView * vec4(wp, 1.0);
  vFogF = smoothstep(${FOG_NEAR}.0, ${FOG_FAR}.0, -vp.z);
  vUv = aCorner * 0.5 + 0.5;
  vColor = aColor * uTint;
  gl_Position = uProj * vp;
}`;

export const SPRITE_FRAG = `
precision mediump float;
varying vec2 vUv;
varying vec4 vColor;
varying float vFogF;
uniform sampler2D uTex;
uniform vec3 uFogColor;
void main() {
  vec4 tex = texture2D(uTex, vUv);
  vec4 col = tex * vColor;
  col.rgb = mix(col.rgb, uFogColor, vFogF * 0.7);
  gl_FragColor = col;
}`;

export const FLAT_VERT = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uMVP;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

export const FLAT_FRAG = `
precision mediump float;
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}`;

// GLSL for the bodies that are drawn procedurally: the Earth's surface,
// its clouds, its atmosphere, and the evening sky over home.
//
// Colours are written in display space (no colour-space conversion), like
// the Sun shader in world.js.

const LOGDEPTH_VERT_PARS = `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
const LOGDEPTH_FRAG_PARS = `
#include <common>
#include <logdepthbuf_pars_fragment>
`;

// Simplex noise (Ashima Arts / Stefan Gustavson, MIT) and a band-limited
// fbm: each octave fades out once it is finer than a pixel (fw is the
// screen-space footprint of the sample point), so the far globe does not
// shimmer and the near ground still gets its detail.
export const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int octaves, float fw) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float keep = 1.0 - smoothstep(0.3, 0.7, fw * freq);
    sum += amp * snoise(p * freq) * keep;
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}
`;

const SPHERE_VERT = `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
${LOGDEPTH_VERT_PARS}
void main() {
  vObj = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

// The light of a low sun is reddened by the long path through the air;
// the same tint is applied wherever the Sun is near the horizon, so the
// terminator warms by itself instead of carrying a painted stripe.
const SUNLIGHT = `
vec3 sunTint(float ndl) {
  return mix(vec3(1.0, 0.5, 0.26), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.32, ndl));
}
`;

export const earthShader = {
  vertexShader: SPHERE_VERT,
  fragmentShader: `
uniform vec3 uSunDir;
uniform vec3 uHome;
uniform vec3 uSea;
uniform float uLamp;
uniform float uHaze;
uniform float uNear;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
${LOGDEPTH_FRAG_PARS}
${NOISE}
${SUNLIGHT}

float angleTo(vec3 a, vec3 b) {
  return acos(clamp(dot(a, b), -1.0, 1.0));
}

void main() {
  vec3 p = vObj;
  float fw = length(fwidth(p));
  float dHome = angleTo(p, uHome);
  float dSea = angleTo(p, uSea);

  // Continents, then coasts, then the fine edge you only see from low.
  float h = fbm(p * 1.6 + vec3(3.1, 1.7, 0.4), 5, fw * 1.6);
  h += 0.34 * fbm(p * 6.5 + 11.0, 5, fw * 6.5);
  h += 0.12 * fbm(p * 36.0 + 5.0, 5, fw * 36.0);
  h += 0.045 * fbm(p * 170.0, 4, fw * 170.0);
  // Home stands on land, a short walk from a sea that lies past the
  // end of the path.
  h += 0.42 * (1.0 - smoothstep(0.03, 0.13, dHome));
  h -= 0.55 * (1.0 - smoothstep(0.05, 0.2, dSea));
  h -= 0.05;

  float edge = max(fw * 2.0, 0.002);
  float land = smoothstep(-edge, edge, h);

  float lat = abs(p.y);
  vec3 deep = vec3(0.04, 0.085, 0.13);
  vec3 shelf = vec3(0.1, 0.22, 0.26);
  vec3 ocean = mix(deep, shelf, smoothstep(-0.16, 0.0, h));

  float veg = fbm(p * 4.0 + 7.0, 4, fw * 4.0) + 0.3 * fbm(p * 22.0, 3, fw * 22.0);
  float arid = smoothstep(0.18, 0.32, lat) * (1.0 - smoothstep(0.5, 0.62, lat));
  vec3 sand = vec3(0.76, 0.66, 0.5);
  vec3 scrub = vec3(0.5, 0.47, 0.32);
  vec3 forest = vec3(0.27, 0.3, 0.2);
  vec3 ground = mix(scrub, forest, smoothstep(-0.1, 0.25, veg));
  ground = mix(ground, sand, clamp(arid * 0.85 + smoothstep(0.1, 0.4, -veg) * 0.5, 0.0, 1.0));
  ground = mix(ground, sand * 0.96, 1.0 - smoothstep(0.02, 0.09, dHome));
  ground *= 0.92 + 0.16 * fbm(p * 90.0, 3, fw * 90.0);
  float ice = smoothstep(0.9, 0.95, lat + 0.03 * fbm(p * 12.0, 3, fw * 12.0));
  ground = mix(ground, vec3(0.92, 0.91, 0.88), ice);
  ocean = mix(ocean, vec3(0.86, 0.88, 0.88), ice);

  vec3 albedo = mix(ocean, ground, land);

  vec3 n = normalize(vNormalW);
  vec3 l = normalize(uSunDir);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = dot(n, l);
  vec3 sun = sunTint(ndl);
  float diffuse = clamp(ndl * 1.05 + 0.03, 0.0, 1.0);
  // After sunset the sky still lights the ground for a while.
  float twilight = smoothstep(-0.2, 0.05, ndl) * (1.0 - smoothstep(0.05, 0.4, ndl));
  vec3 col = albedo * diffuse * sun + albedo * (0.022 + 0.16 * twilight * vec3(0.8, 0.82, 1.0));
  // Close to the ground the eye is adapted to the evening: the land is
  // lit the way the person's own ground is, by the low Sun and the sky.
  col += albedo * uNear * (diffuse * sun * 1.6 + 0.5 * smoothstep(-0.15, 0.25, ndl) * vec3(0.78, 0.8, 0.86));

  vec3 hv = normalize(l + v);
  float glint = pow(max(dot(n, hv), 0.0), 90.0) * (1.0 - land) * smoothstep(0.0, 0.12, ndl);
  col += sun * glint * 0.55;

  // Night lights: towns gather on coasts and in clusters, and home is
  // one of the brightest of them. Points blur into an even glow when they
  // fall below a pixel, so the side in shadow keeps its brightness.
  float night = 1.0 - smoothstep(-0.12, 0.03, ndl);
  float cluster = smoothstep(0.02, 0.32, fbm(p * 9.0 + 4.0, 4, fw * 9.0));
  float coast = 1.0 - smoothstep(0.0, 0.3, h);
  float density = land * (1.0 - ice) * clamp(cluster * 0.85 + coast * 0.4, 0.0, 1.0);
  float cities = smoothstep(0.5, 0.95, snoise(p * 34.0 + 9.0));
  cities *= 1.0 - smoothstep(0.3, 0.7, fw * 34.0) * 0.6;
  float pts = smoothstep(0.45, 0.85, snoise(p * 260.0));
  pts = max(pts, smoothstep(0.55, 0.9, snoise(p * 900.0 + 3.0)) * 0.8);
  float fine = smoothstep(0.15, 0.55, fw * 260.0);
  float towns = density * (mix(pts, 0.1, fine) + cities * 1.4);
  float homeGlow = (1.0 - smoothstep(0.0, 0.04, dHome)) * land;
  towns += homeGlow * mix(0.6 + 0.6 * pts, 1.2, fine);
  col += vec3(1.0, 0.7, 0.4) * towns * night * uLamp;

  float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col += vec3(0.32, 0.5, 0.82) * rim * 0.55 * smoothstep(-0.2, 0.4, ndl) * uHaze;
  col += vec3(0.42, 0.55, 0.72) * 0.05 * diffuse * uHaze;

  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`,
};

export const cloudShader = {
  vertexShader: SPHERE_VERT,
  fragmentShader: `
uniform vec3 uSunDir;
uniform vec3 uHome;
uniform float uOpacity;
uniform float uTime;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
${LOGDEPTH_FRAG_PARS}
${NOISE}
${SUNLIGHT}
void main() {
  vec3 p = vObj;
  float fw = length(fwidth(p));
  vec3 q = p * 2.3 + vec3(uTime * 0.02, 0.0, uTime * 0.013);
  float c = fbm(q, 6, fw * 2.3) + 0.35 * fbm(p * 9.0 + uTime * 0.03, 4, fw * 9.0);
  float lat = abs(p.y);
  c += 0.14 * smoothstep(0.5, 0.8, lat);
  c -= 0.12 * smoothstep(0.15, 0.3, lat) * (1.0 - smoothstep(0.4, 0.55, lat));
  float a = smoothstep(0.06, 0.38, c);
  a *= smoothstep(0.04, 0.12, acos(clamp(dot(p, uHome), -1.0, 1.0)));
  float ndl = dot(normalize(vNormalW), normalize(uSunDir));
  vec3 col = vec3(0.97, 0.96, 0.94) * clamp(ndl * 1.1 + 0.06, 0.0, 1.0) * sunTint(ndl) + 0.015;
  gl_FragColor = vec4(col, a * uOpacity);
  #include <logdepthbuf_fragment>
}
`,
};

// A shell around the Earth, drawn from the inside. For each pixel it finds
// how close the line of sight passes to the planet: brightest just above
// the limb, nothing at the shell's own edge, so there is no hard ring.
export const atmosphereShader = {
  vertexShader: `
varying vec3 vWorld;
${LOGDEPTH_VERT_PARS}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`,
  fragmentShader: `
uniform vec3 uSunDir;
uniform vec3 uCenter;
uniform float uR;
uniform float uRa;
uniform float uOpacity;
varying vec3 vWorld;
${LOGDEPTH_FRAG_PARS}
void main() {
  vec3 rd = normalize(vWorld - cameraPosition);
  vec3 oc = cameraPosition - uCenter;
  float t = -dot(oc, rd);
  vec3 closest = oc + rd * max(t, 0.0);
  float b = length(closest);
  float h = clamp((b - uR) / (uRa - uR), 0.0, 1.0);
  float glow = pow(1.0 - h, 2.6) * (1.0 - smoothstep(0.85, 1.0, h));
  float d = dot(normalize(closest), normalize(uSunDir));
  float lit = smoothstep(-0.28, 0.3, d);
  float dusk = smoothstep(-0.28, -0.02, d) * (1.0 - smoothstep(0.02, 0.32, d));
  vec3 col = mix(vec3(0.46, 0.66, 1.0), vec3(1.0, 0.58, 0.32), dusk * 0.75);
  gl_FragColor = vec4(col, glow * lit * uOpacity);
  #include <logdepthbuf_fragment>
}
`,
};

// The evening over home. Drawn first, behind everything, as an opaque
// dome around the camera; it hands over to the plain sky colour as the
// camera climbs.
export const skyShader = {
  vertexShader: `
varying vec3 vWorld;
${LOGDEPTH_VERT_PARS}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`,
  fragmentShader: `
uniform vec3 uSunDir;
uniform vec3 uUp;
uniform vec3 uBg;
uniform vec3 uLow;
uniform float uFade;
varying vec3 vWorld;
${LOGDEPTH_FRAG_PARS}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float h = dot(d, uUp);
  float s = dot(d, normalize(uSunDir));
  vec3 zenith = vec3(0.35, 0.42, 0.52);
  vec3 horizon = vec3(0.94, 0.75, 0.56);
  vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.62, h), 0.62));
  col = mix(col, uLow, 1.0 - smoothstep(-0.2, 0.0, h));
  float sg = max(s, 0.0);
  float low = 1.0 - smoothstep(0.0, 0.55, h);
  col += vec3(1.0, 0.6, 0.3) * (pow(sg, 5.0) * 0.32 + pow(sg, 60.0) * 0.55) * low;
  // Opposite the low Sun: the pink band above the horizon, with the
  // Earth's own shadow rising under it as the Sun goes down.
  float anti = max(-s, 0.0);
  float sunH = dot(normalize(uSunDir), uUp);
  float bandH = 0.07 + max(0.0, -sunH) * 0.6;
  col = mix(col, vec3(0.86, 0.62, 0.62), 0.42 * anti * exp(-pow((h - bandH) / 0.07, 2.0)));
  float shadowUp = 1.0 - smoothstep(-0.02, 0.06, sunH);
  col = mix(col, vec3(0.3, 0.33, 0.42), 0.55 * shadowUp * anti * (1.0 - smoothstep(0.0, bandH - 0.03, h)) * step(0.0, h));
  col = mix(col, vec3(1.0, 0.94, 0.82), smoothstep(0.99955, 0.99985, s) * smoothstep(-0.01, 0.01, h));
  gl_FragColor = vec4(mix(uBg, col, uFade), 1.0);
  #include <logdepthbuf_fragment>
}
`,
};

import * as THREE from 'three';
import { createFigure, poseFigure, sampleWalk } from './figure.js';
import { keyInterpolator } from './motion.js';
import { keplerRatio, galaxyOmegaRatio } from './orbits.js';

const EARTH_R = 400;
const MOON_R = 26;
const MOON_ORBIT = 640;
const SUN_R = 280;
const EARTH_ORBIT = 1760;
const INNER_ORBIT = 860;
const INNER_R = 22;
const OUTER_ORBIT = 3480;
const OUTER_R = 48;
const GALAXY_R = 12000;
const HOME = { lat: 0.52, lon: 1.74 };

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CAM_YAW = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -0.55);
const HOME_QUAT = new THREE.Quaternion();
const WALK_SPIN = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_OFFSET = new THREE.Vector3(1, 0.28, -0.14).normalize();
const GALAXY_OFFSET = new THREE.Vector3(0.62, 0.42, 0.66).normalize();

const HOME_COAST = [
  [1.42, 0.28],
  [1.58, 0.2],
  [1.78, 0.24],
  [1.96, 0.16],
  [1.88, 0.34],
  [2.08, 0.42],
  [2.16, 0.58],
  [2.02, 0.74],
  [1.82, 0.86],
  [1.6, 0.78],
  [1.46, 0.62],
  [1.36, 0.44],
];

const FAR_COAST = [
  [4.15, -0.32],
  [4.55, -0.58],
  [5.15, -0.46],
  [5.45, -0.08],
  [5.15, 0.24],
  [4.62, 0.2],
  [4.2, -0.02],
];

const SOUTH_COAST = [
  [2.75, -0.7],
  [3.25, -0.88],
  [3.58, -0.64],
  [3.22, -0.46],
  [2.82, -0.52],
];

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Scale keys ride the same continuous curve as the cue timing: no
// smoothstep stall at each key, so the pull-back accelerates through a
// phase boundary instead of arriving, pausing, and leaving again.
function keyLerp(u, keys) {
  return keyInterpolator(keys)(u);
}

function logKey(u, keys) {
  return keyInterpolator(keys, { log: true })(u);
}

const DIST = [
  { u: 0, v: 6.2 },
  { u: 0.08, v: 9 },
  { u: 0.16, v: 32 },
  { u: 0.24, v: 90 },
  { u: 0.32, v: 520 },
  { u: 0.42, v: 2200 },
  { u: 0.5, v: 3400 },
  { u: 0.58, v: 6200 },
  { u: 0.66, v: 12000 },
  { u: 0.74, v: 20000 },
  { u: 0.84, v: 46000 },
  { u: 0.92, v: 100000 },
  { u: 1, v: 250000 },
];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function latLonToDir(lat, lon, target) {
  const cosLat = Math.cos(lat);
  target.set(-Math.cos(lon) * cosLat, Math.sin(lat), Math.sin(lon) * cosLat);
  return target;
}

function latLonToCanvas(lat, lon, size) {
  const u = lon / (Math.PI * 2);
  const v = 0.5 + lat / Math.PI;
  return [u * size, (1 - v) * size];
}

function pointInPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function traceCoast(ctx, poly, size) {
  const pts = poly.map(([lon, lat]) => latLonToCanvas(lat, lon, size));
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const start = mid(pts[0], pts[pts.length - 1]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i];
    const n = pts[(i + 1) % pts.length];
    const m = mid(c, n);
    ctx.quadraticCurveTo(c[0], c[1], m[0], m[1]);
  }
  ctx.closePath();
}

function paintDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  grd.addColorStop(0, 'rgba(212, 198, 176, 1)');
  grd.addColorStop(0.86, 'rgba(206, 190, 166, 1)');
  grd.addColorStop(1, 'rgba(206, 190, 166, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(120, 100, 78, 0.18)';
  g.beginPath();
  g.ellipse(256, 270, 70, 28, -0.4, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintShadow() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(40, 64, 4, 90, 64, 120);
  grd.addColorStop(0, 'rgba(20, 14, 10, 0.55)');
  grd.addColorStop(0.45, 'rgba(20, 14, 10, 0.22)');
  grd.addColorStop(1, 'rgba(20, 14, 10, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintSoft(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintEarth() {
  const size = 4096;
  const day = document.createElement('canvas');
  day.width = day.height = size;
  const g = day.getContext('2d');
  g.fillStyle = '#1a2421';
  g.fillRect(0, 0, size, size);

  const drawLand = (poly, fill, shallow) => {
    traceCoast(g, poly, size);
    g.lineWidth = 42;
    g.strokeStyle = shallow;
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  };

  drawLand(FAR_COAST, '#cbbba4', '#8f9a90');
  drawLand(SOUTH_COAST, '#cfc3ac', '#8f9a90');
  drawLand(HOME_COAST, '#d7c9b4', '#9aa598');

  g.fillStyle = '#d7c9b4';
  const islands = [
    [2.72, 0.38, 0.055, 0.03],
    [2.84, 0.3, 0.04, 0.022],
    [2.93, 0.24, 0.028, 0.016],
    [1.02, 0.4, 0.035, 0.02],
    [3.7, -0.2, 0.05, 0.028],
  ];
  for (const [lon, lat, rx, ry] of islands) {
    const [x, y] = latLonToCanvas(lat, lon, size);
    g.beginPath();
    g.ellipse(x, y, rx * size, ry * size, 0.4, 0, Math.PI * 2);
    g.fill();
  }

  const lamps = document.createElement('canvas');
  lamps.width = lamps.height = 2048;
  const lg = lamps.getContext('2d');
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, 2048, 2048);
  const rand = mulberry32(11);
  const sprinkle = (poly, count, alpha) => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 30) {
      guard += 1;
      const lon = rand() * Math.PI * 2;
      const lat = (rand() - 0.5) * Math.PI;
      if (!pointInPoly(lon, lat, poly)) continue;
      const [x, y] = latLonToCanvas(lat, lon, 2048);
      const city = rand() < 0.18;
      lg.fillStyle = city ? `rgba(255, 214, 170, ${alpha})` : `rgba(255, 186, 130, ${alpha * 0.7})`;
      lg.beginPath();
      lg.arc(x, y, city ? 1.6 : 0.7, 0, Math.PI * 2);
      lg.fill();
      placed += 1;
    }
  };
  sprinkle(HOME_COAST, 900, 0.95);
  sprinkle(FAR_COAST, 280, 0.8);
  sprinkle(SOUTH_COAST, 80, 0.7);

  const dayTex = new THREE.CanvasTexture(day);
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = 8;
  const lampTex = new THREE.CanvasTexture(lamps);
  lampTex.colorSpace = THREE.SRGBColorSpace;
  return { dayTex, lampTex };
}

function paintClouds() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = mulberry32(4);
  for (let i = 0; i < 36; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 30 + rand() * 90;
    const ry = 16 + rand() * 40;
    const grd = g.createRadialGradient(x, y, 4, x, y, Math.max(rx, ry));
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeOrbit(radius, thickness, color) {
  const geo = new THREE.RingGeometry(Math.max(1, radius - thickness), radius + thickness, 180);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

function galaxyPoint(rand, arm) {
  const t = Math.pow(rand(), 0.72);
  const r = t * GALAXY_R;
  let theta = arm * (Math.PI / 2);
  if (t > 0.12) theta += (t - 0.12) * 5.8;
  theta += (rand() - 0.5) * (0.16 + t * 0.5);
  if (rand() < 0.18) theta = rand() * Math.PI * 2;
  const thick = (rand() - 0.5) * (30 + (1 - t) * 280);
  return {
    x: Math.cos(theta) * r,
    y: thick,
    z: Math.sin(theta) * r,
    t,
  };
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xc4b8a4, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c4b8a4');
  scene.fog = new THREE.Fog('#c4b8a4', 36, 170);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 500000);

  const hemi = new THREE.HemisphereLight('#c4b8a4', '#6d5c4a', 0.9);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight('#fff0dc', 0);
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const galaxySpin = new THREE.Group();
  galaxySpin.rotation.x = 0.62;
  scene.add(galaxySpin);

  const sunPath = new THREE.Group();
  galaxySpin.add(sunPath);

  const arm = new THREE.Group();
  const sunT = 0.52;
  const sunTheta = (sunT - 0.12) * 5.8;
  const sunArmR = sunT * GALAXY_R;
  arm.position.set(Math.cos(sunTheta) * sunArmR, 0, Math.sin(sunTheta) * sunArmR);
  sunPath.add(arm);

  const sunMat = new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: true,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFade;
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float limb = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 1.35);
        float grain = sin(vWorld.x * 0.021 + uTime) * sin(vWorld.y * 0.019 - uTime * 0.65);
        grain *= sin(vWorld.z * 0.017 + uTime * 0.4);
        vec3 col = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 0.42, 0.14), limb);
        col += grain * 0.035;
        gl_FragColor = vec4(col, uFade);
        #include <logdepthbuf_fragment>
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), sunMat);
  arm.add(sun);

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: paintSoft('rgba(255, 244, 230, 0.95)', 'rgba(255, 120, 50, 0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  sunGlow.scale.setScalar(SUN_R * 4.2);
  sunGlow.material.fog = false;
  arm.add(sunGlow);

  // The ecliptic sits ~60° to the galactic plane. Every planet shares
  // this one plane group and then orbits independently inside it — the
  // inner and outer worlds used to be children of the Earth's own orbit
  // pivot, so their motion was the Earth's motion plus their own.
  const solarGroup = new THREE.Group();
  solarGroup.rotation.x = 1.05;
  arm.add(solarGroup);

  const yearPivot = new THREE.Group();
  solarGroup.add(yearPivot);

  const earthOrbit = makeOrbit(EARTH_ORBIT, 10, 0xf3eadc);
  solarGroup.add(earthOrbit);

  const sunOrbit = makeOrbit(sunArmR, 50, 0xe6d7c2);
  galaxySpin.add(sunOrbit);

  const earthPivot = new THREE.Group();
  earthPivot.position.set(EARTH_ORBIT, 0, 0);
  yearPivot.add(earthPivot);

  // The Moon's orbit is inclined ~5° to the ecliptic, in a plane of its
  // own: an inclined group outside the spinning orbit pivot, so the Moon
  // circles the Earth instead of riding a ring fixed above its pole.
  const moonPlane = new THREE.Group();
  moonPlane.rotation.z = 0.09;
  earthPivot.add(moonPlane);
  const moonPivot = new THREE.Group();
  moonPlane.add(moonPivot);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_R, 32, 24),
    new THREE.MeshLambertMaterial({ color: '#c4b6a4' }),
  );
  moon.position.set(MOON_ORBIT, 0, 0);
  moonPivot.add(moon);

  const innerPivot = new THREE.Group();
  solarGroup.add(innerPivot);
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(INNER_R, 24, 18),
    new THREE.MeshLambertMaterial({ color: '#6a6158' }),
  );
  inner.position.set(INNER_ORBIT, 0, 0);
  innerPivot.add(inner);

  const outerPivot = new THREE.Group();
  solarGroup.add(outerPivot);
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(OUTER_R, 28, 20),
    new THREE.MeshLambertMaterial({ color: '#c4b49a' }),
  );
  outer.position.set(OUTER_ORBIT, 0, 0);
  outerPivot.add(outer);
  const outerOrbit = makeOrbit(OUTER_ORBIT, 14, 0xe7dccb);
  solarGroup.add(outerOrbit);

  // Axial tilt (23.4°) is a fixed direction in space, and the spin happens
  // about that tilted axis — two separate groups. Folding both into one
  // Euler made the axis precess like a top instead of the Earth turning
  // beneath a steady axis, and because the tilt rode the orbit pivot the
  // axis used to swing around once a year, abolishing the seasons.
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.41;
  earthPivot.add(tilt);
  const earthSpin = new THREE.Group();
  tilt.add(earthSpin);

  const { dayTex, lampTex } = paintEarth();
  const earthMat = new THREE.MeshLambertMaterial({ map: dayTex });
  const earthShader = { uniforms: null };
  earthMat.onBeforeCompile = (shader) => {
    earthShader.uniforms = shader.uniforms;
    shader.uniforms.uLamps = { value: lampTex };
    shader.uniforms.uSunDir = { value: new THREE.Vector3(1, 0, 0) };
    shader.uniforms.uLamp = { value: 0 };
    shader.fragmentShader =
      'uniform sampler2D uLamps;\nuniform vec3 uSunDir;\nuniform float uLamp;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
        float ndl = dot(normalize(vNormal), normalize(uSunDir));
        float night = 1.0 - smoothstep(-0.06, 0.2, ndl);
        float band = smoothstep(-0.22, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.2, ndl));
        vec3 lamps = texture2D(uLamps, vMapUv).rgb;
        outgoingLight += lamps * night * uLamp;
        outgoingLight += vec3(1.0, 0.46, 0.2) * band * 0.28;
        #include <opaque_fragment>
      `,
    );
  };
  earthMat.customProgramCacheKey = () => 'earth-lamps-v1';

  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 128, 96), earthMat);
  earthSpin.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.015, 80, 60),
    new THREE.MeshLambertMaterial({
      alphaMap: paintClouds(),
      transparent: true,
      depthWrite: false,
      color: '#f7f3ee',
      opacity: 0,
    }),
  );
  earthSpin.add(clouds);

  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(n, viewDir)), 2.6);
        float lit = smoothstep(-0.15, 0.55, dot(n, normalize(uSunDir)));
        float alpha = fres * lit * uOpacity;
        gl_FragColor = vec4(0.95, 0.86, 0.74, alpha);
        #include <logdepthbuf_fragment>
      }
    `,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.08, 80, 60), atmoMat);
  tilt.add(atmo);

  const anchor = new THREE.Group();
  earthSpin.add(anchor);

  const key = new THREE.DirectionalLight('#ffe4c4', 2.8);
  key.position.set(-7, 8, 3.5);
  anchor.add(key);
  anchor.add(key.target);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(190, 64),
    new THREE.MeshLambertMaterial({
      map: paintDisc(),
      transparent: true,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.18;
  disc.visible = false;
  anchor.add(disc);

  const stoneMat = new THREE.MeshLambertMaterial({ color: '#8d7b66' });
  const stones = new THREE.Group();
  const stoneSpots = [
    [4.8, 2.2, 0.16],
    [-5.2, 1.4, 0.12],
    [3.2, -4.6, 0.18],
    [-4.4, -3.1, 0.11],
  ];
  for (const [x, z, s] of stoneSpots) {
    const stone = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), stoneMat);
    stone.scale.y = 0.55;
    stone.position.set(x, 0.18 + s * 0.35, z);
    stones.add(stone);
  }
  const place = new THREE.Group();
  const placeNormal = new THREE.Vector3();
  latLonToDir(HOME.lat, HOME.lon, placeNormal);
  place.position.copy(placeNormal).multiplyScalar(EARTH_R);
  place.quaternion.setFromUnitVectors(Y_AXIS, placeNormal);
  earthSpin.add(place);
  place.add(stones);

  const wall = new THREE.MeshLambertMaterial({ color: '#cbb89a' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#8a7058' });
  const doorMat = new THREE.MeshLambertMaterial({ color: '#5c4636' });
  const hamlet = new THREE.Group();
  const houses = [
    [-6.2, -7.4, 1.5, 1.2, 1.5],
    [5.4, -8.6, 1.1, 1.3, 2.4],
    [-9.2, -3.2, 1.8, 1.1, 1.2],
    [8.4, -4.2, 1.3, 1.5, 1.8],
    [-3.6, -12.5, 2.1, 1.2, 1.3],
    [2.8, -11.2, 0.9, 0.9, 2.7],
    [11.2, -8.8, 1.6, 1.2, 1.4],
  ];
  for (const [x, z, w, d, h] of houses) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.set(x, 0.18 + h / 2, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.1, d + 0.16), roofMat);
    cap.position.set(x, 0.18 + h + 0.05, z);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 0.06), doorMat);
    door.position.set(x, 0.4, z + d / 2);
    hamlet.add(body, cap, door);
  }
  const laneMat = new THREE.MeshLambertMaterial({ color: '#b7a48c' });
  const lane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 6), laneMat);
  lane.position.set(-1.4, 0.06, -11);
  hamlet.add(lane);
  place.add(hamlet);

  const figure = createFigure();
  figure.root.position.y = 0.2;
  anchor.add(figure.root);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({
      color: 0x1a140f,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  figure.root.add(contact);

  const longShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.45),
    new THREE.MeshBasicMaterial({
      map: paintShadow(),
      transparent: true,
      depthWrite: false,
    }),
  );
  longShadow.visible = false;
  figure.root.add(longShadow);

  const spark = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: paintSoft('rgba(255, 246, 236, 1)', 'rgba(255, 170, 110, 0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  );
  spark.position.y = 1.15;
  anchor.add(spark);

  const soft = paintSoft('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const rand = mulberry32(7);
  const gCount = 24000;
  const innerPos = [];
  const innerCol = [];
  const outerPos = [];
  const outerCol = [];
  const color = new THREE.Color();
  const sunX = Math.cos(sunTheta) * sunArmR;
  const sunZ = Math.sin(sunTheta) * sunArmR;
  for (let i = 0; i < gCount; i++) {
    const p = galaxyPoint(rand, i % 4);
    const dx = p.x - sunX;
    const dz = p.z - sunZ;
    const sunGap = Math.hypot(dx, dz);
    if (sunGap < 2400 && sunGap > 0) {
      const push = 2400 / sunGap;
      p.x = sunX + dx * push;
      p.z = sunZ + dz * push;
    }
    if (p.t < 0.18) color.set('#fffaf2');
    else if (p.t < 0.45) color.set('#ffe3c2');
    else color.set('#f0d2ae');
    if (rand() < 0.08) color.set('#d5dde4');
    const bucket = p.t < 0.42 ? innerPos : outerPos;
    const colors = p.t < 0.42 ? innerCol : outerCol;
    bucket.push(p.x, p.y, p.z);
    colors.push(color.r, color.g, color.b);
  }
  const galaxyMat = new THREE.PointsMaterial({
    size: 16,
    map: soft,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    opacity: 0,
    sizeAttenuation: true,
    fog: false,
  });
  // True differential rotation, per star, in the vertex shader: each
  // point turns at the flat-rotation-curve rate for its own radius, so
  // the disk shears continuously. Stars at the Sun's radius share the
  // Sun's rate exactly — the neighbourhood the Sun travels with is the
  // neighbourhood it keeps.
  const galaxyShader = { uniforms: null };
  galaxyMat.onBeforeCompile = (shader) => {
    galaxyShader.uniforms = shader.uniforms;
    shader.uniforms.uGalaxy = { value: 0.35 };
    shader.uniforms.uSunR = { value: sunArmR };
    shader.vertexShader = 'uniform float uGalaxy;\nuniform float uSunR;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float gR = length(position.xz);
       float gRatio = 0.65 + 0.35 * ((uSunR + 1800.0) / (gR + 1800.0));
       float gAng = uGalaxy * gRatio;
       float gC = cos(gAng);
       float gS = sin(gAng);
       transformed.xz = mat2(gC, -gS, gS, gC) * position.xz;`,
    );
  };
  galaxyMat.customProgramCacheKey = () => 'galaxy-differential-v1';
  const makeDisk = (pos, cols) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeBoundingSphere();
    return new THREE.Points(geo, galaxyMat);
  };
  const innerSpin = new THREE.Group();
  galaxySpin.add(innerSpin);
  const innerDisk = makeDisk(innerPos, innerCol);
  innerSpin.add(innerDisk);
  const outerSpin = new THREE.Group();
  galaxySpin.add(outerSpin);
  const galaxy = makeDisk(outerPos, outerCol);
  outerSpin.add(galaxy);

  const starCount = 1800;
  const sPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    dir.multiplyScalar(180000);
    sPos[i * 3] = dir.x;
    sPos[i * 3 + 1] = dir.y;
    sPos[i * 3 + 2] = dir.z;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.4,
    map: soft,
    transparent: true,
    depthWrite: false,
    color: '#e7e2d8',
    opacity: 0,
    sizeAttenuation: false,
    fog: false,
  });
  const stars = new THREE.Points(sGeo, starMat);
  scene.add(stars);

  const dCount = 160;
  const dPos = new Float32Array(dCount * 3);
  const nodes = [];
  for (let i = 0; i < 10; i++) {
    nodes.push(
      new THREE.Vector3((rand() - 0.5) * 140000, (rand() - 0.5) * 50000, (rand() - 0.5) * 140000),
    );
  }
  let di = 0;
  for (let i = 0; di < dCount; i++) {
    const a = nodes[i % nodes.length];
    const b = nodes[(i + 3) % nodes.length];
    const t = rand();
    const p = a.clone().lerp(b, t);
    p.x += (rand() - 0.5) * 6000;
    p.y += (rand() - 0.5) * 4000;
    p.z += (rand() - 0.5) * 6000;
    if (p.length() < 22000) continue;
    dPos[di * 3] = p.x;
    dPos[di * 3 + 1] = p.y;
    dPos[di * 3 + 2] = p.z;
    di += 1;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const distantMat = new THREE.PointsMaterial({
    size: 2.2,
    map: paintSoft('rgba(255, 236, 214, 1)', 'rgba(255, 210, 170, 0)'),
    transparent: true,
    depthWrite: false,
    opacity: 0,
    sizeAttenuation: false,
    color: '#f0e0cc',
    fog: false,
  });
  const distant = new THREE.Points(dGeo, distantMat);
  scene.add(distant);

  const neighborCount = 90;
  const neighborBase = new Float32Array(neighborCount * 3);
  const neighborPhase = new Float32Array(neighborCount);
  const neighborRand = mulberry32(21);
  for (let i = 0; i < neighborCount; i++) {
    const radius = 1400 + neighborRand() * 3200;
    const theta = neighborRand() * Math.PI * 2;
    const lift = (neighborRand() - 0.5) * 500;
    neighborBase[i * 3] = Math.cos(theta) * radius;
    neighborBase[i * 3 + 1] = lift;
    neighborBase[i * 3 + 2] = Math.sin(theta) * radius;
    neighborPhase[i] = neighborRand() * Math.PI * 2;
  }
  const neighborGeo = new THREE.BufferGeometry();
  neighborGeo.setAttribute('position', new THREE.BufferAttribute(neighborBase.slice(), 3));
  const neighborMat = new THREE.PointsMaterial({
    size: 26,
    map: soft,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    color: '#fff4e4',
    fog: false,
  });
  const neighbors = new THREE.Points(neighborGeo, neighborMat);
  arm.add(neighbors);

  // Two master clocks, not ten independent ones. Everything in the solar
  // system is a fixed multiple of the year angle (spin 16×, Moon 5⅓×,
  // planets at their Kepler ratios), and everything galactic is a fixed
  // multiple of the Sun's galactic angle. A phase transition now changes
  // how fast time flows, never which motions exist: nothing starts,
  // stops, or slows down just because the camera arrived.
  const SPINS_PER_YEAR = 16;
  const MOONS_PER_YEAR = SPINS_PER_YEAR / 3;
  const state = { solar: 0, galaxy: 0.35 };

  const sky = { r: 196, g: 184, b: 164 };
  const tmp = {
    dir: new THREE.Vector3(),
    earth: new THREE.Vector3(),
    sun: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    ta: new THREE.Vector3(),
    tb: new THREE.Vector3(),
    tc: new THREE.Vector3(),
    td: new THREE.Vector3(),
    side: new THREE.Vector3(),
    cam: new THREE.Vector3(),
    look: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    q: new THREE.Quaternion(),
  };

  function placeWalker(x, z) {
    latLonToDir(HOME.lat, HOME.lon, tmp.normal);
    HOME_QUAT.setFromUnitVectors(Y_AXIS, tmp.normal);
    tmp.a.set(x, 0, z).applyQuaternion(HOME_QUAT);
    tmp.b.copy(tmp.normal).multiplyScalar(EARTH_R).add(tmp.a);
    tmp.b.normalize();
    WALK_SPIN.setFromUnitVectors(tmp.normal, tmp.b);
    anchor.quaternion.copy(WALK_SPIN).multiply(HOME_QUAT);
    anchor.position.copy(tmp.b).multiplyScalar(EARTH_R);
  }

  // Time itself accelerates as the view widens, smoothly and for every
  // body in a family at once. The solar clock begins to flow as the
  // turning Earth becomes visible and keeps flowing, unchanged, while
  // the year, the Moon and the planets take over the story; likewise the
  // galactic clock. Ratios between bodies never change with zoom.
  function solarRate(u) {
    return 0.015 + 0.11 * smoothstep(0.3, 0.52, u) + 0.06 * smoothstep(0.52, 0.68, u);
  }

  function galaxyRate(u) {
    return 0.01 + 0.12 * smoothstep(0.66, 0.84, u);
  }

  function integrate(dPlay, u0, u1, reduced) {
    if (reduced) {
      state.solar = u1 * 2.6;
      state.galaxy = 0.35 + u1 * 0.9;
      return;
    }
    const steps = Math.max(1, Math.ceil(Math.abs(dPlay) / 0.04));
    for (let i = 1; i <= steps; i++) {
      const u = u0 + (u1 - u0) * (i / steps);
      const dp = dPlay / steps;
      state.solar += dp * solarRate(u);
      state.galaxy += dp * galaxyRate(u);
    }
  }

  function reset() {
    state.solar = 0;
    state.galaxy = 0.35;
  }

  function skyAt(u) {
    const keys = [
      { u: 0, v: [196, 184, 164] },
      { u: 0.18, v: [166, 152, 134] },
      { u: 0.3, v: [96, 108, 112] },
      { u: 0.4, v: [24, 32, 36] },
      { u: 0.5, v: [17, 14, 12] },
      { u: 1, v: [17, 14, 12] },
    ];
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (u <= keys[i + 1].u) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const t = smoothstep(a.u, b.u, u);
    sky.r = a.v[0] + (b.v[0] - a.v[0]) * t;
    sky.g = a.v[1] + (b.v[1] - a.v[1]) * t;
    sky.b = a.v[2] + (b.v[2] - a.v[2]) * t;
    return sky;
  }

  function frame(u, scale) {
    const back = keyLerp(u, [
      { u: 0, v: 3.8 },
      { u: 0.1, v: 7 },
      { u: 0.16, v: 14 },
      { u: 0.24, v: 28 },
      { u: 0.36, v: 40 },
    ]);
    const lift = keyLerp(u, [
      { u: 0, v: 1.7 },
      { u: 0.1, v: 3.1 },
      { u: 0.16, v: 18 },
      { u: 0.24, v: 110 },
      { u: 0.34, v: 560 },
      { u: 0.42, v: 720 },
    ]);
    const side = keyLerp(u, [
      { u: 0, v: 2.4 },
      { u: 0.14, v: 8 },
      { u: 0.28, v: 30 },
      { u: 0.4, v: 48 },
    ]);

    anchor.updateWorldMatrix(true, true);
    figure.root.updateWorldMatrix(true, true);
    earth.getWorldPosition(tmp.earth);
    sun.getWorldPosition(tmp.sun);
    anchor.getWorldPosition(tmp.look);
    tmp.normal.copy(tmp.look).sub(tmp.earth).normalize();
    anchor.getWorldQuaternion(tmp.q);
    tmp.q.multiply(CAM_YAW);
    tmp.right.set(1, 0, 0).applyQuaternion(tmp.q);
    tmp.fwd.set(0, 0, 1).applyQuaternion(tmp.q);
    const chest = 1.15 * scale;
    tmp.ta.copy(tmp.look).addScaledVector(tmp.normal, 0.04 + chest);
    tmp.a
      .copy(tmp.ta)
      .addScaledVector(tmp.right, side)
      .addScaledVector(tmp.fwd, back)
      .addScaledVector(tmp.normal, Math.max(0.4, lift - chest));

    const dist = logKey(u, DIST);
    const toSun = tmp.b.copy(tmp.sun).sub(tmp.earth).normalize();
    tmp.side.crossVectors(toSun, WORLD_UP);
    if (tmp.side.lengthSq() < 1e-6) tmp.side.set(0, 0, 1);
    tmp.side.normalize();
    tmp.c
      .copy(toSun)
      .multiplyScalar(0.28)
      .addScaledVector(tmp.side, 0.86)
      .addScaledVector(WORLD_UP, 0.18)
      .normalize();
    tmp.b.copy(tmp.earth).addScaledVector(tmp.c, dist);
    tmp.tb.copy(tmp.earth);

    tmp.d.copy(tmp.sun).addScaledVector(SUN_OFFSET, dist);
    tmp.td.copy(tmp.sun);

    galaxySpin.getWorldPosition(tmp.look);
    tmp.cam.copy(tmp.look).addScaledVector(GALAXY_OFFSET, dist);

    // Wider, earlier handovers: the next centre is already taking weight
    // while the current one still holds the frame, so the view is carried
    // across the boundary by both — no arrival, cut, and departure.
    const wB = smoothstep(0.33, 0.49, u);
    const wC = smoothstep(0.51, 0.67, u);
    const wD = smoothstep(0.73, 0.89, u);

    tmp.a.lerp(tmp.b, wB);
    tmp.ta.lerp(tmp.tb, wB);
    tmp.a.lerp(tmp.d, wC);
    tmp.ta.lerp(tmp.td, wC);
    tmp.a.lerp(tmp.cam, wD);
    tmp.ta.lerp(tmp.look, wD);

    if (u > 0.24) pushOut(tmp.a, tmp.earth, EARTH_R + 3);
    if (u > 0.46) pushOut(tmp.a, tmp.sun, SUN_R + 40);

    tmp.up.copy(tmp.normal).lerp(WORLD_UP, smoothstep(0.36, 0.58, u)).normalize();
    camera.up.copy(tmp.up);
    camera.position.copy(tmp.a);
    camera.lookAt(tmp.ta);

    const focus = camera.position.distanceTo(tmp.ta);
    camera.near = Math.max(0.04, focus / 180);
    camera.far = Math.max(focus * 80, 4000);
    camera.updateProjectionMatrix();
    return focus;
  }

  function pushOut(pos, center, minR) {
    tmp.dir.copy(pos).sub(center);
    const len = tmp.dir.length();
    if (len < minR && len > 0) pos.copy(center).addScaledVector(tmp.dir.normalize(), minR);
  }

  function render(u, playTime, width, height) {
    const walk = sampleWalk(playTime);
    placeWalker(walk.x, walk.z);

    // All angles derive from the two master clocks, with the offsets the
    // opening composition was built with.
    const yearAngle = state.solar;
    const spinAngle = 0.15 + state.solar * SPINS_PER_YEAR;
    const moonAngle = 0.8 + state.solar * MOONS_PER_YEAR;
    const innerAngle = 0.4 + state.solar * keplerRatio(INNER_ORBIT, EARTH_ORBIT);
    const outerAngle = 1.1 + state.solar * keplerRatio(OUTER_ORBIT, EARTH_ORBIT);
    const sunSpinAngle = 0.4 + state.solar * 4;
    const galaxyAngle = state.galaxy;
    // The Sun crosses the galactic plane about three times per orbit,
    // a few hundred units — the thickness of the disk it moves through,
    // not the old 2,600-unit plunge across it.
    const bobAngle = 0.2 + (galaxyAngle - 0.35) * 3;

    sunPath.rotation.y = galaxyAngle;
    // The solar system's orientation is fixed against the distant stars:
    // counter the orbit pivot so the ecliptic, the Earth's axis and the
    // neighbouring stars are carried around the galaxy, not spun with
    // the line to its centre.
    arm.quaternion.setFromAxisAngle(Y_AXIS, -galaxyAngle);
    if (galaxyShader.uniforms) galaxyShader.uniforms.uGalaxy.value = galaxyAngle;
    innerSpin.rotation.y = 0;
    outerSpin.rotation.y = 0;
    const breathe = 1 + 0.018 * Math.sin(galaxyAngle + 0.6);
    arm.position.set(
      Math.cos(sunTheta) * sunArmR * breathe,
      Math.sin(bobAngle) * 220,
      Math.sin(sunTheta) * sunArmR * breathe,
    );
    sun.rotation.y = sunSpinAngle;
    sunMat.uniforms.uTime.value = sunSpinAngle * 2.2;
    const driftPos = neighborGeo.attributes.position;
    for (let i = 0; i < neighborCount; i++) {
      const phase = neighborPhase[i];
      const slide = Math.sin(galaxyAngle * 0.22 + phase);
      driftPos.setXYZ(
        i,
        neighborBase[i * 3] + Math.cos(phase) * slide * 130,
        neighborBase[i * 3 + 1] + Math.sin(bobAngle * 0.5 + phase) * 80,
        neighborBase[i * 3 + 2] + Math.sin(phase) * slide * 130,
      );
    }
    driftPos.needsUpdate = true;
    yearPivot.rotation.y = yearAngle;
    // Hold the Earth's orientation against its own orbit: the axis keeps
    // pointing one way all year (which is what makes seasons), while the
    // ground, the Moon's plane and the tilt group ride the fixed frame.
    earthPivot.quaternion.setFromAxisAngle(Y_AXIS, -yearAngle);
    earthSpin.rotation.y = spinAngle;
    clouds.rotation.y = spinAngle * 0.08;
    moonPivot.rotation.y = moonAngle;
    innerPivot.rotation.y = innerAngle;
    inner.rotation.y = innerAngle * 2;
    outerPivot.rotation.y = outerAngle;
    outer.rotation.y = outerAngle * 0.6;

    const pose = poseFigure(figure, playTime, walk);
    figure.root.scale.setScalar(1);

    frame(u, 1);

    const skyColor = skyAt(u);
    scene.background.setRGB(
      skyColor.r / 255,
      skyColor.g / 255,
      skyColor.b / 255,
      THREE.SRGBColorSpace,
    );
    scene.fog.color.copy(scene.background);
    const fogAmt = 1 - smoothstep(0.08, 0.24, u);
    scene.fog.near = THREE.MathUtils.lerp(1e8, 26, fogAmt);
    scene.fog.far = THREE.MathUtils.lerp(1e9, 150, fogAmt);
    renderer.setClearColor(scene.background, 1);

    hemi.color.copy(scene.background);
    hemi.groundColor.set('#5c4d3d');
    hemi.intensity = THREE.MathUtils.lerp(0.95, 0.08, smoothstep(0.28, 0.5, u));
    key.intensity = 3.1 * (1 - smoothstep(0.18, 0.48, u));

    sun.getWorldPosition(tmp.sun);
    earth.getWorldPosition(tmp.earth);
    sunLight.position.copy(tmp.sun);
    sunLight.target.position.copy(tmp.earth);
    sunLight.intensity = 3.4 * smoothstep(0.18, 0.48, u);

    const sunDir = tmp.dir.copy(tmp.sun).sub(tmp.earth).normalize();
    atmoMat.uniforms.uSunDir.value.copy(sunDir);
    if (earthShader.uniforms) {
      tmp.b.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      earthShader.uniforms.uSunDir.value.copy(tmp.b);
      earthShader.uniforms.uLamp.value = 2.4 * smoothstep(0.4, 0.5, u);
    }

    anchor.getWorldPosition(tmp.look);
    earth.getWorldPosition(tmp.earth);
    sun.getWorldPosition(tmp.sun);
    const alt = camera.position.distanceTo(tmp.earth) - EARTH_R;
    const camSun = camera.position.distanceTo(tmp.sun);
    const camGal = camera.position.length();
    camera.fov = width < height ? 48 : 34;
    const fovRad = (camera.fov * Math.PI) / 180;
    const px = (worldSize, distance) =>
      (worldSize / Math.max(distance, 0.001)) * (height * 0.5) / Math.tan(fovRad / 2);
    const personDist = camera.position.distanceTo(tmp.look);
    const personPx = px(1.7, personDist);
    const earthPx = px(EARTH_R * 2, camera.position.distanceTo(tmp.earth));

    figure.mat.opacity = smoothstep(1.6, 7, personPx);
    figure.mat.transparent = figure.mat.opacity < 0.99;
    figure.mat.depthWrite = figure.mat.opacity > 0.45;
    contact.material.opacity = 0.28 * figure.mat.opacity;
    disc.material.opacity = 1 - smoothstep(20, 38, alt);
    disc.material.depthWrite = disc.material.opacity > 0.85;
    disc.visible = disc.material.opacity > 0.03;
    // The hamlet hands over to the spark instead of shrinking into hard
    // sub-pixel boxes: it dissolves as the altitude grows, over the same
    // stretch where the person dissolves into that point of light.
    const hamletOpacity = 1 - smoothstep(60, 260, alt);
    for (const m of [wall, roofMat, doorMat, laneMat, stoneMat]) {
      m.opacity = hamletOpacity;
      m.transparent = hamletOpacity < 0.99;
      m.depthWrite = hamletOpacity > 0.5;
    }
    hamlet.visible = hamletOpacity > 0.03;
    stones.visible = hamlet.visible;

    const sparkOn = (1 - smoothstep(3, 9, personPx)) * smoothstep(22, 60, earthPx);
    spark.material.opacity = sparkOn;
    const sparkPx = Math.min(Math.max(personPx, 2.2), earthPx * 0.1);
    const sparkWorld = (sparkPx * personDist * Math.tan(fovRad / 2)) / (height * 0.5);
    spark.scale.setScalar(THREE.MathUtils.clamp(sparkWorld, 0.15, 80));

    const earthAng = EARTH_R / Math.max(1, camera.position.distanceTo(tmp.earth));
    clouds.material.opacity = 0.32 * smoothstep(100, 460, alt);
    atmoMat.uniforms.uOpacity.value =
      0.95 * smoothstep(50, 260, alt) * smoothstep(0.004, 0.02, earthAng);
    moon.material.opacity = 1;
    moon.material.transparent = false;
    inner.material.opacity = 1;
    inner.material.transparent = false;
    outer.material.opacity = 1;
    outer.material.transparent = false;
    sunMat.uniforms.uFade.value = 1;
    sunMat.depthWrite = true;
    sun.visible = true;
    sunGlow.material.opacity = 0.7;
    earthOrbit.material.opacity = 0.5 * smoothstep(EARTH_ORBIT * 1.15, EARTH_ORBIT * 2.3, camSun);
    outerOrbit.material.opacity = 0.4 * smoothstep(OUTER_ORBIT * 0.9, OUTER_ORBIT * 1.55, camSun);
    sunOrbit.material.opacity = 0.28 * smoothstep(sunArmR * 1.15, sunArmR * 2.4, camGal);

    const night = smoothstep(0.3, 0.46, u);
    starMat.opacity = 0.9 * night;
    stars.visible = night > 0.02;
    neighborMat.opacity = 0.85 * night;
    neighborMat.size = 26;
    neighbors.visible = night > 0.02;
    galaxyMat.opacity = night * smoothstep(5000, 16000, camGal);
    galaxyMat.size = 16;
    galaxy.visible = galaxyMat.opacity > 0.01;
    innerSpin.visible = galaxy.visible;
    distantMat.opacity = 0.55 * night;
    distant.visible = night > 0.02;
    distantMat.size = 1.4 + smoothstep(24000, 80000, camGal) * 2.2;

    const veil = smoothstep(0.97, 1, u);

    camera.aspect = width / height;
    camera.fov = width < height ? 48 : 34;
    camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, width < 800 ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);

    return { sky: skyColor, veil, stepped: pose.stepped && u < 0.34 };
  }

  return { render, integrate, reset, sky };
}

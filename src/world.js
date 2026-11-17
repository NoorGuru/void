import * as THREE from 'three';
import { createFigure, poseFigure, sampleWalk } from './figure.js';
import { keyInterpolator } from './motion.js';
import { keplerRatio } from './orbits.js';
import { earthShader, cloudShader, atmosphereShader, skyShader } from './shaders.js';

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

// The evening the piece opens on: the Sun about 13° above home's horizon
// on the side where it is going down, behind the camera and to its right,
// so the last light falls on the person's face and their shadow runs
// ahead of them toward the sea they cannot see yet.
const SUN_ELEVATION = 0.22;
const SUN_AZIMUTH = Math.atan2(0.8, 0.9);
const SEA_ANGLE = 0.2;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CAM_YAW = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -0.55);
const HOME_QUAT = new THREE.Quaternion();
const WALK_SPIN = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SUN_OFFSET = new THREE.Vector3(1, 0.28, -0.14).normalize();
const GALAXY_OFFSET = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
const ECLIPTIC = new THREE.Vector3(0, 1, 0);
const GALAXY_UP = new THREE.Vector3(0, 1, 0);

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Every scale curve rides the same continuous-slope interpolator as the
// cue timing, so the pull-back accelerates through a phase boundary
// instead of arriving, pausing, and leaving again.
const DIST = keyInterpolator(
  [
    { u: 0, v: 6.2 },
    { u: 0.08, v: 9 },
    { u: 0.16, v: 32 },
    { u: 0.24, v: 90 },
    { u: 0.32, v: 520 },
    { u: 0.42, v: 2200 },
    { u: 0.5, v: 3400 },
    { u: 0.58, v: 5600 },
    { u: 0.66, v: 9000 },
    { u: 0.72, v: 14000 },
    { u: 0.78, v: 22000 },
    { u: 0.86, v: 60000 },
    { u: 0.92, v: 160000 },
    { u: 0.96, v: 420000 },
    { u: 1, v: 1600000 },
  ],
  { log: true },
);

const BACK = keyInterpolator([
  { u: 0, v: 3.8 },
  { u: 0.1, v: 7 },
  { u: 0.16, v: 14 },
  { u: 0.24, v: 28 },
  { u: 0.36, v: 40 },
]);
const LIFT = keyInterpolator([
  { u: 0, v: 1.7 },
  { u: 0.1, v: 3.1 },
  { u: 0.16, v: 18 },
  { u: 0.24, v: 110 },
  { u: 0.34, v: 560 },
  { u: 0.42, v: 720 },
]);
const SIDE = keyInterpolator([
  { u: 0, v: 2.4 },
  { u: 0.14, v: 8 },
  { u: 0.28, v: 30 },
  { u: 0.4, v: 48 },
]);

// The scale relay. Sizes are compressed so each scale fits on screen, but
// each body hands over to the next by shrinking toward its true size as
// the next one takes the frame: the Earth falls well below the Sun by the
// year, and the whole solar system closes into one star before the
// galaxy arrives.
const EARTH_SCALE = keyInterpolator(
  [
    { u: 0, v: 1 },
    { u: 0.47, v: 1 },
    { u: 0.66, v: 0.05 },
    { u: 1, v: 0.05 },
  ],
  { log: true },
);
const SYSTEM_SCALE = keyInterpolator(
  [
    { u: 0, v: 1 },
    { u: 0.72, v: 1 },
    { u: 0.86, v: 0.025 },
    { u: 1, v: 0.025 },
  ],
  { log: true },
);

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

function gaussian(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function latLonToDir(lat, lon, target) {
  const cosLat = Math.cos(lat);
  target.set(-Math.cos(lon) * cosLat, Math.sin(lat), Math.sin(lon) * cosLat);
  return target;
}

function paintDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  grd.addColorStop(0, 'rgba(206, 186, 156, 1)');
  grd.addColorStop(0.7, 'rgba(200, 178, 146, 1)');
  grd.addColorStop(1, 'rgba(196, 172, 140, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const rand = mulberry32(5);
  for (let i = 0; i < 2600; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 220;
    g.fillStyle = rand() < 0.5 ? 'rgba(120, 96, 70, 0.07)' : 'rgba(240, 222, 196, 0.08)';
    g.beginPath();
    g.ellipse(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 1 + rand() * 4, 1 + rand() * 2, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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

function paintCore(inner, mid) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.18, mid);
  grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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

function galaxyPoint(rand, arm, radius = GALAXY_R) {
  const t = Math.pow(rand(), 0.72);
  const r = t * radius;
  let theta = arm * (Math.PI / 2);
  if (t > 0.12) theta += (t - 0.12) * 5.8;
  theta += (rand() - 0.5) * (0.16 + t * 0.5);
  if (rand() < 0.18) theta = rand() * Math.PI * 2;
  const thick = (rand() - 0.5) * (30 + (1 - t) * 280) * (radius / GALAXY_R);
  return {
    x: Math.cos(theta) * r,
    y: thick,
    z: Math.sin(theta) * r,
    t,
  };
}

function shaderMesh(geometry, shader, uniforms, options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    ...options,
  });
  return new THREE.Mesh(geometry, material);
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xd6b492, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6b492');
  scene.fog = new THREE.Fog('#dbb28f', 36, 170);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 500000);

  const hemi = new THREE.HemisphereLight('#9aa4b2', '#7a6250', 2.2);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight('#fff0dc', 0);
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const skyUniforms = {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uBg: { value: new THREE.Color() },
    uLow: { value: new THREE.Color('#dbb28f') },
    uFade: { value: 1 },
  };
  const skyDome = shaderMesh(new THREE.SphereGeometry(1, 48, 24), skyShader, skyUniforms, {
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  skyDome.renderOrder = -1000;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

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

  // Everything bound to the Sun, scaled as one in the relay. The
  // neighbouring stars stay outside it, in `arm`.
  const system = new THREE.Group();
  arm.add(system);

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
        vec3 q = n * 9.0;
        float grain = sin(q.x * 3.1 + uTime) * sin(q.y * 2.7 - uTime * 0.65) * sin(q.z * 2.3 + uTime * 0.4);
        vec3 col = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 0.42, 0.14), limb);
        col += grain * 0.035;
        gl_FragColor = vec4(col, uFade);
        #include <logdepthbuf_fragment>
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), sunMat);
  system.add(sun);

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: paintSoft('rgba(255, 244, 230, 0.95)', 'rgba(255, 120, 50, 0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  sunGlow.material.fog = false;
  arm.add(sunGlow);

  // The ecliptic sits ~60° to the galactic plane. Every planet shares
  // this one plane group and then orbits independently inside it.
  const solarGroup = new THREE.Group();
  solarGroup.rotation.x = 1.05;
  system.add(solarGroup);

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
  // own. The Moon is a child of its pivot, so it keeps one face to Earth.
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

  // Axial tilt (23.4°) is a fixed direction in space; the spin happens
  // about that tilted axis, in a separate group.
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.41;
  earthPivot.add(tilt);
  const earthSpin = new THREE.Group();
  tilt.add(earthSpin);

  const placeNormal = new THREE.Vector3();
  latLonToDir(HOME.lat, HOME.lon, placeNormal);

  const earthUniforms = {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uHome: { value: placeNormal.clone() },
    uSea: { value: placeNormal.clone() },
    uLamp: { value: 0 },
    uHaze: { value: 0 },
    uNear: { value: 1 },
  };
  const earth = shaderMesh(new THREE.SphereGeometry(EARTH_R, 192, 128), earthShader, earthUniforms);
  earthSpin.add(earth);

  const cloudUniforms = {
    uSunDir: earthUniforms.uSunDir,
    uHome: earthUniforms.uHome,
    uOpacity: { value: 0 },
    uTime: { value: 0 },
  };
  const clouds = shaderMesh(new THREE.SphereGeometry(EARTH_R * 1.012, 128, 96), cloudShader, cloudUniforms, {
    transparent: true,
    depthWrite: false,
  });
  earthSpin.add(clouds);

  const atmoUniforms = {
    uSunDir: earthUniforms.uSunDir,
    uCenter: { value: new THREE.Vector3() },
    uR: { value: EARTH_R },
    uRa: { value: EARTH_R * 1.05 },
    uOpacity: { value: 0 },
  };
  const atmo = shaderMesh(new THREE.SphereGeometry(EARTH_R * 1.05, 96, 64), atmosphereShader, atmoUniforms, {
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  tilt.add(atmo);

  const anchor = new THREE.Group();
  earthSpin.add(anchor);

  // The key light is the real Sun seen from where the person stands: its
  // direction is set every frame from the Sun's actual position, so the
  // evening light, the long shadows and the sunset seen from orbit are
  // one and the same.
  const key = new THREE.DirectionalLight('#ffd3a6', 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 140;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 3;
  anchor.add(key);
  anchor.add(key.target);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(190, 96),
    new THREE.MeshLambertMaterial({
      map: paintDisc(),
      transparent: true,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.18;
  disc.receiveShadow = true;

  const place = new THREE.Group();
  place.position.copy(placeNormal).multiplyScalar(EARTH_R);
  earthSpin.add(place);
  place.add(disc);

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
    stone.castShadow = true;
    stones.add(stone);
  }
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
  // Each house turns its lights on at its own moment as the Sun goes
  // down (thresholds in degrees of solar elevation): one or two are
  // already lit when the piece opens.
  const lightAt = [17, 6, 11, 2, -1, 15, 8];
  const windows = [];
  const windowGeo = new THREE.PlaneGeometry(0.24, 0.3);
  houses.forEach(([x, z, w, d, h], index) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.set(x, 0.18 + h / 2, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.1, d + 0.16), roofMat);
    cap.position.set(x, 0.18 + h + 0.05, z);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 0.06), doorMat);
    door.position.set(x, 0.4, z + d / 2);
    for (const mesh of [body, cap]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    hamlet.add(body, cap, door);

    const glass = new THREE.MeshBasicMaterial({
      color: '#ffc27a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const rows = h > 2 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const y = 0.18 + h * (rows === 2 ? 0.34 + r * 0.36 : 0.56);
      for (const side of w > 1.2 ? [-1, 1] : [1]) {
        const pane = new THREE.Mesh(windowGeo, glass);
        pane.position.set(x + side * w * 0.27, y, z + d / 2 + 0.006);
        hamlet.add(pane);
      }
    }
    windows.push({ glass, at: Math.sin((lightAt[index] * Math.PI) / 180) });
  });
  const laneMat = new THREE.MeshLambertMaterial({ color: '#b7a48c' });
  const lane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 6), laneMat);
  lane.position.set(-1.4, 0.06, -11);
  lane.receiveShadow = true;
  hamlet.add(lane);
  place.add(hamlet);

  const figure = createFigure();
  figure.root.position.y = 0.2;
  figure.root.traverse((node) => {
    if (node.isMesh) node.castShadow = true;
  });
  anchor.add(figure.root);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({
      color: 0x1a140f,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  figure.root.add(contact);

  const soft = paintSoft('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const rand = mulberry32(7);
  const gCount = 24000;
  const gPos = [];
  const gCol = [];
  const color = new THREE.Color();
  const sunX = Math.cos(sunTheta) * sunArmR;
  const sunZ = Math.sin(sunTheta) * sunArmR;
  for (let i = 0; i < gCount; i++) {
    const p = galaxyPoint(rand, i % 4);
    const dx = p.x - sunX;
    const dz = p.z - sunZ;
    const sunGap = Math.hypot(dx, dz);
    if (sunGap < 900 && sunGap > 0) {
      const push = 900 / sunGap;
      p.x = sunX + dx * push;
      p.z = sunZ + dz * push;
    }
    if (p.t < 0.18) color.set('#fffaf2');
    else if (p.t < 0.45) color.set('#ffe3c2');
    else color.set('#f0d2ae');
    if (rand() < 0.08) color.set('#d5dde4');
    gPos.push(p.x, p.y, p.z);
    gCol.push(color.r, color.g, color.b);
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
  // point turns at the flat-rotation-curve rate for its own radius (see
  // galaxyOmegaRatio in orbits.js). Stars at the Sun's radius share the
  // Sun's rate exactly.
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
  const galaxyGeo = new THREE.BufferGeometry();
  galaxyGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  galaxyGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
  galaxyGeo.computeBoundingSphere();
  const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
  galaxySpin.add(galaxy);

  const bulge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: paintCore('rgba(255, 240, 214, 1)', 'rgba(255, 196, 140, 0.35)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false,
    }),
  );
  galaxySpin.add(bulge);

  // Andromeda: larger than our galaxy, steeply inclined, off to one side
  // of the view the camera takes when it leaves the disk. Its distance is
  // compressed like every other distance here.
  const viewFwd = GALAXY_OFFSET.clone().negate();
  const viewUpRef = new THREE.Vector3(0, Math.cos(galaxySpin.rotation.x), Math.sin(galaxySpin.rotation.x))
    .lerp(WORLD_UP, 0.3)
    .normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewFwd, viewUpRef).normalize();
  const viewUp = new THREE.Vector3().crossVectors(viewRight, viewFwd).normalize();
  const andromeda = new THREE.Group();
  andromeda.position
    .copy(viewRight)
    .multiplyScalar(50000)
    .addScaledVector(viewUp, 10000)
    .addScaledVector(GALAXY_OFFSET, -30000);
  // Seen about 77° from face-on, as it is from here: a long tilted oval.
  const andromedaAxis = viewUp
    .clone()
    .multiplyScalar(Math.cos(0.5))
    .addScaledVector(viewRight, Math.sin(0.5))
    .multiplyScalar(Math.sin(1.34))
    .addScaledVector(GALAXY_OFFSET, Math.cos(1.34))
    .normalize();
  andromeda.quaternion.setFromUnitVectors(Y_AXIS, andromedaAxis);
  scene.add(andromeda);
  const andromedaDisk = new THREE.Group();
  andromeda.add(andromedaDisk);
  const aRand = mulberry32(19);
  const aPos = [];
  const aCol = [];
  for (let i = 0; i < 9000; i++) {
    const p = galaxyPoint(aRand, i % 2 === 0 ? 0 : 2, GALAXY_R * 1.4);
    aPos.push(p.x, p.y, p.z);
    color.set(p.t < 0.25 ? '#fff4e2' : p.t < 0.5 ? '#ffe2c0' : '#e8d4bc');
    aCol.push(color.r, color.g, color.b);
  }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute('position', new THREE.Float32BufferAttribute(aPos, 3));
  aGeo.setAttribute('color', new THREE.Float32BufferAttribute(aCol, 3));
  const andromedaMat = new THREE.PointsMaterial({
    size: 18,
    map: soft,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    opacity: 0,
    sizeAttenuation: true,
    fog: false,
  });
  andromedaDisk.add(new THREE.Points(aGeo, andromedaMat));
  const andromedaCore = new THREE.Sprite(bulge.material.clone());
  andromeda.add(andromedaCore);

  // Stars of our own galaxy, seen from inside it: a sky at infinity that
  // travels with the camera, and fades as the camera leaves the disk.
  const starCount = 2400;
  const sPos = new Float32Array(starCount * 3);
  const sCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const dir = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
    sPos[i * 3] = dir.x;
    sPos[i * 3 + 1] = dir.y;
    sPos[i * 3 + 2] = dir.z;
    const warm = rand();
    color.set(warm < 0.15 ? '#cfdaf0' : warm < 0.7 ? '#efe8dc' : '#f6d9b4');
    const b = 0.35 + 0.65 * rand() ** 2;
    sCol[i * 3] = color.r * b;
    sCol[i * 3 + 1] = color.g * b;
    sCol[i * 3 + 2] = color.b * b;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.4,
    map: soft,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    opacity: 0,
    sizeAttenuation: false,
    fog: false,
  });
  const stars = new THREE.Points(sGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // The cosmic web: clusters joined by filaments, thousands of galaxies,
  // each one dimmer and redder the farther it is (the light of distant
  // galaxies is stretched on its way here).
  const webRand = mulberry32(33);
  const nodes = [];
  for (let i = 0; i < 60; i++) {
    nodes.push(
      new THREE.Vector3(
        (webRand() - 0.5) * 2.2e6,
        (webRand() - 0.5) * 1.2e6,
        (webRand() - 0.5) * 2.2e6,
      ),
    );
  }
  nodes.push(new THREE.Vector3(-320000, -50000, 200000), new THREE.Vector3(300000, 70000, -240000));
  const edges = [];
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: a.distanceToSquared(b) }))
      .filter((e) => e.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3);
    for (const e of near) if (e.j > i || !edges.some(([p, q]) => p === e.j && q === i)) edges.push([i, e.j]);
  });
  const webCount = 40000;
  const wPos = new Float32Array(webCount * 3);
  const wCol = new Float32Array(webCount * 3);
  const p = new THREE.Vector3();
  let wi = 0;
  while (wi < webCount) {
    if (webRand() < 0.3) {
      const c = nodes[Math.floor(webRand() * nodes.length)];
      const spread = 30000 + webRand() * 40000;
      p.set(gaussian(webRand), gaussian(webRand), gaussian(webRand)).multiplyScalar(spread * 0.6).add(c);
    } else {
      const [ia, ib] = edges[Math.floor(webRand() * edges.length)];
      p.copy(nodes[ia]).lerp(nodes[ib], webRand());
      p.x += gaussian(webRand) * 16000;
      p.y += gaussian(webRand) * 16000;
      p.z += gaussian(webRand) * 16000;
    }
    if (p.length() < 40000) continue;
    wPos[wi * 3] = p.x;
    wPos[wi * 3 + 1] = p.y;
    wPos[wi * 3 + 2] = p.z;
    const far = Math.min(1, p.length() / 1.6e6);
    const b = (0.6 + 0.4 * webRand()) * (1 - far * 0.5);
    color.setRGB(1, 0.93 - far * 0.28, 0.84 - far * 0.42);
    wCol[wi * 3] = color.r * b;
    wCol[wi * 3 + 1] = color.g * b;
    wCol[wi * 3 + 2] = color.b * b;
    wi += 1;
  }
  const webGeo = new THREE.BufferGeometry();
  webGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  webGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 3));
  const webMat = new THREE.PointsMaterial({
    size: 2.2,
    map: soft,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    opacity: 0,
    sizeAttenuation: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const web = new THREE.Points(webGeo, webMat);
  scene.add(web);

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

  // Two master clocks. Everything in the solar system is a fixed multiple
  // of the year angle (spin 16×, Moon 5⅓×, planets at their Kepler
  // ratios), and everything galactic is a fixed multiple of the Sun's
  // galactic angle. A phase changes how fast time flows, never which
  // motions exist.
  const SPINS_PER_YEAR = 16;
  const MOONS_PER_YEAR = SPINS_PER_YEAR / 3;
  const state = { solar: 0, galaxy: 0.35 };
  let spin0 = 0.15;

  const sky = { r: 214, g: 180, b: 146 };
  const tmp = {
    dir: new THREE.Vector3(),
    earth: new THREE.Vector3(),
    sun: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    home: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
    d: new THREE.Vector3(),
    ta: new THREE.Vector3(),
    tb: new THREE.Vector3(),
    td: new THREE.Vector3(),
    side: new THREE.Vector3(),
    cam: new THREE.Vector3(),
    look: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    qi: new THREE.Quaternion(),
  };

  function poseBodies() {
    const yearAngle = state.solar;
    const spinAngle = spin0 + state.solar * SPINS_PER_YEAR;
    const moonAngle = 0.8 + state.solar * MOONS_PER_YEAR;
    const innerAngle = 0.4 + state.solar * keplerRatio(INNER_ORBIT, EARTH_ORBIT);
    const outerAngle = 1.1 + state.solar * keplerRatio(OUTER_ORBIT, EARTH_ORBIT);
    const sunSpinAngle = 0.4 + state.solar * 4;
    const galaxyAngle = state.galaxy;
    // The Sun crosses the galactic plane about three times per orbit,
    // a few hundred units: the thickness of the disk it moves through.
    const bobAngle = 0.2 + (galaxyAngle - 0.35) * 3;

    sunPath.rotation.y = galaxyAngle;
    // The solar system's orientation is fixed against the distant stars:
    // counter the orbit pivot so the ecliptic and the Earth's axis are
    // carried around the galaxy, not spun with the line to its centre.
    arm.quaternion.setFromAxisAngle(Y_AXIS, -galaxyAngle);
    if (galaxyShader.uniforms) galaxyShader.uniforms.uGalaxy.value = galaxyAngle;
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
    andromedaDisk.rotation.y = 0.3 + (galaxyAngle - 0.35) * 0.8;
    yearPivot.rotation.y = yearAngle;
    // Hold the Earth's orientation against its own orbit: the axis keeps
    // pointing one way all year, which is what makes seasons.
    earthPivot.quaternion.setFromAxisAngle(Y_AXIS, -yearAngle);
    earthSpin.rotation.y = spinAngle;
    moonPivot.rotation.y = moonAngle;
    innerPivot.rotation.y = innerAngle;
    inner.rotation.y = innerAngle * 2;
    outerPivot.rotation.y = outerAngle;
    outer.rotation.y = outerAngle * 0.6;
  }

  function homeSunDot() {
    place.getWorldPosition(tmp.home);
    earth.getWorldPosition(tmp.earth);
    sun.getWorldPosition(tmp.sun);
    tmp.normal.copy(tmp.home).sub(tmp.earth).normalize();
    tmp.dir.copy(tmp.sun).sub(tmp.earth).normalize();
    return tmp.normal.dot(tmp.dir);
  }

  // Solve the opening at load: turn the Earth until the Sun stands at
  // SUN_ELEVATION over home while setting, then turn home's local frame
  // so the low Sun sits at SUN_AZIMUTH relative to the walk.
  function calibrate() {
    state.solar = 0;
    state.galaxy = 0.35;
    spin0 = 0;
    poseBodies();
    const target = Math.sin(SUN_ELEVATION);
    const steps = 4000;
    let prevA = 0;
    let prevE = null;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      earthSpin.rotation.y = a;
      scene.updateMatrixWorld(true);
      const e = homeSunDot();
      if (prevE !== null && prevE >= target && e < target) {
        spin0 = prevA + ((prevE - target) / (prevE - e)) * (a - prevA);
        break;
      }
      prevA = a;
      prevE = e;
    }
    earthSpin.rotation.y = spin0;
    scene.updateMatrixWorld(true);
    homeSunDot();
    const base = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, placeNormal);
    earthSpin.getWorldQuaternion(tmp.q);
    const local = tmp.dir.clone().applyQuaternion(tmp.q.invert()).applyQuaternion(base.clone().invert());
    const az = Math.atan2(local.x, local.z) - SUN_AZIMUTH;
    HOME_QUAT.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, az));
    place.quaternion.copy(HOME_QUAT);
    const walkDir = new THREE.Vector3(0, 0, -1).applyQuaternion(HOME_QUAT);
    earthUniforms.uSea.value
      .copy(placeNormal)
      .multiplyScalar(Math.cos(SEA_ANGLE))
      .addScaledVector(walkDir, Math.sin(SEA_ANGLE))
      .normalize();

    // Look at the solar system from 35° above the plane the planets share
    // (fixed against the stars), so their orbits read as open ellipses.
    solarGroup.getWorldQuaternion(tmp.q);
    ECLIPTIC.set(0, 1, 0).applyQuaternion(tmp.q);
    galaxySpin.getWorldQuaternion(tmp.q);
    GALAXY_UP.set(0, 1, 0).applyQuaternion(tmp.q);
    const across = SUN_OFFSET.clone().addScaledVector(ECLIPTIC, -SUN_OFFSET.dot(ECLIPTIC)).normalize();
    SUN_OFFSET.copy(ECLIPTIC).multiplyScalar(Math.sin(0.61)).addScaledVector(across, Math.cos(0.61)).normalize();
  }
  calibrate();

  function placeWalker(x, z) {
    tmp.a.set(x, 0, z).applyQuaternion(HOME_QUAT);
    tmp.b.copy(placeNormal).multiplyScalar(EARTH_R).add(tmp.a);
    tmp.b.normalize();
    WALK_SPIN.setFromUnitVectors(placeNormal, tmp.b);
    anchor.quaternion.copy(WALK_SPIN).multiply(HOME_QUAT);
    anchor.position.copy(tmp.b).multiplyScalar(EARTH_R);
  }

  // Time accelerates as the view widens, for every body in a family at
  // once. The solar clock all but stands still during the walk, so the
  // evening holds; it starts to flow as the camera climbs, which is what
  // brings the night over home during the coast, and keeps flowing while
  // the year, the Moon and the planets take over. Ratios between bodies
  // never change with zoom.
  function solarRate(u) {
    return (
      0.0001 +
      0.03 * smoothstep(0.26, 0.4, u) +
      0.08 * smoothstep(0.32, 0.52, u) +
      0.06 * smoothstep(0.52, 0.68, u)
    );
  }

  function galaxyRate(u) {
    return 0.01 + 0.12 * smoothstep(0.66, 0.84, u);
  }

  // The clocks are integrated along the timeline, so any jump (a scrub,
  // a reduced-motion step, the flight home) lands on the same sky as
  // playing through would.
  function integrate(t0, t1, uAt) {
    const steps = Math.max(1, Math.ceil(Math.abs(t1 - t0) / 0.04));
    const dp = (t1 - t0) / steps;
    for (let i = 0; i < steps; i++) {
      const u = uAt(t0 + dp * (i + 0.5));
      state.solar += dp * solarRate(u);
      state.galaxy += dp * galaxyRate(u);
    }
  }

  function reset() {
    state.solar = 0;
    state.galaxy = 0.35;
  }

  const SKY_KEYS = [
    { u: 0, v: [214, 180, 146] },
    { u: 0.18, v: [176, 148, 124] },
    { u: 0.3, v: [62, 70, 82] },
    { u: 0.4, v: [20, 22, 28] },
    { u: 0.5, v: [14, 12, 12] },
    { u: 1, v: [12, 10, 10] },
  ];

  function skyAt(u) {
    let a = SKY_KEYS[0];
    let b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (u <= SKY_KEYS[i + 1].u) {
        a = SKY_KEYS[i];
        b = SKY_KEYS[i + 1];
        break;
      }
    }
    const t = smoothstep(a.u, b.u, u);
    sky.r = a.v[0] + (b.v[0] - a.v[0]) * t;
    sky.g = a.v[1] + (b.v[1] - a.v[1]) * t;
    sky.b = a.v[2] + (b.v[2] - a.v[2]) * t;
    return sky;
  }

  function frame(u, es, ss) {
    const back = BACK(u);
    const lift = LIFT(u);
    const side = SIDE(u);

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
    const chest = 1.15 * es;
    tmp.ta.copy(tmp.look).addScaledVector(tmp.normal, 0.04 + chest);
    tmp.a
      .copy(tmp.ta)
      .addScaledVector(tmp.right, side)
      .addScaledVector(tmp.fwd, back)
      .addScaledVector(tmp.normal, Math.max(0.4, lift - chest));

    // The whole Earth is seen from beside its path, a little above the
    // plane of the planets and a little toward the night: the turning
    // terminator and the lit towns share the frame, and the Sun stays to
    // the right, clear of the words.
    const dist = DIST(u);
    const toSun = tmp.b.copy(tmp.sun).sub(tmp.earth).normalize();
    tmp.side.crossVectors(toSun, ECLIPTIC);
    if (tmp.side.lengthSq() < 1e-6) tmp.side.set(0, 0, 1);
    tmp.side.normalize();
    tmp.c
      .copy(toSun)
      .multiplyScalar(-0.25)
      .addScaledVector(tmp.side, 0.9)
      .addScaledVector(ECLIPTIC, 0.22)
      .normalize();
    tmp.b.copy(tmp.earth).addScaledVector(tmp.c, dist);
    tmp.tb.copy(tmp.earth);

    tmp.d.copy(tmp.sun).addScaledVector(SUN_OFFSET, dist);
    tmp.td.copy(tmp.sun);

    galaxySpin.getWorldPosition(tmp.look);
    tmp.cam.copy(tmp.look).addScaledVector(GALAXY_OFFSET, dist);

    // Wide, early handovers: the next centre is already taking weight
    // while the current one still holds the frame.
    const wB = smoothstep(0.33, 0.49, u);
    const wC = smoothstep(0.51, 0.67, u);
    const wD = smoothstep(0.73, 0.89, u);

    // Person to planet: swing around the Earth's centre, distance eased
    // in log space, so the camera never cuts through the globe on its
    // way from above home to the view of the whole turning world.
    if (wB > 0) {
      tmp.p.copy(tmp.a).sub(tmp.earth);
      const rA = Math.max(1e-3, tmp.p.length());
      tmp.p.divideScalar(rA);
      tmp.b.copy(tmp.c);
      slerpUnit(tmp.p, tmp.b, wB);
      const r = Math.exp(THREE.MathUtils.lerp(Math.log(rA), Math.log(dist), wB));
      tmp.a.copy(tmp.earth).addScaledVector(tmp.p, r);
      tmp.ta.lerp(tmp.tb, wB);
    }
    tmp.a.lerp(tmp.d, wC);
    tmp.ta.lerp(tmp.td, wC);
    tmp.a.lerp(tmp.cam, wD);
    tmp.ta.lerp(tmp.look, wD);

    if (u > 0.24) pushOut(tmp.a, tmp.earth, (EARTH_R + 3) * es);
    if (u > 0.46) pushOut(tmp.a, tmp.sun, (SUN_R + 40) * ss);

    // Up follows the frame of reference that owns the view: home's sky,
    // then the plane of the planets, then (most of the way) the galaxy.
    tmp.up
      .copy(tmp.normal)
      .lerp(ECLIPTIC, smoothstep(0.36, 0.58, u))
      .lerp(GALAXY_UP, 0.7 * smoothstep(0.74, 0.88, u))
      .normalize();
    camera.up.copy(tmp.up);
    camera.position.copy(tmp.a);
    camera.lookAt(tmp.ta);

    const focus = camera.position.distanceTo(tmp.ta);
    camera.near = Math.max(0.04, focus / 180);
    camera.far = Math.max(focus * 80, 4000);
    camera.updateProjectionMatrix();
    return focus;
  }

  function slerpUnit(a, b, t) {
    const d = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    const theta = Math.acos(d);
    if (theta < 1e-4) return a.lerp(b, t).normalize();
    if (Math.PI - theta < 1e-3) {
      tmp.right.set(1, 0, 0);
      if (Math.abs(a.x) > 0.9) tmp.right.set(0, 1, 0);
      b.copy(tmp.right).addScaledVector(a, -tmp.right.dot(a)).normalize();
      return slerpUnit(a, b, t * 2 > 1 ? 1 : t * 2);
    }
    const s = Math.sin(theta);
    const ka = Math.sin((1 - t) * theta) / s;
    const kb = Math.sin(t * theta) / s;
    return a.multiplyScalar(ka).addScaledVector(b, kb).normalize();
  }

  function pushOut(pos, center, minR) {
    tmp.dir.copy(pos).sub(center);
    const len = tmp.dir.length();
    if (len < minR && len > 0) pos.copy(center).addScaledVector(tmp.dir.normalize(), minR);
  }

  const ember = { x: 0, y: 0, a: 0, label: 0 };
  const horizonColor = new THREE.Color('#dbb28f');

  function render(u, playTime, width, height) {
    const walk = sampleWalk(playTime);
    placeWalker(walk.x, walk.z);
    poseBodies();

    const es = EARTH_SCALE(u);
    const ss = SYSTEM_SCALE(u);
    earthPivot.scale.setScalar(es);
    system.scale.setScalar(ss);

    const pose = poseFigure(figure, playTime, walk);
    camera.aspect = width / height;
    camera.fov = width < height ? 48 : 34;
    frame(u, es, ss);

    const skyColor = skyAt(u);
    scene.background.setRGB(skyColor.r / 255, skyColor.g / 255, skyColor.b / 255, THREE.SRGBColorSpace);
    const fogAmt = 1 - smoothstep(0.08, 0.24, u);
    scene.fog.color.copy(horizonColor).lerp(scene.background, 1 - fogAmt);
    scene.fog.near = THREE.MathUtils.lerp(1e8, 30, fogAmt);
    scene.fog.far = THREE.MathUtils.lerp(1e9, 170, fogAmt);
    renderer.setClearColor(scene.background, 1);

    sun.getWorldPosition(tmp.sun);
    earth.getWorldPosition(tmp.earth);
    const sunDir = tmp.dir.copy(tmp.sun).sub(tmp.earth).normalize();
    earthUniforms.uSunDir.value.copy(sunDir);
    place.getWorldPosition(tmp.home);
    const homeNormal = tmp.normal.copy(tmp.home).sub(tmp.earth).normalize();
    const sunHeight = homeNormal.dot(sunDir);

    // Evening sky over home, drawn behind everything until the climb.
    const skyFade = 1 - smoothstep(0.17, 0.33, u);
    skyDome.visible = skyFade > 0.002;
    skyUniforms.uFade.value = skyFade;
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uUp.value.copy(homeNormal);
    skyUniforms.uBg.value.copy(scene.background);
    skyUniforms.uLow.value.copy(horizonColor);
    skyDome.position.copy(camera.position);
    skyDome.scale.setScalar(camera.far * 0.5);

    hemi.color.set('#9aa4b2').lerp(scene.background, smoothstep(0.2, 0.4, u));
    hemi.groundColor.set('#7a6250');
    hemi.intensity = THREE.MathUtils.lerp(2.2, 0.12, smoothstep(0.24, 0.5, u));

    // The key light is the Sun's direction in the person's frame. Its
    // strength follows the Sun's height: full in the evening, gone once
    // the Sun is below home's horizon.
    anchor.getWorldQuaternion(tmp.q);
    tmp.qi.copy(tmp.q).invert();
    tmp.p.copy(sunDir).applyQuaternion(tmp.qi);
    key.position.copy(tmp.p).multiplyScalar(60);
    key.target.position.set(0, 0, 0);
    const keyOn = 1 - smoothstep(0.18, 0.4, u);
    key.intensity = 7 * keyOn * smoothstep(-0.02, 0.08, sunHeight);
    renderer.shadowMap.autoUpdate = u < 0.3;

    sunLight.position.copy(tmp.sun);
    sunLight.target.position.copy(tmp.earth);
    sunLight.intensity = 3.6 * smoothstep(0.18, 0.44, u);

    const lampOn = smoothstep(0.19, 0.3, u);
    earthUniforms.uLamp.value = 1.7 * lampOn;
    earthUniforms.uNear.value = 1 - smoothstep(0.24, 0.36, u);
    cloudUniforms.uTime.value = state.solar * 6;
    clouds.rotation.y = state.solar * 0.6;

    anchor.getWorldPosition(tmp.look);
    const alt = camera.position.distanceTo(tmp.earth) - EARTH_R * es;
    const camSun = camera.position.distanceTo(tmp.sun);
    galaxySpin.getWorldPosition(tmp.c);
    const camGal = camera.position.distanceTo(tmp.c);
    const fovRad = (camera.fov * Math.PI) / 180;
    const pxPerUnit = (distance) => (height * 0.5) / Math.tan(fovRad / 2) / Math.max(distance, 0.001);
    const personDist = camera.position.distanceTo(tmp.look);
    const personPx = 1.7 * es * pxPerUnit(personDist);
    const earthDist = camera.position.distanceTo(tmp.earth);
    const earthPx = EARTH_R * 2 * es * pxPerUnit(earthDist);

    figure.mat.opacity = smoothstep(1.6, 7, personPx);
    figure.mat.transparent = figure.mat.opacity < 0.99;
    figure.mat.depthWrite = figure.mat.opacity > 0.45;
    contact.material.opacity = 0.2 * figure.mat.opacity;
    disc.material.opacity = 1 - smoothstep(30, 90, alt);
    disc.material.depthWrite = disc.material.opacity > 0.85;
    disc.visible = disc.material.opacity > 0.03;
    // The hamlet hands over to the town lights of the Earth's night side
    // instead of shrinking into hard sub-pixel boxes.
    const hamletOpacity = 1 - smoothstep(60, 260, alt);
    for (const m of [wall, roofMat, doorMat, laneMat, stoneMat]) {
      m.opacity = hamletOpacity;
      m.transparent = hamletOpacity < 0.99;
      m.depthWrite = hamletOpacity > 0.5;
    }
    hamlet.visible = hamletOpacity > 0.03;
    stones.visible = hamlet.visible;
    for (const w of windows) {
      w.glass.opacity = hamletOpacity * smoothstep(w.at + 0.02, w.at - 0.02, sunHeight);
    }

    const earthAng = (EARTH_R * es) / Math.max(1, earthDist);
    cloudUniforms.uOpacity.value = 0.62 * smoothstep(90, 420, alt);
    clouds.visible = cloudUniforms.uOpacity.value > 0.005;
    const haze = smoothstep(50, 260, alt) * smoothstep(0.003, 0.016, earthAng);
    atmoUniforms.uOpacity.value = 1.1 * haze;
    atmoUniforms.uCenter.value.copy(tmp.earth);
    atmoUniforms.uR.value = EARTH_R * es;
    atmoUniforms.uRa.value = EARTH_R * 1.05 * es;
    atmo.visible = haze > 0.002;
    earthUniforms.uHaze.value = haze;

    // The real Sun and Moon would hang huge in the evening sky at these
    // compressed distances; the dome draws the low Sun until the climb.
    const space = smoothstep(0.2, 0.3, u);
    sunMat.uniforms.uFade.value = space;
    sunMat.depthWrite = space > 0.9;
    sun.visible = space > 0.01;
    moon.visible = space > 0.5;
    sunGlow.position.copy(sun.position).applyMatrix4(system.matrix);
    const sunPx = SUN_R * ss * pxPerUnit(camSun);
    const glowWorld = Math.max(SUN_R * 4.2 * ss, (22 / pxPerUnit(camSun)) * Math.min(1, 6 / Math.max(sunPx, 0.01)));
    sunGlow.scale.setScalar(glowWorld);
    sunGlow.material.opacity = 0.75 * space * (1 - smoothstep(0.92, 0.97, u));

    const orbitsOn = 1 - smoothstep(0.75, 0.81, u);
    earthOrbit.material.opacity =
      0.45 * smoothstep(EARTH_ORBIT * 1.15 * ss, EARTH_ORBIT * 2.3 * ss, camSun) * orbitsOn;
    outerOrbit.material.opacity =
      0.36 * smoothstep(OUTER_ORBIT * 0.9 * ss, OUTER_ORBIT * 1.55 * ss, camSun) * orbitsOn;
    sunOrbit.material.opacity =
      0.24 * smoothstep(sunArmR * 1.15, sunArmR * 2.4, camGal) * (1 - smoothstep(0.88, 0.93, u));

    const night = smoothstep(0.3, 0.46, u);
    const inGalaxy = 1 - smoothstep(0.84, 0.92, u);
    starMat.opacity = 0.95 * night * inGalaxy;
    stars.visible = starMat.opacity > 0.01;
    stars.position.copy(camera.position);
    stars.scale.setScalar(camera.far * 0.45);
    neighborMat.opacity = 0.85 * night * (1 - smoothstep(0.86, 0.93, u));
    neighbors.visible = neighborMat.opacity > 0.01;
    const lastLight = 1 - smoothstep(0.955, 0.995, u);
    galaxyMat.opacity = night * smoothstep(5000, 16000, camGal) * lastLight;
    galaxy.visible = galaxyMat.opacity > 0.01;
    const bulgePx = Math.max(4600, 9 / pxPerUnit(camGal));
    bulge.scale.setScalar(bulgePx);
    bulge.material.opacity = 0.55 * smoothstep(0.74, 0.84, u) * lastLight;
    bulge.visible = bulge.material.opacity > 0.01;
    andromeda.getWorldPosition(tmp.p);
    const andDist = camera.position.distanceTo(tmp.p);
    const andOn = smoothstep(0.84, 0.9, u) * lastLight;
    andromedaMat.opacity = 0.42 * andOn;
    andromedaCore.material.opacity = 0.45 * andOn;
    andromedaCore.scale.setScalar(Math.max(6400, 8 / pxPerUnit(andDist)));
    andromeda.visible = andOn > 0.01;
    webMat.opacity = smoothstep(0.89, 0.96, u) * (1 - smoothstep(0.965, 0.995, u));
    web.visible = webMat.opacity > 0.01;

    const veil = smoothstep(0.97, 1, u);

    const dpr = Math.min(window.devicePixelRatio || 1, width < 800 ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);

    // The ember: where you are, at every scale. It sits on the person
    // until the globe is small, then on the Earth, which at the largest
    // scales is the same point as the Sun and the galaxy around it.
    const toCenter = smoothstep(34, 12, earthPx);
    tmp.a.copy(tmp.look).addScaledVector(homeNormal.copy(tmp.look).sub(tmp.earth).normalize(), 1.1 * es);
    tmp.b.copy(camera.position).sub(tmp.a).normalize();
    const facing = smoothstep(-0.02, 0.1, tmp.b.dot(homeNormal));
    tmp.a.lerp(tmp.earth, toCenter);
    let visible = THREE.MathUtils.lerp(facing, 1, toCenter);
    if (ss > 0.2) {
      tmp.b.copy(tmp.a).sub(camera.position);
      const len = tmp.b.length();
      tmp.b.divideScalar(len);
      const along = tmp.c.copy(tmp.sun).sub(camera.position).dot(tmp.b);
      if (along > 0 && along < len) {
        const miss = tmp.c.copy(camera.position).addScaledVector(tmp.b, along).distanceTo(tmp.sun);
        visible *= smoothstep(SUN_R * ss * 0.95, SUN_R * ss * 1.2, miss);
      }
    }
    tmp.c.copy(tmp.a).project(camera);
    const onScreen = tmp.c.z < 1 && Math.abs(tmp.c.x) < 1.2 && Math.abs(tmp.c.y) < 1.2 ? 1 : 0;
    ember.x = (tmp.c.x * 0.5 + 0.5) * width;
    ember.y = (-tmp.c.y * 0.5 + 0.5) * height;
    ember.a = (1 - smoothstep(3, 8, personPx)) * visible * onScreen;
    ember.label = smoothstep(0.64, 0.68, u);

    return { sky: skyColor, veil, stepped: pose.stepped && u < 0.34, ember };
  }

  return { render, integrate, reset, sky };
}

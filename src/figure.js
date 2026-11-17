import * as THREE from 'three';

const BONE = 0xf4eee4;

export function createFigure() {
  const mat = new THREE.MeshLambertMaterial({ color: BONE });
  const root = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  root.add(hips);

  const left = makeLeg(mat, -1);
  const right = makeLeg(mat, 1);
  hips.add(left.pivot, right.pivot);

  const spine = new THREE.Group();
  hips.add(spine);

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.68, 20), mat);
  coat.position.y = 0.28;
  spine.add(coat);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), mat);
  shoulder.scale.set(1.02, 0.5, 0.72);
  shoulder.position.y = 0.5;
  spine.add(shoulder);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.09, 10), mat);
  neck.position.y = 0.66;
  spine.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.72;
  spine.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.122, 28, 20), mat);
  head.scale.set(0.9, 1.14, 0.96);
  head.position.y = 0.07;
  headPivot.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat);
  nose.position.set(0, 0.01, 0.1);
  head.add(nose);

  const leftArm = makeArm(mat, -1);
  const rightArm = makeArm(mat, 1);
  leftArm.pivot.position.set(-0.17, 0.5, 0.02);
  rightArm.pivot.position.set(0.17, 0.5, 0.02);
  spine.add(leftArm.pivot, rightArm.pivot);

  root.rotation.y = -0.55;

  return { root, hips, spine, headPivot, left, right, leftArm, rightArm, mat };
}

const THIGH = 0.56;
const SHIN = 0.5;
const HIP_Y = 0.92;
const ANKLE_Y = 0.02;

function makeLeg(mat, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.085, 0, 0);

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, THIGH, 8), mat);
  upper.position.y = -THIGH / 2;
  pivot.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -THIGH;
  pivot.add(knee);

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, SHIN, 8), mat);
  lower.position.y = -SHIN / 2;
  knee.add(lower);

  const ankle = new THREE.Group();
  ankle.position.y = -SHIN;
  knee.add(ankle);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.16), mat);
  foot.position.set(0, 0, 0.045);
  ankle.add(foot);

  return { pivot, knee, ankle };
}

function makeArm(mat, side) {
  const pivot = new THREE.Group();
  pivot.rotation.z = side * -0.06;

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.3, 8), mat);
  upper.position.y = -0.17;
  pivot.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.32;
  pivot.add(elbow);

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.28, 8), mat);
  lower.position.y = -0.16;
  elbow.add(lower);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), mat);
  hand.position.y = -0.32;
  elbow.add(hand);

  return { pivot, elbow };
}

function setArm(arm, swing, elbowBend) {
  arm.pivot.rotation.x = swing;
  arm.elbow.rotation.x = elbowBend;
}

const STEP = 0.7;
const WALK_V = 0.7;
const WALK_PATH = [
  { x: 0, z: 0 },
  { x: -0.7, z: -4.2 },
  { x: -1.35, z: -8.2 },
  { x: -1.4, z: -13.2 },
];
const WALK_SEG = [];
let WALK_L = 0;
for (let i = 1; i < WALK_PATH.length; i++) {
  const len = Math.hypot(WALK_PATH[i].x - WALK_PATH[i - 1].x, WALK_PATH[i].z - WALK_PATH[i - 1].z);
  WALK_SEG.push(len);
  WALK_L += len;
}
const WALK_T = WALK_L / WALK_V;

const yawQ = new THREE.Quaternion();
const pitchQ = new THREE.Quaternion();
const aimX = new THREE.Vector3(1, 0, 0);
const aimY = new THREE.Vector3(0, 1, 0);

function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function pointOnPath(dist) {
  let d = Math.min(WALK_L, Math.max(0, dist));
  for (let i = 0; i < WALK_SEG.length; i++) {
    const len = WALK_SEG[i];
    if (d <= len || i === WALK_SEG.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, d / len);
      const a = WALK_PATH[i];
      const b = WALK_PATH[i + 1];
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
    }
    d -= len;
  }
  return { x: 0, z: 0 };
}

function pathS(od) {
  if (od <= WALK_L) return od;
  return Math.max(0, 2 * WALK_L - od);
}

function bodyAt(od) {
  return pointOnPath(pathS(od));
}

export function odometer(walkT) {
  if (walkT <= 0) return 0;
  if (walkT >= 2 * WALK_T) return 2 * WALK_L;
  if (walkT <= WALK_T) return smooth(0, WALK_T, walkT) * WALK_L;
  const back = smooth(0, WALK_T, 2 * WALK_T - walkT);
  return WALK_L + (1 - back) * WALK_L;
}

function headingOut(path) {
  const a = pointOnPath(Math.max(0, path - 0.85));
  const b = pointOnPath(path);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz < 1e-4) return Math.PI;
  return Math.atan2(dx, dz);
}

function headingBack(path) {
  const a = pointOnPath(path);
  const b = pointOnPath(Math.max(0, path - 0.85));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * dx + dz * dz < 1e-4) return -0.55;
  return Math.atan2(dx, dz);
}

export function sampleWalk(playTime) {
  const t = Math.max(0, playTime - 2.8);
  const od = odometer(t);
  const here = bodyAt(od);
  const speed = Math.abs(odometer(t + 0.04) - odometer(t - 0.04)) / 0.08;
  const gait = smooth(0.1, 0.42, speed);
  const turn = smooth(WALK_T - 2.2, WALK_T + 2.2, Math.min(t, 2 * WALK_T));
  let yaw = lerpAngle(headingOut(pathS(od)), headingBack(pathS(od)), turn);
  yaw = lerpAngle(-0.55, yaw, smooth(0.15, 2.5, t));
  if (t > 2 * WALK_T) {
    yaw = lerpAngle(yaw, -0.55, 1 - Math.exp(-(t - 2 * WALK_T) * 1.15));
  }
  const prev = odometer(t - 0.05);
  const stepped = gait > 0.45 && Math.floor(od / STEP) !== Math.floor(prev / STEP) && od > prev;
  return { x: here.x, z: here.z, yaw, gait, od, stepped };
}

function plantOd(od, offset) {
  const cycle = STEP * 2;
  const shifted = od + offset * cycle;
  const local = ((shifted % cycle) + cycle) % cycle;
  const cycleStart = od - local;
  if (local < STEP) {
    return { od: cycleStart + STEP / 2, lift: 0 };
  }
  const k = (local - STEP) / STEP;
  const e = k * k * (3 - 2 * k);
  const from = cycleStart + STEP / 2;
  const to = cycleStart + STEP * 2.5;
  return { od: from + (to - from) * e, lift: Math.sin(Math.PI * k) * 0.11 };
}

function aimLeg(leg, lx, lz, footY, hipY) {
  const reach = Math.hypot(lx, lz);
  const aim = reach > 0.015 ? Math.atan2(lx, lz) : 0;
  const dy = footY - hipY;
  let dist = Math.hypot(reach, dy);
  const max = THIGH + SHIN - 0.02;
  const min = Math.abs(THIGH - SHIN) + 0.04;
  dist = Math.min(max, Math.max(min, dist));
  const footPitch = Math.atan2(reach, -dy);
  const cosHip = (THIGH * THIGH + dist * dist - SHIN * SHIN) / (2 * THIGH * dist);
  const hipBend = Math.acos(Math.min(1, Math.max(-1, cosHip)));
  const cosKnee = (THIGH * THIGH + SHIN * SHIN - dist * dist) / (2 * THIGH * SHIN);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosKnee)));
  const pitch = -(footPitch + hipBend);
  yawQ.setFromAxisAngle(aimY, aim);
  pitchQ.setFromAxisAngle(aimX, pitch);
  leg.pivot.quaternion.copy(yawQ).multiply(pitchQ);
  leg.knee.rotation.set(bend, 0, 0);
  leg.ankle.rotation.set(-(pitch + bend), 0, 0);
}

export function poseFigure(fig, playTime, walk) {
  const motion = walk ?? sampleWalk(playTime);
  const breath = Math.sin(playTime * 1.55);
  const gait = motion.gait;
  const phase = (motion.od / STEP) * Math.PI;
  const sway = Math.sin(phase) * gait;

  fig.root.rotation.y = motion.yaw;
  fig.spine.scale.set(1, 1 + breath * 0.012, 1);
  fig.hips.position.y = HIP_Y + Math.abs(Math.cos(phase)) * 0.018 * gait;
  fig.hips.rotation.set(0.02 * gait, sway * 0.08, sway * 0.035);
  fig.spine.rotation.y = -sway * 0.08;
  fig.headPivot.rotation.set(0.12 - 0.04 * gait, sway * 0.1 * (1 - gait) + -sway * 0.05 * gait, 0);

  const hipY = fig.hips.position.y;
  const body = { x: motion.x, z: motion.z };
  const feet = [
    { leg: fig.left, side: -1, offset: 0, idle: 0.04 },
    { leg: fig.right, side: 1, offset: 0.5, idle: -0.03 },
  ];
  for (const foot of feet) {
    const planted = plantOd(motion.od, foot.offset);
    const at = bodyAt(planted.od);
    const dx = at.x - body.x;
    const dz = at.z - body.z;
    const c = Math.cos(motion.yaw);
    const s = Math.sin(motion.yaw);
    let lx = dx * c - dz * s;
    let lz = dx * s + dz * c;
    lx = lx * gait;
    lz = lz * gait + foot.idle * (1 - gait);
    lx -= foot.side * 0.085 * gait;
    const reach = Math.hypot(lx, lz);
    if (reach > 1.15) {
      lx *= 1.15 / reach;
      lz *= 1.15 / reach;
    }
    const lift = planted.lift * gait;
    aimLeg(foot.leg, lx, lz, ANKLE_Y + lift, hipY);
  }

  const arm = Math.sin(phase) * 0.42 * gait;
  setArm(fig.leftArm, -arm, Math.max(0, arm) * 0.55 + 0.12);
  setArm(fig.rightArm, arm, Math.max(0, -arm) * 0.55 + 0.1);
  return { stepped: motion.stepped, walking: gait };
}

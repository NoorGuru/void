import * as THREE from 'three';
import { clamp01, smootherstep01, smoothstep01 } from './motion.js';

const BONE = 0xf4eee4;

// Anthropometry first, because the old gait was built on a body that
// could not stand up: thigh + shin summed to 1.06 m against a 0.90 m
// hip-to-ankle distance, so the IK held a permanent 64° crouch and the
// legs scissored into a diamond. These lengths sum to 0.86 m over a
// 0.845 m hip-to-ankle drop — a soft, nearly straight standing knee.
export const FIGURE = { hipY: 0.92, ankleY: 0.075, thigh: 0.435, shin: 0.425 };
const HIP_Y = FIGURE.hipY;
const ANKLE_Y = FIGURE.ankleY;
const THIGH = FIGURE.thigh;
const SHIN = FIGURE.shin;
const HIP_HALF = 0.088;

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

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.108, 0.66, 20), mat);
  coat.position.y = 0.27;
  spine.add(coat);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.128, 20, 14), mat);
  shoulder.scale.set(1.04, 0.5, 0.72);
  shoulder.position.y = 0.49;
  spine.add(shoulder);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.09, 10), mat);
  neck.position.y = 0.635;
  spine.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.7;
  spine.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), mat);
  head.scale.set(0.9, 1.13, 0.96);
  head.position.y = 0.068;
  headPivot.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), mat);
  nose.position.set(0, 0.008, 0.098);
  head.add(nose);

  const leftArm = makeArm(mat, -1);
  const rightArm = makeArm(mat, 1);
  leftArm.pivot.position.set(-0.168, 0.49, 0.015);
  rightArm.pivot.position.set(0.168, 0.49, 0.015);
  spine.add(leftArm.pivot, rightArm.pivot);

  root.rotation.y = -0.55;
  return { root, hips, spine, headPivot, left, right, leftArm, rightArm, mat };
}

function makeLeg(mat, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * HIP_HALF, -0.012, 0);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.041, THIGH, 10), mat);
  upper.position.y = -THIGH / 2;
  pivot.add(upper);
  const knee = new THREE.Group();
  knee.position.y = -THIGH;
  pivot.add(knee);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.032, SHIN, 10), mat);
  lower.position.y = -SHIN / 2;
  knee.add(lower);
  const ankle = new THREE.Group();
  ankle.position.y = -SHIN;
  knee.add(ankle);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.048, 0.24), mat);
  foot.position.set(0, -0.051, 0.058);
  ankle.add(foot);
  return { pivot, knee, ankle };
}

function makeArm(mat, side) {
  const pivot = new THREE.Group();
  pivot.rotation.z = side * -0.07;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.027, 0.3, 8), mat);
  upper.position.y = -0.16;
  pivot.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -0.31;
  pivot.add(elbow);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.021, 0.28, 8), mat);
  lower.position.y = -0.15;
  elbow.add(lower);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 10), mat);
  hand.position.y = -0.31;
  elbow.add(hand);
  return { pivot, elbow };
}

// ---- Walk cycle -------------------------------------------------------
// A real walk, in distance rather than in easing: the body travels down a
// smoothed lane at a near-constant 1.32 m/s (a normal adult pace), reached
// through one smooth acceleration and left through one smooth braking.
// Steps are anchored to the ground in distance — a stance foot does not
// slide while the body passes over it — with a 62% stance / 38% swing
// split, so there is a brief double support at each hand-over instead of
// the old one-foot-always-in-the-air march. Turns are separate, stepped
// phases: the body never pirouettes on planted feet.

const STEP = 0.72;
const STRIDE = STEP * 2;
const STANCE = 0.62;
const CRUISE = 1.32;
const ACCEL_T = 0.85;
const ACCEL_D = CRUISE * ACCEL_T * 0.5;
const WALK_START = 2.8;
const IDLE_YAW = -0.55;

const PATH_CURVE = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.7, 0, -4.2),
    new THREE.Vector3(-1.35, 0, -8.2),
    new THREE.Vector3(-1.4, 0, -13.2),
  ],
  false,
  'centripetal',
);
const WALK_L = PATH_CURVE.getLength();
const CRUISE_T = Math.max(0.5, (WALK_L - 2 * ACCEL_D) / CRUISE);
const LEG_T = 2 * ACCEL_T + CRUISE_T;
const TURN_OUT_T = 1.7;
const FAR_DWELL_T = 0.65;
const TURN_BACK_T = 2.0;
const TURN_HOME_T = 1.3;
const T_OUT = TURN_OUT_T;
const T_OUT_END = T_OUT + LEG_T;
const T_TURNBACK = T_OUT_END + FAR_DWELL_T;
const T_BACK = T_TURNBACK + TURN_BACK_T;
const T_BACK_END = T_BACK + LEG_T;
const T_DONE = T_BACK_END + TURN_HOME_T;

function smooth(a, b, x) {
  return smoothstep01((x - a) / (b - a));
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function pointOnPath(dist) {
  const p = PATH_CURVE.getPointAt(clamp01(dist / WALK_L));
  return { x: p.x, z: p.z };
}

function yawOnPath(dist, back = false) {
  const tan = PATH_CURVE.getTangentAt(clamp01(dist / WALK_L));
  return back ? Math.atan2(-tan.x, -tan.z) : Math.atan2(tan.x, tan.z);
}

function legDistance(tau) {
  if (tau <= 0) return 0;
  if (tau >= LEG_T) return WALK_L;
  if (tau < ACCEL_T) {
    const u = tau / ACCEL_T;
    return CRUISE * ACCEL_T * (u * u * u - 0.5 * u ** 4);
  }
  if (tau < ACCEL_T + CRUISE_T) return ACCEL_D + CRUISE * (tau - ACCEL_T);
  const u = (tau - ACCEL_T - CRUISE_T) / ACCEL_T;
  return ACCEL_D + CRUISE * CRUISE_T + CRUISE * ACCEL_T * (u - u * u * u + 0.5 * u ** 4);
}

function legSpeed(tau) {
  if (tau <= 0 || tau >= LEG_T) return 0;
  if (tau < ACCEL_T) return CRUISE * smoothstep01(tau / ACCEL_T);
  if (tau < ACCEL_T + CRUISE_T) return CRUISE;
  return CRUISE * (1 - smoothstep01((tau - ACCEL_T - CRUISE_T) / ACCEL_T));
}

// Total ground covered (keeps counting on the way home, so footfalls and
// gait phase continue seamlessly through the turn).
function travelAt(t) {
  if (t < T_OUT) return 0;
  if (t < T_OUT_END) return legDistance(t - T_OUT);
  if (t < T_BACK) return WALK_L;
  if (t < T_BACK_END) return WALK_L + legDistance(t - T_BACK);
  return 2 * WALK_L;
}

export function odometer(walkT) {
  return travelAt(Math.max(0, walkT));
}

export function sampleWalk(playTime) {
  const t = Math.max(0, playTime - WALK_START);
  const base = {
    x: 0, z: 0, yaw: IDLE_YAW, gait: 0, od: travelAt(t), speed: 0, accel: 0,
    stepped: false, turning: 0, turnFrom: IDLE_YAW, turnTo: IDLE_YAW, turnK: 0,
  };
  if (playTime < WALK_START) return base;

  if (t < T_OUT) {
    const k = t / TURN_OUT_T;
    const to = yawOnPath(0);
    return { ...base, mode: 'turn', turning: 1, turnFrom: IDLE_YAW, turnTo: to, turnK: k, yaw: lerpAngle(IDLE_YAW, to, smootherstep01(k)) };
  }
  if (t < T_OUT_END) {
    const tau = t - T_OUT;
    const s = legDistance(tau);
    const speed = legSpeed(tau);
    const pos = pointOnPath(s);
    const prevOd = travelAt(t - 0.05);
    return {
      ...base, mode: 'walk', x: pos.x, z: pos.z, yaw: yawOnPath(s), speed,
      accel: (legSpeed(tau + 0.05) - legSpeed(tau - 0.05)) / 0.1,
      gait: clamp01(speed / CRUISE),
      stepped: speed > 0.35 && Math.floor(base.od / STEP) !== Math.floor(prevOd / STEP) && base.od > prevOd,
    };
  }
  if (t < T_TURNBACK) {
    const pos = pointOnPath(WALK_L);
    return { ...base, mode: 'dwell', x: pos.x, z: pos.z, yaw: yawOnPath(WALK_L) };
  }
  if (t < T_BACK) {
    const k = (t - T_TURNBACK) / TURN_BACK_T;
    const from = yawOnPath(WALK_L);
    const to = yawOnPath(WALK_L, true);
    const pos = pointOnPath(WALK_L);
    return { ...base, mode: 'turn', x: pos.x, z: pos.z, turning: 1, turnFrom: from, turnTo: to, turnK: k, yaw: lerpAngle(from, to, smootherstep01(k)) };
  }
  if (t < T_BACK_END) {
    const tau = t - T_BACK;
    const travelled = legDistance(tau);
    const s = WALK_L - travelled;
    const speed = legSpeed(tau);
    const pos = pointOnPath(s);
    const prevOd = travelAt(t - 0.05);
    return {
      ...base, mode: 'walk', x: pos.x, z: pos.z, yaw: yawOnPath(s, true), speed,
      accel: (legSpeed(tau + 0.05) - legSpeed(tau - 0.05)) / 0.1,
      gait: clamp01(speed / CRUISE),
      stepped: speed > 0.35 && Math.floor(base.od / STEP) !== Math.floor(prevOd / STEP) && base.od > prevOd,
    };
  }
  if (t < T_DONE) {
    const k = (t - T_BACK_END) / TURN_HOME_T;
    const from = yawOnPath(0, true);
    return { ...base, mode: 'turn', turning: 1, turnFrom: from, turnTo: IDLE_YAW, turnK: k, yaw: lerpAngle(from, IDLE_YAW, smootherstep01(k)) };
  }
  return { ...base, mode: 'idle' };
}

// One foot against the ground. During stance the planted point is fixed in
// odometer space (hence fixed on the lane) while the body passes over it;
// during swing it travels one full stride to the next plant, easing out of
// the ground and settling back onto it, with a low, late-peaking lift.
function plantOd(od, offset) {
  const cycle = STRIDE;
  const stanceDist = cycle * STANCE;
  const swingDist = cycle - stanceDist;
  const shifted = od + offset * cycle;
  const local = ((shifted % cycle) + cycle) % cycle;
  const cycleOd = od - local;
  const plant = cycleOd + stanceDist / 2;
  if (local < stanceDist) {
    return { od: plant, lift: 0, swing: 0, phase: local / stanceDist };
  }
  const k = (local - stanceDist) / swingDist;
  const e = smoothstep01(k);
  return {
    od: plant + cycle * e,
    lift: Math.sin(Math.PI * k) ** 0.9 * 0.062,
    swing: 1,
    phase: k,
  };
}

// A foot does not land on the body's centreline — it lands under its own
// hip, a step-width to that side of the lane, measured perpendicular to
// the direction of travel at the moment it was planted.
const STEP_WIDTH = 0.098;

function footWorldAt(od, side) {
  const s = travelClamp(od);
  const p = pointOnPath(s);
  const tan = PATH_CURVE.getTangentAt(clamp01(s / WALK_L));
  const dir = od <= WALK_L ? 1 : -1;
  const tx = tan.x * dir;
  const tz = tan.z * dir;
  return { x: p.x + tz * side * STEP_WIDTH, z: p.z - tx * side * STEP_WIDTH };
}

function travelClamp(od) {
  if (od <= WALK_L) return Math.max(0, od);
  return Math.max(0, 2 * WALK_L - od);
}

const yawQ = new THREE.Quaternion();
const pitchQ = new THREE.Quaternion();
const aimX = new THREE.Vector3(1, 0, 0);
const aimY = new THREE.Vector3(0, 1, 0);

function aimLeg(leg, lx, lz, footY, hipY, footPitch = 0) {
  const reach = Math.hypot(lx, lz);
  const aim = reach > 0.012 ? Math.atan2(lx, lz) : 0;
  const dy = footY - hipY;
  let dist = Math.hypot(reach, dy);
  const max = THIGH + SHIN - 0.015;
  const min = Math.abs(THIGH - SHIN) + 0.05;
  dist = Math.min(max, Math.max(min, dist));
  const footPitchAim = Math.atan2(reach, -dy);
  const cosHip = (THIGH * THIGH + dist * dist - SHIN * SHIN) / (2 * THIGH * dist);
  const hipBend = Math.acos(Math.min(1, Math.max(-1, cosHip)));
  const cosKnee = (THIGH * THIGH + SHIN * SHIN - dist * dist) / (2 * THIGH * SHIN);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosKnee)));
  const pitch = -(footPitchAim + hipBend);
  yawQ.setFromAxisAngle(aimY, aim);
  pitchQ.setFromAxisAngle(aimX, pitch);
  leg.pivot.quaternion.copy(yawQ).multiply(pitchQ);
  leg.knee.rotation.set(bend, 0, 0);
  leg.ankle.rotation.set(-(pitch + bend) + footPitch, 0, 0);
}

function setArm(arm, swing, elbowFlex) {
  arm.pivot.rotation.x = swing;
  arm.elbow.rotation.x = -elbowFlex;
}

export function poseFigure(fig, playTime, walk) {
  const motion = walk ?? sampleWalk(playTime);
  const gait = motion.gait ?? 0;
  const phase = (motion.od / STEP) * Math.PI;
  const stepSin = Math.sin(phase);
  const breath = Math.sin(playTime * 1.5) * (1 - gait * 0.7);
  const accelLean = Math.max(-0.05, Math.min(0.07, (motion.accel ?? 0) * 0.055));

  fig.root.rotation.y = motion.yaw;
  fig.spine.scale.set(1, 1 + breath * 0.009, 1);

  // Centre of mass: lowest at double support (each footfall), highest at
  // mid-stance, drifting toward the supporting foot, pelvis rotating
  // against the shoulders while the head stays level and looks forward.
  const bob = -Math.cos(2 * phase) * 0.015 * gait;
  fig.hips.position.set(
    stepSin * 0.026 * gait,
    HIP_Y - 0.004 + bob,
    0.012 * gait,
  );
  const pelvisYaw = stepSin * 0.07 * gait;
  fig.hips.rotation.set(0.015 * gait, pelvisYaw, Math.cos(phase) * 0.032 * gait);
  const lean = 0.075 * gait + accelLean;
  fig.spine.rotation.set(lean, -pelvisYaw * 0.85, -Math.cos(phase) * 0.014 * gait);
  fig.headPivot.rotation.set(0.1 - lean * 0.72, pelvisYaw * 0.4, -fig.hips.rotation.z * 0.55);

  const hipY = fig.hips.position.y;
  const body = { x: motion.x, z: motion.z };
  const feet = [
    { leg: fig.left, side: -1, offset: 0, idle: 0.05 },
    { leg: fig.right, side: 1, offset: 0.5, idle: -0.04 },
  ];

  if (motion.turning) {
    poseTurnFeet(fig, motion, feet, hipY);
  } else {
    const c = Math.cos(motion.yaw);
    const s = Math.sin(motion.yaw);
    const blend = smoothstep01(gait * 1.15);
    for (const foot of feet) {
      const planted = plantOd(motion.od, foot.offset);
      const at = footWorldAt(planted.od, foot.side);
      const dx = at.x - body.x;
      const dz = at.z - body.z;
      let bx = dx * c - dz * s;
      let bz = dx * s + dz * c;
      bx = foot.side * HIP_HALF + (bx - foot.side * HIP_HALF) * blend;
      bz = foot.idle + (bz - foot.idle) * blend;
      let lx = bx - (foot.side * HIP_HALF + fig.hips.position.x);
      let lz = bz;
      const reach = Math.hypot(lx, lz);
      if (reach > 0.8) {
        lx *= 0.8 / reach;
        lz *= 0.8 / reach;
      }
      const lift = planted.lift * blend;
      let footPitch = 0;
      if (planted.swing) footPitch = -0.16 * Math.sin(Math.PI * Math.min(1, planted.phase * 1.15));
      else if (planted.phase > 0.68) footPitch = 0.3 * ((planted.phase - 0.68) / 0.32) * gait;
      else if (planted.phase < 0.14) footPitch = -0.07 * gait;
      aimLeg(foot.leg, lx, lz, ANKLE_Y + lift, hipY, footPitch);
    }
  }

  // Arms counter-swing against their own-side leg, elbows softening and
  // bending a little more as the hand comes forward.
  const armSwing = stepSin * 0.46 * gait;
  setArm(fig.leftArm, -armSwing, 0.2 + Math.max(0, -armSwing) * 0.6 + 0.04 * breath);
  setArm(fig.rightArm, armSwing, 0.2 + Math.max(0, armSwing) * 0.6 - 0.03 * breath);
  return { stepped: motion.stepped, walking: gait };
}

// Stepped turn: each foot stays planted while the body rotates over it,
// then lifts and re-plants aligned with the new heading — left foot in the
// first half of the turn, right foot in the second. No foot ever twists
// or skates across the ground.
function poseTurnFeet(fig, motion, feet, hipY) {
  const total = Math.atan2(
    Math.sin(motion.turnTo - motion.turnFrom),
    Math.cos(motion.turnTo - motion.turnFrom),
  );
  for (let i = 0; i < feet.length; i++) {
    const foot = feet[i];
    const winStart = i === 0 ? 0.06 : 0.52;
    const winEnd = i === 0 ? 0.48 : 0.94;
    const nominal = { x: foot.side * (HIP_HALF + 0.018), z: foot.idle };
    const yawAt = (k) => motion.turnFrom + total * smootherstep01(k);
    let local;
    let lift = 0;
    if (motion.turnK < winStart) {
      const d = yawAt(motion.turnK) - motion.turnFrom;
      local = rotXZ(nominal, -d);
    } else if (motion.turnK > winEnd) {
      local = nominal;
    } else {
      const p = (motion.turnK - winStart) / (winEnd - winStart);
      const d0 = yawAt(winStart) - motion.turnFrom;
      const plantedLocal = rotXZ(nominal, -d0);
      const e = smoothstep01(p);
      local = {
        x: plantedLocal.x + (nominal.x - plantedLocal.x) * e,
        z: plantedLocal.z + (nominal.z - plantedLocal.z) * e,
      };
      lift = Math.sin(Math.PI * p) * 0.045;
    }
    const lx = local.x - (foot.side * HIP_HALF + fig.hips.position.x);
    aimLeg(foot.leg, lx, local.z, ANKLE_Y + lift, hipY, lift > 0.01 ? -0.1 : 0);
  }
}

function rotXZ(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.z, z: s * v.x + c * v.z };
}

import * as THREE from 'three';

const BONE = 0xf4eee4;

export function createFigure() {
  const mat = new THREE.MeshLambertMaterial({ color: BONE });
  const root = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = 0.96;
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

function makeLeg(mat, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.085, 0, 0);

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.42, 8), mat);
  upper.position.y = -0.21;
  pivot.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -0.44;
  pivot.add(knee);

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.38, 8), mat);
  lower.position.y = -0.195;
  knee.add(lower);

  const ankle = new THREE.Group();
  ankle.position.y = -0.4;
  knee.add(ankle);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.16), mat);
  foot.position.set(0, 0.01, 0.04);
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

function setLeg(leg, thigh, kneeBend) {
  leg.pivot.rotation.x = thigh;
  leg.knee.rotation.x = kneeBend;
  leg.ankle.rotation.x = -kneeBend * 0.3 + 0.08;
}

function setArm(arm, swing, elbowBend) {
  arm.pivot.rotation.x = swing;
  arm.elbow.rotation.x = elbowBend;
}

export function poseFigure(fig, playTime) {
  const t = Math.max(0, playTime - 2.8);
  const walking = 1 - Math.exp(-Math.max(0, t) * 1.15);
  const phase = t * Math.PI * 2 * 0.5;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const breath = Math.sin(playTime * 1.55);

  fig.spine.scale.set(1, 1 + breath * 0.012, 1);

  if (walking < 0.02) {
    const w = Math.sin(playTime * 0.65);
    fig.hips.rotation.set(0, 0, w * 0.04);
    fig.hips.position.y = 0.96;
    fig.headPivot.rotation.set(0.14, w * 0.14, 0);
    setLeg(fig.left, 0.06, 0.1);
    setLeg(fig.right, -0.03, 0.16);
    setArm(fig.leftArm, 0.06, 0.18);
    setArm(fig.rightArm, -0.04, 0.14);
    return { phase, walking, stepped: false };
  }

  fig.hips.rotation.set(0.06 * walking, s * 0.1 * walking, 0);
  fig.hips.position.y = 0.96 + Math.abs(c) * 0.03 * walking;
  fig.spine.rotation.y = -s * 0.07 * walking;
  fig.headPivot.rotation.set(0.1, -s * 0.04 * walking, 0);

  const stride = 0.68 * walking;
  setLeg(fig.left, s * stride, Math.max(0, -c) * 1.05 * walking);
  setLeg(fig.right, -s * stride, Math.max(0, c) * 1.05 * walking);
  setArm(fig.leftArm, -s * 0.5 * walking, Math.max(0, s) * 0.45 * walking);
  setArm(fig.rightArm, s * 0.5 * walking, Math.max(0, -s) * 0.45 * walking);

  const prev = Math.sin(phase - 0.35);
  const stepped = walking > 0.4 && prev < 0 && s >= 0;
  return { phase, walking, stepped };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { monotoneInterpolator } from '../src/motion.js';
import { sampleWalk, FIGURE } from '../src/figure.js';
import { keplerRatio, galaxyOmegaRatio } from '../src/orbits.js';
import { formatWidth } from '../src/i18n.js';

test('scale readout says real widths in spoken units', () => {
  assert.equal(formatWidth(4.9, 'en'), '4.9 meters across');
  assert.equal(formatWidth(7.5e6, 'en'), '7,500 kilometers across');
  assert.equal(formatWidth(1.1e12, 'en'), '1.1 billion kilometers across');
  assert.equal(formatWidth(3.1e19, 'en'), '3,300 light-years across');
  assert.equal(formatWidth(8.8e26, 'en'), '93 billion light-years across');
  assert.equal(formatWidth(8.8e26, 'ar'), 'عرض المشهد 93 مليار سنة ضوئية');
  assert.equal(formatWidth(5 * 9.4607e15, 'ar'), 'عرض المشهد 5 سنوات ضوئية');
});

test('zoom mapping keeps moving between phase cues', () => {
  const cues = [
    [0, 0],
    [10, 0.2],
    [20, 0.45],
    [30, 0.7],
    [40, 1],
  ];
  const at = monotoneInterpolator(cues);
  let prev = at(0);
  for (let t = 0.5; t < 40; t += 0.5) {
    const u = at(t);
    assert.ok(u > prev, `u stalls at t=${t}`);
    prev = u;
  }
  // Interior knots must not be dead stops: speed near a knot stays a
  // meaningful fraction of the neighbouring segment average.
  for (const [t] of cues.slice(1, -1)) {
    const speed = (at(t + 0.4) - at(t - 0.4)) / 0.8;
    assert.ok(speed > 0.008, `speed collapses at cue t=${t}: ${speed}`);
  }
});

test('standing leg is nearly straight, not crouched', () => {
  const dist = FIGURE.hipY - FIGURE.ankleY;
  const { thigh, shin } = FIGURE;
  const cosKnee = (thigh * thigh + shin * shin - dist * dist) / (2 * thigh * shin);
  const flexion = 180 - (Math.acos(Math.max(-1, Math.min(1, cosKnee))) * 180) / Math.PI;
  assert.ok(dist < thigh + shin, 'ankle target must be reachable');
  assert.ok(flexion < 26, `standing knee flexion ${flexion.toFixed(1)}deg is a crouch`);
});

test('walk goes out, turns, comes home and stops without jumps', () => {
  let prev = sampleWalk(0);
  assert.equal(prev.x, 0);
  assert.equal(prev.z, 0);
  let maxStep = 0;
  let farthest = 0;
  for (let t = 0.1; t <= 34; t += 0.1) {
    const s = sampleWalk(t);
    const jump = Math.hypot(s.x - prev.x, s.z - prev.z);
    maxStep = Math.max(maxStep, jump);
    farthest = Math.max(farthest, Math.hypot(s.x, s.z));
    const yawJump = Math.abs(Math.atan2(Math.sin(s.yaw - prev.yaw), Math.cos(s.yaw - prev.yaw)));
    assert.ok(yawJump < 0.3, `yaw snaps at t=${t.toFixed(1)}: ${yawJump}`);
    assert.ok(s.speed <= 1.5, `speed ${s.speed} at t=${t} is not a walk`);
    prev = s;
  }
  assert.ok(maxStep < 0.16, `body teleports: ${maxStep}m in 0.1s`);
  assert.ok(farthest > 10, `walk never leaves home: ${farthest}`);
  const home = sampleWalk(34);
  assert.ok(Math.hypot(home.x, home.z) < 0.05, 'walker does not return home');
  assert.ok(home.speed < 0.01 && home.gait < 0.01, 'walker still moving at home');
});

test('planets follow Kepler: inner faster, outer slower', () => {
  assert.ok(Math.abs(keplerRatio(860, 1760) - 2.93) < 0.05);
  assert.ok(Math.abs(keplerRatio(3480, 1760) - 0.36) < 0.03);
  assert.ok(keplerRatio(860, 1760) > 1 && keplerRatio(3480, 1760) < 1);
});

test('galactic stars co-move with the Sun at the Sun radius', () => {
  assert.ok(Math.abs(galaxyOmegaRatio(6240, 6240) - 1) < 1e-9);
  assert.ok(galaxyOmegaRatio(2000, 6240) > 1, 'inner disk must pull ahead');
  assert.ok(galaxyOmegaRatio(11000, 6240) < 1, 'outer disk must lag');
  assert.ok(galaxyOmegaRatio(200, 6240) < 5, 'core must not diverge');
});

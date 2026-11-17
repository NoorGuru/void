// Shared one-dimensional motion curves.
//
// Every zoom / scale curve in the piece used to be a chain of independent
// smoothsteps. A smoothstep has zero slope at both ends, so the zoom
// stalled at every cue, restarted, stalled again — the phases felt stitched
// together instead of flowing. The interpolator below is a monotone cubic
// (Fritsch–Carlson): it passes through every key, stays monotonic, and its
// slope is continuous and non-zero at interior keys, so one motion carries
// through the next phase instead of stopping between them.

export function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

export function smoothstep01(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

export function smootherstep01(x) {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function monotoneInterpolator(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1];
  };
}

// Interpolator over [u, value] keys with the same continuous-slope rule,
// optionally in log space for exponential scale ramps.
export function keyInterpolator(keys, { log = false } = {}) {
  const pts = keys.map((k) => [k.u, log ? Math.log(k.v) : k.v]);
  const fn = monotoneInterpolator(pts);
  return log ? (u) => Math.exp(fn(u)) : fn;
}

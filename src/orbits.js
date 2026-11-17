// Orbital ratios, shared by the scene and its tests.
//
// Planets: Kepler's third law. For a circular orbit the period grows as
// a^(3/2), so the angular speed relative to a reference orbit is
// (a_ref / a)^(3/2). Inner worlds really do lap the Earth; outer worlds
// really do crawl. The scene compresses distances, but it no longer
// invents a different ordering per phase.
//
// Galaxy: a near-flat rotation curve. The circular speed is roughly
// constant with radius (softened in the core so the centre does not
// diverge), so the angular speed falls as 1/r. Stars at the Sun's radius
// co-move with the Sun by construction; the inside pulls ahead and the
// outside lags — differential rotation, not two rigid disks shearing
// against each other at one hard boundary.

export function keplerRatio(a, refA) {
  return (refA / a) ** 1.5;
}

export function galaxyOmegaRatio(r, sunR, core = 1800) {
  // Compressed toward the pattern rate: the disk is shown over a span in
  // which a purely material spiral would wind itself into rings, so the
  // shear is kept in ordering and sign (inside ahead, outside behind,
  // Sun exact) at a fraction of its literal strength.
  const raw = (sunR + core) / (Math.max(0, r) + core);
  return 0.65 + 0.35 * raw;
}

// Dwarf planets, main-belt asteroids and one comet, propagated as fixed
// osculating Keplerian orbits about the Sun.
//
// Unlike the major planets these carry no secular rates, so they drift from
// reality over long spans (and, for Halley, they ignore non-gravitational
// forces entirely). Positions are good to roughly a degree near the present
// epoch - fine for showing where things are, not for pointing a telescope.

import { J2000, DEG, norm360 } from './time.js';
import { solveKepler } from './planets.js';

const GAUSS_K = 0.01720209895; // Gaussian gravitational constant, rad/day

// a (au), e, i/node/peri/M0 (deg), epoch (JD TT), radius (km).
export const SMALL_BODIES = {
  ceres: { name: 'Ceres', a: 2.7658, e: 0.0785, i: 10.594, node: 80.305, peri: 73.597, M0: 77.372, epoch: 2459000.5, radius: 469.7, color: 0x9c9187, group: 'belt' },
  pallas: { name: 'Pallas', a: 2.7721, e: 0.2299, i: 34.837, node: 173.024, peri: 310.202, M0: 59.15, epoch: 2459000.5, radius: 256, color: 0x8d8880, group: 'belt' },
  vesta: { name: 'Vesta', a: 2.3617, e: 0.0886, i: 7.141, node: 103.810, peri: 151.198, M0: 95.86, epoch: 2459000.5, radius: 262.7, color: 0xb4a893, group: 'belt' },
  juno: { name: 'Juno', a: 2.6693, e: 0.2563, i: 12.991, node: 169.85, peri: 248.14, M0: 32.0, epoch: 2459000.5, radius: 127, color: 0x9a8f84, group: 'belt' },

  eris: { name: 'Eris', a: 67.78, e: 0.4363, i: 44.040, node: 35.951, peri: 151.639, M0: 205.99, epoch: 2459000.5, radius: 1163, color: 0xd8d4cd, group: 'tno' },
  haumea: { name: 'Haumea', a: 43.13, e: 0.1912, i: 28.213, node: 122.163, peri: 239.041, M0: 218.2, epoch: 2459000.5, radius: 780, color: 0xcfc9c2, group: 'tno' },
  makemake: { name: 'Makemake', a: 45.43, e: 0.1600, i: 28.983, node: 79.362, peri: 294.834, M0: 157.0, epoch: 2459000.5, radius: 715, color: 0xb99c8c, group: 'tno' },

  halley: { name: "1P/Halley", a: 17.8341, e: 0.96714, i: 162.262, node: 58.42, peri: 111.33, tp: 2446470.95, radius: 5.5, color: 0x9fd4e0, group: 'comet' },
};

export const SMALL_BODY_KEYS = Object.keys(SMALL_BODIES);

/** Heliocentric ecliptic-J2000 position in au. */
export function smallBodyPosition(key, jdTT) {
  const b = SMALL_BODIES[key];
  const n = (GAUSS_K / Math.pow(b.a, 1.5)) / DEG; // deg/day
  const M = (b.tp !== undefined
    ? norm360(n * (jdTT - b.tp))
    : norm360(b.M0 + n * (jdTT - b.epoch))) * DEG;

  const E = solveKepler(M > Math.PI ? M - 2 * Math.PI : M, b.e);
  const xp = b.a * (Math.cos(E) - b.e);
  const yp = b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(E);

  const i = b.i * DEG, w = b.peri * DEG, node = b.node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const cn = Math.cos(node), sn = Math.sin(node);
  return {
    x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

/** Closed orbit polyline in ecliptic J2000, au. */
export function smallBodyOrbit(key, segments = 512) {
  const b = SMALL_BODIES[key];
  const i = b.i * DEG, w = b.peri * DEG, node = b.node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const cn = Math.cos(node), sn = Math.sin(node);
  const pts = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = b.a * (Math.cos(E) - b.e);
    const yp = b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(E);
    pts.push({
      x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      z: sw * si * xp + cw * si * yp,
    });
  }
  return pts;
}

/** Orbital period in days. */
export function smallBodyPeriod(key) {
  return (2 * Math.PI / GAUSS_K) * Math.pow(SMALL_BODIES[key].a, 1.5);
}

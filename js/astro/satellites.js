// Natural satellites.
//
// Two models are used:
//
//  * The Galilean moons get Meeus' Jovian satellite theory (Astronomical
//    Algorithms ch. 43), which encodes the real orbital phases including the
//    Laplace resonance libration, so Io/Europa/Ganymede line up correctly.
//  * Everything else is a Keplerian orbit in the primary's equatorial plane
//    with published semi-major axis, eccentricity, inclination and period.
//    Sizes, distances and periods are accurate; the epoch phase is approximate.
//
// Earth's Moon lives in moon.js, which uses the full ELP truncation.

import { J2000, DEG, norm360 } from './time.js';
import { solveKepler } from './planets.js';
import { bodyBasis } from './rotation.js';
import { cross, normalize, scale, add, sub, v3 } from './vec.js';

export const AU_KM = 149597870.7;

/**
 * Non-rotating equatorial frame of a primary: z along its north pole, x at the
 * ascending node of its equator on the ecliptic.
 */
export function equatorFrame(primaryKey, jdTT) {
  const basis = bodyBasis(primaryKey, jdTT);
  const z = basis ? basis.z : v3(0, 0, 1);
  let x = cross(v3(0, 0, 1), z);
  if (Math.hypot(x.x, x.y, x.z) < 1e-8) x = v3(1, 0, 0);
  x = normalize(x);
  return { x, y: cross(z, x), z };
}

// a: km, e, i: deg from the primary's equator, node/peri/M0: deg, period: days,
// radius: km. `retro` orbits are handled by an inclination above 90 degrees.
export const SATELLITES = {
  phobos: { primary: 'mars', a: 9376, e: 0.0151, i: 1.093, node: 0, peri: 150, M0: 92, period: 0.31891023, radius: 11.27, texture: null, color: 0x8a7f74 },
  deimos: { primary: 'mars', a: 23463, e: 0.00033, i: 1.788, node: 0, peri: 260, M0: 296, period: 1.263, radius: 6.2, texture: null, color: 0x9a8d80 },

  // Galileans: elements kept for radius/size only, positions come from Meeus.
  io: { primary: 'jupiter', a: 421800, e: 0.0041, i: 0.036, period: 1.769137786, radius: 1821.6, meeus: 1, color: 0xd9c98a },
  europa: { primary: 'jupiter', a: 671100, e: 0.0094, i: 0.466, period: 3.551181, radius: 1560.8, meeus: 2, color: 0xbfae95 },
  ganymede: { primary: 'jupiter', a: 1070400, e: 0.0013, i: 0.177, period: 7.154553, radius: 2631.2, meeus: 3, color: 0x9d8f80 },
  callisto: { primary: 'jupiter', a: 1882700, e: 0.0074, i: 0.192, period: 16.689017, radius: 2410.3, meeus: 4, color: 0x6b6055 },

  mimas: { primary: 'saturn', a: 185539, e: 0.0196, i: 1.574, node: 0, peri: 160, M0: 20, period: 0.942422, radius: 198.2, color: 0xb0aca6 },
  enceladus: { primary: 'saturn', a: 237948, e: 0.0047, i: 0.009, node: 0, peri: 120, M0: 200, period: 1.370218, radius: 252.1, color: 0xf0f2f4 },
  tethys: { primary: 'saturn', a: 294619, e: 0.0001, i: 1.091, node: 0, peri: 80, M0: 120, period: 1.887802, radius: 531.1, color: 0xd8d5cf },
  dione: { primary: 'saturn', a: 377396, e: 0.0022, i: 0.028, node: 0, peri: 40, M0: 300, period: 2.736915, radius: 561.4, color: 0xc9c6c0 },
  rhea: { primary: 'saturn', a: 527108, e: 0.0013, i: 0.331, node: 0, peri: 20, M0: 60, period: 4.518212, radius: 763.8, color: 0xbdb9b2 },
  titan: { primary: 'saturn', a: 1221870, e: 0.0288, i: 0.306, node: 0, peri: 180, M0: 250, period: 15.945421, radius: 2574.7, color: 0xd9a066 },
  iapetus: { primary: 'saturn', a: 3560820, e: 0.0286, i: 15.47, node: 0, peri: 270, M0: 340, period: 79.3215, radius: 734.5, color: 0x8f8474 },

  miranda: { primary: 'uranus', a: 129900, e: 0.0013, i: 4.232, node: 0, peri: 60, M0: 30, period: 1.413479, radius: 235.8, color: 0xa8a8a8 },
  ariel: { primary: 'uranus', a: 190900, e: 0.0012, i: 0.260, node: 0, peri: 120, M0: 200, period: 2.520379, radius: 578.9, color: 0xb4b0ac },
  umbriel: { primary: 'uranus', a: 266000, e: 0.0039, i: 0.128, node: 0, peri: 200, M0: 80, period: 4.144177, radius: 584.7, color: 0x7c7874 },
  titania: { primary: 'uranus', a: 436300, e: 0.0011, i: 0.340, node: 0, peri: 300, M0: 140, period: 8.705872, radius: 788.9, color: 0xa9a29a },
  oberon: { primary: 'uranus', a: 583500, e: 0.0014, i: 0.058, node: 0, peri: 20, M0: 260, period: 13.463239, radius: 761.4, color: 0x9c948c },

  proteus: { primary: 'neptune', a: 117647, e: 0.0005, i: 0.026, node: 0, peri: 90, M0: 45, period: 1.122315, radius: 210, color: 0x6f6f72 },
  triton: { primary: 'neptune', a: 354759, e: 0.000016, i: 156.865, node: 178, peri: 0, M0: 130, period: 5.876854, radius: 1353.4, color: 0xd6cfc4 },

  charon: { primary: 'pluto', a: 19591, e: 0.0002, i: 0.080, node: 0, peri: 0, M0: 20, period: 6.3872304, radius: 606, color: 0x9c9086 },
};

/** Position of a Keplerian satellite relative to its primary, in km. */
function keplerSatellite(sat, jdTT, frame) {
  const n = 360 / sat.period; // deg/day
  const M = norm360(sat.M0 + n * (jdTT - J2000)) * DEG;
  const E = solveKepler(M, sat.e);
  const xp = sat.a * (Math.cos(E) - sat.e);
  const yp = sat.a * Math.sqrt(1 - sat.e * sat.e) * Math.sin(E);

  const i = sat.i * DEG, w = sat.peri * DEG, node = sat.node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const cn = Math.cos(node), sn = Math.sin(node);
  // Perifocal -> primary equatorial frame.
  const ex = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const ey = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const ez = sw * si * xp + cw * si * yp;

  return add(add(scale(frame.x, ex), scale(frame.y, ey)), scale(frame.z, ez));
}

/**
 * Meeus ch. 43: orbital longitudes u1..u4 of the Galilean moons measured from
 * superior conjunction with Jupiter as seen from Earth, plus their radii in
 * Jupiter equatorial radii.
 */
export function galileanElements(jdTT) {
  const d = jdTT - J2000;
  const V = (172.74 + 0.00111588 * d) * DEG;
  const M = (357.529 + 0.9856003 * d) * DEG;
  const N = (20.020 + 0.0830853 * d) * DEG + 0.329 * DEG * Math.sin(V);
  const J = (66.115 + 0.9025179 * d) * DEG - 0.329 * DEG * Math.sin(V);
  const A = (1.915 * Math.sin(M) + 0.020 * Math.sin(2 * M)) * DEG;
  const B = (5.555 * Math.sin(N) + 0.168 * Math.sin(2 * N)) * DEG;
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * Math.cos(M) - 0.00014 * Math.cos(2 * M);
  const r = 5.20872 - 0.25208 * Math.cos(N) - 0.00611 * Math.cos(2 * N);
  const delta = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(K));
  const psi = Math.asin((R / delta) * Math.sin(K));

  const tau = d - delta / 173; // light-time correction, days
  const Bdeg = B / DEG, psiDeg = psi / DEG;

  let u1 = norm360(163.8067 + 203.4058643 * tau + psiDeg - Bdeg);
  let u2 = norm360(358.4108 + 101.2916334 * tau + psiDeg - Bdeg);
  let u3 = norm360(5.7129 + 50.2345179 * tau + psiDeg - Bdeg);
  let u4 = norm360(224.8151 + 21.4879801 * tau + psiDeg - Bdeg);

  const G = (331.18 + 50.310482 * tau) * DEG;
  const H = (87.45 + 21.569231 * tau) * DEG;
  const du1 = 0.473 * Math.sin(2 * (u1 - u2) * DEG);
  const du2 = 1.065 * Math.sin(2 * (u2 - u3) * DEG);
  const du3 = 0.165 * Math.sin(G);
  const du4 = 0.843 * Math.sin(H);

  const r1 = 5.9057 - 0.0244 * Math.cos(2 * (u1 - u2) * DEG);
  const r2 = 9.3966 - 0.0882 * Math.cos(2 * (u2 - u3) * DEG);
  const r3 = 14.9883 - 0.0216 * Math.cos(2 * (u3 - u4) * DEG);
  const r4 = 26.3627 - 0.1939 * Math.cos((u4 - u3) * DEG);

  return [
    { u: (u1 + du1) * DEG, r: r1 },
    { u: (u2 + du2) * DEG, r: r2 },
    { u: (u3 + du3) * DEG, r: r3 },
    { u: (u4 + du4) * DEG, r: r4 },
  ];
}

const JUPITER_EQ_RADIUS = 71492;

/**
 * Position of a Galilean moon relative to Jupiter, in km. u is measured from
 * the anti-Earth direction, so we build the in-plane basis from the
 * Jupiter->Earth line projected into Jupiter's equatorial plane.
 */
function galileanPosition(sat, jdTT, frame, jupiterPos, earthPos) {
  const el = galileanElements(jdTT)[sat.meeus - 1];
  const away = normalize(sub(jupiterPos, earthPos)); // superior-conjunction direction
  const d = away.x * frame.z.x + away.y * frame.z.y + away.z * frame.z.z;
  const b = normalize(sub(away, scale(frame.z, d))); // project into the equator
  const t = cross(frame.z, b); // 90 degrees ahead, prograde
  const radiusKm = el.r * JUPITER_EQ_RADIUS;
  return add(scale(b, radiusKm * Math.cos(el.u)), scale(t, radiusKm * Math.sin(el.u)));
}

/**
 * One closed orbit of a satellite, relative to its primary, in km. Drawn from
 * the elements rather than by integrating the position, so it stays cheap
 * enough to refresh as the primary's pole slowly moves.
 */
export function satelliteOrbitPath(key, jdTT, positionsAu, segments = 192) {
  const sat = SATELLITES[key];
  const frame = equatorFrame(sat.primary, jdTT);
  const pts = [];

  if (sat.meeus) {
    const el = galileanElements(jdTT)[sat.meeus - 1];
    const radiusKm = el.r * JUPITER_EQ_RADIUS;
    for (let k = 0; k <= segments; k++) {
      const a = (k / segments) * 2 * Math.PI;
      pts.push(add(scale(frame.x, radiusKm * Math.cos(a)), scale(frame.y, radiusKm * Math.sin(a))));
    }
    return pts;
  }

  const i = sat.i * DEG, w = sat.peri * DEG, node = sat.node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const cn = Math.cos(node), sn = Math.sin(node);
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = sat.a * (Math.cos(E) - sat.e);
    const yp = sat.a * Math.sqrt(1 - sat.e * sat.e) * Math.sin(E);
    const ex = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
    const ey = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
    const ez = sw * si * xp + cw * si * yp;
    pts.push(add(add(scale(frame.x, ex), scale(frame.y, ey)), scale(frame.z, ez)));
  }
  return pts;
}

/**
 * Positions of every satellite, relative to their primary, in km.
 * @param ctx {{jdTT:number, positionsAu:Object}} heliocentric positions keyed by body
 */
export function satellitePositions(jdTT, positionsAu) {
  const frames = {};
  const out = {};
  for (const [key, sat] of Object.entries(SATELLITES)) {
    if (!frames[sat.primary]) frames[sat.primary] = equatorFrame(sat.primary, jdTT);
    const frame = frames[sat.primary];
    if (sat.meeus) {
      out[key] = galileanPosition(
        sat, jdTT, frame,
        scale(positionsAu.jupiter, AU_KM),
        scale(positionsAu.earth, AU_KM)
      );
    } else {
      out[key] = keplerSatellite(sat, jdTT, frame);
    }
  }
  return out;
}

// Heliocentric planet positions from JPL's "Keplerian Elements for Approximate
// Positions of the Major Planets" (E. M. Standish, Solar System Dynamics group).
//
// Two element sets are published. Table 1 is fitted to 1800-2050 and is good to
// a few arcseconds for the inner planets; Table 2 spans 3000 BC - 3000 AD with
// extra long-period terms for Jupiter..Pluto and is good to a fraction of a
// degree over that whole span. We pick whichever covers the requested date.
//
// Output is heliocentric ecliptic J2000, in astronomical units.

import { J2000, DEG } from './time.js';

// a (au), e, I (deg), L (deg), longPeri (deg), longNode (deg) at J2000,
// followed by their rates per Julian century.
const TABLE1 = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  ],
  embary: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
  pluto: [
    [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  ],
};

// Table 2, valid 3000 BC - 3000 AD. Jupiter..Pluto carry four extra terms
// [b, c, s, f] that model the great Jupiter-Saturn inequality and Pluto's
// long-period behaviour.
const TABLE2 = {
  mercury: [
    [0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
    [0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182],
  ],
  venus: [
    [0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496],
    [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174],
  ],
  embary: [
    [1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
    [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856],
  ],
  mars: [
    [1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
    [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431],
  ],
  jupiter: [
    [5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
    [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619],
    [-0.00012452, 0.06064060, -0.35635438, 38.35125000],
  ],
  saturn: [
    [9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
    [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002],
    [0.00025899, -0.13434469, 0.87320147, 38.35125000],
  ],
  uranus: [
    [19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
    [-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699],
    [0.00058331, -0.97731848, 0.17689245, 7.67025000],
  ],
  neptune: [
    [30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853],
    [0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302],
    [-0.00041348, 0.68346318, -0.10162547, 7.67025000],
  ],
  pluto: [
    [39.48686035, 0.24885238, 17.14104260, 238.96535011, 224.09702598, 110.30167986],
    [0.00449751, 0.00006016, 0.00000501, 145.18042903, -0.00968827, -0.00809981],
    [-0.01262724, 0, 0, 0],
  ],
};

export const PLANET_KEYS = Object.keys(TABLE1);

/** Solve Kepler's equation for the eccentric anomaly (radians). */
export function solveKepler(M, e, tol = 1e-12) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 60; i++) {
    const dM = M - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/**
 * Osculating elements for a body at a given TT Julian date.
 * @returns {{a:number,e:number,i:number,M:number,w:number,node:number}} angles in radians
 */
export function elementsAt(key, jdTT, forceTable = 0) {
  const year = 2000 + (jdTT - J2000) / 365.25;
  const useT2 = forceTable ? forceTable === 2 : year < 1800 || year > 2050;
  const row = (useT2 ? TABLE2 : TABLE1)[key];
  if (!row) throw new Error(`unknown planet: ${key}`);

  const T = (jdTT - J2000) / 36525;
  const [e0, rate, extra] = row;
  const a = e0[0] + rate[0] * T;
  const e = e0[1] + rate[1] * T;
  const I = e0[2] + rate[2] * T;
  const L = e0[3] + rate[3] * T;
  const peri = e0[4] + rate[4] * T;
  const node = e0[5] + rate[5] * T;

  let M = L - peri;
  if (extra) {
    const [b, c, s, f] = extra;
    M += b * T * T + c * Math.cos(f * DEG * T) + s * Math.sin(f * DEG * T);
  }
  M = ((M % 360) + 540) % 360 - 180; // fold into [-180, 180)

  return {
    a,
    e,
    i: I * DEG,
    M: M * DEG,
    w: (peri - node) * DEG, // argument of perihelion
    node: node * DEG,
  };
}

/** Rotate perifocal coordinates into the ecliptic J2000 frame. */
function perifocalToEcliptic(xp, yp, { i, w, node }) {
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const cn = Math.cos(node), sn = Math.sin(node);
  // Standard 3-1-3 rotation R_z(node) R_x(i) R_z(w).
  const x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;
  return { x, y, z };
}

/** Heliocentric ecliptic-J2000 position, in au. */
export function heliocentric(key, jdTT, forceTable = 0) {
  const el = elementsAt(key, jdTT, forceTable);
  const E = solveKepler(el.M, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return perifocalToEcliptic(xp, yp, el);
}

/** Heliocentric velocity in au/day, by central difference. */
export function heliocentricVelocity(key, jdTT, h = 0.02) {
  const a = heliocentric(key, jdTT - h);
  const b = heliocentric(key, jdTT + h);
  return { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) };
}

/**
 * Sample one full orbit as a closed polyline of ecliptic-J2000 points, using the
 * elements osculating at `jdTT`. Sampling in eccentric anomaly keeps the point
 * density high near perihelion where curvature is greatest.
 */
export function orbitPath(key, jdTT, segments = 512) {
  const el = elementsAt(key, jdTT);
  const pts = new Array(segments + 1);
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * 2 * Math.PI;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    pts[k] = perifocalToEcliptic(xp, yp, el);
  }
  return pts;
}

// The tables track the Earth-Moon barycentre, so callers asking about "earth"
// are answered from the barycentre's elements.
const alias = (key) => (key === 'earth' ? 'embary' : key);

/** Sidereal orbital period in days, from the mean-longitude rate. */
export function orbitalPeriodDays(key) {
  const row = TABLE1[alias(key)];
  if (!row) return null;
  return (360 / row[1][3]) * 36525; // rate is deg per Julian century
}

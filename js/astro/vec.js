// Minimal double-precision 3-vector helpers. The ephemeris layer never touches
// three.js types, so positions stay in float64 all the way to the renderer,
// where a floating origin converts them to small float32 offsets.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a) => Math.hypot(a.x, a.y, a.z);

export function normalize(a) {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

// Mean obliquity of the ecliptic at J2000 (IAU 2006).
export const OBLIQUITY_J2000 = 23.4392794444 * (Math.PI / 180);
const COS_E = Math.cos(OBLIQUITY_J2000);
const SIN_E = Math.sin(OBLIQUITY_J2000);

/** Equatorial J2000 (ICRF-aligned) -> ecliptic J2000. */
export const eqToEcl = (a) => ({
  x: a.x,
  y: a.y * COS_E + a.z * SIN_E,
  z: -a.y * SIN_E + a.z * COS_E,
});

/** Ecliptic J2000 -> equatorial J2000. */
export const eclToEq = (a) => ({
  x: a.x,
  y: a.y * COS_E - a.z * SIN_E,
  z: a.y * SIN_E + a.z * COS_E,
});

/** Spherical (lon, lat in radians, radius) -> cartesian. */
export function sph(lon, lat, r = 1) {
  const cl = Math.cos(lat);
  return { x: r * cl * Math.cos(lon), y: r * cl * Math.sin(lon), z: r * Math.sin(lat) };
}

/** Cartesian -> { lon, lat, r }, angles in radians with lon in [0, 2pi). */
export function toSph(a) {
  const r = len(a);
  const lon = Math.atan2(a.y, a.x);
  return {
    lon: lon < 0 ? lon + 2 * Math.PI : lon,
    lat: r === 0 ? 0 : Math.asin(a.z / r),
    r,
  };
}

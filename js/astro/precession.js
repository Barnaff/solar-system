// Precession of the equinoxes (IAU 1976 / Lieske).
//
// The lunar series in moon.js produces coordinates referred to the mean
// equinox and ecliptic *of date*, while everything else in this project works
// in the fixed J2000 frame. Without this reduction the Moon drifts about
// 0.014 degrees per year against the planets - enough to smear eclipses.

import { ARCSEC } from './time.js';
import { eqToEcl } from './vec.js';

/** Mean obliquity of the ecliptic of date, in radians. T = centuries from J2000. */
export function obliquityOfDate(T) {
  const seconds = 84381.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return seconds * ARCSEC;
}

/** Accumulated precession angles zeta, z, theta (radians) for J2000 -> date. */
function precessionAngles(T) {
  const T2 = T * T, T3 = T2 * T;
  return {
    zeta: (2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) * ARCSEC,
    z: (2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) * ARCSEC,
    theta: (2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) * ARCSEC,
  };
}

/** Rows of the equatorial precession matrix taking J2000 -> equinox of date. */
function precessionMatrix(T) {
  const { zeta, z, theta } = precessionAngles(T);
  const cz = Math.cos(zeta), sz = Math.sin(zeta);
  const cZ = Math.cos(z), sZ = Math.sin(z);
  const ct = Math.cos(theta), st = Math.sin(theta);
  return [
    [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
    [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
    [cz * st, -sz * st, ct],
  ];
}

/** Equatorial cartesian, equinox of date -> equatorial J2000 (transpose). */
export function equatorialDateToJ2000(v, T) {
  const m = precessionMatrix(T);
  return {
    x: m[0][0] * v.x + m[1][0] * v.y + m[2][0] * v.z,
    y: m[0][1] * v.x + m[1][1] * v.y + m[2][1] * v.z,
    z: m[0][2] * v.x + m[1][2] * v.y + m[2][2] * v.z,
  };
}

/** Equatorial cartesian, J2000 -> equinox of date. */
export function equatorialJ2000ToDate(v, T) {
  const m = precessionMatrix(T);
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

/**
 * Ecliptic cartesian referred to the mean ecliptic and equinox of date,
 * reduced to the ecliptic and equinox of J2000.
 */
export function eclipticDateToJ2000(v, T) {
  const eps = obliquityOfDate(T);
  const ce = Math.cos(eps), se = Math.sin(eps);
  const eqDate = { x: v.x, y: v.y * ce - v.z * se, z: v.y * se + v.z * ce };
  return eqToEcl(equatorialDateToJ2000(eqDate, T));
}

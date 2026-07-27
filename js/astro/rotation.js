// Body orientation from the IAU/IAG Working Group on Cartographic Coordinates
// and Rotational Elements (2015 report).
//
// Each body is described by the right ascension and declination of its north
// pole in the ICRF (alpha0, delta0) plus W, the angle from the ascending node
// of the body equator on the ICRF equator to the body's prime meridian. From
// those three angles we build a body-fixed orthonormal basis, which is what
// puts the right face of a planet toward the Sun at the right moment - the
// thing sunrise timing actually depends on.

import { J2000, DEG } from './time.js';
import { eqToEcl, cross, normalize, sub, scale } from './vec.js';

const sin = (deg) => Math.sin(deg * DEG);
const cos = (deg) => Math.cos(deg * DEG);

/**
 * @returns {{ra:number, dec:number, w:number}} degrees
 */
export function iauAngles(key, jdTT) {
  const d = jdTT - J2000; // days
  const T = d / 36525; // centuries

  switch (key) {
    case 'sun':
      return { ra: 286.13, dec: 63.87, w: 84.176 + 14.1844000 * d };

    case 'mercury': {
      const M1 = 174.791086 + 4.092335 * d;
      const M2 = 349.582171 + 8.184670 * d;
      const M3 = 164.373257 + 12.277005 * d;
      const M4 = 339.164343 + 16.369340 * d;
      const M5 = 153.955429 + 20.461675 * d;
      const w = 329.5988 + 6.1385108 * d +
        0.01067257 * sin(M1) - 0.00112309 * sin(M2) - 0.00011040 * sin(M3) -
        0.00002539 * sin(M4) - 0.00000571 * sin(M5);
      return { ra: 281.0103 - 0.0328 * T, dec: 61.4155 - 0.0049 * T, w };
    }

    case 'venus':
      return { ra: 272.76, dec: 67.16, w: 160.20 - 1.4813688 * d };

    case 'earth':
      return { ra: 0.00 - 0.641 * T, dec: 90.00 - 0.557 * T, w: 190.147 + 360.9856235 * d };

    case 'moon': {
      const E1 = 125.045 - 0.0529921 * d;
      const E2 = 250.089 - 0.1059842 * d;
      const E3 = 260.008 + 13.0120009 * d;
      const E4 = 176.625 + 13.3407154 * d;
      const E5 = 357.529 + 0.9856003 * d;
      const E6 = 311.589 + 26.4057084 * d;
      const E7 = 134.963 + 13.0649930 * d;
      const E8 = 276.617 + 0.3287146 * d;
      const E9 = 34.226 + 1.7484877 * d;
      const E10 = 15.134 - 0.1589763 * d;
      const E11 = 119.743 + 0.0036096 * d;
      const E12 = 239.961 + 0.1643573 * d;
      const E13 = 25.053 + 12.9590088 * d;
      const ra = 269.9949 + 0.0031 * T - 3.8787 * sin(E1) - 0.1204 * sin(E2) +
        0.0700 * sin(E3) - 0.0172 * sin(E4) + 0.0072 * sin(E6) -
        0.0052 * sin(E10) + 0.0043 * sin(E13);
      const dec = 66.5392 + 0.0130 * T + 1.5419 * cos(E1) + 0.0239 * cos(E2) -
        0.0278 * cos(E3) + 0.0068 * cos(E4) - 0.0029 * cos(E6) +
        0.0009 * cos(E7) + 0.0008 * cos(E10) - 0.0009 * cos(E13);
      const w = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d +
        3.5610 * sin(E1) + 0.1208 * sin(E2) - 0.0642 * sin(E3) + 0.0158 * sin(E4) +
        0.0252 * sin(E5) - 0.0066 * sin(E6) - 0.0047 * sin(E7) - 0.0046 * sin(E8) +
        0.0028 * sin(E9) + 0.0052 * sin(E10) + 0.0040 * sin(E11) +
        0.0019 * sin(E12) - 0.0044 * sin(E13);
      return { ra, dec, w };
    }

    case 'mars':
      return {
        ra: 317.68143 - 0.1061 * T,
        dec: 52.88650 - 0.0609 * T,
        w: 176.630 + 350.89198226 * d,
      };

    case 'jupiter':
      // System III (magnetic field / deep interior) rotation.
      return {
        ra: 268.056595 - 0.006499 * T,
        dec: 64.495303 + 0.002413 * T,
        w: 284.95 + 870.5360000 * d,
      };

    case 'saturn':
      return { ra: 40.589 - 0.036 * T, dec: 83.537 - 0.004 * T, w: 38.90 + 810.7939024 * d };

    case 'uranus':
      return { ra: 257.311, dec: -15.175, w: 203.81 - 501.1600928 * d };

    case 'neptune': {
      const N = 357.85 + 52.316 * T;
      return {
        ra: 299.36 + 0.70 * sin(N),
        dec: 43.46 - 0.51 * cos(N),
        w: 249.978 + 541.1397757 * d - 0.48 * sin(N),
      };
    }

    case 'pluto':
      return { ra: 132.993, dec: -6.163, w: 302.695 + 56.3625225 * d };

    default:
      return null;
  }
}

/** Sidereal rotation period in days (negative when retrograde). */
export function rotationPeriodDays(key) {
  const a = iauAngles(key, J2000);
  const b = iauAngles(key, J2000 + 1);
  if (!a || !b) return null;
  const rate = b.w - a.w; // deg/day
  return 360 / rate;
}

/**
 * Body-fixed basis expressed in the ecliptic-J2000 frame.
 * `z` is the north pole, `x` points at the prime meridian, `y` completes the
 * right-handed set (i.e. 90 degrees of increasing planetocentric longitude).
 */
export function bodyBasis(key, jdTT) {
  const ang = iauAngles(key, jdTT);
  if (!ang) return null;
  const { ra, dec, w } = ang;

  // Equatorial J2000.
  const pole = { x: cos(dec) * cos(ra), y: cos(dec) * sin(ra), z: sin(dec) };
  // Ascending node of the body equator on the ICRF equator, at RA = alpha0 + 90.
  const q = { x: -sin(ra), y: cos(ra), z: 0 };
  const p = cross(pole, q);
  const cw = cos(w), sw = sin(w);
  const xAxis = { x: q.x * cw + p.x * sw, y: q.y * cw + p.y * sw, z: q.z * cw + p.z * sw };

  const z = eqToEcl(pole);
  const x = eqToEcl(xAxis);
  const y = cross(z, x);
  return { x: normalize(x), y: normalize(y), z: normalize(z) };
}

/**
 * Basis for a tidally locked satellite: the prime meridian faces the primary
 * and the pole is taken normal to the orbit plane. Used for every moon except
 * Earth's, which has a proper IAU model.
 */
export function synchronousBasis(satPos, primaryPos, satVel, primaryVel) {
  const rel = sub(primaryPos, satPos); // sub-primary direction
  const relV = sub(satVel, primaryVel);
  let z = normalize(cross(sub(satPos, primaryPos), relV)); // orbit normal
  if (!isFinite(z.x)) z = { x: 0, y: 0, z: 1 };
  let x = normalize(rel);
  // Re-orthogonalise x against the pole.
  const d = x.x * z.x + x.y * z.y + x.z * z.z;
  x = normalize(sub(x, scale(z, d)));
  const y = cross(z, x);
  return { x, y, z };
}

/** Unit vector for a planetographic (lat, lon) in body-fixed coordinates. */
export function surfaceNormal(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
}

/** Rotate a body-fixed vector into the ecliptic frame using a basis. */
export function bodyToEcliptic(basis, v) {
  return {
    x: basis.x.x * v.x + basis.y.x * v.y + basis.z.x * v.z,
    y: basis.x.y * v.x + basis.y.y * v.y + basis.z.y * v.z,
    z: basis.x.z * v.x + basis.y.z * v.y + basis.z.z * v.z,
  };
}

/** Inverse of {@link bodyToEcliptic}: the basis is orthonormal, so transpose. */
export function eclipticToBody(basis, v) {
  return {
    x: basis.x.x * v.x + basis.x.y * v.y + basis.x.z * v.z,
    y: basis.y.x * v.x + basis.y.y * v.y + basis.y.z * v.z,
    z: basis.z.x * v.x + basis.z.y * v.y + basis.z.z * v.z,
  };
}

/** Planetographic latitude and longitude, in degrees, of a body-fixed direction. */
export function latLonOf(bodyFixedDir) {
  const r = Math.hypot(bodyFixedDir.x, bodyFixedDir.y, bodyFixedDir.z) || 1;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, bodyFixedDir.z / r))) / DEG,
    lon: ((Math.atan2(bodyFixedDir.y, bodyFixedDir.x) / DEG) % 360 + 360) % 360,
  };
}


/**
 * Axial tilt as conventionally quoted: the angle between the body's *angular
 * momentum* pole and the normal to its orbit.
 *
 * Two conventions have to be reconciled. The IAU north pole is the one lying
 * north of the invariable plane, which for a retrograde rotator such as Venus
 * or Uranus is the opposite end of the spin vector; flipping it when W runs
 * backwards is what turns Uranus's 82 degrees into the familiar 97.8. And the
 * reference plane is the body's own orbit, not the ecliptic, which is what
 * separates Jupiter's 2.2 degrees from its quoted 3.1.
 */
export function axialTilt(key, jdTT, orbitNormal = null) {
  const b = bodyBasis(key, jdTT);
  if (!b) return null;

  const retrograde = rotationPeriodDays(key) < 0;
  const pole = retrograde ? { x: -b.z.x, y: -b.z.y, z: -b.z.z } : b.z;
  const n = orbitNormal || { x: 0, y: 0, z: 1 };
  const d = (pole.x * n.x + pole.y * n.y + pole.z * n.z) /
    Math.hypot(n.x, n.y, n.z);
  return Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
}

/** Unit normal of an orbit, from a position and velocity pair. */
export function orbitNormalOf(pos, vel) {
  return normalize(cross(pos, vel));
}

// Where the Sun is from a spot on a world: altitude, azimuth, local solar
// time, and when it next crosses the horizon.
//
// Pure astronomy - no renderer dependency - so the verification suite can
// import it directly under Node.

import { DEG } from './time.js';
import { surfaceNormal, bodyToEcliptic } from './rotation.js';
import { computeState } from './ephemeris.js';
import { normalize, sub, dot } from './vec.js';

export const EYE_HEIGHT_KM = 0.0017; // 1.7 m

/** Local east/north/up unit vectors in the body-fixed frame. */
export function localFrame(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  const up = surfaceNormal(latDeg, lonDeg);
  const east = { x: -Math.sin(lo), y: Math.cos(lo), z: 0 };
  const north = {
    x: -Math.sin(la) * Math.cos(lo),
    y: -Math.sin(la) * Math.sin(lo),
    z: Math.cos(la),
  };
  return { east, north, up };
}

/** Geodetic radius of an oblate body along a surface normal direction. */
export function ellipsoidRadius(n, a, f) {
  if (!f) return a;
  const b = a * (1 - f);
  return 1 / Math.sqrt((n.x * n.x + n.y * n.y) / (a * a) + (n.z * n.z) / (b * b));
}

/** Angular radius of the horizon seen from `height` above a sphere of `radius`. */
export const horizonAngle = (radiusKm, heightKm) => Math.acos(radiusKm / (radiusKm + heightKm));

/** Sun altitude in degrees at an arbitrary time, for a fixed site. */
export function sunAltitudeAt(jdUTC, bodyKey, latDeg, lonDeg, def) {
  const state = computeState(jdUTC);
  const basis = state.basis[bodyKey];
  const planet = state.pos[bodyKey];
  if (!basis || !planet) return 0;
  const nBody = surfaceNormal(latDeg, lonDeg);
  const up = bodyToEcliptic(basis, nBody);
  const r = def ? ellipsoidRadius(nBody, def.radius, def.flattening || 0) : 0;
  const observer = {
    x: planet.x + up.x * r, y: planet.y + up.y * r, z: planet.z + up.z * r,
  };
  const sunDir = normalize(sub(state.pos.sun, observer));
  return Math.asin(Math.max(-1, Math.min(1, dot(sunDir, up)))) / DEG;
}

/**
 * Mean solar day: the beat between a body's inertial rotation and the rate at
 * which its direction to the Sun sweeps round.
 *
 * The second term must be the *heliocentric* period, not the orbit about a
 * primary. The Moon turns once every 27.32 days and orbits the Earth in the
 * same 27.32 days, but its day is the 29.5-day synodic month, set against the
 * Earth-Moon system's year around the Sun.
 *
 * @param {number} rotationDays sidereal rotation period, signed
 * @param {number} heliocentricPeriodDays orbital period about the Sun
 */
export function solarDayLength(rotationDays, heliocentricPeriodDays) {
  if (!rotationDays) return 1;
  if (!heliocentricPeriodDays) return Math.abs(rotationDays);
  const denom = 1 / rotationDays - 1 / heliocentricPeriodDays;
  return Math.abs(denom) < 1e-12 ? Math.abs(heliocentricPeriodDays) : Math.abs(1 / denom);
}

/**
 * Next sunrise and sunset after `jd`. Scans one solar day coarsely, then
 * bisects each horizon crossing. The refraction allowance only applies where
 * there is an atmosphere to refract through.
 */
export function nextSunEvents(jd, bodyKey, latDeg, lonDeg, def, solarDay, eyeHeight = EYE_HEIGHT_KM) {
  // -0.833 is the usual refraction-plus-semidiameter allowance; without an
  // atmosphere only the Sun's own radius counts. Height above the surface
  // depresses the horizon further, which matters when floating 2 km over a
  // gas giant far more than when standing 1.7 m up on rock.
  const base = def?.atmosphere ? -0.833 : -0.25;
  const dip = horizonAngle(def?.radius ?? 6378, eyeHeight) / DEG;
  const horizon = base - dip;
  const span = Math.min(solarDay * 1.05, 4000);
  const steps = 160;
  const dt = span / steps;

  const alt = (t) => sunAltitudeAt(t, bodyKey, latDeg, lonDeg, def) - horizon;
  let prevT = jd;
  let prevA = alt(prevT);
  let rise = null, set = null;

  for (let i = 1; i <= steps && (rise === null || set === null); i++) {
    const t = jd + i * dt;
    const a = alt(t);
    if (prevA <= 0 && a > 0 && rise === null) rise = bisect(alt, prevT, t);
    else if (prevA >= 0 && a < 0 && set === null) set = bisect(alt, prevT, t);
    prevT = t;
    prevA = a;
  }
  return { rise, set, polar: rise === null && set === null, up: prevA > 0 };
}

function bisect(f, lo, hi, iterations = 30) {
  let flo = f(lo);
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Azimuth of the Sun at a given time, degrees from north through east. */
export function sunAzimuthAt(jdUTC, bodyKey, latDeg, lonDeg, def) {
  const state = computeState(jdUTC);
  const basis = state.basis[bodyKey];
  if (!basis) return 0;
  const nBody = surfaceNormal(latDeg, lonDeg);
  const { east, north } = localFrame(latDeg, lonDeg);
  const up = bodyToEcliptic(basis, nBody);
  const r = def ? ellipsoidRadius(nBody, def.radius, def.flattening || 0) : 0;
  const p = state.pos[bodyKey];
  const observer = { x: p.x + up.x * r, y: p.y + up.y * r, z: p.z + up.z * r };
  const sunDir = normalize(sub(state.pos.sun, observer));
  const az = Math.atan2(dot(sunDir, bodyToEcliptic(basis, east)), dot(sunDir, bodyToEcliptic(basis, north)));
  return ((az / DEG) % 360 + 360) % 360;
}

/**
 * Local apparent solar time in hours: the hour angle of the Sun measured from
 * the site's meridian. This is real sundial time, so it carries the equation
 * of time rather than any civil-clock convention.
 */
export function localSolarTime(state, bodyKey, lonDeg) {
  const basis = state.basis[bodyKey];
  if (!basis) return 0;
  const sunDir = normalize(sub(state.pos.sun, state.pos[bodyKey]));
  const x = dot(sunDir, basis.x), y = dot(sunDir, basis.y);
  const subSolarLon = Math.atan2(y, x) / DEG;
  const hourAngle = ((lonDeg - subSolarLon + 540) % 360) - 180;
  return ((hourAngle / 15 + 12) % 24 + 24) % 24;
}

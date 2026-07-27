// Assembles a complete Solar System state for one instant: heliocentric
// positions (km, ecliptic J2000), velocities (km/day) and body-fixed
// orientation bases for everything the renderer draws.

import { jdUTCtoTT } from './time.js';
import { heliocentric, heliocentricVelocity, PLANET_KEYS } from './planets.js';
import { moonGeocentricKm, MOON_MASS_FRACTION } from './moon.js';
import { SATELLITES, satellitePositions } from './satellites.js';
import { SMALL_BODY_KEYS, smallBodyPosition } from './smallbodies.js';
import { bodyBasis, synchronousBasis } from './rotation.js';
import { add, sub, scale, len, normalize, dot, v3 } from './vec.js';

export const AU_KM = 149597870.7;

const PLANET_LIST = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/**
 * @param {number} jdUTC simulation time on the UTC scale
 * @returns {{jdUTC:number, jdTT:number, pos:Object, vel:Object, basis:Object}}
 */
export function computeState(jdUTC) {
  const jdTT = jdUTCtoTT(jdUTC);

  // --- Heliocentric planet positions -------------------------------------
  const au = {}; // in au, used by the Galilean theory
  for (const key of PLANET_KEYS) {
    if (key === 'embary') continue;
    au[key] = heliocentric(key, jdTT);
  }
  const emb = heliocentric('embary', jdTT);
  const moonGeoKm = moonGeocentricKm(jdTT);
  const moonGeoAu = scale(moonGeoKm, 1 / AU_KM);

  // The published elements track the Earth-Moon barycentre; split it.
  au.earth = sub(emb, scale(moonGeoAu, MOON_MASS_FRACTION));
  au.moon = add(au.earth, moonGeoAu);

  const pos = { sun: v3(0, 0, 0) };
  for (const [k, p] of Object.entries(au)) pos[k] = scale(p, AU_KM);

  // --- Velocities ---------------------------------------------------------
  const vel = { sun: v3(0, 0, 0) };
  for (const key of PLANET_LIST) {
    if (key === 'earth') continue;
    vel[key] = scale(heliocentricVelocity(key, jdTT), AU_KM);
  }
  vel.earth = scale(heliocentricVelocity('embary', jdTT), AU_KM);
  {
    const h = 0.02;
    const a = moonGeocentricKm(jdTT - h);
    const b = moonGeocentricKm(jdTT + h);
    const dMoon = scale(sub(b, a), 1 / (2 * h));
    vel.earth = sub(vel.earth, scale(dMoon, MOON_MASS_FRACTION));
    vel.moon = add(vel.earth, dMoon);
  }

  // --- Small bodies -------------------------------------------------------
  for (const key of SMALL_BODY_KEYS) {
    pos[key] = scale(smallBodyPosition(key, jdTT), AU_KM);
    const h = 0.5;
    const a = smallBodyPosition(key, jdTT - h);
    const b = smallBodyPosition(key, jdTT + h);
    vel[key] = scale(sub(b, a), AU_KM / (2 * h));
  }

  // --- Satellites ---------------------------------------------------------
  const relSat = satellitePositions(jdTT, au);
  const relSatAhead = satellitePositions(jdTT + 0.02, au);
  for (const [key, rel] of Object.entries(relSat)) {
    const primary = SATELLITES[key].primary;
    pos[key] = add(pos[primary], rel);
    vel[key] = add(vel[primary], scale(sub(relSatAhead[key], rel), 1 / 0.02));
  }

  // --- Orientation --------------------------------------------------------
  const basis = {};
  for (const key of ['sun', ...PLANET_LIST, 'moon']) {
    basis[key] = bodyBasis(key, jdTT);
  }
  for (const key of Object.keys(SATELLITES)) {
    const primary = SATELLITES[key].primary;
    basis[key] = synchronousBasis(pos[key], pos[primary], vel[key], vel[primary]);
  }
  for (const key of SMALL_BODY_KEYS) {
    // No published rotation models here; spin them slowly about the ecliptic
    // pole so they are not visually frozen.
    const ang = ((jdTT % 0.4) / 0.4) * 2 * Math.PI;
    basis[key] = {
      x: v3(Math.cos(ang), Math.sin(ang), 0),
      y: v3(-Math.sin(ang), Math.cos(ang), 0),
      z: v3(0, 0, 1),
    };
  }

  return { jdUTC, jdTT, pos, vel, basis };
}

/** Sun-relative and Earth-relative geometry for the info panel. */
export function bodyGeometry(state, key) {
  const p = state.pos[key];
  if (!p) return null;
  const rSun = len(p);
  const fromEarth = sub(p, state.pos.earth);
  const rEarth = len(fromEarth);
  const speed = state.vel[key] ? len(state.vel[key]) / 86400 : 0; // km/s

  // Illuminated fraction as seen from Earth.
  let phase = 1;
  if (key !== 'sun' && rSun > 0 && rEarth > 0) {
    const cosPhase = dot(normalize(scale(p, -1)), normalize(scale(fromEarth, -1)));
    phase = (1 + cosPhase) / 2;
  }
  return { rSun, rEarth, speed, phase, fromEarth };
}

/**
 * Sub-solar point on a body, in planetographic degrees. This is the quantity
 * that decides where it is local noon, and hence when the Sun rises.
 */
export function subSolarPoint(state, key) {
  const b = state.basis[key];
  if (!b) return null;
  const toSun = normalize(scale(state.pos[key], -1));
  const x = dot(toSun, b.x), y = dot(toSun, b.y), z = dot(toSun, b.z);
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI),
    lon: ((Math.atan2(y, x) * (180 / Math.PI)) % 360 + 360) % 360,
  };
}

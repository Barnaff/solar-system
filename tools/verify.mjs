// Accuracy checks for the ephemeris layer, run with: node tools/verify.mjs
//
// Every assertion is framed so that it does not depend on the equinox of date:
// eclipse tests compare two bodies in the same J2000 frame, so precession
// cancels out. Sub-solar longitude tests are absolute and exercise the IAU
// rotation model, which is what sunrise timing rides on.

import { dateToJD, jdUTCtoTT, formatJD, norm180, norm360, J2000 } from '../js/astro/time.js';
import { heliocentric, elementsAt } from '../js/astro/planets.js';
import { moonSpherical } from '../js/astro/moon.js';
import { computeState, subSolarPoint, AU_KM } from '../js/astro/ephemeris.js';
import { galileanElements } from '../js/astro/satellites.js';
import { rotationPeriodDays, axialTilt, orbitNormalOf } from '../js/astro/rotation.js';
import { len, sub, toSph } from '../js/astro/vec.js';
import { SUN, PLANETS, MOON, LANDABLE, CLOUD_TOP } from '../js/data/bodies.js';
import { sunAltitudeAt } from '../js/astro/observer.js';

let pass = 0, fail = 0;
const R2D = 180 / Math.PI;

function check(label, actual, expected, tol, unit = '') {
  const d = Math.abs(actual - expected);
  const ok = d <= tol;
  ok ? pass++ : fail++;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${fmt(actual)}${unit}` +
    `  (expect ${fmt(expected)}${unit} +/- ${fmt(tol)})`;
  console.log(line);
}
function fmt(x) {
  return Math.abs(x) >= 1000 || (Math.abs(x) < 0.001 && x !== 0) ? x.toExponential(4) : x.toFixed(4);
}
function section(t) { console.log(`\n--- ${t} ---`); }

const jd = (iso) => dateToJD(new Date(iso));

/** Geocentric ecliptic J2000 longitude/latitude of the Sun and Moon, degrees. */
function sunMoon(jdUTC) {
  const s = computeState(jdUTC);
  const sun = toSph({ x: -s.pos.earth.x, y: -s.pos.earth.y, z: -s.pos.earth.z });
  const moon = toSph(sub(s.pos.moon, s.pos.earth));
  return {
    sunLon: sun.lon * R2D,
    moonLon: moon.lon * R2D,
    moonLat: moon.lat * R2D,
    moonDist: moon.r,
  };
}

// ---------------------------------------------------------------------------
section('Solar eclipses: Sun and Moon must share an ecliptic longitude');
// Greatest-eclipse times from the NASA five-millennium canon.
for (const [name, t] of [
  ['2017-08-21 total (USA)', '2017-08-21T18:26:40Z'],
  ['2024-04-08 total (Mexico/USA)', '2024-04-08T18:17:16Z'],
  ['2019-07-02 total (Chile)', '2019-07-02T19:22:57Z'],
  ['2026-08-12 total (Spain)', '2026-08-12T17:46:01Z'],
  ['1999-08-11 total (Europe)', '1999-08-11T11:03:04Z'],
]) {
  const { sunLon, moonLon, moonLat } = sunMoon(jd(t));
  check(`${name}: dLon`, norm180(moonLon - sunLon), 0, 0.30, ' deg');
  check(`${name}: Moon |lat|`, Math.abs(moonLat), 0, 1.60, ' deg');
}

section('Lunar eclipses: Moon opposite the Sun');
for (const [name, t] of [
  ['2025-03-14 total lunar', '2025-03-14T06:58:43Z'],
  ['2022-05-16 total lunar', '2022-05-16T04:11:28Z'],
]) {
  const { sunLon, moonLon, moonLat } = sunMoon(jd(t));
  check(`${name}: dLon-180`, norm180(moonLon - sunLon - 180), 0, 0.30, ' deg');
  check(`${name}: Moon |lat|`, Math.abs(moonLat), 0, 1.60, ' deg');
}

section('Lunar distance extremes');
{
  // Perigee 2024-01-13 ~362,267 km; apogee 2024-01-01 ~404,909 km.
  check('perigee 2024-01-13 10:35', sunMoon(jd('2024-01-13T10:35Z')).moonDist, 362267, 60, ' km');
  check('apogee 2024-01-01 15:30', sunMoon(jd('2024-01-01T15:30Z')).moonDist, 404909, 60, ' km');
}

section('Earth orbit');
{
  let min = 1e9, max = 0, minJD = 0, maxJD = 0;
  for (let d = 0; d < 366; d += 0.25) {
    const t = jd('2024-01-01T00:00Z') + d;
    const r = len(computeState(t).pos.earth) / AU_KM;
    if (r < min) { min = r; minJD = t; }
    if (r > max) { max = r; maxJD = t; }
  }
  check('perihelion distance', min, 0.98329, 0.0004, ' au');
  check('aphelion distance', max, 1.01671, 0.0004, ' au');
  console.log(`      perihelion ${formatJD(minJD, false)},  aphelion ${formatJD(maxJD, false)}`);
}

section('Sub-solar longitude on Earth (drives sunrise timing)');
{
  // Around 15 April and 1 September the equation of time is ~0, so apparent
  // solar noon at Greenwich falls within a few seconds of 12:00 UTC.
  check('2024-04-15 12:00 UTC', norm180(subSolarPoint(computeState(jd('2024-04-15T12:00Z')), 'earth').lon), 0, 0.25, ' deg');
  check('2024-09-01 12:00 UTC', norm180(subSolarPoint(computeState(jd('2024-09-01T12:00Z')), 'earth').lon), 0, 0.25, ' deg');
  // Equation of time near its extremes: 3 Nov solar noon is ~16.4 min early
  // (sun already 4.1 deg past Greenwich), 11 Feb ~14.2 min late.
  check('2024-11-03 12:00 UTC (EoT +16.4m)', norm180(subSolarPoint(computeState(jd('2024-11-03T12:00Z')), 'earth').lon), -4.10, 0.30, ' deg');
  check('2024-02-11 12:00 UTC (EoT -14.2m)', norm180(subSolarPoint(computeState(jd('2024-02-11T12:00Z')), 'earth').lon), 3.56, 0.30, ' deg');
  // Sub-solar latitude equals the solar declination: +23.44 at the June solstice.
  check('solstice 2024-06-20 declination', subSolarPoint(computeState(jd('2024-06-20T20:51Z')), 'earth').lat, 23.4368, 0.02, ' deg');
  check('equinox 2024-09-22 declination', subSolarPoint(computeState(jd('2024-09-22T12:44Z')), 'earth').lat, 0, 0.02, ' deg');
}

section('Planetary oppositions and elongations');
const R2Dl = R2D;
/** Geocentric elongation, the full angular separation from the Sun. */
function elongation(jdUTC, key) {
  const s = computeState(jdUTC);
  const toBody = sub(s.pos[key], s.pos.earth);
  const toSun = { x: -s.pos.earth.x, y: -s.pos.earth.y, z: -s.pos.earth.z };
  const c = (toBody.x * toSun.x + toBody.y * toSun.y + toBody.z * toSun.z) /
    (len(toBody) * len(toSun));
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2Dl;
}
/**
 * Difference in geocentric ecliptic longitude. Opposition is defined this way
 * (not by the 3-D angle, which falls short of 180 by the planet's latitude),
 * and the difference is immune to precession because both terms shift alike.
 */
function deltaLongitude(jdUTC, key) {
  const s = computeState(jdUTC);
  const b = toSph(sub(s.pos[key], s.pos.earth)).lon * R2Dl;
  const sun = toSph({ x: -s.pos.earth.x, y: -s.pos.earth.y, z: -s.pos.earth.z }).lon * R2Dl;
  return norm180(b - sun);
}
// Compare against 180 the short way round, so +179.99 and -179.99 both score 0.
const fromOpposition = (t, key) => Math.abs(norm180(deltaLongitude(t, key) - 180));
check('Mars opposition 2025-01-16', fromOpposition(jd('2025-01-16T02:38Z'), 'mars'), 0, 0.2, ' deg');
check('Jupiter opposition 2024-12-07', fromOpposition(jd('2024-12-07T21:29Z'), 'jupiter'), 0, 0.2, ' deg');
check('Saturn opposition 2025-09-21', fromOpposition(jd('2025-09-21T05:00Z'), 'saturn'), 0, 0.2, ' deg');
check('Neptune opposition 2024-09-21', fromOpposition(jd('2024-09-21T00:00Z'), 'neptune'), 0, 0.2, ' deg');
check('Venus greatest elong E 2025-01-10', elongation(jd('2025-01-10T09:00Z'), 'venus'), 47.2, 0.6, ' deg');
check('Mercury greatest elong E 2024-03-24', elongation(jd('2024-03-24T00:00Z'), 'mercury'), 18.7, 0.8, ' deg');

section('Heliocentric distances stay inside the true perihelion/aphelion band');
// Tolerance is looser for Jupiter and Saturn: Table 1 is a pure Keplerian fit
// and does not model the great inequality, so their heliocentric distance
// oscillates by a few hundredths of an au against reality.
for (const [key, q, Q, tol] of [
  ['mercury', 0.3075, 0.4667, 0.002], ['venus', 0.7184, 0.7282, 0.002],
  ['earth', 0.9833, 1.0167, 0.002], ['mars', 1.3814, 1.6660, 0.004],
  ['jupiter', 4.9501, 5.4570, 0.03], ['saturn', 9.0412, 10.1238, 0.07],
  ['uranus', 18.2861, 20.0965, 0.05], ['neptune', 29.8100, 30.3300, 0.05],
  ['pluto', 29.6580, 49.3050, 0.5],
]) {
  let min = 1e9, max = 0;
  for (let y = 1900; y <= 2100; y += 0.05) {
    const r = len(computeState(J2000 + (y - 2000) * 365.25).pos[key]) / AU_KM;
    if (r < min) min = r;
    if (r > max) max = r;
  }
  const ok = Math.abs(min - q) <= tol && Math.abs(max - Q) <= tol + 0.4;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${(key + ' range 1900-2100').padEnd(52)} ` +
    `${min.toFixed(4)} .. ${max.toFixed(4)} au  (true ${q} .. ${Q})`);
}

section('Element tables 1 and 2 agree where their validity ranges meet');
for (const year of [1800, 2050]) {
  const t = J2000 + (year - 2000) * 365.25;
  for (const key of ['mercury', 'embary', 'mars', 'jupiter', 'saturn', 'neptune', 'pluto']) {
    const t1 = heliocentric(key, t, 1);
    const t2 = heliocentric(key, t, 2);
    const gapDeg = Math.abs(norm180((toSph(t2).lon - toSph(t1).lon) * R2D));
    check(`${year} ${key}: table 1 vs 2 longitude`, gapDeg, 0, 0.35, ' deg');
  }
}

section('IAU rotation models');
check('Earth sidereal day', rotationPeriodDays('earth') * 24, 23.9344696, 1e-4, ' h');
check('Mars sidereal day', rotationPeriodDays('mars') * 24, 24.6229, 1e-3, ' h');
check('Jupiter System III', rotationPeriodDays('jupiter') * 24, 9.92492, 1e-3, ' h');
check('Venus (retrograde)', rotationPeriodDays('venus'), -243.0185, 0.01, ' d');
check('Moon synodic-locked period', rotationPeriodDays('moon'), 27.3216, 0.01, ' d');
// Obliquity, quoted the conventional way: angular-momentum pole vs orbit normal.
{
  const st = computeState(J2000);
  const tilt = (k) => axialTilt(k, st.jdTT, orbitNormalOf(st.pos[k], st.vel[k]));
  check('Mercury obliquity', tilt('mercury'), 0.034, 0.02, ' deg');
  check('Earth obliquity', tilt('earth'), 23.4393, 0.03, ' deg');
  check('Uranus obliquity', tilt('uranus'), 97.77, 0.15, ' deg');
  check('Venus obliquity', tilt('venus'), 177.36, 0.15, ' deg');
  check('Mars obliquity', tilt('mars'), 25.19, 0.15, ' deg');
  check('Jupiter obliquity', tilt('jupiter'), 3.13, 0.15, ' deg');
  check('Saturn obliquity', tilt('saturn'), 26.73, 0.15, ' deg');
  check('Neptune obliquity', tilt('neptune'), 28.32, 0.20, ' deg');
  check('Pluto obliquity', tilt('pluto'), 119.6, 3.0, ' deg');
}

section('Galilean moons');
{
  // The Laplace argument L1 - 3*L2 + 2*L3 is exactly 180 deg in the mean
  // motions. Meeus' empirical libration corrections perturb it by a few
  // degrees; what matters is that it stays bounded rather than drifting,
  // which is the real test of the mean-motion constants.
  let min = 360, max = -360;
  for (let y = 2000; y <= 2100; y += 0.02) {
    const el = galileanElements(J2000 + (y - 2000) * 365.25);
    const lap = norm180(norm360((el[0].u - 3 * el[1].u + 2 * el[2].u) * R2D) - 180);
    min = Math.min(min, lap);
    max = Math.max(max, lap);
  }
  check('Laplace argument stays bounded (min)', min, 0, 5, ' deg');
  check('Laplace argument stays bounded (max)', max, 0, 5, ' deg');

  const el = galileanElements(jdUTCtoTT(jd('2024-01-01T00:00Z')));
  check('Io orbital radius', el[0].r, 5.9057, 0.03, ' Rj');
  check('Callisto orbital radius', el[3].r, 26.3627, 0.25, ' Rj');
  const t0 = jdUTCtoTT(jd('2024-01-01T00:00Z'));
  const a = galileanElements(t0)[0].u, b = galileanElements(t0 + 1.769137786)[0].u;
  check('Io period closes the loop', norm180((b - a) * R2D), 0, 1.5, ' deg');
}

section('Mars prime meridian vs Mars Coordinated Time');
{
  // MTC is mean solar time at Airy-0 (Allison & McEwen). At MTC = 12:00 the
  // *mean* sun sits over longitude 0, so the true sub-solar longitude should
  // scatter about zero by the Martian equation of time (roughly +/-12 deg) and
  // average out over a full Mars year. A wrong W constant would bias the mean.
  const msdToJdTT = (msd) => msd * 1.0274912517 + 2405522.0028779;
  const msd0 = Math.ceil((jdUTCtoTT(jd('2024-01-01T00:00Z')) - 2405522.0028779) / 1.0274912517);
  let sum = 0, peak = 0;
  const SOLS = 669;
  for (let k = 0; k < SOLS; k++) {
    const jdTT = msdToJdTT(msd0 + k + 0.5); // MTC = 12:00
    const st = computeState(jdTT - 69.2 / 86400);
    const l = norm180(subSolarPoint(st, 'mars').lon);
    sum += l;
    peak = Math.max(peak, Math.abs(l));
  }
  check('mean sub-solar longitude over a Mars year', sum / SOLS, 0, 1.2, ' deg');
  check('equation-of-time swing stays plausible', peak, 12, 6, ' deg');
}

section('Body sizes');
{
  // Radii are the IAU/NASA reference values: equatorial, at the 1-bar level
  // for the giants. The renderer uses these directly, so getting them right is
  // what "correct size" means.
  for (const [key, radius, flattening] of [
    ['sun', 695700, 0], ['mercury', 2439.7, 0], ['venus', 6051.8, 0],
    ['earth', 6378.137, 1 / 298.257223563], ['moon', 1737.4, 0],
    ['mars', 3396.2, 0.00589], ['jupiter', 71492, 0.06487],
    ['saturn', 60268, 0.09796], ['uranus', 25559, 0.02293],
    ['neptune', 24764, 0.01708], ['pluto', 1188.3, 0],
  ]) {
    const def = key === 'sun' ? SUN : key === 'moon' ? MOON : PLANETS[key];
    check(`${key} equatorial radius`, def.radius, radius, 0.05, ' km');
    check(`${key} flattening`, def.flattening || 0, flattening, 1e-6);
  }

  // Ratios worth being sure about, because they are the ones people notice.
  check('Sun / Earth radius ratio', SUN.radius / PLANETS.earth.radius, 109.08, 0.05);
  check('Jupiter / Earth radius ratio', PLANETS.jupiter.radius / PLANETS.earth.radius, 11.209, 0.005);
  check('Earth / Moon radius ratio', PLANETS.earth.radius / MOON.radius, 3.6705, 0.001);
}

section('Apparent diameters, as a check that sizes and distances agree');
{
  const arcsec = (radiusKm, rangeKm) => 2 * Math.atan(radiusKm / rangeKm) * (648000 / Math.PI);
  const rangeFrom = (state, from, to) => len(sub(state.pos[to], state.pos[from]));

  // The Sun's apparent diameter runs 31.5' at aphelion to 32.5' at perihelion.
  const peri = computeState(jd('2024-01-03T00:00Z'));
  const aphe = computeState(jd('2024-07-05T06:00Z'));
  check('Sun from Earth at perihelion', arcsec(SUN.radius, rangeFrom(peri, 'earth', 'sun')) / 60, 32.53, 0.05, "'");
  check('Sun from Earth at aphelion', arcsec(SUN.radius, rangeFrom(aphe, 'earth', 'sun')) / 60, 31.46, 0.05, "'");

  // The Moon at its 2024-01-13 perigee and 2024-01-01 apogee.
  const mPeri = computeState(jd('2024-01-13T10:35Z'));
  const mApo = computeState(jd('2024-01-01T15:30Z'));
  check('Moon at perigee', arcsec(MOON.radius, rangeFrom(mPeri, 'earth', 'moon')) / 60, 32.98, 0.05, "'");
  check('Moon at apogee', arcsec(MOON.radius, rangeFrom(mApo, 'earth', 'moon')) / 60, 29.51, 0.05, "'");

  // Planets at opposition, where published apparent diameters are quoted.
  const jup = computeState(jd('2024-12-07T21:29Z'));
  check('Jupiter at 2024 opposition', arcsec(PLANETS.jupiter.radius, rangeFrom(jup, 'earth', 'jupiter')), 48.2, 0.6, '"');
  const mar = computeState(jd('2025-01-16T02:38Z'));
  check('Mars at 2025 opposition', arcsec(PLANETS.mars.radius, rangeFrom(mar, 'earth', 'mars')), 14.6, 0.4, '"');
  const sat = computeState(jd('2025-09-21T05:00Z'));
  check('Saturn at 2025 opposition', arcsec(PLANETS.saturn.radius, rangeFrom(sat, 'earth', 'saturn')), 19.1, 0.5, '"');

  // Earth seen from the Moon, at the same perigee and apogee passages checked
  // above: 2*atan(6378.137 / 362267) and / 404909.
  check('Earth from the Moon at perigee', arcsec(PLANETS.earth.radius, rangeFrom(mPeri, 'moon', 'earth')) / 60, 121.06, 0.4, "'");
  check('Earth from the Moon at apogee', arcsec(PLANETS.earth.radius, rangeFrom(mApo, 'moon', 'earth')) / 60, 108.31, 0.4, "'");
}

section('Landable bodies');
{
  // Every planet is now standable, plus Pluto and the major moons.
  for (const key of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn',
    'uranus', 'neptune', 'pluto', 'moon', 'titan', 'triton']) {
    const ok = LANDABLE.includes(key);
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${(`${key} is landable`).padEnd(52)}`);
  }
  const gasOk = ['jupiter', 'saturn', 'uranus', 'neptune'].every((k) => CLOUD_TOP.has(k)) &&
    !CLOUD_TOP.has('earth');
  gasOk ? pass++ : fail++;
  console.log(`${gasOk ? 'PASS' : 'FAIL'}  ${'gas giants flagged as cloud-top viewpoints'.padEnd(52)}`);

  // Uranus is the interesting case: at 97.8 degrees of obliquity a polar site
  // should see the Sun stay up for years, while the equator gets a 17-hour day.
  const solarDay = 1 / Math.abs(1 / rotationPeriodDays('uranus') - 1 / 30685);
  check('Uranus solar day', solarDay * 24, 17.24, 0.02, ' h');
  const polarAlt = (t) => sunAltitudeAt(t, 'uranus', 85, 0, PLANETS.uranus);
  let minAlt = 90;
  for (let k = 0; k < 40; k++) minAlt = Math.min(minAlt, polarAlt(J2000 + 9000 + k * (solarDay / 40)));
  const noSet = minAlt > 0;
  noSet ? pass++ : fail++;
  console.log(`${noSet ? 'PASS' : 'FAIL'}  ${'Uranus 85N: Sun never sets over a full rotation'.padEnd(52)} min alt ${minAlt.toFixed(2)} deg`);
}

section('Delta-T');
for (const [y, expected] of [['2024-01-01', 69.18], ['2000-01-01', 63.83], ['1900-01-01', -2.79]]) {
  const state = computeState(jd(`${y}T00:00Z`));
  check(`delta-T at ${y}`, (state.jdTT - state.jdUTC) * 86400, expected, 0.6, ' s');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

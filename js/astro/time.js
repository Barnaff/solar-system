// Time scales and calendar conversions.
//
// The simulation clock is a Julian Date in Terrestrial Time (JD_TT), because
// every ephemeris expression below (planetary elements, lunar theory, IAU
// rotation models) is defined against TT. The UI works in UTC, so we bridge
// with delta-T.

export const J2000 = 2451545.0; // JD of 2000-01-01 12:00 TT
export const DAY_MS = 86400000;
export const DEG = Math.PI / 180;
export const ARCSEC = DEG / 3600;

/** JD (UTC scale) from a JS Date. */
export function dateToJD(date) {
  return date.getTime() / DAY_MS + 2440587.5;
}

/** JS Date from a JD on the UTC scale. */
export function jdToDate(jd) {
  return new Date(Math.round((jd - 2440587.5) * DAY_MS));
}

/** Julian centuries of TT since J2000. */
export function centuriesTT(jdTT) {
  return (jdTT - J2000) / 36525;
}

/** Days of TT since J2000. */
export function daysTT(jdTT) {
  return jdTT - J2000;
}

// Observed delta-T (TT - UT1) in seconds, from IERS. The Espenak & Meeus
// polynomial for 2005-2050 was a 2006-era projection and now overshoots badly
// (it gives 73.9 s for 2024 against an observed 69.2 s), because the Earth's
// rotation sped up instead of continuing to slow. Measured values win.
const OBSERVED_DELTA_T = [
  [1970, 40.18], [1975, 45.48], [1980, 50.54], [1985, 54.34], [1990, 56.86],
  [1995, 60.78], [2000, 63.83], [2005, 64.69], [2010, 66.07], [2015, 67.64],
  [2018, 69.14], [2020, 69.36], [2022, 69.29], [2024, 69.18], [2026, 69.20],
];
const OBS_FIRST = OBSERVED_DELTA_T[0];
const OBS_LAST = OBSERVED_DELTA_T[OBSERVED_DELTA_T.length - 1];

/**
 * Delta-T = TT - UT1 in seconds. Measured values are interpolated over
 * 1970-2026; outside that, Espenak & Meeus polynomial expressions (NASA
 * eclipse site) cover -500 to +2150 with a parabolic tail beyond. Beyond 2026
 * we continue smoothly from the last observation rather than rejoining the
 * stale projection.
 */
export function deltaTSeconds(year) {
  let u, t;

  if (year >= OBS_FIRST[0] && year <= OBS_LAST[0]) {
    for (let i = 1; i < OBSERVED_DELTA_T.length; i++) {
      const [y1, d1] = OBSERVED_DELTA_T[i];
      if (year <= y1) {
        const [y0, d0] = OBSERVED_DELTA_T[i - 1];
        return d0 + ((d1 - d0) * (year - y0)) / (y1 - y0);
      }
    }
  }
  if (year > OBS_LAST[0] && year < 2150) {
    t = year - OBS_LAST[0];
    return OBS_LAST[1] + 0.35 * t + 0.0045 * t * t;
  }

  if (year < -500) {
    u = (year - 1820) / 100;
    return -20 + 32 * u * u;
  } else if (year < 500) {
    u = year / 100;
    return (
      10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 -
      0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6
    );
  } else if (year < 1600) {
    u = (year - 1000) / 100;
    return (
      1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 -
      0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6
    );
  } else if (year < 1700) {
    t = year - 1600;
    return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129;
  } else if (year < 1800) {
    t = year - 1700;
    return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000;
  } else if (year < 1860) {
    t = year - 1800;
    return (
      13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 -
      0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 +
      0.000000000875 * t ** 7
    );
  } else if (year < 1900) {
    t = year - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 -
      0.0004473624 * t ** 4 + t ** 5 / 233174;
  } else if (year < 1920) {
    t = year - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  } else if (year < 1941) {
    t = year - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3;
  } else if (year < 1961) {
    t = year - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  } else if (year < 1986) {
    t = year - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  } else if (year < 2005) {
    t = year - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 +
      0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  } else if (year < 2050) {
    t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  } else if (year < 2150) {
    u = (year - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - year);
  }
  u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Approximate decimal year from a JD, adequate for selecting a delta-T branch. */
export function jdToDecimalYear(jd) {
  return 2000 + (jd - J2000) / 365.25;
}

/** Convert a UTC-scale JD to the TT scale used by the ephemerides. */
export function jdUTCtoTT(jdUTC) {
  return jdUTC + deltaTSeconds(jdToDecimalYear(jdUTC)) / 86400;
}

export function norm360(d) {
  return ((d % 360) + 360) % 360;
}

export function norm180(d) {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
}

/** Format a JD (UTC) as `YYYY-MM-DD HH:MM:SS UTC`, handling negative years. */
export function formatJD(jd, withSeconds = true) {
  const d = jdToDate(jd);
  const y = d.getUTCFullYear();
  const ys = (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0');
  const p = (n) => String(n).padStart(2, '0');
  const date = `${ys}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` +
    (withSeconds ? `:${p(d.getUTCSeconds())}` : '');
  return `${date} ${time} UTC`;
}

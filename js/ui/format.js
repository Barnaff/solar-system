const AU_KM = 149597870.7;

/** Distance with a unit that suits its magnitude. */
export function distance(km) {
  if (km >= 1e7) return `${(km / AU_KM).toFixed(km / AU_KM < 10 ? 4 : 3)} AU`;
  if (km >= 1e4) return `${(km / 1000).toFixed(0)} 000 km`.replace(/^(\d+) 000/, (m, d) => `${Number(d).toLocaleString('en-US')},000`);
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function shortDistance(km) {
  const au = km / AU_KM;
  if (au >= 0.01) return `${au.toFixed(au < 1 ? 3 : 2)} AU`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  if (km >= 1000) return `${Math.round(km / 1000)}k km`;
  return `${Math.round(km)} km`;
}

export function mass(kg) {
  const e = Math.floor(Math.log10(kg));
  return `${(kg / 10 ** e).toFixed(3)} × 10^${e} kg`;
}

/** Hours as HH:MM, wrapping at 24. */
export function clock(hours) {
  let h = ((hours % 24) + 24) % 24;
  let m = Math.round((h % 1) * 60);
  h = Math.floor(h);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A signed angle with a degree sign. */
export const angle = (deg, digits = 1) => `${deg >= 0 ? '' : '−'}${Math.abs(deg).toFixed(digits)}°`;

/** Compass point for an azimuth in degrees. */
export function compassPoint(az) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

/** Duration in days rendered in the largest sensible unit. */
export function duration(days) {
  const d = Math.abs(days);
  if (d >= 365.25 * 2) return `${(days / 365.25).toFixed(2)} yr`;
  if (d >= 2) return `${days.toFixed(3)} d`;
  const h = days * 24;
  if (Math.abs(h) >= 2) return `${h.toFixed(3)} h`;
  return `${(h * 60).toFixed(1)} min`;
}

/** Angular size given in arcseconds, shown in whichever unit reads best. */
export function angularSize(arcsec) {
  if (arcsec >= 3600) return `${(arcsec / 3600).toFixed(3)}°`;
  if (arcsec >= 60) return `${(arcsec / 60).toFixed(2)}′`;
  if (arcsec >= 1) return `${arcsec.toFixed(2)}″`;
  return `${arcsec.toFixed(3)}″`;
}

export function latLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const e = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${e.toFixed(2)}°E`;
}

// Physical catalogue: radii, masses, appearance and the facts shown in the
// info panel. Radii are equatorial in km; flattening is (Req - Rpol) / Req.

export const AU_KM = 149597870.7;

export const SUN = {
  key: 'sun',
  name: 'Sun',
  type: 'star',
  radius: 695700,
  flattening: 0,
  mass: 1.9885e30,
  gravity: 274,
  tempC: 5505,
  texture: 'sun.jpg',
  color: 0xffd9a0,
  atmosphere: null,
  facts: {
    'Spectral type': 'G2V',
    'Rotation (equator)': '25.05 d',
    'Luminosity': '3.828 x 10^26 W',
    'Age': '4.6 billion yr',
  },
  blurb: 'Contains 99.86% of the mass of the Solar System. The photosphere rotates differentially, faster at the equator than the poles.',
};

export const PLANETS = {
  mercury: {
    key: 'mercury', name: 'Mercury', type: 'planet', radius: 2439.7, flattening: 0,
    mass: 3.3011e23, gravity: 3.70, tempC: 167, color: 0x9c8f83,
    texture: 'mercury.jpg', bump: 'mercury_bump.jpg', bumpScale: 0.02,
    atmosphere: null,
    facts: { 'Moons': '0', 'Orbital period': '87.97 d', 'Day (solar)': '175.94 d', 'Distance': '0.387 AU' },
    blurb: 'A 3:2 spin-orbit resonance means Mercury turns exactly three times on its axis for every two orbits, stretching a solar day to two Mercurian years.',
  },
  venus: {
    key: 'venus', name: 'Venus', type: 'planet', radius: 6051.8, flattening: 0,
    mass: 4.8675e24, gravity: 8.87, tempC: 464, color: 0xd9b787,
    texture: 'venus.jpg', bump: 'venus_bump.jpg', bumpScale: 0.03,
    atmosphere: { color: 0xf0c479, opacity: 0.55, scaleHeight: 0.018, sky: { turbidity: 24, rayleigh: 0.6, mieCoefficient: 0.05, mieDirectionalG: 0.85, exposure: 0.18, tint: [1.0, 0.72, 0.34] } },
    facts: { 'Moons': '0', 'Orbital period': '224.7 d', 'Day (solar)': '116.75 d', 'Distance': '0.723 AU' },
    blurb: 'Rotates retrograde, so the Sun rises in the west. A 92 bar CO2 atmosphere keeps the surface hot enough to melt lead, day and night alike.',
  },
  earth: {
    key: 'earth', name: 'Earth', type: 'planet', radius: 6378.137, flattening: 1 / 298.257223563,
    mass: 5.97237e24, gravity: 9.807, tempC: 15, color: 0x2a5c9a,
    texture: 'earth.jpg', bump: 'earth_bump.jpg', bumpScale: 0.05,
    specular: 'earth_spec.png', night: 'earth_night.png', clouds: 'earth_clouds.png',
    atmosphere: { color: 0x5b8fd6, opacity: 0.5, scaleHeight: 0.014, sky: { turbidity: 2.0, rayleigh: 2.6, mieCoefficient: 0.005, mieDirectionalG: 0.8, exposure: 0.42, tint: [1, 1, 1] } },
    facts: { 'Moons': '1', 'Orbital period': '365.256 d', 'Day (solar)': '24.0000 h', 'Distance': '1.000 AU' },
    blurb: 'The sidereal day is 23h 56m 04s; the extra four minutes of the solar day come from the 1 degree per day of orbital motion around the Sun.',
  },
  mars: {
    key: 'mars', name: 'Mars', type: 'planet', radius: 3396.2, flattening: 0.00589,
    mass: 6.4171e23, gravity: 3.72, tempC: -63, color: 0xb5542a,
    texture: 'mars.jpg', bump: 'mars_bump.jpg', bumpScale: 0.06,
    atmosphere: { color: 0xd9a077, opacity: 0.22, scaleHeight: 0.022, sky: { turbidity: 12, rayleigh: 0.25, mieCoefficient: 0.03, mieDirectionalG: 0.72, exposure: 0.28, tint: [1.0, 0.84, 0.66] } },
    facts: { 'Moons': '2', 'Orbital period': '686.98 d', 'Day (solar)': '24h 39m 35s', 'Distance': '1.524 AU' },
    blurb: 'Dust suspended high in the thin atmosphere scatters red light forward, so the Martian sky is butterscotch by day and blue only right around the Sun at sunset.',
  },
  jupiter: {
    key: 'jupiter', name: 'Jupiter', type: 'planet', radius: 71492, flattening: 0.06487,
    mass: 1.8982e27, gravity: 24.79, tempC: -108, color: 0xc4a181,
    texture: 'jupiter.jpg',
    atmosphere: { color: 0xd8c0a0, opacity: 0.3, scaleHeight: 0.01, sky: { turbidity: 10, rayleigh: 1.0, mieCoefficient: 0.02, mieDirectionalG: 0.8, exposure: 0.22, tint: [1.0, 0.9, 0.78] } },
    rings: { inner: 122500, outer: 129000, opacity: 0.08, color: 0xa08d78, tiltWithEquator: true },
    facts: { 'Moons': '97 known', 'Orbital period': '11.862 yr', 'Day (System III)': '9h 55m 30s', 'Distance': '5.204 AU' },
    blurb: 'The fastest rotator in the Solar System. Ten hours of spin flattens it by 6.5%, visibly oval even in a small telescope.',
  },
  saturn: {
    key: 'saturn', name: 'Saturn', type: 'planet', radius: 60268, flattening: 0.09796,
    mass: 5.6834e26, gravity: 10.44, tempC: -139, color: 0xd8c08a,
    texture: 'saturn.jpg',
    atmosphere: { color: 0xe6d3a8, opacity: 0.28, scaleHeight: 0.01, sky: { turbidity: 8, rayleigh: 1.0, mieCoefficient: 0.02, mieDirectionalG: 0.8, exposure: 0.2, tint: [1.0, 0.93, 0.76] } },
    rings: {
      inner: 74500, outer: 140220, opacity: 1.0,
      colorMap: 'saturn_ring_color.jpg', alphaMap: 'saturn_ring_pattern.gif',
    },
    facts: { 'Moons': '274 known', 'Orbital period': '29.457 yr', 'Day': '10h 33m', 'Distance': '9.537 AU' },
    blurb: 'Mean density 0.687 g/cm3 - less than water. The rings span 270,000 km but average only about ten metres thick.',
  },
  uranus: {
    key: 'uranus', name: 'Uranus', type: 'planet', radius: 25559, flattening: 0.02293,
    mass: 8.6810e25, gravity: 8.87, tempC: -197, color: 0x9fd8e0,
    texture: 'uranus.jpg',
    atmosphere: { color: 0xa8e2ea, opacity: 0.35, scaleHeight: 0.012, sky: { turbidity: 4, rayleigh: 2.2, mieCoefficient: 0.01, mieDirectionalG: 0.8, exposure: 0.16, tint: [0.7, 0.95, 1.0] } },
    rings: {
      inner: 37850, outer: 51500, opacity: 0.55,
      colorMap: 'uranus_ring_color.jpg', alphaMap: 'uranus_ring_trans.gif',
    },
    facts: { 'Moons': '28 known', 'Orbital period': '84.02 yr', 'Day': '17h 14m (retrograde)', 'Distance': '19.19 AU' },
    blurb: 'Tipped 97.8 degrees, Uranus rolls along its orbit. Each pole spends 42 years in continuous sunlight, then 42 in darkness.',
  },
  neptune: {
    key: 'neptune', name: 'Neptune', type: 'planet', radius: 24764, flattening: 0.01708,
    mass: 1.02413e26, gravity: 11.15, tempC: -201, color: 0x3b62c4,
    texture: 'neptune.jpg',
    atmosphere: { color: 0x4a7ad8, opacity: 0.4, scaleHeight: 0.012, sky: { turbidity: 4, rayleigh: 2.6, mieCoefficient: 0.01, mieDirectionalG: 0.8, exposure: 0.14, tint: [0.6, 0.75, 1.0] } },
    rings: { inner: 41900, outer: 62930, opacity: 0.06, color: 0x6d7ea8 },
    facts: { 'Moons': '16 known', 'Orbital period': '164.79 yr', 'Day': '16h 06m', 'Distance': '30.07 AU' },
    blurb: 'Hosts the fastest winds measured anywhere in the Solar System, over 2,000 km/h, despite receiving 1/900th of Earth\'s sunlight.',
  },
  pluto: {
    key: 'pluto', name: 'Pluto', type: 'dwarf', radius: 1188.3, flattening: 0,
    mass: 1.303e22, gravity: 0.62, tempC: -229, color: 0xc0a48c,
    texture: 'pluto.jpg', bump: 'pluto_bump.jpg', bumpScale: 0.04,
    atmosphere: { color: 0x9ab0d0, opacity: 0.1, scaleHeight: 0.05, sky: { turbidity: 2, rayleigh: 0.4, mieCoefficient: 0.005, mieDirectionalG: 0.8, exposure: 0.1, tint: [0.8, 0.85, 1.0] } },
    facts: { 'Moons': '5', 'Orbital period': '247.94 yr', 'Day': '6d 9h 17m (retrograde)', 'Distance': '39.48 AU' },
    blurb: 'In a 2:3 resonance with Neptune. Between 1979 and 1999 it was closer to the Sun than Neptune ever gets.',
  },
};

export const MOON = {
  key: 'moon', name: 'Moon', type: 'moon', primary: 'earth',
  radius: 1737.4, flattening: 0, mass: 7.342e22, gravity: 1.62, tempC: -20,
  color: 0x9a9a96, texture: 'moon.jpg', bump: 'moon_bump.jpg', bumpScale: 0.05,
  atmosphere: null,
  facts: { 'Orbital period': '27.322 d (sidereal)', 'Synodic month': '29.531 d', 'Distance': '384,400 km', 'Recession': '3.8 cm/yr' },
  blurb: 'Tidally locked, so the same hemisphere always faces Earth - though libration lets us see 59% of the surface over time.',
};

/**
 * Bodies you can stand on.
 *
 * The gas giants have no surface to stand on, so the viewpoint is the 1-bar
 * level - the pressure altitude their quoted radii refer to - and the camera
 * floats a couple of kilometres above the cloud deck rather than 1.7 m above
 * rock. Everything else about the view is unchanged: the horizon, the Sun's
 * track and the sunrise time are all still computed from the real rotation
 * model.
 */
export const LANDABLE = [
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  'moon', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'triton', 'charon',
];

/** Bodies whose "surface" is a cloud deck rather than solid ground. */
export const CLOUD_TOP = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);

/** Observer height above the reference surface, in km. */
export function eyeHeightKm(key) {
  // Two kilometres above a cloud deck gives a horizon hundreds of km out, which
  // is the scale the banding actually lives at.
  return CLOUD_TOP.has(key) ? 2 : 0.0017;
}

/** Interesting places, offered as presets in surface mode. */
export const LANDMARKS = {
  earth: [
    { name: 'Greenwich', lat: 51.4779, lon: 0.0015 },
    { name: 'New York', lat: 40.7128, lon: -74.006 },
    { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
    { name: 'Reykjavik', lat: 64.1466, lon: -21.9426 },
    { name: 'South Pole', lat: -89.99, lon: 0 },
  ],
  moon: [
    { name: 'Apollo 11 (Tranquillitatis)', lat: 0.674, lon: 23.473 },
    { name: 'Apollo 15 (Hadley)', lat: 26.132, lon: 3.634 },
    { name: 'Tycho', lat: -43.31, lon: -11.36 },
    { name: 'Farside centre', lat: 0, lon: 180 },
  ],
  mars: [
    { name: 'Olympus Mons', lat: 18.65, lon: -133.8 },
    { name: 'Valles Marineris', lat: -13.9, lon: -59.2 },
    { name: 'Gale Crater (Curiosity)', lat: -5.4, lon: 137.8 },
    { name: 'Jezero (Perseverance)', lat: 18.44, lon: 77.45 },
  ],
  mercury: [{ name: 'Caloris Basin', lat: 30.5, lon: 189.8 }, { name: 'Equator', lat: 0, lon: 0 }],
  venus: [{ name: 'Maxwell Montes', lat: 65.2, lon: 3.3 }, { name: 'Aphrodite Terra', lat: -5, lon: 105 }],
  pluto: [{ name: 'Sputnik Planitia', lat: 20, lon: 175 }],

  jupiter: [
    { name: 'Great Red Spot (drifts)', lat: -22, lon: 300 },
    { name: 'North Equatorial Belt', lat: 17, lon: 0 },
    { name: 'Equatorial Zone', lat: 0, lon: 0 },
    { name: 'North polar vortex', lat: 87, lon: 0 },
  ],
  saturn: [
    { name: 'Equator (rings overhead)', lat: 0, lon: 0 },
    { name: 'North polar hexagon', lat: 78, lon: 0 },
    { name: 'Mid-northern latitudes', lat: 40, lon: 0 },
    { name: 'South pole', lat: -88, lon: 0 },
  ],
  // Tipped 97.8 degrees, so latitude is what decides whether you get a
  // 17-hour day or a 42-year one.
  uranus: [
    { name: 'North pole (42-year day)', lat: 88, lon: 0 },
    { name: 'Equator (17-hour day)', lat: 0, lon: 0 },
    { name: 'Mid-latitude 45N', lat: 45, lon: 0 },
    { name: 'South pole (42-year night)', lat: -88, lon: 0 },
  ],
  neptune: [
    { name: 'Great Dark Spot latitude', lat: -22, lon: 0 },
    { name: 'Equator', lat: 0, lon: 0 },
    { name: 'South pole', lat: -88, lon: 0 },
  ],
};

export const ALL_TEXTURES = [
  'sun.jpg', 'mercury.jpg', 'mercury_bump.jpg', 'venus.jpg', 'venus_bump.jpg',
  'earth.jpg', 'earth_bump.jpg', 'earth_spec.png', 'earth_clouds.png', 'earth_night.png',
  'moon.jpg', 'moon_bump.jpg', 'mars.jpg', 'mars_bump.jpg', 'jupiter.jpg',
  'saturn.jpg', 'saturn_ring_color.jpg', 'saturn_ring_pattern.gif',
  'uranus.jpg', 'uranus_ring_color.jpg', 'uranus_ring_trans.gif',
  'neptune.jpg', 'pluto.jpg', 'pluto_bump.jpg', 'stars_milkyway.png',
];

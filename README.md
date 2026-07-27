# Solar System

A 3-D solar system in the browser, built on real ephemerides rather than
decorative circles. Planets sit where they actually are, spin to the phase they
actually have, and the surface camera lets you stand on a world and watch the
Sun come up at the right minute.

```bash
npm install
npm run textures
npm start
```

Then open <http://localhost:8080>. A server is needed because browsers refuse
ES-module imports and texture reads over `file://`.

## What it does

**Time.** A slider scrubs through a selectable window â€” twelve hours to
Â±250 years â€” and the whole system reconfigures continuously. Play forward or
backward from one second per second up to ten years per second, type a date
directly, or press **Now**.

**Bodies.** The Sun, eight planets, Pluto, the Moon under a full lunar theory,
20 other named moons, four main-belt asteroids, three trans-Neptunian dwarfs and
comet Halley. Rings for Saturn and Uranus with the planet's shadow falling
across them, Earth's clouds and city lights, atmospheric limb glow, and
statistical clouds for the main belt, the Jupiter Trojans and the Kuiper belt.

**Standing on a world.** Every planet, plus Pluto and seven major moons â€” 17
bodies in all. Drag the little figure from the bottom-right onto anything in
the view and drop it: the target rings up, a readout shows the exact
coordinates under your cursor, and releasing flies you down to that spot. The
camera swoops in over the limb and lands, and reverses on the way out.

Once you are down, drag to look around and scroll to zoom. The HUD gives local
solar time, the Sun's altitude and azimuth, and the next sunrise and sunset â€”
computed, not tabulated. **Face the sunrise** turns you to the exact bearing
where the Sun will next clear the horizon. Looking into the Sun throws a lens
flare, scaled by how much air there is to scatter through and by how far from
the Sun you are standing.

The gas giants have no surface, so the viewpoint is 2 km above the 1-bar level
their quoted radii refer to. Everything else still holds: on Saturn the rings
arc right across the sky, correctly clipped where the planet's own bulk cuts
them off at the horizon. Uranus is the one to try â€” tipped 97.8Â°, a site at
88Â°N gets a Sun that simply never sets, the equator gets a 17-hour day, and the
south pole is in a decades-long night.

Earth gets Preetham sky scattering, Mars its butterscotch dust, Venus and Titan
their haze. Airless worlds get what they should: a black sky full of stars at
local noon, with Earth hanging motionless overhead if you are standing on the
near side of the Moon.

**Scale.** Every radius is the real one â€” equatorial, at the 1-bar level for
the giants â€” and the default size factor is 1, so nothing is exaggerated out of
the box. That does mean planets are genuinely sub-pixel from across the system,
so small bodies also carry a glow marker; a slider exaggerates size up to 2000Ã—
when you want to pick them out. The exaggeration is applied uniformly, the Sun
included, so relative sizes stay truthful at every setting. The info panel
reports each body's apparent angular size from wherever you are standing, which
is the honest way to check: the Sun must subtend 0.533Â° from Earth.

Sunlight falls off as 1/rÂ², so exposure tracks the focused body's distance
automatically; you can override it.

## Accuracy

| Quantity | Source | Accuracy |
| --- | --- | --- |
| Planet positions | JPL Keplerian elements (Standish), tables 1 and 2 | arcseconds 1800â€“2050; better than a degree 3000 BCâ€“3000 AD |
| Moon position | ELP-2000/82 truncation (Meeus ch. 47), precessed to J2000 | ~10â€³ longitude, ~4â€³ latitude |
| Body orientation | IAU/IAG WGCCRE rotational elements | sub-arcminute |
| Galilean moons | Meeus ch. 43 | ~0.05 Jupiter radii |
| Other moons | Published Keplerian elements | exact sizes/distances/periods; **epoch phase approximate** |
| Small bodies | Fixed osculating elements | ~a degree near the present epoch, degrading with time |
| Time scale | Espenak & Meeus Î”T, with observed IERS values 1970â€“2026 | sub-second in the modern era |
| Radii | IAU/NASA reference values, equatorial | exact to the published figure |

`npm run verify` runs 126 assertions against independently known events â€”
five total solar eclipses, two lunar eclipses, lunar perigee and apogee,
Earth's perihelion distance, four planetary oppositions, two greatest
elongations, the solstice and equinox solar declination, every planet's
perihelion/aphelion band over two centuries, agreement between the two element
tables where their validity ranges meet, all nine axial tilts, the Martian
prime meridian cross-checked against Mars Coordinated Time, every body radius
and flattening, apparent diameters at perihelion/apogee/opposition, and the
Uranian polar day.

The assertions that pin this down most directly are the sub-solar longitude
tests: at 12:00 UTC on a date when the equation of time is near zero, the Sun
must be over longitude 0.000Â° to within 0.25Â° (one minute of rotation), and on
3 November it must be 4.10Â° past it. Those pass, which is what makes derived
quantities trustworthy â€” sunrise at Greenwich on 28 July 2026 comes out at
04:18:12 UTC, inside a minute of published almanac times.

The eclipse tests are the strongest check on relative geometry: at five real
totality times the Sun and Moon agree in ecliptic longitude to better than
0.09Â°, having been 0.3Â° apart before the lunar precession reduction was added.

### Known limits

- Planetary positions come from Keplerian fits, not numerical integration.
  Saturn's heliocentric distance drifts up to ~0.03 au against reality because
  table 1 does not model the great Jupiterâ€“Saturn inequality.
- Moons other than Earth's and the Galileans have correct orbits but approximate
  orbital phase. Their positions are illustrative, not predictive.
- Small bodies use fixed osculating elements with no secular rates, so they
  drift the further you travel from the present epoch. Halley ignores
  non-gravitational forces entirely.
- Rings cast shadows onto themselves but not onto the planet.
- The gas giants have no solid surface. Standing on one is a viewpoint at a
  defined pressure level, not a place.
- The lens flare is a camera conceit, not a physical simulation. It tracks the
  Sun's real position and occlusion, but its shape is authored.
- Surface maps are a few km per pixel at best, so close-up ground is synthesised
  detail over a single texel. The horizon, its distance and its curvature are
  geometrically real; the dirt under your boots is not a photograph.
- The star sphere is a photographic sky map, not a positional star catalogue.
  Constellations are in roughly the right place; individual stars are not
  survey-accurate.

## How it is put together

```
js/astro/     ephemerides â€” no rendering code, no three.js
  time.js         Julian dates, delta-T, UTC/TT
  planets.js      JPL Keplerian elements, Kepler solver
  moon.js         truncated ELP-2000/82
  precession.js   IAU 1976 reduction to J2000
  rotation.js     IAU rotational elements, body-fixed bases
  satellites.js   Meeus Jovian theory + Keplerian moons
  smallbodies.js  asteroids, TNOs, Halley
  ephemeris.js    assembles one complete system state
  observer.js     sun altitude/azimuth, local solar time, sunrise search
js/render/    scene graph, materials, surface camera, lens flare
js/ui/        labels, formatting, the drag-and-drop figure
tools/        texture fetcher, verification suite
```

The astronomy layer is deliberately free of any renderer dependency â€” it deals
in float64 kilometres and can be imported straight into Node, which is exactly
what the verification suite does.

Two implementation details matter more than they look:

**Floating origin.** Positions stay in float64 all the way from the ephemeris,
and the current origin (normally the focused body, or the observer in surface
mode) is subtracted before anything reaches the GPU. Without it, standing on
Mars while Neptune sits 4.5 billion km away puts the camera in a jitter of
hundreds of metres.

**The ground patch.** One scene unit is 1000 km, so a globe generated in float32
quantises to about half a metre â€” more than the eye height you are standing at.
The local ground is therefore generated in float64 *relative to the observer's
own surface point*. It is also a polar patch rather than a sphere: from 1.7 m
the horizon is 4.65 km away and subtends 0.042Â°, so a uniform 256-segment globe
would put its nearest vertex 156 km away and there would be no horizon at all.

## Controls

| | |
| --- | --- |
| Click a body, or its label | Select and focus |
| Drag the figure onto a world | Land there |
| Drag / scroll | Orbit and zoom (look around and change field of view in surface mode) |
| `Space` | Play / pause |
| `â†` `â†’` | Step one unit of the current rate; `Shift` for ten |
| `â†‘` `â†“` | Faster / slower |
| `[` `]` | Narrow / widen the slider span |
| `R` | Reverse direction |
| `N` | Jump to now |
| `L` `O` | Labels / orbit paths |
| `?` | Keyboard help |
| `Esc` | Leave the surface |

`window.solarSystem` is exposed in the console for poking at state directly.

## Credits

Textures are public mirrors of open collections: Planet Pixel Emporium maps
(spacecraft-derived) via `jeromeetienne/threex.planets`, NASA Blue Marble and
SRTM-derived Earth maps via `turban/webgl-earth`, NASA city lights via the
three.js examples, and a Milky Way sky sphere via `vasturiano/three-globe`.
`tools/fetch-textures.mjs` lists every source URL.

Rendering uses [three.js](https://threejs.org) (vendored into `vendor/`, so the
page runs entirely offline once textures are fetched).

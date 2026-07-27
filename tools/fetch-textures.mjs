// Downloads the planetary texture set into ./textures.
// Sources are public CDN mirrors (jsDelivr) of well-known open texture collections:
//  - jeromeetienne/threex.planets  -> Planet Pixel Emporium maps (JHT), spacecraft-derived
//  - turban/webgl-earth            -> NASA Blue Marble / SRTM derived 4k Earth maps
//  - mrdoob/three.js               -> NASA Earth city-lights
//  - vasturiano/three-globe        -> Milky Way sky sphere
// Run: node tools/fetch-textures.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'textures');

const THREEX = 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/';
const TURBAN = 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/';
const THREE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/textures/';
const GLOBE = 'https://cdn.jsdelivr.net/gh/vasturiano/three-globe@master/example/img/';

const FILES = {
  'sun.jpg': THREEX + 'sunmap.jpg',

  'mercury.jpg': THREEX + 'mercurymap.jpg',
  'mercury_bump.jpg': THREEX + 'mercurybump.jpg',

  'venus.jpg': THREEX + 'venusmap.jpg',
  'venus_bump.jpg': THREEX + 'venusbump.jpg',

  'earth.jpg': TURBAN + '2_no_clouds_4k.jpg',
  'earth_bump.jpg': TURBAN + 'elev_bump_4k.jpg',
  'earth_spec.png': TURBAN + 'water_4k.png',
  'earth_clouds.png': TURBAN + 'fair_clouds_4k.png',
  'earth_night.png': THREE + 'planets/earth_lights_2048.png',

  'moon.jpg': THREEX + 'moonmap1k.jpg',
  'moon_bump.jpg': THREEX + 'moonbump1k.jpg',

  'mars.jpg': THREEX + 'marsmap1k.jpg',
  'mars_bump.jpg': THREEX + 'marsbump1k.jpg',

  'jupiter.jpg': THREEX + 'jupitermap.jpg',
  'saturn.jpg': THREEX + 'saturnmap.jpg',
  'saturn_ring_color.jpg': THREEX + 'saturnringcolor.jpg',
  'saturn_ring_pattern.gif': THREEX + 'saturnringpattern.gif',

  'uranus.jpg': THREEX + 'uranusmap.jpg',
  'uranus_ring_color.jpg': THREEX + 'uranusringcolour.jpg',
  'uranus_ring_trans.gif': THREEX + 'uranusringtrans.gif',

  'neptune.jpg': THREEX + 'neptunemap.jpg',

  'pluto.jpg': THREEX + 'plutomap1k.jpg',
  'pluto_bump.jpg': THREEX + 'plutobump1k.jpg',

  'stars_milkyway.png': GLOBE + 'night-sky.png',
};

await mkdir(OUT, { recursive: true });

let total = 0;
const results = await Promise.all(
  Object.entries(FILES).map(async ([name, url]) => {
    const dest = join(OUT, name);
    try {
      const s = await stat(dest);
      if (s.size > 0) return { name, size: s.size, cached: true };
    } catch { /* not cached */ }
    const res = await fetch(url);
    if (!res.ok) return { name, error: `HTTP ${res.status}`, url };
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    return { name, size: buf.length };
  })
);

for (const r of results) {
  if (r.error) console.error(`  FAIL ${r.name}: ${r.error} (${r.url})`);
  else {
    total += r.size;
    console.log(`  ${r.cached ? 'have' : 'get '} ${r.name.padEnd(26)} ${(r.size / 1024).toFixed(0)} KB`);
  }
}
console.log(`\n${results.filter((r) => !r.error).length}/${results.length} textures, ${(total / 1048576).toFixed(1)} MB in textures/`);
if (results.some((r) => r.error)) process.exitCode = 1;

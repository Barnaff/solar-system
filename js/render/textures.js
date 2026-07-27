import * as THREE from 'three';
import { ALL_TEXTURES } from '../data/bodies.js';

const loader = new THREE.TextureLoader();
const cache = new Map();

/** Load one texture, resolving to null instead of rejecting if it is missing. */
function loadOne(name, colorSpace) {
  return new Promise((resolve) => {
    loader.load(
      `textures/${name}`,
      (tex) => {
        tex.colorSpace = colorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

// Colour maps are sRGB; bump and specular maps carry raw data.
const DATA_MAPS = /_(bump|spec)\./;

/**
 * Preload everything up front so the simulation never pops textures in mid
 * flight. Missing files degrade to flat colours rather than breaking the run.
 */
export async function loadTextures(onProgress) {
  let done = 0;
  await Promise.all(
    ALL_TEXTURES.map(async (name) => {
      const tex = await loadOne(name, DATA_MAPS.test(name) ? THREE.NoColorSpace : THREE.SRGBColorSpace);
      if (tex) cache.set(name, tex);
      onProgress?.(++done / ALL_TEXTURES.length, name);
    })
  );
  return cache;
}

export const tex = (name) => (name ? cache.get(name) || null : null);

/**
 * Saturn's and Uranus' ring maps ship as a colour strip plus a separate
 * greyscale opacity strip. Composite them into one RGBA texture so a single
 * sampler gives both.
 */
export function buildRingTexture(colorName, alphaName, width = 2048) {
  const colorTex = tex(colorName);
  const alphaTex = tex(alphaName);
  if (!colorTex) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.drawImage(colorTex.image, 0, 0, width, 1);
  const rgba = ctx.getImageData(0, 0, width, 1);

  if (alphaTex) {
    ctx.clearRect(0, 0, width, 1);
    ctx.drawImage(alphaTex.image, 0, 0, width, 1);
    const mask = ctx.getImageData(0, 0, width, 1).data;
    for (let i = 0; i < width; i++) {
      // The pattern strip is greyscale; luminance is the opacity.
      rgba.data[i * 4 + 3] = (mask[i * 4] + mask[i * 4 + 1] + mask[i * 4 + 2]) / 3;
    }
  }

  ctx.putImageData(rgba, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.wrapS = THREE.ClampToEdgeWrapping;
  out.wrapT = THREE.ClampToEdgeWrapping;
  out.anisotropy = 8;
  return out;
}

/**
 * Tone-invert a greyscale map into a new texture. Earth's shipped specular map
 * paints the oceans white, but a roughness map wants the opposite: water is
 * the smooth surface. Inverting once at load is cheaper than branching in the
 * shader and keeps the standard material intact.
 */
export function invertedTexture(name) {
  const src = tex(name);
  if (!src || !src.image) return null;
  const { width, height } = src.image;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src.image, 0, 0);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.NoColorSpace;
  out.wrapS = THREE.RepeatWrapping;
  out.wrapT = THREE.ClampToEdgeWrapping;
  out.anisotropy = 4;
  return out;
}

/** Soft radial sprite used for glow points and the Sun's corona. */
export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

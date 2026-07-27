// Builds the visual representation of one body: the globe itself, plus any
// clouds, atmospheric limb glow, rings and a distance marker.
//
// Scene units are 1000 km, so the Earth's globe has a radius of 6.378 and one
// astronomical unit is 149,598 units. Real positions are held in float64 by
// the ephemeris layer and only converted to float32 after the floating origin
// has been subtracted (see world.js).

import * as THREE from 'three';
import { tex, buildRingTexture, radialSprite, invertedTexture } from './textures.js';

export const KM = 1 / 1000; // kilometres -> scene units

const SPHERE_SEGMENTS = 96;

/** Lazily built once and shared by every body's visibility marker. */
let sharedGlow = null;

function glowTexture() {
  if (!sharedGlow) sharedGlow = radialSprite('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
  return sharedGlow;
}

/**
 * A limb glow that only lights up on the sunward side. Uses a back-face shell
 * slightly larger than the globe, so the glow reads as atmosphere seen edge-on
 * rather than a uniform halo.
 */
function atmosphereMaterial(color, sunDirView) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunDir: sunDirView,
      uStrength: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uSunDir;
      uniform float uStrength;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vec3 n = normalize(vNormalView);
        vec3 v = normalize(-vViewPos);
        // Grazing angles give the thickest air column, so glow at the limb.
        float rim = pow(1.0 - abs(dot(n, v)), 2.4);
        // Only the daylit side scatters. Allow a little wrap for twilight.
        float lit = smoothstep(-0.35, 0.28, dot(n, uSunDir));
        float a = rim * lit * uStrength;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}

/**
 * Ring material. Rings are lit from both faces, fade with the Sun's angle to
 * the ring plane, and darken where the planet's shadow cylinder crosses them -
 * the shadow being the detail that sells Saturn.
 */
function ringMaterial(map, planetRadius, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSunDirLocal: { value: new THREE.Vector3(1, 0, 0) },
      uPlanetRadius: { value: planetRadius },
      uOpacity: { value: opacity },
      // Horizon clip, used only when standing on this planet.
      uClipEnabled: { value: 0 },
      uClipPoint: { value: new THREE.Vector3() },
      uClipNormal: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vLocal;
      void main() {
        vUv = uv;
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uSunDirLocal;
      uniform float uPlanetRadius;
      uniform float uOpacity;
      uniform float uClipEnabled;
      uniform vec3 uClipPoint;
      uniform vec3 uClipNormal;
      varying vec2 vUv;
      varying vec3 vLocal;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.01) discard;

        // Standing on the planet, the part of the ring below the observer's
        // horizon is behind the bulk of the planet. The local ground patch only
        // spans a few times the horizon angle, so it cannot occlude that on its
        // own and the rings would otherwise show through the gap.
        if (uClipEnabled > 0.5 && dot(vLocal - uClipPoint, uClipNormal) < 0.0) discard;

        // Distance from the ring point to the planet-Sun axis, measured
        // perpendicular to the sunlight. Inside one planet radius and on the
        // far side of the planet means eclipsed.
        float along = dot(vLocal, uSunDirLocal);
        vec3 perp = vLocal - uSunDirLocal * along;
        float shadow = (along < 0.0 && length(perp) < uPlanetRadius) ? 0.13 : 1.0;

        gl_FragColor = vec4(c.rgb * shadow, c.a * uOpacity);
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Ring disc geometry with the u coordinate running radially outward. */
function ringGeometry(inner, outer, segments = 256) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 8);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Injects Earth's night side into the standard material: city lights fade in
 * exactly where the Sun sets, which is also a useful visual confirmation that
 * the rotation model is right.
 */
function addNightLights(material, nightMap, sunDirView) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightMap = { value: nightMap };
    shader.uniforms.uSunDirView = sunDirView;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNightMap;
        uniform vec3 uSunDirView;`)
      // Feeding the lights into totalEmissiveRadiance keeps them in linear
      // space, so they go through tone mapping with everything else. Injecting
      // after the final colour conversion would add sRGB to sRGB and clip.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float sunDot = dot(normalize(normal), uSunDirView);
          // smoothstep needs edge0 < edge1; reversing the edges is undefined
          // in GLSL and silently returns zero on some drivers.
          float night = 1.0 - smoothstep(-0.14, 0.09, sunDot);
          vec3 lights = texture2D(uNightMap, vMapUv).rgb;
          // Squaring keeps the bright city cores and drops the diffuse haze.
          totalEmissiveRadiance += lights * lights * night * 0.35;
        }`);
  };
  material.customProgramCacheKey = () => 'earth-night';
}

/**
 * @param {object} def entry from the body catalogue
 * @param {{sunDirView: {value: THREE.Vector3}, isStar?: boolean}} ctx
 */
export function createBody(def, ctx) {
  const radius = def.radius * KM;
  const root = new THREE.Group();
  root.name = def.key;

  // `orient` carries the body-fixed basis; `size` applies the exaggeration
  // factor without disturbing the flattening baked into the geometry.
  const size = new THREE.Group();
  const orient = new THREE.Group();
  root.add(size);
  size.add(orient);

  const geo = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2);
  if (def.flattening) geo.scale(1, 1 - def.flattening, 1);

  let material;
  if (ctx.isStar) {
    material = new THREE.MeshBasicMaterial({
      map: tex(def.texture),
      color: tex(def.texture) ? 0xffffff : def.color,
      toneMapped: false,
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      map: tex(def.texture),
      color: tex(def.texture) ? 0xffffff : def.color,
      bumpMap: tex(def.bump),
      bumpScale: def.bumpScale ?? 0.02,
      roughness: 0.92,
      metalness: 0,
    });
    if (def.key === 'earth') {
      const rough = invertedTexture(def.specular);
      if (rough) {
        material.roughnessMap = rough;
        material.roughness = 1;
      }
      const night = tex(def.night);
      if (night) addNightLights(material, night, ctx.sunDirView);
    }
  }

  const mesh = new THREE.Mesh(geo, material);
  // Geometry poles run along local +Y; the body basis expects them along +Z.
  mesh.rotation.x = Math.PI / 2;
  orient.add(mesh);

  const parts = { root, size, orient, mesh, material, radius, def };

  // --- clouds ---------------------------------------------------------
  if (def.clouds && tex(def.clouds)) {
    const cloudGeo = new THREE.SphereGeometry(radius * 1.003, 64, 32);
    if (def.flattening) cloudGeo.scale(1, 1 - def.flattening, 1);
    const clouds = new THREE.Mesh(cloudGeo, new THREE.MeshStandardMaterial({
      map: tex(def.clouds),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      roughness: 1,
    }));
    clouds.rotation.x = Math.PI / 2;
    orient.add(clouds);
    parts.clouds = clouds;
  }

  // --- atmosphere limb -------------------------------------------------
  if (def.atmosphere) {
    const h = 1 + (def.atmosphere.scaleHeight ?? 0.015);
    const shellGeo = new THREE.SphereGeometry(radius * h, 64, 32);
    if (def.flattening) shellGeo.scale(1, 1 - def.flattening, 1);
    const shell = new THREE.Mesh(shellGeo, atmosphereMaterial(def.atmosphere.color, ctx.sunDirView));
    shell.material.uniforms.uStrength.value = def.atmosphere.opacity;
    shell.renderOrder = 2;
    size.add(shell);
    parts.atmosphere = shell;
  }

  // --- rings -----------------------------------------------------------
  if (def.rings) {
    const r = def.rings;
    let map = r.colorMap ? buildRingTexture(r.colorMap, r.alphaMap) : null;
    if (!map) {
      // Faint, textureless rings (Jupiter, Neptune) get a plain gradient.
      map = radialSprite(
        `#${new THREE.Color(r.color ?? 0x888888).getHexString()}`,
        `#${new THREE.Color(r.color ?? 0x888888).getHexString()}`, 4
      );
    }
    const geoR = ringGeometry(r.inner * KM, r.outer * KM);
    const mat = ringMaterial(map, radius, r.opacity ?? 1);
    const rings = new THREE.Mesh(geoR, mat);
    // RingGeometry lies in the XY plane, which is already the equator plane
    // once `orient` applies the body basis.
    rings.renderOrder = 1;
    orient.add(rings);
    parts.rings = rings;
  }

  // --- distance marker --------------------------------------------------
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color: def.color,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
    toneMapped: false,
  }));
  marker.renderOrder = 5;
  root.add(marker);
  parts.marker = marker;

  return parts;
}

/**
 * The Sun gets an extra additive corona sprite so it still reads as a light
 * source when the globe itself is only a few pixels across.
 */
export function createCorona(radius) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSprite('rgba(255,240,214,0.85)', 'rgba(255,150,40,0)'),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  sprite.scale.setScalar(radius * 7);
  sprite.renderOrder = 4;
  return sprite;
}

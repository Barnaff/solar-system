// Standing on a world.
//
// Two problems have to be solved to make a surface view honest:
//
// 1. Precision. The observer is 1.7 m above a sphere whose radius is 6378 km.
//    Generating that sphere in float32 quantises the ground to about half a
//    metre, which swamps the eye height. So the local ground is generated in
//    float64 *relative to the observer's own surface point* and only then
//    narrowed, giving sub-millimetre precision underfoot.
//
// 2. Resolution. From 1.7 m the horizon is 4.65 km away, subtending just
//    0.042 degrees of arc. A uniform 256-segment globe puts its nearest vertex
//    156 km away, so the horizon would not exist at all. Instead the ground is
//    a polar patch centred on the observer, with rings packed towards the
//    middle, covering a few times the horizon angle.

import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { DEG } from '../astro/time.js';
import { surfaceNormal, bodyToEcliptic } from '../astro/rotation.js';
import { localFrame, ellipsoidRadius, horizonAngle } from '../astro/observer.js';
import { normalize, sub, dot, len } from '../astro/vec.js';
import { KM } from './body.js';
import { tex } from './textures.js';
import { CLOUD_TOP, eyeHeightKm } from '../data/bodies.js';

/**
 * Tone-mapping exposure that makes a sunlit surface at one au read correctly.
 * A Lambertian BRDF divides albedo by pi, so a 0.3-albedo ground under unit
 * irradiance only emits about 0.1 - it needs roughly this much gain before
 * ACES to look like daylight. The automatic exposure scales this by r^2.
 */
export const BASE_EXPOSURE = 4.2;

/**
 * Ground patch centred on (lat, lon), built in body-fixed coordinates with the
 * observer's surface point at the origin.
 *
 * @param {number} radiusKm equatorial radius
 * @param {number} flattening
 * @param {number} horizonAngle angular radius to cover, radians
 */
export function buildGroundPatch(latDeg, lonDeg, radiusKm, flattening, horizonAngle,
  rings = 96, sectors = 640) {
  const { east, north, up } = localFrame(latDeg, lonDeg);
  const r0 = ellipsoidRadius(up, radiusKm, flattening);

  const vertexCount = rings * sectors + 1;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  // Ground-plane coordinates in metres, used for the fine detail overlay. The
  // planetographic uv above spans a fraction of one texel across this whole
  // patch, so it carries no near-field detail at all.
  const detail = new Float32Array(vertexCount * 2);

  const writeVertex = (i, n) => {
    const r = ellipsoidRadius(n, radiusKm, flattening);
    // Both terms are float64; the difference is tiny near the observer, which
    // is exactly where precision matters.
    positions[i * 3] = (r * n.x - r0 * up.x) * KM;
    positions[i * 3 + 1] = (r * n.y - r0 * up.y) * KM;
    positions[i * 3 + 2] = (r * n.z - r0 * up.z) * KM;
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
    const lon = Math.atan2(n.y, n.x);
    const lat = Math.asin(Math.max(-1, Math.min(1, n.z)));
    uvs[i * 2] = 0.5 + lon / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 + lat / Math.PI;
  };

  writeVertex(0, up);
  for (let i = 0; i < rings; i++) {
    // Concentrate rings near the observer: the first metre matters as much as
    // the last kilometre.
    const psi = horizonAngle * Math.pow((i + 1) / rings, 2.2);
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const groundMetres = r0 * psi * 1000;
    for (let j = 0; j < sectors; j++) {
      const beta = (j / sectors) * 2 * Math.PI;
      const cb = Math.cos(beta), sb = Math.sin(beta);
      const n = {
        x: up.x * cp + (north.x * cb + east.x * sb) * sp,
        y: up.y * cp + (north.y * cb + east.y * sb) * sp,
        z: up.z * cp + (north.z * cb + east.z * sb) * sp,
      };
      const k = 1 + i * sectors + j;
      writeVertex(k, n);
      detail[k * 2] = groundMetres * sb;
      detail[k * 2 + 1] = groundMetres * cb;
    }
  }

  const indices = [];
  for (let j = 0; j < sectors; j++) {
    indices.push(0, 1 + ((j + 1) % sectors), 1 + j);
  }
  for (let i = 0; i < rings - 1; i++) {
    const a = 1 + i * sectors;
    const b = 1 + (i + 1) * sectors;
    for (let j = 0; j < sectors; j++) {
      const jn = (j + 1) % sectors;
      indices.push(a + j, b + jn, b + j);
      indices.push(a + j, a + jn, b + jn);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('detailUv', new THREE.BufferAttribute(detail, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Break up the flat colour of a global map at close range.
 *
 * The best available surface maps are a few kilometres per pixel, so from
 * standing height the entire visible landscape falls inside one texel. This
 * adds multi-scale value noise keyed to real ground metres, which restores a
 * sense of texture and distance without inventing terrain that is not there.
 */
function addGroundDetail(material, coarseMetres = 30) {
  const mid = coarseMetres * 0.13;
  const fine = coarseMetres * 0.023;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 detailUv;
        varying vec2 vDetailUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDetailUv = detailUv;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vDetailUv;
        float dHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float dNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), f.x),
                     mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      // Three octaves spanning the scales the eye can resolve from the given
      // viewpoint: metres on rock, kilometres above a cloud deck.
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n = 0.55 * dNoise(vDetailUv / ${coarseMetres.toFixed(3)})
                  + 0.30 * dNoise(vDetailUv / ${mid.toFixed(3)})
                  + 0.15 * dNoise(vDetailUv / ${fine.toFixed(3)});
          diffuseColor.rgb *= 0.62 + 0.76 * n;
        }`);
  };
  material.customProgramCacheKey = () => `ground-detail-${coarseMetres}`;
}

const smoothstep = (x, edge0, edge1) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------

export class SurfaceView {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.active = false;
    this.bodyKey = null;
    this.lat = 0;
    this.lon = 0;
    this.eyeHeight = eyeHeightKm('earth');
    this.yaw = 90 * DEG; // azimuth from north, positive toward east
    this.pitch = 4 * DEG;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.sky = new Sky();
    this.sky.scale.setScalar(1e7);
    this.sky.visible = false;
    this.sky.renderOrder = -900;
    this.sky.frustumCulled = false;
    const m = this.sky.material;
    m.depthTest = false;
    m.depthWrite = false;
    // Deliberately NOT flagged transparent: three.js defers every transparent
    // object until after the opaque pass, which would paint the sky straight
    // over the ground. Kept in the opaque queue, renderOrder puts it after the
    // star sphere and before everything solid, while additive blending still
    // lets the stars show through a dark sky.
    m.transparent = false;
    m.blending = THREE.AdditiveBlending;
    m.uniforms.uSkyScale = { value: 1 };
    m.uniforms.uTint = { value: new THREE.Vector3(1, 1, 1) };
    m.fragmentShader = m.fragmentShader
      .replace('varying float vSunfade;', 'varying float vSunfade;\nuniform float uSkyScale;\nuniform vec3 uTint;')
      .replace('gl_FragColor = vec4( retColor, 1.0 );',
        'gl_FragColor = vec4( retColor * uSkyScale * uTint, 1.0 );');
    this.scene.add(this.sky);

    // Scattered skylight. Without it the ground would be pure black until the
    // Sun's disc actually clears the horizon, when in reality the sky lights
    // the landscape through the whole of twilight.
    this.skyLight = new THREE.HemisphereLight(0xffffff, 0x2a2118, 0);
    this.skyLight.visible = false;
    this.scene.add(this.skyLight);

    this._up = new THREE.Vector3();
    this._north = new THREE.Vector3();
    this._east = new THREE.Vector3();
  }

  /** @param {object} def catalogue entry for the body being stood on */
  enter(def, lat, lon) {
    this.def = def;
    this.bodyKey = def.key;
    this.lat = lat;
    this.lon = lon;
    this.eyeHeight = eyeHeightKm(def.key);
    this.active = true;
    this.group.visible = true;
    this._rebuild();
  }

  exit() {
    this.active = false;
    this.group.visible = false;
    this.sky.visible = false;
    this.skyLight.visible = false;
  }

  setLocation(lat, lon) {
    this.lat = lat;
    this.lon = lon;
    this._rebuild();
  }

  _rebuild() {
    const def = this.def;
    if (this.ground) {
      this.ground.geometry.dispose();
      this.group.remove(this.ground);
    }
    const psiH = horizonAngle(def.radius, this.eyeHeight);
    // Three times the horizon angle leaves headroom without wasting most of
    // the rings on ground that curvature hides anyway.
    const geo = buildGroundPatch(
      this.lat, this.lon, def.radius, def.flattening || 0,
      Math.min(Math.PI / 2, psiH * 3)
    );
    const cloud = CLOUD_TOP.has(def.key);
    const material = new THREE.MeshStandardMaterial({
      map: tex(def.texture),
      color: tex(def.texture) ? 0xffffff : def.color,
      roughness: cloud ? 0.6 : 0.95,
      metalness: 0,
    });
    // Detail is keyed to what the eye can resolve from this viewpoint: tens of
    // metres standing on rock, tens of kilometres floating over a cloud deck.
    addGroundDetail(material, cloud ? this.eyeHeight * 18000 : 30);
    this.ground = new THREE.Mesh(geo, material);
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    const atmo = def.atmosphere?.sky;
    if (atmo) {
      const u = this.sky.material.uniforms;
      u.turbidity.value = atmo.turbidity;
      u.rayleigh.value = atmo.rayleigh;
      u.mieCoefficient.value = atmo.mieCoefficient;
      u.mieDirectionalG.value = atmo.mieDirectionalG;
      u.uTint.value.set(...atmo.tint);
    }
    this.sky.visible = !!atmo;
  }

  /**
   * Place the camera and orient the sky. The world origin is expected to be
   * the observer's own position, so the local geometry sits at zero.
   */
  update(state, world) {
    if (!this.active) return null;
    const key = this.bodyKey;
    const basis = state.basis[key];
    const planet = state.pos[key];
    if (!basis || !planet) return null;

    const nBody = surfaceNormal(this.lat, this.lon);
    const r0 = ellipsoidRadius(nBody, this.def.radius, this.def.flattening || 0);
    const upEcl = bodyToEcliptic(basis, nBody);
    const surfacePoint = {
      x: planet.x + upEcl.x * r0,
      y: planet.y + upEcl.y * r0,
      z: planet.z + upEcl.z * r0,
    };
    const observer = {
      x: surfacePoint.x + upEcl.x * this.eyeHeight,
      y: surfacePoint.y + upEcl.y * this.eyeHeight,
      z: surfacePoint.z + upEcl.z * this.eyeHeight,
    };
    world.setOrigin(observer);

    // Ground patch: rotate by the body basis, translate so the observer's
    // surface point lands exactly under the camera.
    const mat = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(basis.x.x, basis.x.y, basis.x.z),
      new THREE.Vector3(basis.y.x, basis.y.y, basis.y.z),
      new THREE.Vector3(basis.z.x, basis.z.y, basis.z.z)
    );
    this.group.quaternion.setFromRotationMatrix(mat);
    this.group.position.set(
      (surfacePoint.x - observer.x) * KM,
      (surfacePoint.y - observer.y) * KM,
      (surfacePoint.z - observer.z) * KM
    );

    const { east, north } = localFrame(this.lat, this.lon);
    this._up.set(upEcl.x, upEcl.y, upEcl.z).normalize();
    const eEcl = bodyToEcliptic(basis, east);
    const nEcl = bodyToEcliptic(basis, north);
    this._east.set(eEcl.x, eEcl.y, eEcl.z).normalize();
    this._north.set(nEcl.x, nEcl.y, nEcl.z).normalize();

    this.camera.position.set(0, 0, 0);
    this.camera.up.copy(this._up);
    const dir = new THREE.Vector3()
      .addScaledVector(this._north, Math.cos(this.yaw) * Math.cos(this.pitch))
      .addScaledVector(this._east, Math.sin(this.yaw) * Math.cos(this.pitch))
      .addScaledVector(this._up, Math.sin(this.pitch));
    this.camera.lookAt(dir);

    // Sky dome follows the camera; the Sun direction drives the scattering.
    const sunDir = normalize(sub(state.pos.sun, observer));
    this.sky.position.copy(this.camera.position);
    const su = this.sky.material.uniforms;
    su.sunPosition.value.set(sunDir.x, sunDir.y, sunDir.z);
    su.up.value.copy(this._up);
    // Preetham assumes Earth's illumination, so scale by the local irradiance.
    // Dividing by the base exposure too keeps the sky's brightness relative to
    // the ground fixed, whatever gain the camera is running at.
    const auRel = len(state.pos[key]) / 149597870.7;
    su.uSkyScale.value =
      (this.def.atmosphere?.sky?.exposure ?? 0.4) / (auRel * auRel * BASE_EXPOSURE);

    const altitude = Math.asin(Math.max(-1, Math.min(1, dot(sunDir, upEcl))));
    const az = Math.atan2(dot(sunDir, eEcl), dot(sunDir, nEcl));

    // Skylight ramps in across civil/nautical twilight and holds through the
    // day. Scaled like every other light source by the local irradiance, so
    // the automatic exposure keeps it in proportion.
    const altDeg = altitude / DEG;
    if (this.def.atmosphere) {
      const tint = this.def.atmosphere.sky?.tint ?? [1, 1, 1];
      const twilight = smoothstep(altDeg, -10, 5);
      this.skyLight.visible = true;
      this.skyLight.color.setRGB(tint[0], tint[1], tint[2]);
      this.skyLight.intensity = (0.05 + 0.5 * twilight) * (0.25 / (auRel * auRel));
      this.skyLight.position.copy(this._up);
    } else {
      this.skyLight.visible = false;
    }

    return {
      observer,
      up: upEcl,
      // Standing 1.7 m up, the true horizon dips a fraction of a degree below
      // level; anything lower than that is behind the planet.
      horizonDip: -Math.acos(r0 / (r0 + this.eyeHeight)),
      sunAltitude: altitude / DEG,
      sunAzimuth: ((az / DEG) % 360 + 360) % 360,
      lookAzimuth: ((this.yaw / DEG) % 360 + 360) % 360,
      lookAltitude: this.pitch / DEG,
    };
  }
}

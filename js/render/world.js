// The scene graph and its per-frame update.
//
// Everything positional flows through a floating origin: the ephemeris hands
// us float64 kilometres, we subtract the current origin (normally the focused
// body) and only then narrow to the float32 the GPU wants. Without that, a
// camera standing on Mars while Neptune sits 4.5 billion km away would jitter
// by hundreds of metres.

import * as THREE from 'three';
import { SUN, PLANETS, MOON } from '../data/bodies.js';
import { SATELLITES } from '../astro/satellites.js';
import { SMALL_BODIES, smallBodyOrbit } from '../astro/smallbodies.js';
import { orbitPath } from '../astro/planets.js';
import { createBody, createCorona, KM } from './body.js';
import { tex } from './textures.js';
import { OBLIQUITY_J2000, normalize, sub, dot } from '../astro/vec.js';

const AU_KM = 149597870.7;
const ORBIT_REFRESH_DAYS = 3650;

/** Planet key -> ephemeris key used for its orbit path. */
const ORBIT_SOURCE = { earth: 'embary' };

export class World {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.origin = { x: 0, y: 0, z: 0 }; // km, float64
    this.bodies = new Map();
    this.orbits = new Map();
    this.moonOrbits = new Map();
    this.sizeFactor = 1;
    this.lastOrbitJD = -Infinity;

    // Shared uniform: the Sun's direction in view space, used by the
    // atmosphere shells and Earth's night-lights injection.
    this.sunDirView = { value: new THREE.Vector3(1, 0, 0) };

    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  build() {
    this._buildLighting();
    this._buildBodies();
    this._buildOrbits();
    this._buildStarfield();
    this._buildBelts();
  }

  // ------------------------------------------------------------------ setup

  _buildLighting() {
    // decay 2 with intensity chosen so irradiance is ~1 at one au: sunlight
    // really does fall off as the inverse square, which is why Neptune needs
    // the exposure control.
    const auUnits = AU_KM * KM;
    this.sunLight = new THREE.PointLight(0xfff4e6, auUnits * auUnits, 0, 2);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x22304a, 0.05));
  }

  _buildBodies() {
    const add = (def, opts = {}) => {
      const parts = createBody(def, { sunDirView: this.sunDirView, ...opts });
      parts.category = opts.category || 'planet';
      this.scene.add(parts.root);
      this.bodies.set(def.key, parts);
      return parts;
    };

    const sun = add(SUN, { isStar: true, category: 'star' });
    sun.corona = createCorona(SUN.radius * KM);
    sun.root.add(sun.corona);
    sun.marker.visible = false;

    for (const def of Object.values(PLANETS)) add(def, { category: 'planet' });
    add(MOON, { category: 'moon' });

    for (const [key, sat] of Object.entries(SATELLITES)) {
      add({
        key,
        name: key[0].toUpperCase() + key.slice(1),
        radius: sat.radius,
        flattening: 0,
        color: sat.color,
        texture: null,
        atmosphere: key === 'titan'
          ? { color: 0xd9a066, opacity: 0.45, scaleHeight: 0.05 }
          : null,
      }, { category: 'moon' });
    }

    for (const [key, b] of Object.entries(SMALL_BODIES)) {
      add({
        key, name: b.name, radius: b.radius, flattening: 0,
        color: b.color, texture: null, atmosphere: null,
      }, { category: 'small' });
    }
  }

  _buildOrbits() {
    this.orbitGroup = new THREE.Group();
    this.scene.add(this.orbitGroup);

    for (const key of Object.keys(PLANETS)) {
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: PLANETS[key].color, transparent: true, opacity: 0.34, depthWrite: false,
        })
      );
      line.frustumCulled = false;
      this.orbitGroup.add(line);
      this.orbits.set(key, line);
    }

    this.smallOrbitGroup = new THREE.Group();
    this.scene.add(this.smallOrbitGroup);
    for (const [key, b] of Object.entries(SMALL_BODIES)) {
      const pts = smallBodyOrbit(key).map((p) => new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(AU_KM * KM));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: b.color, transparent: true,
          opacity: b.group === 'comet' ? 0.32 : 0.18, depthWrite: false,
        })
      );
      line.frustumCulled = false;
      this.smallOrbitGroup.add(line);
      this.orbits.set(key, line);
    }

    // Satellite orbits are drawn relative to their primary.
    this.moonOrbitGroup = new THREE.Group();
    this.scene.add(this.moonOrbitGroup);
    const moonKeys = ['moon', ...Object.keys(SATELLITES)];
    for (const key of moonKeys) {
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x8fa5c8, transparent: true, opacity: 0.3, depthWrite: false })
      );
      line.frustumCulled = false;
      this.moonOrbitGroup.add(line);
      this.moonOrbits.set(key, { line, trail: [] });
    }
  }

  _buildStarfield() {
    const map = tex('stars_milkyway.png');
    const geo = new THREE.SphereGeometry(1, 64, 32);
    const mat = map
      ? new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, depthWrite: false, toneMapped: false })
      : new THREE.MeshBasicMaterial({ color: 0x05070d, side: THREE.BackSide, depthWrite: false });
    this.sky = new THREE.Mesh(geo, mat);
    // The sky map is in equatorial coordinates; the scene is ecliptic. The
    // extra quarter turn lifts the geometry's poles from +Y onto +Z.
    this.sky.rotation.x = Math.PI / 2 - OBLIQUITY_J2000;
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.setSkyBrightness(1);
  }

  /**
   * Dim the star sphere by tinting it. It must stay in the opaque queue -
   * flagging it transparent would defer it past the ground in surface mode.
   */
  setSkyBrightness(v) {
    if (!this.sky) return;
    this.sky.material.color.setScalar(v);
  }

  /**
   * The main belt, the Jupiter Trojan clouds and a sparse Kuiper disc.
   * These are statistical populations drawn from the real orbital-element
   * distributions, not catalogued objects.
   */
  _buildBelts() {
    this.beltGroup = new THREE.Group();
    this.scene.add(this.beltGroup);

    let seed = 20260727;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const gauss = () => (rand() + rand() + rand() + rand() - 2) / 1.155;

    const makeCloud = (count, sample, color, size, opacity) => {
      const el = new Float32Array(count * 5); // a, e, i, node+peri, M0
      for (let k = 0; k < count; k++) sample(el, k * 5);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      // No sprite map here: at one or two pixels a point samples the sprite's
      // transparent rim as often as its centre, so alpha testing erases most
      // of the cloud. Flat points read better at this size.
      const points = new THREE.Points(geo, new THREE.PointsMaterial({
        color, size, sizeAttenuation: false, transparent: true,
        opacity, depthWrite: false,
      }));
      points.frustumCulled = false;
      points.userData.elements = el;
      this.beltGroup.add(points);
      return points;
    };

    // Main belt: 2.1-3.3 au, with the Kirkwood gaps left as-is (a uniform
    // draw is close enough at this visual density).
    this.belt = makeCloud(4200, (el, o) => {
      el[o] = 2.15 + rand() * 1.15;
      el[o + 1] = Math.abs(gauss()) * 0.09;
      el[o + 2] = Math.abs(gauss()) * 0.14;
      el[o + 3] = rand() * Math.PI * 2;
      el[o + 4] = rand() * Math.PI * 2;
    }, 0xbdac92, 2.0, 0.6);

    // Trojans librate around Jupiter's L4 and L5 points.
    this.trojans = makeCloud(900, (el, o) => {
      el[o] = 5.202 + gauss() * 0.14;
      el[o + 1] = Math.abs(gauss()) * 0.07;
      el[o + 2] = Math.abs(gauss()) * 0.2;
      el[o + 3] = 0;
      el[o + 4] = (rand() < 0.5 ? 1 : -1) * (Math.PI / 3) + gauss() * 0.25;
    }, 0x9fb0c8, 2.0, 0.6);
    this.trojans.userData.followsJupiter = true;

    this.kuiper = makeCloud(2600, (el, o) => {
      el[o] = 35 + rand() * 15;
      el[o + 1] = Math.abs(gauss()) * 0.12;
      el[o + 2] = Math.abs(gauss()) * 0.28;
      el[o + 3] = rand() * Math.PI * 2;
      el[o + 4] = rand() * Math.PI * 2;
    }, 0x7f8aa2, 1.7, 0.42);
  }

  // ----------------------------------------------------------------- update

  setOrigin(km) {
    this.origin.x = km.x;
    this.origin.y = km.y;
    this.origin.z = km.z;
  }

  /** Convert an absolute position in km to scene units about the origin. */
  toScene(km, out) {
    return (out || this._v).set(
      (km.x - this.origin.x) * KM,
      (km.y - this.origin.y) * KM,
      (km.z - this.origin.z) * KM
    );
  }

  /**
   * Exaggeration is applied uniformly, the Sun included, so relative sizes
   * stay truthful at every setting. At 1 every body is exactly its real
   * diameter; wind it up far enough and the Sun really does swallow Mercury's
   * orbit, because at 250x it would be 1.16 au across.
   */
  setSizeFactor(f) {
    this.sizeFactor = f;
    for (const parts of this.bodies.values()) parts.size.scale.setScalar(f);
  }

  update(state, opts) {
    const { pos, basis } = state;

    // Sun direction in view space, shared by the atmosphere and night shaders.
    const camWorld = this.camera.getWorldPosition(this._v.clone());
    const sunScene = this.toScene(pos.sun, new THREE.Vector3());
    this.sunDirView.value.copy(sunScene).sub(camWorld).normalize()
      .transformDirection(this.camera.matrixWorldInverse);

    this.sunLight.position.copy(sunScene);

    for (const [key, parts] of this.bodies) {
      const p = pos[key];
      if (!p) { parts.root.visible = false; continue; }

      // Standing on a ringed planet, the globe under your feet is drawn by the
      // surface view instead - but the rings themselves arc overhead and must
      // stay in the scene.
      const ringsOnly = key === opts.standingOn && !!parts.rings;
      const visible = ringsOnly ||
        (opts.categoryVisible(parts.category, key) && !opts.occluded(key, p));
      parts.root.visible = visible;
      if (!visible) continue;

      if (parts.rings) parts.rings.visible = true;
      parts.mesh.visible = !ringsOnly;
      if (parts.clouds) parts.clouds.visible = !ringsOnly;
      if (parts.atmosphere) parts.atmosphere.visible = !ringsOnly;
      if (parts.marker) parts.marker.visible = parts.marker.visible && !ringsOnly;

      this.toScene(p, parts.root.position);

      const b = basis[key];
      if (b) {
        this._m.makeBasis(
          this._v.set(b.x.x, b.x.y, b.x.z),
          new THREE.Vector3(b.y.x, b.y.y, b.y.z),
          new THREE.Vector3(b.z.x, b.z.y, b.z.z)
        );
        parts.orient.quaternion.setFromRotationMatrix(this._m);
      }

      if (parts.rings && b) {
        // Express the sunward direction in body-fixed coordinates so the ring
        // shader can test the planet's shadow cylinder. Done from the basis
        // directly rather than from matrices, which are still stale here.
        const toSun = normalize(sub(pos.sun, p));
        const u = parts.rings.material.uniforms;
        u.uSunDirLocal.value.set(dot(toSun, b.x), dot(toSun, b.y), dot(toSun, b.z));

        const clip = ringsOnly ? opts.horizonClip : null;
        u.uClipEnabled.value = clip ? 1 : 0;
        if (clip) {
          u.uClipPoint.value.set(clip.point.x, clip.point.y, clip.point.z);
          u.uClipNormal.value.set(clip.normal.x, clip.normal.y, clip.normal.z);
        }
      }
    }

    this._updateMarkers(opts);
    this._updateOrbits(state, opts);
    this._updateBelts(state, opts);

    if (this.sky) {
      this.sky.position.copy(camWorld);
      this.sky.scale.setScalar(this.camera.far * 0.4);
      this.sky.visible = opts.showStars;
    }
  }

  /**
   * Bodies smaller than a couple of pixels get a glow point so they stay
   * findable at true scale. The threshold is in screen pixels, so it adapts
   * to zoom automatically.
   */
  _updateMarkers(opts) {
    const height = opts.viewportHeight;
    const p11 = 1 / Math.tan((this.camera.fov * Math.PI) / 360);
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());

    for (const [key, parts] of this.bodies) {
      const marker = parts.marker;
      if (!marker || !parts.root.visible || key === 'sun') continue;
      if (!opts.showMarkers || key === opts.standingOn) { marker.visible = false; continue; }

      const d = camPos.distanceTo(parts.root.position);
      const radiusPx = ((parts.radius * this.sizeFactor) / d) * (p11 / 2) * height;
      marker.visible = radiusPx < 3.2 && d > 0;
      if (marker.visible) {
        const px = THREE.MathUtils.clamp(8 - radiusPx, 3.5, 8);
        const s = (2 * px) / (p11 * height);
        marker.scale.set(s, s, 1);
        marker.material.opacity = THREE.MathUtils.clamp(1 - radiusPx / 3.2, 0.25, 0.95);
      }
    }
  }

  _updateOrbits(state, opts) {
    this.orbitGroup.visible = opts.showOrbits;
    this.smallOrbitGroup.visible = opts.showOrbits && opts.showSmall;
    this.moonOrbitGroup.visible = opts.showOrbits && opts.showMoons;
    if (!opts.showOrbits) return;

    const off = -1;
    this.orbitGroup.position.set(this.origin.x * KM * off, this.origin.y * KM * off, this.origin.z * KM * off);
    this.smallOrbitGroup.position.copy(this.orbitGroup.position);

    // Planetary elements drift; resample the ellipses every few years.
    if (Math.abs(state.jdTT - this.lastOrbitJD) > ORBIT_REFRESH_DAYS) {
      this.lastOrbitJD = state.jdTT;
      for (const key of Object.keys(PLANETS)) {
        const src = ORBIT_SOURCE[key] || key;
        const pts = orbitPath(src, state.jdTT, 512)
          .map((p) => new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(AU_KM * KM));
        this.orbits.get(key).geometry.setFromPoints(pts);
      }
    }

    if (!opts.showMoons) return;

    // Satellite ellipses only shift as their primary's pole precesses, so
    // resampling once a simulated month is plenty.
    const resample = Math.abs(state.jdTT - (this._lastMoonOrbitJD ?? -1e9)) > 30;
    if (resample) this._lastMoonOrbitJD = state.jdTT;

    for (const [key, entry] of this.moonOrbits) {
      const parts = this.bodies.get(key);
      const primary = key === 'moon' ? 'earth' : SATELLITES[key].primary;
      if (!parts?.root.visible) { entry.line.visible = false; continue; }
      entry.line.visible = true;
      this.toScene(state.pos[primary], entry.line.position);

      if (resample || !entry.built) {
        const pts = opts.satelliteOrbit(key, state)
          .map((p) => new THREE.Vector3(p.x * KM, p.y * KM, p.z * KM));
        entry.line.geometry.setFromPoints(pts);
        entry.line.geometry.computeBoundingSphere();
        entry.built = true;
      }
    }
  }

  _updateBelts(state, opts) {
    this.beltGroup.visible = opts.showBelt;
    if (!opts.showBelt) return;

    // ~7,700 particles, each needing a Kepler step. Skip the work entirely
    // when neither the clock nor the origin has moved.
    const stamp = `${state.jdTT}|${this.origin.x}|${this.origin.y}|${this.origin.z}`;
    if (stamp === this._beltStamp) return;
    this._beltStamp = stamp;

    const t = state.jdTT;
    const jupiterLon = Math.atan2(state.pos.jupiter.y, state.pos.jupiter.x);

    for (const cloud of this.beltGroup.children) {
      const el = cloud.userData.elements;
      const arr = cloud.geometry.attributes.position.array;
      const trojan = cloud.userData.followsJupiter;

      for (let k = 0, o = 0, j = 0; o < el.length; k++, o += 5, j += 3) {
        const a = el[o], e = el[o + 1], inc = el[o + 2], node = el[o + 3], phase = el[o + 4];
        const n = (2 * Math.PI) / (365.25 * Math.pow(a, 1.5));
        const M = trojan ? jupiterLon + phase : node + phase + n * t;
        // Two-term expansion of Kepler's equation: ample for e < 0.2 at the
        // scale a dust cloud is viewed.
        const E = M + e * Math.sin(M) + 0.5 * e * e * Math.sin(2 * M);
        const xp = a * (Math.cos(E) - e);
        const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
        const ci = Math.cos(inc), si = Math.sin(inc);
        const cn = Math.cos(node), sn = Math.sin(node);
        const x = xp * cn - yp * sn * ci;
        const y = xp * sn + yp * cn * ci;
        const z = yp * si;
        arr[j] = x * AU_KM * KM - this.origin.x * KM;
        arr[j + 1] = y * AU_KM * KM - this.origin.y * KM;
        arr[j + 2] = z * AU_KM * KM - this.origin.z * KM;
      }
      cloud.geometry.attributes.position.needsUpdate = true;
    }
  }
}

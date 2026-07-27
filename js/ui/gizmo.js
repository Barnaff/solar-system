// A drag-and-drop observer, in the spirit of Street View's pegman.
//
// Pick the figure up and drag it over the scene: whichever world you are
// hovering gets ringed, a readout follows the cursor with the exact
// planetographic coordinates under the pointer, and releasing drops you onto
// that spot in surface mode.
//
// At true scale most planets are only a few pixels wide, so a ray/sphere test
// alone would make this nearly impossible to use. Instead the nearest landable
// body within a generous screen radius wins; if the ray genuinely hits the
// globe we use the exact intersection, and otherwise we fall back to the point
// facing the camera, which is what the user can actually see.

import * as THREE from 'three';
import { eclipticToBody, latLonOf } from '../astro/rotation.js';

const GRAB_RADIUS_PX = 46;

export class DropGizmo {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.dock       container the figure sits in when idle
   * @param {HTMLCanvasElement} opts.canvas
   * @param {() => object} opts.getContext  supplies camera, positions and state
   * @param {(key, lat, lon) => void} opts.onDrop
   */
  constructor({ dock, canvas, getContext, onDrop }) {
    this.canvas = canvas;
    this.getContext = getContext;
    this.onDrop = onDrop;
    this.dragging = false;
    this.target = null;

    this.figure = document.createElement('button');
    this.figure.id = 'gizmo-figure';
    this.figure.type = 'button';
    this.figure.title = 'Drag onto a world to stand there';
    this.figure.setAttribute('aria-label', 'Drag onto a world to stand there');
    this.figure.innerHTML = FIGURE_SVG;
    dock.appendChild(this.figure);

    this.ghost = document.createElement('div');
    this.ghost.id = 'gizmo-ghost';
    this.ghost.innerHTML = FIGURE_SVG;
    this.ghost.hidden = true;
    document.body.appendChild(this.ghost);

    this.ring = document.createElement('div');
    this.ring.id = 'gizmo-ring';
    this.ring.hidden = true;
    document.body.appendChild(this.ring);

    this.readout = document.createElement('div');
    this.readout.id = 'gizmo-readout';
    this.readout.hidden = true;
    document.body.appendChild(this.readout);

    this.figure.addEventListener('pointerdown', (e) => this._start(e));
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  _start(e) {
    e.preventDefault();
    this.dragging = true;
    this.figure.classList.add('held');
    this.ghost.hidden = false;
    document.body.classList.add('gizmo-dragging');

    const move = (ev) => this._move(ev);
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this._end(ev);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    this._move(e);
  }

  _move(e) {
    if (!this.dragging) return;
    this.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -85%)`;

    const hit = this.pick(e.clientX, e.clientY);
    this.target = hit;

    if (!hit) {
      this.ring.hidden = true;
      this.readout.hidden = true;
      this.ghost.classList.remove('over');
      return;
    }

    this.ghost.classList.add('over');
    const d = Math.max(34, hit.screenRadius * 2 + 18);
    this.ring.hidden = false;
    this.ring.style.width = `${d}px`;
    this.ring.style.height = `${d}px`;
    this.ring.style.transform =
      `translate(${hit.screenX}px, ${hit.screenY}px) translate(-50%, -50%)`;

    this.readout.hidden = false;
    this.readout.textContent = `${hit.name}  ${formatLatLon(hit.lat, hit.lon)}`;
    this.readout.style.transform = `translate(${e.clientX + 18}px, ${e.clientY + 14}px)`;
  }

  _end() {
    if (!this.dragging) return;
    this.dragging = false;
    this.figure.classList.remove('held');
    this.ghost.hidden = true;
    this.ghost.classList.remove('over');
    this.ring.hidden = true;
    this.readout.hidden = true;
    document.body.classList.remove('gizmo-dragging');

    if (this.target) this.onDrop(this.target.key, this.target.lat, this.target.lon);
    this.target = null;
  }

  /**
   * Resolve a screen point to a landing site.
   * @returns {?{key, name, lat, lon, screenX, screenY, screenRadius}}
   */
  pick(px, py) {
    const ctx = this.getContext();
    if (!ctx) return null;
    const { camera, scenePositions, state, bodies, landable, catalogue } = ctx;
    const rect = this.canvas.getBoundingClientRect();
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) return null;

    const v = new THREE.Vector3();
    let best = null;
    let bestDist = GRAB_RADIUS_PX;

    for (const key of landable) {
      const p = scenePositions.get(key);
      const parts = bodies.get(key);
      if (!p || !parts?.root.visible) continue;
      v.copy(p).project(camera);
      if (v.z < -1 || v.z > 1) continue;
      const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
      const screenRadius = this._screenRadius(parts, p, camera, rect.height);
      // Anywhere inside the disc counts as a direct hit; outside it, the
      // closest body within the grab radius wins.
      const d = Math.max(0, Math.hypot(sx - px, sy - py) - screenRadius);
      if (d < bestDist) {
        bestDist = d;
        best = { key, parts, sx, sy, screenRadius };
      }
    }
    if (!best) return null;

    const { lat, lon } = this._surfacePoint(best, px, py, rect, ctx, state);
    return {
      key: best.key,
      name: catalogue.get(best.key).name,
      lat,
      lon,
      screenX: best.sx,
      screenY: best.sy,
      screenRadius: best.screenRadius,
    };
  }

  _screenRadius(parts, scenePos, camera, viewportHeight) {
    const dist = camera.position.distanceTo(scenePos);
    const p11 = 1 / Math.tan((camera.fov * Math.PI) / 360);
    const scale = parts.size.scale.x || 1;
    return ((parts.radius * scale) / dist) * (p11 / 2) * viewportHeight;
  }

  /**
   * Planetographic coordinates under the cursor. Uses the true ray/sphere
   * intersection where there is one, and the sub-camera point otherwise so
   * that dropping onto a two-pixel Mercury still lands somewhere sensible.
   */
  _surfacePoint(best, px, py, rect, ctx, state) {
    const { camera, scenePositions } = ctx;
    const centre = scenePositions.get(best.key);
    const basis = state.basis[best.key];

    this._ndc.set(
      ((px - rect.left) / rect.width) * 2 - 1,
      -(((py - rect.top) / rect.height) * 2 - 1)
    );
    this._raycaster.setFromCamera(this._ndc, camera);

    const radius = best.parts.radius * (best.parts.size.scale.x || 1);
    const sphere = new THREE.Sphere(centre.clone(), radius);
    const hit = this._raycaster.ray.intersectSphere(sphere, new THREE.Vector3());

    const dir = hit
      ? hit.sub(centre).normalize()
      : centre.clone().sub(camera.position).normalize().negate();

    return latLonOf(eclipticToBody(basis, { x: dir.x, y: dir.y, z: dir.z }));
  }
}

function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${lon.toFixed(1)}°E`;
}

// A small standing figure. Deliberately plain: it reads at 30 px.
const FIGURE_SVG = `
<svg viewBox="0 0 24 34" aria-hidden="true" focusable="false">
  <ellipse class="shadow" cx="12" cy="31.5" rx="7" ry="2.2"/>
  <circle class="head" cx="12" cy="5" r="4"/>
  <path class="body" d="M12 10c-3.4 0-5.6 1.9-5.6 4.6v5.1c0 .9.7 1.6 1.6 1.6h.5v7.1c0 1 .8 1.8 1.8 1.8s1.8-.8 1.8-1.8v-4.6h.4v4.6c0 1 .8 1.8 1.8 1.8s1.8-.8 1.8-1.8v-7.1h.5c.9 0 1.6-.7 1.6-1.6v-5.1C17.6 11.9 15.4 10 12 10z"/>
</svg>`;

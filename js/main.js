import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

import { dateToJD, formatJD, DEG } from './astro/time.js';
import { computeState, bodyGeometry, subSolarPoint, AU_KM } from './astro/ephemeris.js';
import { orbitalPeriodDays } from './astro/planets.js';
import { SATELLITES, satelliteOrbitPath } from './astro/satellites.js';
import { SMALL_BODIES, smallBodyPeriod } from './astro/smallbodies.js';
import { moonGeocentricKm } from './astro/moon.js';
import {
  rotationPeriodDays, axialTilt, orbitNormalOf, surfaceNormal, bodyToEcliptic,
} from './astro/rotation.js';
import { len, sub } from './astro/vec.js';

import { SUN, PLANETS, MOON, LANDABLE, LANDMARKS, CLOUD_TOP, eyeHeightKm } from './data/bodies.js';
import { DropGizmo } from './ui/gizmo.js';
import { loadTextures } from './render/textures.js';
import { KM } from './render/body.js';
import { World } from './render/world.js';
import { SurfaceView, BASE_EXPOSURE } from './render/surface.js';
import { LensFlare } from './render/flare.js';
import {
  nextSunEvents, sunAzimuthAt, localSolarTime, solarDayLength, ellipsoidRadius,
} from './astro/observer.js';
import { Labels } from './ui/labels.js';
import * as fmt from './ui/format.js';

const $ = (id) => document.getElementById(id);

/** Every body the UI knows about, with its catalogue entry. */
function buildCatalogue() {
  const map = new Map();
  map.set('sun', { ...SUN, category: 'star', group: 'Star' });
  for (const [k, d] of Object.entries(PLANETS)) {
    map.set(k, { ...d, category: 'planet', group: d.type === 'dwarf' ? 'Dwarf planets' : 'Planets' });
  }
  map.set('moon', { ...MOON, category: 'moon', group: 'Moons', primary: 'earth' });
  for (const [k, s] of Object.entries(SATELLITES)) {
    map.set(k, {
      key: k, name: k[0].toUpperCase() + k.slice(1), type: 'moon', category: 'moon',
      group: 'Moons', primary: s.primary, radius: s.radius, flattening: 0,
      color: s.color, mass: null, texture: null,
      atmosphere: k === 'titan'
        ? { color: 0xd9a066, opacity: 0.45, scaleHeight: 0.05, sky: { turbidity: 30, rayleigh: 0.5, mieCoefficient: 0.08, mieDirectionalG: 0.85, exposure: 0.35, tint: [1.0, 0.66, 0.28] } }
        : null,
      facts: { Primary: s.primary[0].toUpperCase() + s.primary.slice(1), 'Orbital period': `${s.period.toFixed(4)} d`, 'Semi-major axis': fmt.distance(s.a) },
      blurb: '',
    });
  }
  for (const [k, b] of Object.entries(SMALL_BODIES)) {
    map.set(k, {
      key: k, name: b.name, type: b.group === 'comet' ? 'comet' : 'dwarf', category: 'small',
      group: b.group === 'comet' ? 'Comets' : b.group === 'tno' ? 'Dwarf planets' : 'Asteroids',
      radius: b.radius, flattening: 0, color: b.color, mass: null, texture: null, atmosphere: null,
      facts: { 'Semi-major axis': `${b.a.toFixed(3)} AU`, Eccentricity: b.e.toFixed(4), Inclination: `${b.i.toFixed(2)}°` },
      blurb: 'Propagated from fixed osculating elements, so this position drifts from reality far from the present epoch.',
    });
  }
  return map;
}

const GROUP_ORDER = ['Star', 'Planets', 'Dwarf planets', 'Moons', 'Asteroids', 'Comets'];

class App {
  constructor() {
    this.catalogue = buildCatalogue();
    this.jd = dateToJD(new Date());
    this.centerJD = this.jd;
    this.span = 182.6;
    this.rate = 3600; // 1 hour of simulation per second; matches the markup
    this.playing = false;
    this.direction = 1;
    this.focus = 'earth';
    this.selected = 'earth';
    this.exposure = null; // null = automatic
    this.autoExposure = 1;
    this.sizeFactor = 1;

    this.opts = {
      orbits: true, labels: true, moons: true, small: true,
      belt: true, stars: true, markers: true, flare: true,
    };

    this.tween = null;
    this._scenePositions = new Map();
    this._sunEvents = null;
    this._sunEventsKey = '';
  }

  async start() {
    this._initRenderer();
    await loadTextures((frac, name) => {
      $('loading-fill').style.width = `${(frac * 100).toFixed(0)}%`;
      $('loading-text').textContent = name;
    });

    this.world = new World(this.scene, this.camera);
    this.world.build();
    this.surface = new SurfaceView(this.scene, this.camera);
    this.flare = new LensFlare();

    this._initLabels();
    this._initUI();
    this._openingView();

    $('loading').classList.add('done');
    setTimeout(() => $('loading').remove(), 700);

    this.lastFrame = performance.now();
    // A throw inside the animation callback would otherwise stop three's loop
    // from rescheduling, freezing the whole scene with no obvious cause.
    this.renderer.setAnimationLoop(() => {
      try {
        this._frame();
      } catch (err) {
        if (!this._reportedError) {
          this._reportedError = true;
          console.error('frame error', err);
          this._toast(`Render error: ${err.message}`);
        }
      }
    });
  }

  // -------------------------------------------------------------- renderer

  _initRenderer() {
    const canvas = $('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    // Scene axes are the ecliptic J2000 frame, so +Z is the ecliptic north
    // pole rather than three.js' usual +Y up.
    // One scene unit is 1000 km, so near = 1e-7 is 10 cm: close enough to see
    // the ground at your feet in surface mode. The logarithmic depth buffer is
    // what makes a near:far ratio of 1e16 survivable.
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1e-7, 2e9);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -40, 14);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 1e-5;
    this.controls.maxDistance = 3e8;

    addEventListener('resize', () => this._resize());
    this._resize();
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ------------------------------------------------------------------ UI

  _initLabels() {
    this.labels = new Labels($('labels'), (key) => {
      this._selectBody(key);
      this._focusBody(key);
    });
    for (const [key, def] of this.catalogue) {
      this.labels.add(key, def.name,
        def.category === 'moon' ? 'moon' : def.category === 'small' ? 'small' : '');
    }
  }

  _initUI() {
    this._buildBodyList();

    // --- panels ---
    for (const btn of document.querySelectorAll('.collapse[data-target]')) {
      btn.addEventListener('click', () => {
        $(btn.dataset.target).classList.toggle('collapsed');
        this._syncRestoreTabs();
      });
    }
    this._makeRestoreTabs();

    // --- time ---
    const slider = $('time-slider');
    slider.addEventListener('input', () => {
      const f = Number(slider.value) / Number(slider.max);
      this.jd = this.centerJD + (f - 0.5) * 2 * this.span;
      this._syncClock();
    });
    // Browsers restore <select> state across a reload, so read the controls
    // rather than assuming they still hold their markup defaults.
    this.span = Number($('span-select').value);
    this.rate = Number($('rate-select').value);
    $('span-select').addEventListener('change', (e) => this._setSpan(Number(e.target.value)));
    $('rate-select').addEventListener('change', (e) => { this.rate = Number(e.target.value); });
    $('btn-play').addEventListener('click', () => this._setPlaying(!this.playing));
    $('btn-reverse').addEventListener('click', () => {
      this.direction *= -1;
      $('btn-reverse').classList.toggle('active', this.direction < 0);
    });
    $('btn-now').addEventListener('click', () => {
      this.jd = dateToJD(new Date());
      this.centerJD = this.jd;
      this._syncClock();
      this._syncSlider();
      this._syncTicks();
    });
    $('date-input').addEventListener('change', (e) => {
      const parsed = parseDate(e.target.value);
      if (parsed === null) { this._syncClock(); this._toast('Could not read that date'); return; }
      this.jd = parsed;
      this.centerJD = this.jd;
      this._syncSlider();
      this._syncTicks();
    });

    // --- display toggles ---
    const bind = (id, key) => {
      const el = $(id);
      el.checked = this.opts[key];
      el.addEventListener('change', () => { this.opts[key] = el.checked; });
    };
    bind('opt-orbits', 'orbits');
    bind('opt-labels', 'labels');
    bind('opt-moons', 'moons');
    bind('opt-small', 'small');
    bind('opt-belt', 'belt');
    bind('opt-stars', 'stars');
    bind('opt-markers', 'markers');
    bind('opt-flare', 'flare');

    $('opt-size').addEventListener('input', (e) => {
      const t = Number(e.target.value) / 100;
      // Log scale from true size up to 2000x, which is roughly what it takes
      // to see Mercury from across the inner system.
      this.sizeFactor = Math.pow(10, t * Math.log10(2000));
      $('size-val').textContent = this.sizeFactor < 1.05
        ? '1× (true)'
        : `${this.sizeFactor < 10 ? this.sizeFactor.toFixed(1) : Math.round(this.sizeFactor)}×`;
      this.world.setSizeFactor(this.sizeFactor);
    });

    $('opt-exposure').addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (v <= -99) { this.exposure = null; $('exposure-val').textContent = 'auto'; return; }
      this.exposure = Math.pow(10, v / 20);
      $('exposure-val').textContent = `${this.exposure.toFixed(2)}×`;
    });

    // --- view buttons ---
    $('btn-follow').addEventListener('click', () => this._focusBody(this.selected));
    $('btn-surface').addEventListener('click', () => {
      if (this.surface.active) this._flyFromSurface();
      else this._flyToSurface(this.selected);
    });
    $('btn-exit-surface').addEventListener('click', () => this._flyFromSurface());
    $('btn-face-sunrise').addEventListener('click', () => this._faceSunrise());

    // --- surface controls ---
    $('surface-preset').addEventListener('change', (e) => {
      const [lat, lon] = e.target.value.split(',').map(Number);
      this._setSurfaceInputs(lat, lon);
      this.surface.setLocation(lat, lon);
      this._sunEventsKey = '';
    });
    for (const id of ['surface-lat', 'surface-lon']) {
      $(id).addEventListener('change', () => {
        this.surface.setLocation(Number($('surface-lat').value) || 0, Number($('surface-lon').value) || 0);
        this._sunEventsKey = '';
      });
    }

    // --- search ---
    $('body-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const el of document.querySelectorAll('#body-list .body-item')) {
        el.hidden = !!q && !el.dataset.name.includes(q);
      }
      for (const el of document.querySelectorAll('#body-list .group-title')) {
        el.hidden = !!q;
      }
    });

    this._initPointer();
    this._initGizmo();
    $('help-close').addEventListener('click', () => { $('help').hidden = true; });
    $('help').addEventListener('click', (e) => {
      if (e.target === $('help')) $('help').hidden = true;
    });
    addEventListener('keydown', (e) => this._onKey(e));

    this._syncClock();
    this._syncSlider();
    this._syncTicks();
  }

  /**
   * Open on Earth at true scale. Every radius in the catalogue is the real
   * one, so the default size factor is 1 and nothing is exaggerated; the
   * slider is there for when you want to pick planets out from across the
   * system, not to make the default view lie.
   */
  _openingView() {
    this._selectBody('earth');
    this._focusBody('earth', true);
    this.camera.position.set(18, -21, 9).setLength(this._frameDistance('earth'));
    this.controls.target.set(0, 0, 0);
  }

  _makeRestoreTabs() {
    for (const side of ['left', 'right']) {
      const btn = document.createElement('button');
      btn.className = 'restore';
      btn.id = `restore-${side}`;
      btn.hidden = true;
      btn.textContent = side === 'left' ? '\u2192' : '\u2190';
      btn.addEventListener('click', () => {
        $(`panel-${side}`).classList.remove('collapsed');
        this._syncRestoreTabs();
      });
      document.body.appendChild(btn);
    }
  }

  _syncRestoreTabs() {
    for (const side of ['left', 'right']) {
      $(`restore-${side}`).hidden = !$(`panel-${side}`).classList.contains('collapsed');
    }
  }

  _buildBodyList() {
    const list = $('body-list');
    list.textContent = '';
    const groups = new Map();
    for (const [key, def] of this.catalogue) {
      if (!groups.has(def.group)) groups.set(def.group, []);
      groups.get(def.group).push([key, def]);
    }
    for (const groupName of GROUP_ORDER) {
      const items = groups.get(groupName);
      if (!items) continue;
      const h = document.createElement('div');
      h.className = 'group-title';
      h.textContent = groupName;
      list.appendChild(h);

      for (const [key, def] of items) {
        const btn = document.createElement('button');
        btn.className = `body-item${def.category === 'moon' ? ' indent' : ''}`;
        btn.dataset.key = key;
        btn.dataset.name = def.name.toLowerCase();
        btn.innerHTML =
          `<span class="swatch" style="background:#${new THREE.Color(def.color).getHexString()};` +
          `color:#${new THREE.Color(def.color).getHexString()}"></span>` +
          `<span class="nm"></span><span class="dist"></span>`;
        btn.querySelector('.nm').textContent = def.name;
        btn.addEventListener('click', () => {
          this._selectBody(key);
          this._focusBody(key);
        });
        list.appendChild(btn);
      }
    }
  }

  _initPointer() {
    const canvas = $('canvas');
    let dragging = false;
    let moved = 0;
    let lastX = 0, lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      // Always capture. Without it, releasing the button off-canvas never
      // delivers pointerup here, so `dragging` sticks and every later move
      // keeps turning the view with no button held.
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not captured */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      if (this.surface.active) {
        const k = (this.camera.fov / 55) * 0.0032;
        this.surface.yaw += dx * k;
        this.surface.pitch = THREE.MathUtils.clamp(
          this.surface.pitch - dy * k, -89.5 * DEG, 89.5 * DEG
        );
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved < 5) this._pickAt(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      if (!this.surface.active) return;
      e.preventDefault();
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov * (1 + Math.sign(e.deltaY) * 0.1), 3, 100);
      this.camera.updateProjectionMatrix();
    }, { passive: false });
  }

  /** Select whichever body projects nearest the click, within a small radius. */
  _pickAt(px, py) {
    let best = null;
    let bestD = 26;
    const v = new THREE.Vector3();
    for (const [key, p] of this._scenePositions) {
      if (!this._categoryVisible(this.catalogue.get(key).category, key)) continue;
      v.copy(p).project(this.camera);
      if (v.z < -1 || v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const y = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) { bestD = d; best = key; }
    }
    if (best) {
      this._selectBody(best);
      if (!this.surface.active) this._focusBody(best);
    }
  }

  _initGizmo() {
    this.gizmo = new DropGizmo({
      dock: $('gizmo-dock'),
      canvas: $('canvas'),
      getContext: () => (this.state ? {
        camera: this.camera,
        scenePositions: this._scenePositions,
        state: this.state,
        bodies: this.world.bodies,
        catalogue: this.catalogue,
        landable: LANDABLE,
      } : null),
      onDrop: (key, lat, lon) => {
        this._selectBody(key);
        if (this.surface.active) this._leaveSurfaceState();
        this._flyToSurface(key, lat, lon);
      },
    });
  }

  /** Move the clock by `steps` multiples of the current rate. */
  _stepTime(steps) {
    this.jd += (steps * this.rate) / 86400;
    if (Math.abs(this.jd - this.centerJD) > this.span) {
      this.centerJD = this.jd;
      this._syncTicks();
    }
    this._syncClock();
    this._syncSlider();
  }

  /** Move `delta` places through a <select>, clamped to its ends. */
  _cycleSelect(id, delta, onChange) {
    const sel = $(id);
    const next = Math.min(sel.options.length - 1, Math.max(0, sel.selectedIndex + delta));
    if (next === sel.selectedIndex) return;
    sel.selectedIndex = next;
    onChange(Number(sel.value));
    this._toast(`${id === 'rate-select' ? 'Rate' : 'Span'}: ${sel.options[next].text}`);
  }

  _onKey(e) {
    // e.target is only an Element for real key presses inside the document;
    // events dispatched at window have no matches().
    const el = e.target;
    if (el instanceof Element && el.matches('input, select, textarea, button')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case 'Escape':
        if (!$('help').hidden) $('help').hidden = true;
        else if (this.surface.active) this._flyFromSurface();
        return;
      case '?':
      case 'h':
      case 'H':
        $('help').hidden = !$('help').hidden;
        return;
      case 'ArrowLeft':
        e.preventDefault();
        this._stepTime(e.shiftKey ? -10 : -1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        this._stepTime(e.shiftKey ? 10 : 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        this._cycleSelect('rate-select', 1, (v) => { this.rate = v; });
        return;
      case 'ArrowDown':
        e.preventDefault();
        this._cycleSelect('rate-select', -1, (v) => { this.rate = v; });
        return;
      case '[':
        this._cycleSelect('span-select', -1, (v) => this._setSpan(v));
        return;
      case ']':
        this._cycleSelect('span-select', 1, (v) => this._setSpan(v));
        return;
      case 'r':
      case 'R':
        $('btn-reverse').click();
        return;
      case 'n':
      case 'N':
        $('btn-now').click();
        return;
      case 'l':
      case 'L':
        $('opt-labels').click();
        return;
      case 'o':
      case 'O':
        $('opt-orbits').click();
        return;
      default:
        break;
    }
    if (e.code === 'Space') { e.preventDefault(); this._setPlaying(!this.playing); }
  }

  _setSpan(days) {
    this.span = days;
    this.centerJD = this.jd;
    this._syncSlider();
    this._syncTicks();
  }

  // ------------------------------------------------------------- selection

  _selectBody(key) {
    this.selected = key;
    for (const el of document.querySelectorAll('#body-list .body-item')) {
      el.classList.toggle('selected', el.dataset.key === key);
    }
    this.labels.setSelected(key);
    const def = this.catalogue.get(key);
    $('info-name').textContent = def.name;
    $('info-blurb').textContent = def.blurb || '';
    $('info-blurb').hidden = !def.blurb;

    const facts = $('info-facts');
    facts.textContent = '';
    const rows = { ...(def.facts || {}) };
    if (def.radius) {
      // These are equatorial radii, and for the fast rotators the polar radius
      // is visibly different - Saturn's by nearly 6,000 km.
      const label = def.flattening ? 'Equatorial radius' : 'Mean radius';
      rows[label] = `${def.radius.toLocaleString('en-US')} km`;
      if (def.flattening) {
        rows['Polar radius'] =
          `${Math.round(def.radius * (1 - def.flattening)).toLocaleString('en-US')} km`;
        rows.Flattening = def.flattening.toFixed(5);
      }
      rows.Diameter = `${Math.round(def.radius * 2).toLocaleString('en-US')} km`;
    }
    if (def.mass) rows.Mass = fmt.mass(def.mass);
    if (def.gravity) rows.Gravity = `${def.gravity} m/s²`;
    if (def.tempC !== undefined) rows['Mean temp'] = `${def.tempC} °C`;
    for (const [k, v] of Object.entries(rows)) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      facts.append(dt, dd);
    }

    const landable = LANDABLE.includes(key);
    $('btn-surface').disabled = !landable;
    $('btn-surface').textContent = this.surface.active && this.surface.bodyKey === key
      ? 'Leave surface' : 'Stand on surface';
  }

  _frameDistance(key) {
    const def = this.catalogue.get(key);
    if (key === 'sun') return 3.2 * AU_KM * KM;
    return Math.max(def.radius * KM * 5.5, 1e-4);
  }

  _focusBody(key, immediate = false) {
    this.focus = key;
    const target = this._frameDistance(key);
    const dir = this.camera.position.clone();
    if (dir.lengthSq() < 1e-18) dir.set(0.3, -1, 0.35);
    dir.normalize();
    if (immediate) {
      this.camera.position.copy(dir.multiplyScalar(target));
      this.controls.target.set(0, 0, 0);
    } else {
      this.tween = { from: this.camera.position.length(), to: target, t: 0, dir };
    }
    this.controls.minDistance = Math.max(this.catalogue.get(key).radius * KM * 1.04, 1e-6);
  }

  // ------------------------------------------------------------- surface

  // ------------------------------------------------- landing and launching

  /**
   * Fly the camera down to a landing site, then hand over to surface mode.
   *
   * The descent itself is a swoop: the camera's direction from the planet's
   * centre slerps toward the site while its radius shrinks geometrically, so
   * it arcs over the limb instead of cutting through the planet. The last step
   * - swapping the whole-globe mesh for the local ground patch - cannot be
   * tweened, so a short fade covers it.
   */
  _flyToSurface(key, lat, lon) {
    if (this.flight) return;
    if (!LANDABLE.includes(key)) return;
    // Before the first frame there is no ephemeris state to aim at, so there
    // is nothing to fly along; land directly rather than doing nothing.
    if (!this.state) { this._enterSurface(key, lat, lon); return; }

    if (lat === undefined) {
      const marks = LANDMARKS[key] || [{ lat: 0, lon: 0 }];
      lat = marks[0].lat;
      lon = marks[0].lon;
    }
    const site = this._siteDirection(key, lat, lon);
    if (!site) { this._enterSurface(key, lat, lon); return; }

    this.focus = key;
    this.world.setOrigin(this.state.pos[key]);
    this.controls.enabled = false;
    this.tween = null;

    // Vantage point for the hand-over: low enough to feel like a landing,
    // high enough that the globe's tessellation still looks like a sphere.
    const vantage = (site.radius + Math.max(site.radius * 0.02, 25)) * KM;
    this.flight = {
      mode: 'land',
      key, lat, lon,
      t: 0,
      duration: 1.15,
      from: this.camera.position.clone(),
      toDir: site.dir.clone(),
      toRadius: vantage,
      target: site.dir.clone().multiplyScalar(site.radius * KM),
    };
  }

  /** Reverse of {@link _flyToSurface}: rise from the surface back to orbit. */
  _flyFromSurface() {
    if (this.flight || !this.surface.active) return;
    const key = this.surface.bodyKey;
    const site = this._siteDirection(key, this.surface.lat, this.surface.lon);

    this._leaveSurfaceState();
    this.focus = key;
    this.world.setOrigin(this.state.pos[key]);
    this.controls.enabled = false;

    const startRadius = (site.radius + Math.max(site.radius * 0.02, 25)) * KM;
    this.camera.position.copy(site.dir).multiplyScalar(startRadius);
    this.flight = {
      mode: 'launch',
      key,
      t: 0,
      duration: 1.0,
      from: this.camera.position.clone(),
      toDir: site.dir.clone().add(new THREE.Vector3(0.35, -0.5, 0.4)).normalize(),
      toRadius: this._frameDistance(key),
      target: site.dir.clone().multiplyScalar(site.radius * KM),
    };
  }

  /** Unit vector from a body's centre to a surface site, in scene axes. */
  _siteDirection(key, lat, lon) {
    const basis = this.state?.basis[key];
    const def = this.catalogue.get(key);
    if (!basis) return null;
    const n = surfaceNormal(lat, lon);
    const e = bodyToEcliptic(basis, n);
    return {
      dir: new THREE.Vector3(e.x, e.y, e.z).normalize(),
      radius: ellipsoidRadius(n, def.radius, def.flattening || 0),
    };
  }

  _updateFlight(dt) {
    const f = this.flight;
    f.t = Math.min(1, f.t + dt / f.duration);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2; // ease in-out cubic

    const fromDir = f.from.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(fromDir, f.toDir);
    const dir = fromDir.clone().applyQuaternion(
      new THREE.Quaternion().slerp(q, e)
    );
    // Geometric interpolation of radius, so the descent feels linear in the
    // orders of magnitude it crosses rather than in kilometres.
    const r = f.from.length() * Math.pow(f.toRadius / f.from.length(), e);
    this.camera.position.copy(dir).multiplyScalar(r);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(f.target.clone().multiplyScalar(e));
    this.controls.target.copy(f.target).multiplyScalar(e);

    // Fade out over the last slice of a landing, in over the first of a launch.
    const fade = f.mode === 'land'
      ? Math.max(0, (f.t - 0.82) / 0.18)
      : Math.max(0, 1 - f.t / 0.22);
    const el = $('fade');
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(1, fade));

    if (f.t < 1) return;
    this.flight = null;
    if (f.mode === 'land') {
      this._enterSurface(f.key, f.lat, f.lon);
      // Hand back to CSS for the fade up, so the new view arrives rather than
      // snapping in from black.
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.5s ease-out';
        el.style.opacity = '0';
      });
    } else {
      el.style.opacity = '0';
      this.controls.enabled = true;
      this.controls.target.set(0, 0, 0);
    }
  }

  /**
   * @param {string} key body to stand on
   * @param {number} [lat] landing site; defaults to the body's first landmark
   * @param {number} [lon]
   */
  _enterSurface(key, lat, lon) {
    const def = this.catalogue.get(key);
    if (!LANDABLE.includes(key)) return;

    const marks = LANDMARKS[key] || [{ name: 'Equator', lat: 0, lon: 0 }];
    const sel = $('surface-preset');
    sel.textContent = '';
    const dropped = lat !== undefined;
    if (dropped) {
      const o = document.createElement('option');
      o.value = `${lat},${lon}`;
      o.textContent = 'Dropped here';
      sel.appendChild(o);
    }
    for (const m of marks) {
      const o = document.createElement('option');
      o.value = `${m.lat},${m.lon}`;
      o.textContent = m.name;
      sel.appendChild(o);
    }
    const startLat = dropped ? lat : marks[0].lat;
    const startLon = dropped ? lon : marks[0].lon;
    this._setSurfaceInputs(startLat, startLon);
    $('surface-body').textContent = def.name;
    $('surface-kind').textContent = CLOUD_TOP.has(key)
      ? `cloud tops, ${eyeHeightKm(key)} km above the 1-bar level`
      : '';

    this.surface.enter(def, startLat, startLon);
    this.surface.yaw = 90 * DEG;
    this.surface.pitch = 3 * DEG;
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.controls.enabled = false;
    this._sunEventsKey = '';

    $('surface-hud').hidden = false;
    $('crosshair').hidden = false;
    $('btn-surface').textContent = 'Leave surface';
    this._buildCompass();
    this._faceSunrise();
  }

  _setSurfaceInputs(lat, lon) {
    $('surface-lat').value = Number(lat).toFixed(2);
    $('surface-lon').value = Number(lon).toFixed(2);
  }

  /** Tear down the surface view without moving the camera. */
  _leaveSurfaceState() {
    this.surface.exit();
    this.camera.fov = 55;
    this.camera.up.set(0, 0, 1);
    this.camera.updateProjectionMatrix();
    $('surface-hud').hidden = true;
    $('crosshair').hidden = true;
    $('btn-surface').textContent = 'Stand on surface';
  }

  _exitSurface() {
    const key = this.surface.bodyKey || this.focus;
    this._leaveSurfaceState();
    this.controls.enabled = true;
    this._focusBody(key, true);
  }

  /** Point the view at the azimuth where the Sun will next clear the horizon. */
  _faceSunrise() {
    if (!this.surface.active) return;
    const def = this.surface.def;
    const key = this.surface.bodyKey;
    const events = this._computeSunEvents(true);
    const t = events?.rise ?? this.jd;
    this.surface.yaw = sunAzimuthAt(t, key, this.surface.lat, this.surface.lon, def) * DEG;
    this.surface.pitch = 3 * DEG;
    if (events?.polar) {
      this._toast(events.up ? 'The Sun never sets here right now' : 'Polar night — the Sun stays down');
    }
  }

  /**
   * Sunrise and sunset are found by scanning the Sun's altitude and bisecting
   * the horizon crossings, which costs a few hundred ephemeris evaluations. So
   * the answer is cached until the simulation actually passes one of the
   * events it predicted - normally once per local day - with a wall-clock
   * floor to stop it thrashing when time is running fast.
   */
  _computeSunEvents(force = false) {
    if (!this.surface.active) return null;
    const key = this.surface.bodyKey;
    const site = `${key}|${this.surface.lat}|${this.surface.lon}`;
    const cache = this._sunEvents;
    const now = performance.now();

    if (!force && cache && site === this._sunEventsKey) {
      const next = [cache.rise, cache.set].filter((t) => t !== null);
      const horizon = next.length ? Math.min(...next) : cache.from + cache.solarDay;
      const stale = this.jd < cache.from || this.jd > horizon;
      if (!stale) return cache;
      if (now - (this._sunEventsAt || 0) < 250) return cache;
    }
    // Above roughly a month per second the events scroll past faster than
    // they can be computed, and the readout would be meaningless anyway.
    if (this.playing && Math.abs(this.rate) > 2.6e6 && cache && site === this._sunEventsKey) {
      return { ...cache, rise: null, set: null, tooFast: true };
    }

    this._sunEventsKey = site;
    this._sunEventsAt = now;

    // Tidally locked moons have no IAU rotation model here, but their spin
    // period is their orbital period about the primary by definition.
    const primary = this.catalogue.get(key).primary;
    const rotation = primary && key !== 'moon'
      ? SATELLITES[key].period
      : rotationPeriodDays(key);
    const heliocentricPeriod = orbitalPeriodDays(primary || key) ?? 365.25;
    const solarDay = solarDayLength(rotation, heliocentricPeriod);
    this._sunEvents = nextSunEvents(this.jd, key, this.surface.lat, this.surface.lon,
      this.surface.def, solarDay, this.surface.eyeHeight);
    this._sunEvents.solarDay = solarDay;
    this._sunEvents.from = this.jd;
    return this._sunEvents;
  }

  _buildCompass() {
    const el = $('compass');
    el.textContent = '';
    this.compassTicks = [];
    for (let a = 0; a < 360; a += 15) {
      const d = document.createElement('div');
      const cardinal = a % 90 === 0;
      d.className = `tick${cardinal ? ' card' : ''}`;
      d.textContent = cardinal ? ['N', 'E', 'S', 'W'][a / 90] : `${a}`;
      el.appendChild(d);
      this.compassTicks.push({ el: d, az: a });
    }
  }

  _updateCompass(lookAz) {
    if (!this.compassTicks) return;
    // fov is vertical; the compass spans the horizontal field.
    const halfFov = Math.atan(Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect) / DEG;
    const width = $('compass').clientWidth;
    for (const t of this.compassTicks) {
      let delta = ((t.az - lookAz + 540) % 360) - 180;
      const inView = Math.abs(delta) < halfFov;
      t.el.style.display = inView ? '' : 'none';
      if (inView) t.el.style.left = `${((delta / halfFov) * 0.5 + 0.5) * width}px`;
    }
  }

  // ---------------------------------------------------------------- clock

  _setPlaying(v) {
    this.playing = v;
    $('btn-play').innerHTML = v ? '&#10073;&#10073;' : '&#9654;';
    $('btn-play').classList.toggle('active', v);
  }

  _syncClock() {
    $('date-input').value = formatJD(this.jd).replace(' UTC', '');
    $('jd-readout').textContent = `JD ${this.jd.toFixed(5)} UTC`;
  }

  _syncSlider() {
    const s = $('time-slider');
    const f = (this.jd - this.centerJD) / (2 * this.span) + 0.5;
    s.value = String(Math.round(THREE.MathUtils.clamp(f, 0, 1) * Number(s.max)));
  }

  _syncTicks() {
    const el = $('time-ticks');
    el.textContent = '';
    for (let i = 0; i <= 4; i++) {
      const t = this.centerJD + (i / 4 - 0.5) * 2 * this.span;
      const span = document.createElement('span');
      span.textContent = formatJD(t, false).replace(' UTC', '').replace(/ \d\d:\d\d$/, (m) => (this.span < 6 ? m : ''));
      el.appendChild(span);
    }
  }

  _categoryVisible(category, key) {
    if (this.surface.active && key === this.surface.bodyKey) return false;
    if (category === 'moon') return this.opts.moons;
    if (category === 'small') return this.opts.small;
    return true;
  }

  // ---------------------------------------------------------------- frame

  _frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;

    if (this.playing) {
      this.jd += (dt * this.rate * this.direction) / 86400;
      if (Math.abs(this.jd - this.centerJD) > this.span) {
        this.centerJD = this.jd;
        this._syncTicks();
      }
      this._syncClock();
      this._syncSlider();
    }

    const state = computeState(this.jd);
    this.state = state;

    if (this.flight) {
      this.world.setOrigin(state.pos[this.flight.key]);
      this._updateFlight(dt);
    } else if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt * 2.2);
      const e = 1 - Math.pow(1 - this.tween.t, 3);
      const r = this.tween.from * Math.pow(this.tween.to / this.tween.from, e);
      this.camera.position.copy(this.tween.dir).multiplyScalar(r);
      this.controls.target.set(0, 0, 0);
      if (this.tween.t >= 1) this.tween = null;
    }

    if (!this.surface.active && !this.flight) this.controls.update();

    // Floating origin: surface mode recentres on the observer, everything else
    // on whatever the camera is orbiting. The surface view has to run first so
    // the world is drawn against the same origin in the same frame.
    let surfaceInfo = null;
    if (this.surface.active) {
      surfaceInfo = this.surface.update(state, this.world);
    } else if (!this.flight) {
      this.world.setOrigin(state.pos[this.focus] || state.pos.sun);
    }

    // Projection and view-space shading both read these, and the renderer
    // would not refresh them until after the world update.
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    // Standing on a world, everything below the local horizon is behind the
    // planet. The globe would occlude most of it, but glow markers and the
    // Sun's corona draw without depth testing, so they need culling by hand.
    const occluded = surfaceInfo
      ? (key, p) => {
        if (key === this.surface.bodyKey) return true;
        const d = sub(p, surfaceInfo.observer);
        const l = len(d) || 1;
        const sinAlt = (d.x * surfaceInfo.up.x + d.y * surfaceInfo.up.y + d.z * surfaceInfo.up.z) / l;
        return sinAlt < Math.sin(surfaceInfo.horizonDip);
      }
      : () => false;

    this.world.update(state, {
      categoryVisible: (c, k) => this._categoryVisible(c, k),
      occluded,
      standingOn: this.surface.active ? this.surface.bodyKey : null,
      horizonClip: this._horizonClip(),
      showOrbits: this.opts.orbits && !this.surface.active,
      showMoons: this.opts.moons,
      showSmall: this.opts.small,
      showBelt: this.opts.belt && !this.surface.active,
      showStars: this.opts.stars,
      showMarkers: this.opts.markers,
      viewportHeight: innerHeight,
      satelliteOrbit: (key, st) => (key === 'moon'
        ? moonOrbitPath(st.jdTT)
        : satelliteOrbitPath(key, st.jdTT, auPositions(st))),
    });

    this._lastSurfaceInfo = surfaceInfo;
    if (surfaceInfo) {
      this._updateSurfaceHUD(state, surfaceInfo);
      // The corona sprite ignores depth, so fade it out as the Sun sinks
      // rather than letting it blink off behind the horizon.
      const corona = this.world.bodies.get('sun').corona;
      corona.material.opacity = THREE.MathUtils.smoothstep(surfaceInfo.sunAltitude, -1.2, 0.6);
    } else {
      this.world.bodies.get('sun').corona.material.opacity = 1;
    }

    this._updateExposure(state, dt);
    this._collectScenePositions(state);
    this.labels.update(this._scenePositions, this.camera, {
      enabled: this.opts.labels,
      width: innerWidth,
      height: innerHeight,
      isVisible: (k) => this._categoryVisible(this.catalogue.get(k).category, k) &&
        !occluded(k, state.pos[k]),
    });
    this._updateInfoPanel(state);

    this._updateFlare(state, surfaceInfo);
    this.renderer.render(this.scene, this.camera);
    this.flare.render(this.renderer);
  }

  /**
   * Lens flare is a lens artefact, so it is limited to the surface view where
   * there is a notional camera standing somewhere. Its strength follows the
   * air the light is coming through: full on Earth, muted in Mars' thin dust,
   * and weak on airless worlds where there is nothing to scatter.
   */
  _updateFlare(state, surfaceInfo) {
    if (!surfaceInfo || !this.opts.flare) { this.flare.hide(); return; }
    const def = this.surface.def;
    const sky = def.atmosphere?.sky;
    const auRel = Math.max(len(state.pos[this.surface.bodyKey]) / AU_KM, 0.3);
    this.flare.update(this.world.toScene(state.pos.sun, new THREE.Vector3()), this.camera, {
      sunAltitude: surfaceInfo.sunAltitude,
      // Inverse-square dimming, softened: a flare at Neptune should be faint
      // but not invisible, and the auto exposure has already lifted the scene.
      strength: (def.atmosphere ? 1 : 0.45) / Math.pow(auRel, 0.9),
      tint: sky?.tint,
    });
  }

  /**
   * The observer's horizon plane in body-fixed scene units, so a ringed planet
   * you are standing on can clip away the half of its rings that is behind it.
   */
  _horizonClip() {
    if (!this.surface.active) return null;
    const def = this.surface.def;
    const n = surfaceNormal(this.surface.lat, this.surface.lon);
    const r = ellipsoidRadius(n, def.radius, def.flattening || 0) + this.surface.eyeHeight;
    return {
      point: { x: n.x * r * KM, y: n.y * r * KM, z: n.z * r * KM },
      normal: n,
    };
  }

  _collectScenePositions(state) {
    for (const key of this.catalogue.keys()) {
      const p = state.pos[key];
      if (!p) continue;
      let v = this._scenePositions.get(key);
      if (!v) { v = new THREE.Vector3(); this._scenePositions.set(key, v); }
      this.world.toScene(p, v);
    }
  }

  /**
   * Sunlight falls off as 1/r², so a view at Neptune needs roughly 900 times
   * the exposure of one at Earth. Track the focus body's heliocentric distance
   * unless the user has taken manual control.
   */
  _updateExposure(state, dt) {
    const key = this.surface.active ? this.surface.bodyKey : this.focus;
    const r = key === 'sun'
      ? 1
      : Math.max(len(state.pos[key] || { x: AU_KM, y: 0, z: 0 }) / AU_KM, 0.3);
    const target = this.exposure ?? THREE.MathUtils.clamp(BASE_EXPOSURE * r * r, 1, 7000);
    this.autoExposure += (target - this.autoExposure) * Math.min(1, dt * 3);
    this.renderer.toneMappingExposure = this.autoExposure;

    // Daylight drowns the stars out. Fade the sky sphere with the Sun's
    // altitude when standing under an atmosphere; on an airless world the
    // stars stay out all day, as they really do.
    let starBrightness = 1;
    if (this.surface.active && this._lastSurfaceInfo) {
      starBrightness = this.surface.def?.atmosphere
        ? 1 - THREE.MathUtils.smoothstep(this._lastSurfaceInfo.sunAltitude, -12, -1)
        : 1;
    }
    this.world.setSkyBrightness(starBrightness);
  }

  _updateSurfaceHUD(state, info) {
    const key = this.surface.bodyKey;
    $('surface-coords').textContent = fmt.latLon(this.surface.lat, this.surface.lon);
    $('ro-lst').textContent = fmt.clock(localSolarTime(state, key, this.surface.lon));
    $('ro-alt').textContent = fmt.angle(info.sunAltitude);
    $('ro-az').textContent = `${info.sunAzimuth.toFixed(1)}° ${fmt.compassPoint(info.sunAzimuth)}`;
    $('ro-look').textContent =
      `${fmt.compassPoint(info.lookAzimuth)} ${info.lookAzimuth.toFixed(0)}°  alt ${fmt.angle(info.lookAltitude, 0)}`;

    const events = this._computeSunEvents();
    const stamp = (t) => (t === null || t === undefined ? '—' : formatJD(t, false).replace(' UTC', ''));
    $('ro-rise').textContent = events?.polar ? 'never' : stamp(events?.rise);
    $('ro-set').textContent = events?.polar ? 'never' : stamp(events?.set);

    this._updateCompass(info.lookAzimuth);
  }

  _updateInfoPanel(state) {
    const key = this.selected;
    const geo = bodyGeometry(state, key);
    const dl = $('info-live');
    if (!geo) { dl.textContent = ''; return; }

    const def = this.catalogue.get(key);
    const rows = [];
    if (key === 'sun') {
      rows.push(['Distance from Earth', fmt.distance(len(sub(state.pos.sun, state.pos.earth)))]);
    } else {
      rows.push(['Distance from Sun', fmt.distance(geo.rSun)]);
      if (key !== 'earth') {
        rows.push(['Distance from Earth', fmt.distance(geo.rEarth)]);
        rows.push(['Illuminated', `${(geo.phase * 100).toFixed(1)}%`]);
      }
      rows.push(['Orbital speed', `${geo.speed.toFixed(2)} km/s`]);
    }

    // Angular diameter is the honest check on whether a body is the right
    // size: the Sun must subtend 0.533 degrees from Earth, the Moon 0.518.
    const observer = this.surface.active ? this.surface.bodyKey : 'earth';
    if (key !== observer) {
      const range = len(sub(state.pos[key], state.pos[observer]));
      if (range > 0) {
        const arcsec = 2 * Math.atan(def.radius / range) * (648000 / Math.PI);
        rows.push([`Apparent size from ${this.catalogue.get(observer).name}`,
          fmt.angularSize(arcsec)]);
      }
    }

    const subSolar = subSolarPoint(state, key);
    if (subSolar) rows.push(['Sub-solar point', fmt.latLon(subSolar.lat, subSolar.lon)]);
    const rot = rotationPeriodDays(key);
    if (rot) rows.push(['Sidereal rotation', fmt.duration(rot)]);
    if (state.vel[key] && def.category === 'planet') {
      rows.push(['Axial tilt',
        `${axialTilt(key, state.jdTT, orbitNormalOf(state.pos[key], state.vel[key])).toFixed(2)}°`]);
    }
    if (def.category === 'planet' && PLANETS[key]) {
      rows.push(['Orbital period', fmt.duration(orbitalPeriodDays(key))]);
    } else if (def.category === 'small') {
      rows.push(['Orbital period', fmt.duration(smallBodyPeriod(key))]);
    }

    dl.textContent = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }

    // Distances in the body list, so the sidebar doubles as a range readout.
    for (const el of document.querySelectorAll('#body-list .body-item')) {
      const k = el.dataset.key;
      const p = state.pos[k];
      el.querySelector('.dist').textContent =
        p && k !== 'sun' ? fmt.shortDistance(len(p)) : '';
    }
  }

  _toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
}

/** Heliocentric positions in au, the form the Galilean theory expects. */
function auPositions(state) {
  const out = {};
  for (const k of ['jupiter', 'earth', 'saturn', 'uranus', 'neptune', 'mars', 'pluto']) {
    const p = state.pos[k];
    out[k] = { x: p.x / AU_KM, y: p.y / AU_KM, z: p.z / AU_KM };
  }
  return out;
}

/** One sidereal month of the real lunar orbit, relative to the Earth. */
function moonOrbitPath(jdTT, segments = 192) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(moonGeocentricKm(jdTT + (i / segments) * 27.321661));
  }
  return pts;
}

/** Accepts `YYYY-MM-DD HH:MM[:SS]`, ISO strings, or a bare `JD 2451545`. */
function parseDate(text) {
  const s = text.trim();
  const jdMatch = s.match(/^jd\s*([0-9.]+)$/i);
  if (jdMatch) return Number(jdMatch[1]);
  const iso = s.replace(' ', 'T');
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : dateToJD(d);
}

const app = new App();
// Exposed deliberately: the console is the quickest way to inspect a frame's
// ephemeris state or drive the view from a script.
window.solarSystem = app;
app.start().catch((err) => {
  console.error(err);
  $('loading-text').textContent = `failed: ${err.message}`;
});

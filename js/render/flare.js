// Lens flare for the surface view.
//
// This is unapologetically a camera artefact rather than something an eye
// would see, which is why it is confined to surface mode and driven entirely
// by where the Sun actually is: it tracks the real screen-space position of
// the solar disc, fades as the Sun approaches the horizon, and dies the
// moment it sets. Nothing here feeds back into the simulation.
//
// Drawn as a single additive full-screen quad after the main pass, so it
// composites over the tone-mapped image the way real flare does - added by the
// lens, not lit by the scene.

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const FRAG = /* glsl */`
  uniform vec2 uSun;        // sun position in NDC
  uniform float uAspect;
  uniform float uIntensity;
  uniform vec3 uTint;
  varying vec2 vUv;

  // Aspect-corrected coordinates so blobs stay circular.
  vec2 fix(vec2 p) { return vec2(p.x * uAspect, p.y); }

  float blob(vec2 p, vec2 c, float r) {
    float d = length(p - c) / r;
    return exp(-d * d * 4.0);
  }

  // A thin bright ring, the classic ghost of an iris edge.
  float ring(vec2 p, vec2 c, float r, float w) {
    float d = abs(length(p - c) - r) / w;
    return exp(-d * d);
  }

  void main() {
    if (uIntensity <= 0.001) discard;

    vec2 p = fix(vUv * 2.0 - 1.0);
    vec2 s = fix(uSun);
    vec2 axis = -s;                    // ghosts march through the screen centre
    float d = length(p - s);
    vec3 col = vec3(0.0);

    // Core bloom and the wide veiling glare around it. The broad term is kept
    // low deliberately: too much of it lifts the whole sky and flattens the
    // scattering gradient that the sky model works hard to get right.
    col += uTint * 1.00 * exp(-d * d * 260.0);
    col += uTint * 0.26 * exp(-d * d * 16.0);
    col += uTint * 0.05 * exp(-d * 2.2);

    // Six-bladed diaphragm starburst.
    float a = atan(p.y - s.y, p.x - s.x);
    float spikes = pow(abs(cos(a * 3.0)), 12.0) * 0.6
                 + pow(abs(cos(a * 3.0 + 0.5236)), 12.0) * 0.4;
    col += uTint * 0.55 * spikes * exp(-d * 5.0);

    // Anamorphic horizontal streak, tinted cool the way coated glass does it.
    float streak = exp(-pow((p.y - s.y) * 120.0, 2.0)) * exp(-abs(p.x - s.x) * 2.0);
    col += vec3(0.45, 0.62, 1.0) * 0.45 * streak;

    // Ghosts: scaled reflections along the sun-to-centre axis.
    col += vec3(0.35, 0.75, 0.55) * 0.16 * blob(p, s + axis * 0.30, 0.055);
    col += vec3(0.95, 0.55, 0.25) * 0.13 * blob(p, s + axis * 0.62, 0.032);
    col += vec3(0.35, 0.45, 1.00) * 0.10 * blob(p, s + axis * 0.95, 0.075);
    col += vec3(1.00, 0.85, 0.45) * 0.09 * blob(p, s + axis * 1.35, 0.026);
    col += vec3(0.55, 0.90, 0.85) * 0.07 * blob(p, s + axis * 1.72, 0.048);
    col += vec3(0.90, 0.40, 0.55) * 0.12 * ring(p, s + axis * 1.15, 0.085, 0.020);
    col += vec3(0.40, 0.80, 1.00) * 0.09 * ring(p, s + axis * 2.05, 0.130, 0.030);

    gl_FragColor = vec4(col * uIntensity, 1.0);
  }`;

export class LensFlare {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uIntensity: { value: 0 },
        uTint: { value: new THREE.Color(1, 0.96, 0.88) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.enabled = false;
  }

  /**
   * @param {THREE.Vector3} sunScene the Sun's position in scene space
   * @param {THREE.Camera} camera
   * @param {object} opts
   * @param {number} opts.sunAltitude degrees above the local horizon
   * @param {number} opts.strength 0-1 overall scaling (atmosphere, exposure)
   * @param {number[]} [opts.tint]
   */
  update(sunScene, camera, { sunAltitude, strength = 1, tint }) {
    const ndc = sunScene.clone().project(camera);
    const behind = ndc.z < -1 || ndc.z > 1;

    // Off-screen flare still throws light into the lens, but only just; fade
    // it out past the frame edge rather than popping.
    const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    const onScreen = 1 - smoothstep(edge, 1.0, 1.9);
    // Below the horizon the disc is occluded, so the flare must go with it.
    const above = smoothstep(sunAltitude, -0.9, 0.5);

    const intensity = behind ? 0 : onScreen * above * strength;
    this.material.uniforms.uSun.value.set(ndc.x, ndc.y);
    this.material.uniforms.uAspect.value = camera.aspect || 1;
    this.material.uniforms.uIntensity.value = intensity;
    if (tint) this.material.uniforms.uTint.value.setRGB(tint[0], tint[1], tint[2]);
    this.enabled = intensity > 0.001;
  }

  render(renderer) {
    if (!this.enabled) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }

  hide() {
    this.enabled = false;
    this.material.uniforms.uIntensity.value = 0;
  }
}

function smoothstep(x, edge0, edge1) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

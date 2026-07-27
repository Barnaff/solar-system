import * as THREE from 'three';

/** HTML labels tracked against 3-D positions, projected once per frame. */
export class Labels {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.entries = new Map();
    this._v = new THREE.Vector3();
  }

  add(key, text, className = '') {
    const el = document.createElement('div');
    el.className = `label ${className}`.trim();
    el.textContent = text;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onSelect(key);
    });
    this.container.appendChild(el);
    this.entries.set(key, { el, visible: false });
  }

  setSelected(key) {
    for (const [k, entry] of this.entries) entry.el.classList.toggle('selected', k === key);
  }

  /**
   * @param positions Map of key -> THREE.Vector3 in scene space
   * @param camera
   * @param opts {{enabled:boolean, width:number, height:number, isVisible:(k:string)=>boolean}}
   */
  update(positions, camera, opts) {
    const { width, height } = opts;
    for (const [key, entry] of this.entries) {
      const p = positions.get(key);
      const show = opts.enabled && p && opts.isVisible(key);
      if (!show) {
        if (entry.visible) { entry.el.style.display = 'none'; entry.visible = false; }
        continue;
      }
      this._v.copy(p).project(camera);
      // z outside [-1, 1] means behind the camera or past the far plane.
      const onScreen = this._v.z > -1 && this._v.z < 1 &&
        this._v.x > -1.15 && this._v.x < 1.15 && this._v.y > -1.15 && this._v.y < 1.15;
      if (!onScreen) {
        if (entry.visible) { entry.el.style.display = 'none'; entry.visible = false; }
        continue;
      }
      const x = (this._v.x * 0.5 + 0.5) * width;
      const y = (-this._v.y * 0.5 + 0.5) * height;
      entry.el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (!entry.visible) { entry.el.style.display = ''; entry.visible = true; }
    }
  }
}

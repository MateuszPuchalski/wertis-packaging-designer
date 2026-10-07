// The preview in the middle: Design (editable, with dieline and guides), Proof and Mockup
// tabs, zoom, and on the Design tab click-to-select, drag-to-move and corner handles to
// resize the window, logos, label and marks.
import { h } from './dom.js';
import { renderSheet } from '../render/sheet.js';
import { renderProof } from '../render/proof.js';
import { packFaces } from '../render/faces.js';
import { SCENES, maxCount, scenesFor } from '../three/scenes.js';
import { PRODUCTS } from '../three/products.js';
import { FILMS } from '../three/softPouch.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export class Stage {
  constructor(root, { store, env, onSelect, renderMockup }) {
    this.store = store;
    this.env = env;
    this.onSelect = onSelect;
    this.renderMockup = renderMockup;
    this.tab = 'design';
    this.zoom = null; // null = fit; else px per mm
    this.show = { dieline: true, guides: true };
    this.selected = null;
    this.hits = [];
    this.geo = null;
    this.drag = null;
    this.pending = false;

    const tab = (id, label) => h('button', { class: 'tab', role: 'tab', dataset: { tab: id }, onclick: () => this.setTab(id) }, label);
    this.tabs = [tab('design', 'Design'), tab('proof', 'Proof'), tab('mockup', 'Mockup'), tab('3d', '3D')];
    this.zoomLabel = h('span', { class: 'zoom-lbl', title: 'Size on screen compared with the real size' }, '');
    const toggle = (key, label) => {
      const cb = h('input', { type: 'checkbox', checked: true, onchange: () => { this.show[key] = cb.checked; this.schedule(); } });
      return h('label', { class: 'toggle' }, cb, label);
    };
    this.toolsDesign = h('span', { class: 'tools-design' }, toggle('dieline', 'Dieline'), toggle('guides', 'Guides'));
    // 3D: scene, how many packs, drop again, push, snapshot.
    this.sceneSel = h('select', { id: 'scene3d', 'aria-label': '3D scene', onchange: () => { this.view3d?.setScene(this.sceneSel.value); this.syncCount(); } });
    this.countIn = h('input', { type: 'number', id: 'count3d', min: 1, max: 40, value: 6, 'aria-label': 'How many', onchange: () => { this.syncCount(); this.view3d?.setCount(Number(this.countIn.value)); } });
    // What is in the pouch: stored in the design, so the project remembers it.
    this.productSel = h('select', { id: 'product3d', 'aria-label': 'Part in the pouch', title: 'The part in the pouch, at its real size',
      onchange: () => { this.store.set(['mockup', 'product3d'], this.productSel.value); this.store.settle(); } },
    Object.entries(PRODUCTS).map(([k, p]) => h('option', { value: k }, p.label)));
    // The pouch's film, from the laminates zip pouches are made of (stiffer with more PE).
    this.filmSel = h('select', { id: 'film3d', 'aria-label': 'Pouch film', title: 'The laminate the pouch is made of: how stiff it is',
      onchange: () => { this.store.set(['mockup', 'film3d'], this.filmSel.value); this.store.settle(); } },
    Object.entries(FILMS).map(([k, f]) => h('option', { value: k }, `${f.label} (${f.thickness} µm)`)));
    this.tools3d = h('span', { class: 'tools-3d', hidden: true }, this.sceneSel, this.productSel, this.filmSel,
      h('label', { class: 'toggle' }, 'Packs', this.countIn),
      h('button', { class: 'secondary tiny', id: 'again3d', onclick: () => this.view3d?.again() }, 'Drop again'),
      h('button', { class: 'secondary tiny', id: 'push3d', onclick: () => this.view3d?.push() }, 'Push'),
      h('button', { class: 'secondary tiny', id: 'png3d', onclick: async () => { const b = await this.view3d?.snapshot(); if (b) this.onSnapshot?.(b); } }, 'Save PNG'));
    this.toolbar = h('div', { class: 'stage-bar' },
      h('div', { class: 'tabs', role: 'tablist' }, this.tabs),
      this.toolsDesign, this.tools3d,
      this.zoomBox = h('div', { class: 'zoom' },
        h('button', { class: 'ghost tiny', title: 'Zoom out', onclick: () => this.zoomBy(1 / 1.25) }, '−'),
        this.zoomLabel,
        h('button', { class: 'ghost tiny', title: 'Zoom in', onclick: () => this.zoomBy(1.25) }, '+'),
        h('button', { class: 'ghost tiny', title: 'Fit to the window', onclick: () => { this.zoom = null; this.schedule(); } }, 'Fit view')));
    this.canvas = h('div', { class: 'canvas' });
    this.root3d = h('div', { class: 'view3d', hidden: true });
    this.viewport = h('div', { class: 'viewport', tabindex: 0 }, this.canvas, this.root3d);
    root.append(this.toolbar, this.viewport);

    this.viewport.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', () => this.pointerUp());
    new ResizeObserver(() => { if (this.zoom === null) this.schedule(); }).observe(this.viewport);
    this.updateTabs();
  }

  setTab(tab) {
    if (this.tab === '3d' && tab !== '3d') this.view3d?.stop();
    this.tab = tab;
    this.zoom = null;
    this.updateTabs();
    this.schedule();
  }

  updateTabs() {
    for (const t of this.tabs) t.setAttribute('aria-selected', String(t.dataset.tab === this.tab));
    this.toolsDesign.hidden = this.tab !== 'design';
    this.tools3d.hidden = this.tab !== '3d';
    this.canvas.hidden = this.tab === '3d';
    this.root3d.hidden = this.tab !== '3d';
    this.zoomBox.hidden = this.tab === '3d';
  }

  syncCount() {
    const max = maxCount(this.sceneSel.value, this.view3d?.pack?.kind ?? this.kind3d);
    this.countIn.max = max;
    if (Number(this.countIn.value) > max) this.countIn.value = max;
  }

  // The 3D view loads three.js on first use and rebuilds its textures a moment after the
  // design stops changing.
  async render3d(design) {
    if (!this.view3d) {
      const { View3D } = await import('../three/view3d.js');
      this.view3d ??= new View3D(this.root3d);
    }
    this.view3d.start();
    if (design === this.design3d) return;
    this.design3d = design;
    clearTimeout(this.timer3d);
    this.timer3d = setTimeout(async () => {
      const pack = packFaces(design, this.env);
      this.productSel.hidden = this.filmSel.hidden = pack.kind === 'box';
      this.kind3d = pack.kind;
      this.productSel.value = design.mockup?.product3d ?? 'none';
      this.filmSel.value = design.mockup?.film3d ?? 'heavy';
      const scenes = scenesFor(pack.kind);
      const sig = scenes.join('|');
      if (this.sceneSel.dataset.sig !== sig) {
        this.sceneSel.replaceChildren(...scenes.map((k) => h('option', { value: k }, SCENES[k].label)));
        this.sceneSel.dataset.sig = sig;
      }
      this.view3d.sceneName = scenes.includes(this.sceneSel.value) ? this.sceneSel.value : scenes[0];
      this.sceneSel.value = this.view3d.sceneName;
      this.syncCount();
      this.view3d.count = Number(this.countIn.value);
      await this.view3d.setPack(pack, design.mockup?.background);
      this.root3d.dataset.ready = '1';
    }, this.view3d.pack ? 350 : 0);
  }

  zoomBy(f) {
    this.zoom = Math.min(40, Math.max(0.2, (this.zoom ?? this.fitPpm ?? 2) * f));
    this.schedule();
  }

  select(id) {
    this.selected = id;
    this.drawSelection();
  }

  schedule() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.render();
    });
  }

  render() {
    const design = this.store.get();
    if (this.tab === '3d') {
      this.render3d(design);
      return;
    }
    let svg, box;
    if (this.tab === 'design') {
      const r = renderSheet(design, this.env, { mode: 'design', margin: 14, dieline: this.show.dieline, guides: this.show.guides });
      this.hits = r.hits;
      this.geo = r.geo;
      svg = r.svg;
      box = r.box;
    } else if (this.tab === 'proof') {
      const r = renderProof(design, this.env, { page: design.proof.page ?? 'a3' });
      svg = r.svg;
      box = { w: r.w, h: r.h };
    } else {
      const r = this.renderMockup(design);
      svg = r.svg;
      box = r.box;
    }
    const vw = this.viewport.clientWidth - 48, vh = this.viewport.clientHeight - 48;
    this.fitPpm = Math.max(0.2, Math.min(vw / box.w, vh / box.h));
    const ppm = this.zoom ?? this.fitPpm;
    // 100 % = real size on a 96 dpi screen.
    this.zoomLabel.textContent = `${Math.round((ppm / (96 / 25.4)) * 100)} %`;
    this.canvas.innerHTML = svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${Math.round(box.w * ppm)}" height="${Math.round(box.h * ppm)}"`);
    this.svg = this.canvas.firstElementChild;
    if (this.tab === 'design') {
      for (const hit of this.hits) if (hit.movable) this.svg.querySelectorAll(`[data-el="${hit.id}"]`).forEach((g) => g.classList.add('movable'));
      this.drawSelection();
    }
  }

  hit(id) {
    return this.hits.find((x) => x.id === id) ?? null;
  }

  panelOf(hit) {
    return this.geo?.panels.find((p) => p.id === hit.panel) ?? null;
  }

  drawSelection() {
    if (!this.svg || this.tab !== 'design') return;
    this.svg.querySelector('#selection')?.remove();
    const hit = this.selected && this.hit(this.selected);
    if (!hit) return;
    const g = document.createElementNS(SVGNS, 'g');
    g.id = 'selection';
    const ppm = this.zoom ?? this.fitPpm;
    const px = 1 / ppm; // one screen pixel in mm
    const { x, y, w, h: hh } = hit.box;
    const rect = document.createElementNS(SVGNS, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: hh, fill: 'none', stroke: '#0a84ff', 'stroke-width': 1.5 * px, 'stroke-dasharray': `${4 * px} ${3 * px}`, 'pointer-events': 'none' })) rect.setAttribute(k, v);
    g.append(rect);
    if (hit.resizable) {
      const s = 9 * px;
      for (const [corner, cx, cy] of [['nw', x, y], ['ne', x + w, y], ['sw', x, y + hh], ['se', x + w, y + hh]]) {
        const hd = document.createElementNS(SVGNS, 'rect');
        for (const [k, v] of Object.entries({ x: cx - s / 2, y: cy - s / 2, width: s, height: s, fill: '#ffffff', stroke: '#0a84ff', 'stroke-width': 1.5 * px, class: `handle ${corner}` })) hd.setAttribute(k, v);
        hd.dataset.handle = corner;
        g.append(hd);
      }
    }
    this.svg.append(g);
  }

  toMm(e) {
    const m = this.svg.getScreenCTM().inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  pointerDown(e) {
    if (this.tab !== 'design' || !this.svg || e.button !== 0) return;
    const handle = e.target.closest?.('[data-handle]');
    const target = handle ? null : e.target.closest?.('[data-el]');
    const id = handle ? this.selected : target?.dataset.el ?? null;
    if (!handle) {
      this.selected = id;
      this.onSelect(id);
      this.drawSelection();
    }
    const hit = id && this.hit(id);
    if (!hit || !(handle ? hit.resizable : hit.movable)) return;
    e.preventDefault();
    this.viewport.focus({ preventScroll: true });
    this.drag = { id, mode: handle ? handle.dataset.handle : 'move', start: this.toMm(e), box: { ...hit.box }, panel: this.panelOf(hit), keepAspect: hit.keepAspect, ctm: this.svg.getScreenCTM().inverse() };
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(d.ctm);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    const P = d.panel;
    let b = { ...d.box };
    if (d.mode === 'move') {
      b.x = clamp(snap(b.x + dx), P.x, P.x + P.w - b.w);
      b.y = clamp(snap(b.y + dy), P.y, P.y + P.h - b.h);
    } else {
      const left = d.mode.includes('w'), top = d.mode.includes('n');
      let w = Math.max(5, d.box.w + (left ? -dx : dx));
      let hh = Math.max(5, d.box.h + (top ? -dy : dy));
      if (d.keepAspect) {
        const k = Math.max(w / d.box.w, hh / d.box.h);
        w = d.box.w * k;
        hh = d.box.h * k;
      }
      w = Math.min(snap(w), P.w);
      hh = Math.min(snap(hh), P.h);
      b = { x: left ? d.box.x + d.box.w - w : d.box.x, y: top ? d.box.y + d.box.h - hh : d.box.y, w, h: hh };
      b.x = clamp(b.x, P.x, P.x + P.w - b.w);
      b.y = clamp(b.y, P.y, P.y + P.h - b.h);
    }
    this.store.set(['layout', d.id], { x: (b.x - P.x) / P.w, y: (b.y - P.y) / P.h, w: b.w / P.w, h: b.h / P.h }, { coalesce: `drag-${d.id}` });
  }

  pointerUp() {
    if (!this.drag) return;
    this.drag = null;
    this.store.settle();
  }

  // Arrow keys: 1 mm (10 with Shift).
  nudge(dx, dy) {
    const hit = this.selected && this.hit(this.selected);
    if (!hit?.movable) return false;
    const P = this.panelOf(hit);
    const b = hit.box;
    const x = clamp(b.x + dx, P.x, P.x + P.w - b.w), y = clamp(b.y + dy, P.y, P.y + P.h - b.h);
    this.store.set(['layout', hit.id], { x: (x - P.x) / P.w, y: (y - P.y) / P.h, w: b.w / P.w, h: b.h / P.h }, { coalesce: `nudge-${hit.id}` });
    return true;
  }
}

function snap(v) {
  return Math.round(v * 2) / 2;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

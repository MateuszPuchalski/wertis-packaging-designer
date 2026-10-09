// The preview in the middle: Design (editable, with dieline and guides), Proof, Mockup and
// 3D tabs. On the Design tab: click to select, drag to move with snapping (Alt: none), pull
// a corner to resize, right-click for more; rulers along the edges. On every flat tab:
// Ctrl + wheel zooms at the pointer, Space + drag or the middle button pans, + − 0 1 zoom.
import { h } from './dom.js';
import { icon } from './icons.js';
import { contextMenu } from './menu.js';
import { Rulers } from './rulers.js';
import { drawHover, drawSelection, drawGuides } from './overlay.js';
import { statusBar } from './statusBar.js';
import { elementMenuEntries } from './elementMenu.js';
import { getPref, setPref } from './prefs.js';
import { t, label, fmtNum } from '../i18n/index.js';
import { renderSheet } from '../render/sheet.js';
import { renderProof } from '../render/proof.js';
import { packFaces } from '../render/faces.js';
import { SCENES, maxCount, scenesFor } from '../three/scenes.js';
import { PRODUCTS } from '../three/products.js';
import { FILMS } from '../three/softPouch.js';
import { snapTargets, snapMove, snapResize } from '../edit/snap.js';
import { fitPpm, clampPpm, wheelFactor, anchorScroll, percent, ppmForPercent, stepZoom } from '../edit/view.js';
import { hide } from '../edit/actions.js';

const SNAP_PX = 6; // how near (screen px) an edge has to come to catch on a line
const mm1 = (v) => fmtNum(Math.round(v * 10) / 10);

export class Stage {
  constructor(root, { store, env, onSelect, renderMockup, editText }) {
    this.store = store;
    this.env = env;
    this.onSelect = onSelect;
    this.renderMockup = renderMockup;
    this.editText = editText;
    this.tab = 'design';
    this.zoom = null; // null = fit; else px per mm
    this.fitPpm = null;
    this.show = { dieline: getPref('dieline'), guides: getPref('guides'), rulers: getPref('rulers'), snap: getPref('snap') };
    this.selected = null;
    this.hover = null;
    this.guides = [];
    this.cursor = null;
    this.hits = [];
    this.geo = null;
    this.drag = null;
    this.pan = null;
    this.space = false;
    this.pending = false;

    const tab = (id, text) => h('button', { class: 'tab', role: 'tab', dataset: { tab: id }, onclick: () => this.setTab(id) }, text);
    this.tabs = [tab('design', t('stage.design')), tab('proof', t('stage.proof')), tab('mockup', t('stage.mockup')), tab('3d', t('stage.3d'))];
    const toggle = (key, id, text, tip, ic) => {
      const b = h('button', { class: 'chip-toggle', id, title: tip, 'aria-pressed': String(this.show[key]), onclick: () => {
        this.show[key] = !this.show[key];
        b.setAttribute('aria-pressed', String(this.show[key]));
        setPref(key, this.show[key]);
        if (key === 'dieline' || key === 'guides') this.schedule(); else this.updateRulers();
      } }, icon(ic, 16), h('span', {}, text));
      return b;
    };
    this.toolsDesign = h('span', { class: 'tools-design', role: 'group', 'aria-label': t('stage.show') },
      toggle('dieline', 'show-dieline', t('stage.dieline'), t('stage.dielineTip'), 'scissors'),
      toggle('guides', 'show-guides', t('stage.guides'), t('stage.guidesTip'), 'guides'),
      toggle('rulers', 'show-rulers', t('stage.rulers'), t('stage.rulersTip'), 'rulers'),
      toggle('snap', 'snap-toggle', t('stage.snap'), t('stage.snapTip'), 'magnet'));
    // 3D: scene, how many packs, drop again, push, snapshot.
    this.sceneSel = h('select', { id: 'scene3d', 'aria-label': t('3d.scene'), onchange: () => { this.view3d?.setScene(this.sceneSel.value); this.syncCount(); } });
    this.countIn = h('input', { type: 'number', id: 'count3d', min: 1, max: 40, value: 6, 'aria-label': t('3d.count'), onchange: () => { this.syncCount(); this.view3d?.setCount(Number(this.countIn.value)); } });
    // What is in the pouch: stored in the design, so the project remembers it.
    this.productSel = h('select', { id: 'product3d', 'aria-label': t('3d.product'), title: t('3d.productTip'),
      onchange: () => { this.store.set(['mockup', 'product3d'], this.productSel.value); this.store.settle(); } },
    Object.entries(PRODUCTS).map(([k, p]) => h('option', { value: k }, label(p.label))));
    // The pouch's film, from the laminates zip pouches are made of (stiffer with more PE).
    this.filmSel = h('select', { id: 'film3d', 'aria-label': t('3d.film'), title: t('3d.filmTip'),
      onchange: () => { this.store.set(['mockup', 'film3d'], this.filmSel.value); this.store.settle(); } },
    Object.entries(FILMS).map(([k, f]) => h('option', { value: k }, `${f.label} (${f.thickness} µm)`)));
    this.tools3d = h('span', { class: 'tools-3d', hidden: true }, this.sceneSel, this.productSel, this.filmSel,
      h('label', { class: 'toggle' }, t('3d.packs'), this.countIn),
      h('button', { class: 'secondary tiny', id: 'again3d', onclick: () => this.view3d?.again() }, t('3d.again')),
      h('button', { class: 'secondary tiny', id: 'push3d', onclick: () => this.view3d?.push() }, t('3d.push')),
      h('button', { class: 'secondary tiny', id: 'png3d', onclick: async () => { const b = await this.view3d?.snapshot(); if (b) this.onSnapshot?.(b); } }, t('3d.png')));
    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('stage.views'), onkeydown: (e) => {
      const i = this.tabs.indexOf(document.activeElement);
      const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: this.tabs.length - 1 }[e.key];
      if (i < 0 || go === undefined) return;
      e.preventDefault();
      const tb = this.tabs[(go + this.tabs.length) % this.tabs.length];
      this.setTab(tb.dataset.tab);
      tb.focus();
    } }, this.tabs);
    this.toolbar = h('div', { class: 'stage-bar' }, tablist, this.toolsDesign, this.tools3d);

    this.canvas = h('div', { class: 'canvas' });
    this.root3d = h('div', { class: 'view3d', hidden: true });
    // An imported dieline has no pack to build in 3D.
    this.no3d = h('div', { class: 'no3d', hidden: true }, t('3d.unavailable'));
    this.viewport = h('div', { class: 'viewport', tabindex: 0, 'aria-label': t('stage.preview') }, this.canvas, this.root3d, this.no3d);
    this.rulers = new Rulers();
    this.tag = h('div', { class: 'hover-tag', hidden: true, 'aria-hidden': 'true' });
    this.main = h('div', { class: 'stage-main' }, this.rulers.corner, this.rulers.top, this.rulers.left, this.viewport, this.tag);
    this.status = statusBar({ zoomIn: () => this.setZoom(stepZoom(this.ppm, 1)), zoomOut: () => this.setZoom(stepZoom(this.ppm, -1)), fit: () => this.fit(), actual: () => this.actual() });
    root.append(this.toolbar, this.main, this.status.el);

    this.viewport.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.viewport.addEventListener('pointerleave', () => { if (!this.drag && !this.pan) this.setHover(null, null); });
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', () => this.pointerUp());
    // The middle button's autoscroll would fight the pan.
    this.viewport.addEventListener('mousedown', (e) => { if (e.button === 1 && this.tab !== '3d') e.preventDefault(); });
    this.viewport.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.viewport.addEventListener('contextmenu', (e) => this.contextMenu(e));
    // Double-click a text to type in it (on its card in the inspector).
    this.viewport.addEventListener('dblclick', (e) => {
      const id = this.tab === 'design' && e.target.closest?.('[data-el]')?.dataset.el;
      if (id && this.hit(id)?.edits.length) this.editText(id);
    });
    let scrollQueued = false;
    this.viewport.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => { scrollQueued = false; this.updateRulers(); this.updateTag(); });
    });
    new ResizeObserver(() => this.refit()).observe(this.viewport);
    this.updateTabs();
  }

  get ppm() {
    return this.zoom ?? this.fitPpm ?? 2;
  }

  setTab(tab) {
    if (this.tab === '3d' && tab !== '3d') this.view3d?.stop();
    this.tab = tab;
    this.zoom = null;
    this.hover = null;
    this.updateTabs();
    this.schedule();
  }

  updateTabs() {
    for (const tb of this.tabs) {
      tb.setAttribute('aria-selected', String(tb.dataset.tab === this.tab));
      tb.tabIndex = tb.dataset.tab === this.tab ? 0 : -1;
    }
    this.toolsDesign.hidden = this.tab !== 'design';
    this.tools3d.hidden = this.tab !== '3d';
    this.canvas.hidden = this.tab === '3d';
    this.root3d.hidden = this.tab !== '3d';
    this.viewport.dataset.tab = this.tab;
    this.status.setMode(this.tab);
    this.tag.hidden = true;
    this.updateRulers();
  }

  syncCount() {
    const max = maxCount(this.sceneSel.value, this.view3d?.pack?.kind ?? this.kind3d);
    this.countIn.max = max;
    if (Number(this.countIn.value) > max) this.countIn.value = max;
  }

  // The 3D view loads three.js on first use and rebuilds its textures a moment after the
  // design stops changing.
  async render3d(design) {
    const none = design.format === 'customDieline';
    this.no3d.hidden = !none;
    this.root3d.hidden = none;
    this.tools3d.hidden = none;
    if (none) { this.view3d?.stop(); return; }
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
        this.sceneSel.replaceChildren(...scenes.map((k) => h('option', { value: k }, label(SCENES[k].label))));
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

  // --- zoom and pan ---

  // Sets the zoom, keeping the point under `at` (a pointer event) or the middle in place.
  setZoom(ppm, at = null) {
    if (this.tab === '3d' || !this.svg) return;
    const vp = this.viewport, r = vp.getBoundingClientRect();
    const cx = at ? at.clientX - r.left : vp.clientWidth / 2, cy = at ? at.clientY - r.top : vp.clientHeight / 2;
    // Where the drawing starts in the scrolled content (an SVG element has no offsetLeft).
    const origin = () => { const s = this.svg.getBoundingClientRect(); return [s.left - r.left + vp.scrollLeft, s.top - r.top + vp.scrollTop]; };
    const old = this.ppm, [ox, oy] = origin(), sl = vp.scrollLeft, st = vp.scrollTop;
    this.zoom = clampPpm(ppm);
    this.applySize();
    const [ox2, oy2] = origin();
    vp.scrollLeft = anchorScroll(cx, sl, ox, old, ox2, this.ppm);
    vp.scrollTop = anchorScroll(cy, st, oy, old, oy2, this.ppm);
    this.updateRulers();
    this.updateTag();
  }

  zoomBy(f) {
    this.setZoom(this.ppm * f);
  }

  fit() {
    this.zoom = null;
    this.refit();
  }

  actual() {
    this.setZoom(ppmForPercent(100));
  }

  // The fitting zoom for the viewport's size; applied when the view is fitted.
  refit() {
    if (!this.box || this.tab === '3d') return;
    this.fitPpm = fitPpm(this.viewport.clientWidth, this.viewport.clientHeight, this.box);
    if (this.zoom === null) this.applySize();
    this.updateRulers();
  }

  // Resizes the drawing without drawing it again.
  applySize() {
    if (!this.svg || !this.box) return;
    this.svg.setAttribute('width', Math.round(this.box.w * this.ppm));
    this.svg.setAttribute('height', Math.round(this.box.h * this.ppm));
    if (this.tab === 'design') this.drawOverlays();
    this.status.setZoom(percent(this.ppm), this.zoom === null);
  }

  wheel(e) {
    if (this.tab === '3d' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    this.setZoom(this.ppm * wheelFactor(e.deltaY, e.deltaMode), e);
  }

  // Keys the preview answers when nothing is being typed. Returns true if it used the key.
  handleKey(e) {
    if (this.tab === '3d') return false;
    if (e.key === ' ' && !e.repeat) {
      const a = document.activeElement;
      if (a && a !== document.body && a !== this.viewport && !this.viewport.contains(a)) return false;
      this.space = true;
      this.viewport.classList.add('pan-ready');
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === '+' || e.key === '=') this.setZoom(stepZoom(this.ppm, 1));
    else if (e.key === '-' || e.key === '_') this.setZoom(stepZoom(this.ppm, -1));
    else if (e.key === '0') this.fit();
    else if (e.key === '1') this.actual();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && this.tab === 'design' && this.selected) {
      this.store.commit(hide(this.store.get(), this.selected));
      this.store.settle();
    } else return false;
    return true;
  }

  keyUp(e) {
    if (e.key === ' ') {
      this.space = false;
      this.viewport.classList.remove('pan-ready');
    }
  }

  // --- drawing ---

  select(id) {
    this.selected = id;
    this.drawOverlays();
    this.updateRulers();
    this.updateStatus();
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
      const r = renderSheet(design, this.env, { mode: 'design', margin: 14, dieline: this.show.dieline, guides: this.show.guides, labelOf: label });
      this.hits = r.hits;
      this.geo = r.geo;
      svg = r.svg;
      box = r.box;
    } else if (this.tab === 'proof') {
      const r = renderProof(design, this.env, { page: design.proof.page ?? 'a3' });
      svg = r.svg;
      box = { x: 0, y: 0, w: r.w, h: r.h };
    } else {
      const r = this.renderMockup(design);
      svg = r.svg;
      box = r.box;
    }
    this.box = box;
    this.fitPpm = fitPpm(this.viewport.clientWidth, this.viewport.clientHeight, box);
    const ppm = this.ppm;
    this.canvas.innerHTML = svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${Math.round(box.w * ppm)}" height="${Math.round(box.h * ppm)}"`);
    this.svg = this.canvas.firstElementChild;
    this.status.setZoom(percent(ppm), this.zoom === null);
    if (this.tab === 'design') {
      for (const hit of this.hits) if (hit.movable) this.svg.querySelectorAll(`[data-el="${hit.id}"]`).forEach((g) => g.classList.add('movable'));
      this.drawOverlays();
      this.updateStatus();
    }
    this.updateRulers();
    this.updateTag();
    this.onRendered?.();
  }

  hit(id) {
    return this.hits.find((x) => x.id === id) ?? null;
  }

  panelOf(hit) {
    return this.geo?.panels.find((p) => p.id === hit.panel) ?? null;
  }

  drawOverlays() {
    if (!this.svg || this.tab !== 'design') return;
    const px = 1 / this.ppm; // one screen pixel in mm
    drawHover(this.svg, this.hover && this.hover !== this.selected && !this.drag ? this.hit(this.hover) : null, px);
    drawSelection(this.svg, this.selected && this.hit(this.selected), px);
    drawGuides(this.svg, this.guides, px);
  }

  updateRulers() {
    const on = this.tab === 'design' && this.show.rulers;
    this.main.classList.toggle('no-rulers', !on);
    if (!on || !this.svg || !this.box) return;
    const sr = this.svg.getBoundingClientRect();
    const ppm = sr.width / this.box.w;
    const map = { left: sr.left - this.box.x * ppm, top: sr.top - this.box.y * ppm, ppm };
    const hit = this.selected && this.hit(this.selected);
    this.rulers.draw(map, hit ? hit.box : null, this.cursor);
  }

  // The selected element in the status bar, in mm from its panel's top left like the inspector.
  updateStatus() {
    const hit = this.tab === 'design' && this.selected && this.hit(this.selected);
    if (!hit) { this.status.setSelection(''); return; }
    const P = this.panelOf(hit);
    this.status.setSelection(t('status.selection', { name: label(hit.label), panel: label(P?.label ?? ''), x: mm1(hit.box.x - (P?.x ?? 0)), y: mm1(hit.box.y - (P?.y ?? 0)), w: mm1(hit.box.w), h: mm1(hit.box.h) }));
  }

  // The name tag over the hovered element; while dragging, its position or size.
  updateTag() {
    const id = this.drag?.id ?? this.hover;
    const hit = this.tab === 'design' && id && this.hit(id);
    if (!hit || !this.svg || (!this.drag && id === this.selected)) { this.tag.hidden = true; return; }
    const P = this.panelOf(hit);
    let text = label(hit.label);
    if (this.drag) {
      text = this.drag.mode === 'move'
        ? t('status.pos', { x: mm1(hit.box.x - P.x), y: mm1(hit.box.y - P.y) })
        : t('status.size', { w: mm1(hit.box.w), h: mm1(hit.box.h) });
    }
    if (this.tag.textContent !== text) this.tag.textContent = text;
    const sr = this.svg.getBoundingClientRect(), mr = this.main.getBoundingClientRect(), vr = this.viewport.getBoundingClientRect();
    const ppm = sr.width / this.box.w;
    let x = sr.left - mr.left + (hit.box.x - this.box.x) * ppm;
    let y = sr.top - mr.top + (hit.box.y - this.box.y) * ppm - 24;
    if (y < vr.top - mr.top + 2) y += 26;
    x = Math.max(vr.left - mr.left + 2, Math.min(x, vr.right - mr.left - 120));
    this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.tag.classList.toggle('dragging', !!this.drag);
    this.tag.hidden = false;
  }

  setHover(id, cursor) {
    this.cursor = cursor;
    if (cursor) this.status.setCursor(t('status.cursor', { x: mm1(cursor.x), y: mm1(cursor.y) }));
    else this.status.setCursor('');
    if (this.show.rulers) this.rulers.pointer(cursor);
    if (id !== this.hover) {
      this.hover = id;
      this.drawOverlays();
    }
    this.updateTag();
  }

  toMm(e) {
    const m = this.svg.getScreenCTM().inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  // --- the pointer ---

  pointerDown(e) {
    if (this.tab === '3d' || !this.svg) return;
    if (e.button === 1 || (e.button === 0 && this.space)) {
      e.preventDefault();
      this.pan = { x: e.clientX, y: e.clientY, sl: this.viewport.scrollLeft, st: this.viewport.scrollTop };
      this.viewport.classList.add('panning');
      return;
    }
    if (this.tab !== 'design' || e.button !== 0) return;
    this.viewport.focus({ preventScroll: true });
    const handle = e.target.closest?.('[data-handle]');
    const target = handle ? null : e.target.closest?.('[data-el]');
    const id = handle ? this.selected : target?.dataset.el ?? null;
    if (!handle) {
      this.selected = id;
      this.onSelect(id);
      this.drawOverlays();
      this.updateRulers();
      this.updateStatus();
    }
    const hit = id && this.hit(id);
    if (!hit || !(handle ? hit.resizable : hit.movable)) return;
    e.preventDefault();
    const panel = this.panelOf(hit);
    this.drag = { id, mode: handle ? handle.dataset.handle : 'move', start: this.toMm(e), box: { ...hit.box }, panel, keepAspect: hit.keepAspect,
      ctm: this.svg.getScreenCTM().inverse(), targets: snapTargets(this.geo, panel, this.hits, id) };
  }

  pointerMove(e) {
    if (this.pan) {
      this.viewport.scrollLeft = this.pan.sl - (e.clientX - this.pan.x);
      this.viewport.scrollTop = this.pan.st - (e.clientY - this.pan.y);
      return;
    }
    const d = this.drag;
    if (!d) {
      if (this.tab !== 'design' || !this.svg || !this.viewport.contains(e.target)) return;
      this.setHover(e.target.closest?.('[data-el]')?.dataset.el ?? null, this.toMm(e));
      return;
    }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(d.ctm);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    const P = d.panel;
    const opts = { threshold: SNAP_PX / this.ppm, lines: this.show.snap && !e.altKey };
    const r = d.mode === 'move'
      ? snapMove({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, d.targets, opts)
      : snapResize(d.box, d.mode, dx, dy, d.targets, { ...opts, keepAspect: d.keepAspect });
    const b = r.box;
    this.guides = r.guides;
    this.cursor = p;
    this.store.set(['layout', d.id], { x: (b.x - P.x) / P.w, y: (b.y - P.y) / P.h, w: b.w / P.w, h: b.h / P.h }, { coalesce: `drag-${d.id}` });
  }

  pointerUp() {
    if (this.pan) {
      this.pan = null;
      this.viewport.classList.remove('panning');
      return;
    }
    if (!this.drag) return;
    this.drag = null;
    this.guides = [];
    this.store.settle();
    this.drawOverlays();
    this.updateTag();
  }

  contextMenu(e) {
    if (this.tab === '3d') return;
    e.preventDefault();
    let hit = null;
    if (this.tab === 'design' && this.svg) {
      const id = e.target.closest?.('[data-el]')?.dataset.el ?? null;
      if (id) {
        this.selected = id;
        this.onSelect(id);
        this.drawOverlays();
        this.updateRulers();
        this.updateStatus();
        hit = this.hit(id);
      }
    }
    contextMenu(elementMenuEntries({ store: this.store, hit, design: this.store.get(), view: this, editText: this.editText }), e.clientX, e.clientY, { label: t('menu.label') });
  }

  // Arrow keys: 1 mm (10 with Shift).
  nudge(dx, dy) {
    const hit = this.tab === 'design' && this.selected && this.hit(this.selected);
    if (!hit?.movable) return false;
    const P = this.panelOf(hit);
    const b = hit.box;
    const x = clamp(b.x + dx, P.x, P.x + P.w - b.w), y = clamp(b.y + dy, P.y, P.y + P.h - b.h);
    this.store.set(['layout', hit.id], { x: (x - P.x) / P.w, y: (y - P.y) / P.h, w: b.w / P.w, h: b.h / P.h }, { coalesce: `nudge-${hit.id}` });
    return true;
  }
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

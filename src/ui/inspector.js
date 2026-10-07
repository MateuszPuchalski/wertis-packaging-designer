// The right-hand panel: the selected element's colours, position and visibility, or the
// list of all elements when nothing is selected.
import { h, clear, syncValue } from './dom.js';
import { resolveColor, refSwatchId, findSwatch, normalizeHex } from '../brand/palette.js';
import { LOGO_PRESETS } from '../brand/wertis.js';

export const SLOT_LABELS = {
  fill: 'Fill', ink: 'Icons', gear: 'Gear', arc: 'Arc', word: 'WERTIS', line: 'Shop line',
  text: 'Text', accent: 'Accent', outline: 'Outline', bars: 'Barcode & QR',
};

const r1 = (v) => Math.round(v * 10) / 10;

export function inspector(store, { getParts, getHit, select, getSelected }) {
  const el = h('div', { class: 'inspector' });
  let built = null; // { id, sig, syncs }

  function slotRow(elem, slot) {
    const key = `${elem.id}.${slot}`;
    const chip = h('span', { class: 'chip' });
    const sel = h('select', { 'aria-label': `${SLOT_LABELS[slot] ?? slot} colour`, onchange: () => {
      const v = sel.value;
      if (v === '__custom') store.set(['colors', key], { custom: resolveColor(store.get().colors[key] ?? elem.colors[slot], store.get().palette).replace('none', '#888888') });
      else if (v === '__none') store.set(['colors', key], { none: true });
      else store.set(['colors', key], v === refSwatchId(elem.colors[slot]) ? undefined : { swatch: v });
      store.settle();
    } });
    const picker = h('input', { type: 'color', 'aria-label': 'Custom colour', oninput: () => store.set(['colors', key], { custom: picker.value }, { coalesce: `c-${key}` }), onchange: () => store.settle() });
    const reset = h('button', { class: 'ghost tiny', title: 'Back to the template colour', onclick: () => { store.set(['colors', key], undefined); store.settle(); } }, '↺');
    const row = h('div', { class: 'slot' }, chip, h('span', { class: 'slot-lbl' }, SLOT_LABELS[slot] ?? slot), sel, picker, reset);
    return { el: row, sync: (design) => {
      const ref = design.colors[key] ?? elem.colors[slot];
      const opts = [...design.palette.map((s) => [s.id, s.name]), ['__custom', 'Custom colour…'], ['__none', 'No colour']];
      const sig = opts.map((o) => o.join(':')).join('|');
      if (sel._sig !== sig) {
        clear(sel);
        for (const [v, label] of opts) sel.append(h('option', { value: v }, label));
        sel._sig = sig;
      }
      const isCustom = ref && typeof ref === 'object' && ref.custom;
      const isNone = ref && typeof ref === 'object' && ref.none;
      sel.value = isCustom ? '__custom' : isNone ? '__none' : (findSwatch(design.palette, refSwatchId(ref)) ? refSwatchId(ref) : '__custom');
      const hex = resolveColor(ref, design.palette);
      chip.style.background = hex === 'none' ? 'repeating-linear-gradient(45deg,#fff 0 3px,#ddd 3px 6px)' : hex;
      picker.hidden = !isCustom;
      if (isCustom) syncValue(picker, normalizeHex(ref.custom) ?? '#888888');
      reset.hidden = !(key in design.colors);
    } };
  }

  function posRows(elem, hit, panel) {
    const fields = ['x', 'y', 'w', 'h'].map((k) => {
      const input = h('input', { type: 'number', step: 0.5, 'aria-label': k.toUpperCase(), oninput: () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        const cur = getHit(elem.id);
        if (!cur) return;
        const box = { x: cur.box.x - panel.x, y: cur.box.y - panel.y, w: cur.box.w, h: cur.box.h };
        if (k === 'w' && hit.keepAspect && box.w > 0) { box.h *= v / box.w; box.w = v; }
        else if (k === 'h' && hit.keepAspect && box.h > 0) { box.w *= v / box.h; box.h = v; }
        else box[k] = v;
        if (box.w < 1 || box.h < 1) return;
        store.set(['layout', elem.id], { x: box.x / panel.w, y: box.y / panel.h, w: box.w / panel.w, h: box.h / panel.h }, { coalesce: `pos-${elem.id}` });
      }, onchange: () => store.settle() });
      return [k, input];
    });
    const reset = h('button', { class: 'ghost', onclick: () => { store.set(['layout', elem.id], undefined); store.settle(); } }, 'Reset position');
    const grid = h('div', { class: 'pos-grid' }, fields.map(([k, input]) => h('label', {}, h('span', {}, k.toUpperCase()), input, h('span', { class: 'unit' }, 'mm'))));
    return {
      el: h('div', { class: 'insp-block' }, h('h4', {}, 'Position (mm, from the panel’s top left)'), grid, reset),
      sync(design) {
        const cur = getHit(elem.id);
        if (cur) {
          const vals = { x: cur.box.x - panel.x, y: cur.box.y - panel.y, w: cur.box.w, h: cur.box.h };
          for (const [k, input] of fields) syncValue(input, r1(vals[k]));
        }
        reset.hidden = !design.layout[elem.id];
      },
    };
  }

  function build(design, id) {
    clear(el);
    const parts = getParts();
    let elem = null, panel = null;
    for (const p of parts) {
      const e = p.elements.find((x) => x.id === id);
      if (e) { elem = e; panel = p.panel; break; }
    }
    if (!elem) return listView(design, parts);
    const hit = getHit(id) ?? { box: elem.box, movable: elem.movable, keepAspect: elem.keepAspect };
    const syncs = [];
    el.append(h('div', { class: 'insp-head' },
      h('div', {}, h('div', { class: 'insp-title' }, elem.label), h('div', { class: 'insp-sub' }, `${panel.label} panel`)),
      h('button', { class: 'ghost tiny', title: 'Close', onclick: () => select(null) }, '✕')));

    const slots = Object.keys(elem.colors ?? {});
    if (slots.length) {
      const block = h('div', { class: 'insp-block' }, h('h4', {}, 'Colours'));
      for (const s of slots) {
        const r = slotRow(elem, s);
        syncs.push(r.sync);
        block.append(r.el);
      }
      if (elem.type === 'logo') {
        block.append(h('div', { class: 'logo-presets' }, h('span', { class: 'lbl' }, 'Logo colours'),
          Object.entries(LOGO_PRESETS).map(([k, p]) => h('button', { class: 'secondary tiny', onclick: () => {
            store.update((d) => {
              const colors = { ...d.colors };
              for (const role of ['gear', 'arc', 'word', 'line']) {
                const v = p[role];
                colors[`${elem.id}.${role}`] = typeof v === 'string' ? { swatch: v } : v;
              }
              return { ...d, colors };
            });
            store.settle();
          } }, p.label))));
      }
      el.append(block);
    }
    if (hit.movable) {
      const pr = posRows(elem, hit, panel);
      syncs.push(pr.sync);
      el.append(pr.el);
    }
    const vis = h('input', { type: 'checkbox', onchange: () => { store.set(['hidden', id], vis.checked ? undefined : true); store.settle(); } });
    el.append(h('div', { class: 'insp-block' }, h('label', { class: 'row check' }, vis, h('span', {}, 'Show this element'))));
    syncs.push((d) => syncValue(vis, !d.hidden[id]));
    if (elem.type === 'window') el.append(h('p', { class: 'help' }, 'The window is printed with no ink at all, so the film stays clear. Its shape and corner radius are under Layout.'));
    if (elem.type === 'text' || elem.type === 'label' || elem.type === 'badge') el.append(h('p', { class: 'help' }, 'Edit the wording under Texts in the left panel.'));
    return { id, syncs };
  }

  function listView(design, parts) {
    el.append(h('div', { class: 'insp-head' }, h('div', {}, h('div', { class: 'insp-title' }, 'Elements'), h('div', { class: 'insp-sub' }, 'Click one here or on the preview'))));
    const syncs = [];
    for (const { panel, elements } of parts) {
      const block = h('div', { class: 'insp-block' }, h('h4', {}, panel.label));
      for (const e of elements) {
        const eye = h('input', { type: 'checkbox', title: 'Show', onchange: () => { store.set(['hidden', e.id], eye.checked ? undefined : true); store.settle(); } });
        block.append(h('div', { class: 'el-row' }, eye, h('button', { class: 'link', onclick: () => select(e.id) }, e.label)));
        syncs.push((d) => syncValue(eye, !d.hidden[e.id]));
      }
      el.append(block);
    }
    return { id: null, syncs };
  }

  return {
    el,
    sync(design) {
      const id = getSelected();
      const sig = `${id}|${design.format}|${design.template}|${JSON.stringify(design.options)}`;
      if (!built || built.sig !== sig) {
        built = { ...build(design, id), sig };
      }
      for (const s of built.syncs) s(design);
    },
  };
}

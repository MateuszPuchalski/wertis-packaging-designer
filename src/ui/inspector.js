// The right-hand panel. On top, a card for the selected element: its texts, colours,
// position and visibility. Below, every element grouped by panel, with a search, a show/hide toggle per
// row and Show all.
import { h, clear, syncValue } from './dom.js';
import { icon } from './icons.js';
import { t, label } from '../i18n/index.js';
import { resolveColor, refSwatchId, findSwatch, normalizeHex } from '../brand/palette.js';
import { LOGO_PRESETS } from '../brand/wertis.js';
import { showAll, resetColors, hasOwnColors, hiddenCount } from '../edit/actions.js';
import { textFields } from './textFields.js';

const r1 = (v) => Math.round(v * 10) / 10;
// Search ignores case and Polish letters' accents (ł is not decomposed by NFD).
const fold = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();

export function inspector(store, { getParts, getHit, select, getSelected, showSection }) {
  let texts = null; // the selected element's text fields
  const SLOTS = {
    fill: t('slot.fill'), ink: t('slot.ink'), gear: t('slot.gear'), arc: t('slot.arc'), word: t('slot.word'), line: t('slot.line'),
    text: t('slot.text'), accent: t('slot.accent'), outline: t('slot.outline'), bars: t('slot.bars'), bg: t('slot.bg'), dots: t('slot.dots'), edge: t('slot.edge'),
  };
  const card = h('div', { class: 'insp-card', hidden: true });
  const listBox = h('div', { class: 'insp-groups' });
  const search = h('input', { type: 'search', class: 'insp-search', placeholder: t('insp.search'), 'aria-label': t('insp.search'), oninput: () => filter() });
  const showAllBtn = h('button', { class: 'ghost tiny', id: 'show-all', onclick: () => { store.commit(showAll(store.get())); store.settle(); } });
  const empty = h('p', { class: 'help', hidden: true });
  const list = h('div', { class: 'insp-list' },
    h('div', { class: 'insp-list-head' }, h('span', { class: 'insp-list-title' }, t('insp.elements')), showAllBtn),
    h('label', { class: 'search-box' }, icon('search', 15), search), listBox, empty);
  const el = h('div', { class: 'inspector' }, card, list);
  let built = null; // the card: { sig, syncs }
  let listSig = '';
  let rows = []; // { id, row, eye, text, group }
  let groups = []; // { panel, el, count, rows }
  const closed = new Set();

  function slotRow(elem, slot) {
    const key = `${elem.id}.${slot}`;
    const name = SLOTS[slot] ?? slot;
    const chip = h('span', { class: 'chip' });
    const sel = h('select', { 'aria-label': t('insp.slotColour', { slot: name }), onchange: () => {
      const v = sel.value;
      if (v === '__custom') store.set(['colors', key], { custom: resolveColor(store.get().colors[key] ?? elem.colors[slot], store.get().palette).replace('none', '#888888') });
      else if (v === '__none') store.set(['colors', key], { none: true });
      else store.set(['colors', key], v === refSwatchId(elem.colors[slot]) ? undefined : { swatch: v });
      store.settle();
    } });
    const picker = h('input', { type: 'color', 'aria-label': t('insp.customColour'), oninput: () => store.set(['colors', key], { custom: picker.value }, { coalesce: `c-${key}` }), onchange: () => store.settle() });
    const reset = h('button', { class: 'ghost tiny', title: t('insp.slotReset'), 'aria-label': t('insp.slotReset'), onclick: () => { store.set(['colors', key], undefined); store.settle(); } }, icon('reset', 14));
    const row = h('div', { class: 'slot' }, chip, h('span', { class: 'slot-lbl' }, name), sel, picker, reset);
    return { el: row, sync: (design) => {
      const ref = design.colors[key] ?? elem.colors[slot];
      const opts = [...design.palette.map((s) => [s.id, s.name]), ['__custom', t('insp.customOption')], ['__none', t('insp.noColour')]];
      const sig = opts.map((o) => o.join(':')).join('|');
      if (sel._sig !== sig) {
        clear(sel);
        for (const [v, l] of opts) sel.append(h('option', { value: v }, l));
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
    const POS = { x: t('insp.pos.x'), y: t('insp.pos.y'), w: t('insp.pos.w'), h: t('insp.pos.h') };
    const fields = ['x', 'y', 'w', 'h'].map((k) => {
      const input = h('input', { type: 'number', step: 0.5, 'aria-label': POS[k], oninput: () => {
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
    const reset = h('button', { class: 'ghost tiny', id: 'insp-reset-pos', onclick: () => { store.set(['layout', elem.id], undefined); store.settle(); } }, icon('reset', 14), t('insp.resetPos'));
    const short = { x: 'X', y: 'Y', w: t('insp.short.w'), h: t('insp.short.h') };
    const grid = h('div', { class: 'pos-grid' }, fields.map(([k, input]) => h('label', { title: POS[k] }, h('span', {}, short[k]), input)));
    return {
      el: h('div', { class: 'insp-block' }, h('div', { class: 'block-head' }, h('h4', { title: t('insp.positionTip') }, t('insp.position')), reset), grid),
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

  function find(id) {
    for (const p of getParts()) {
      const e = p.elements.find((x) => x.id === id);
      if (e) return { elem: e, panel: p.panel };
    }
    return null;
  }

  function buildCard(id) {
    clear(card);
    const found = id && find(id);
    texts = null;
    card.hidden = !found;
    if (!found) return [];
    const { elem, panel } = found;
    const hit = getHit(id) ?? { box: elem.box, movable: elem.movable, keepAspect: elem.keepAspect };
    const syncs = [];
    card.append(h('div', { class: 'insp-head' },
      h('div', {}, h('div', { class: 'insp-title' }, label(elem.label)), h('div', { class: 'insp-sub' }, t('insp.panel', { panel: label(panel.label) }))),
      h('button', { class: 'ghost tiny', title: t('insp.deselect'), 'aria-label': t('insp.deselect'), onclick: () => select(null) }, icon('close', 16))));

    // Its texts first: what it says is what you most often change.
    texts = textFields(store, elem.edits);
    if (texts) {
      card.append(h('div', { class: 'insp-block insp-texts' }, h('h4', {}, t('insp.text')), texts.el));
      syncs.push(texts.sync);
    }

    const slots = Object.keys(elem.colors ?? {});
    if (slots.length) {
      const resetAll = h('button', { class: 'ghost tiny', id: 'insp-reset-colours', onclick: () => { store.commit(resetColors(store.get(), id)); store.settle(); } }, icon('reset', 14), t('insp.resetColours'));
      const block = h('div', { class: 'insp-block' }, h('div', { class: 'block-head' }, h('h4', {}, t('insp.colours')), resetAll));
      syncs.push((d) => { resetAll.hidden = !hasOwnColors(d, id); });
      for (const s of slots) {
        const r = slotRow(elem, s);
        syncs.push(r.sync);
        block.append(r.el);
      }
      if (elem.type === 'logo') {
        block.append(h('div', { class: 'logo-presets' }, h('span', { class: 'lbl' }, t('insp.logoColours')),
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
          } }, label(p.label)))));
      }
      card.append(block);
    }
    if (hit.movable) {
      const pr = posRows(elem, hit, panel);
      syncs.push(pr.sync);
      card.append(pr.el);
    }
    const vis = h('input', { type: 'checkbox', id: 'insp-visible', onchange: () => { store.set(['hidden', id], vis.checked ? undefined : true); store.settle(); } });
    card.append(h('div', { class: 'insp-block' }, h('label', { class: 'row check' }, vis, h('span', {}, t('insp.show')))));
    syncs.push((d) => syncValue(vis, !d.hidden[id]));
    if (elem.type === 'window') card.append(h('p', { class: 'help' }, t('insp.windowHelp'), ' ', h('button', { class: 'link', onclick: () => showSection('sec-layout') }, t('insp.toLayout'))));
    return syncs;
  }

  function buildList(parts) {
    clear(listBox);
    rows = [];
    groups = parts.map(({ panel, elements }) => {
      const count = h('span', { class: 'count' });
      const g = { panel, rows: [], count };
      g.el = h('details', { class: 'el-group', open: !closed.has(panel.id), dataset: { panel: panel.id }, ontoggle: () => (g.el.open ? closed.delete(panel.id) : closed.add(panel.id)) },
        h('summary', {}, h('span', {}, label(panel.label)), count));
      for (const e of elements) {
        const eye = h('button', { class: 'eye ghost tiny', 'aria-pressed': 'true', onclick: () => { const d = store.get(); store.set(['hidden', e.id], d.hidden[e.id] ? undefined : true); store.settle(); } });
        const text = label(e.label);
        const row = h('div', { class: 'el-row', dataset: { elRow: e.id } }, eye, h('button', { class: 'el-name', onclick: () => select(e.id) }, text));
        const r = { id: e.id, row, eye, text, en: e.label, group: g };
        rows.push(r);
        g.rows.push(r);
        g.el.append(row);
      }
      listBox.append(g.el);
      return g;
    });
    filter();
  }

  function filter() {
    const q = fold(search.value.trim());
    let shown = 0;
    for (const r of rows) {
      const on = !q || fold(r.text).includes(q) || fold(r.en).includes(q);
      r.row.hidden = !on;
      if (on) shown++;
    }
    for (const g of groups) {
      g.el.hidden = !g.rows.some((r) => !r.row.hidden);
      if (q && !g.el.hidden) g.el.open = true;
    }
    empty.hidden = shown > 0;
    empty.textContent = shown ? '' : t('insp.noMatch', { q: search.value.trim() });
  }

  function syncList(design, selected) {
    for (const r of rows) {
      const hidden = !!design.hidden[r.id];
      r.row.classList.toggle('is-hidden', hidden);
      r.row.classList.toggle('selected', r.id === selected);
      if (r.id === selected) r.row.setAttribute('aria-current', 'true'); else r.row.removeAttribute('aria-current');
      r.eye.setAttribute('aria-pressed', String(!hidden));
      const tip = hidden ? t('insp.showEl', { name: r.text }) : t('insp.hideEl', { name: r.text });
      if (r.eye.title !== tip) {
        r.eye.title = tip;
        r.eye.setAttribute('aria-label', tip);
        r.eye.replaceChildren(icon(hidden ? 'eyeOff' : 'eye', 15));
      }
    }
    for (const g of groups) {
      const n = g.rows.length, off = g.rows.filter((r) => design.hidden[r.id]).length;
      g.count.textContent = off ? t('insp.countHidden', { n, hidden: off }) : String(n);
    }
    const nh = hiddenCount(design);
    showAllBtn.hidden = !nh;
    showAllBtn.textContent = t('insp.showAll', { n: nh });
  }

  return {
    el,
    sync(design) {
      const id = getSelected();
      // The panel sizes and the options move elements, so they rebuild the card too.
      const shape = `${design.format}|${design.template}|${JSON.stringify(design.options)}|${JSON.stringify(design.dims)}`;
      const sig = `${id}|${shape}`;
      if (!built || built.sig !== sig) built = { sig, syncs: buildCard(id) };
      if (shape !== listSig) {
        listSig = shape;
        buildList(getParts());
      }
      for (const s of built.syncs) s(design);
      syncList(design, id);
    },
    // Puts the cursor in the selected element's first text (double-click, or right-click → Edit text).
    focusText() {
      if (!texts) return false;
      card.scrollIntoView({ block: 'nearest' });
      texts.focus();
      return true;
    },
    // After the preview re-renders: the element boxes (and so the position fields) are new.
    refresh() {
      for (const s of built?.syncs ?? []) s(store.get());
    },
  };
}

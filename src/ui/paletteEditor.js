// The Colours panel: edit, add, reorder and delete swatches, and keep named presets.
// Editing a swatch recolours every element that points at it.
import { h, clear, syncValue, dialog, toast } from './dom.js';
import { addSwatch, updateSwatch, moveSwatch, canDeleteSwatch, makeSwatch, normalizeHex, cmykFromHex, mergePalette } from '../brand/palette.js';
import { WERTIS_PALETTE } from '../brand/wertis.js';
import { removeSwatch, slotsUsingSwatch } from '../design.js';
import { listPresets, savePreset, deletePreset, newId } from '../storage.js';
import { download, slug } from '../export/files.js';

export function paletteEditor(store, getParts) {
  const list = h('div', { class: 'swatches' });
  const presetSel = h('select', { 'aria-label': 'Colour preset' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importPreset });
  let signature = '';
  let rows = [];

  const set = (id, fields, coalesce) => store.update((d) => ({ ...d, palette: updateSwatch(d.palette, id, fields) }), { coalesce: coalesce ? `sw-${id}-${coalesce}` : null });

  function row(sw) {
    const color = h('input', { type: 'color', title: 'Pick the colour', oninput: () => set(sw.id, { hex: color.value }, 'hex'), onchange: () => store.settle() });
    const name = h('input', { type: 'text', class: 'sw-name', 'aria-label': 'Name', oninput: () => set(sw.id, { name: name.value }, 'name'), onchange: () => store.settle() });
    const hex = h('input', { type: 'text', class: 'sw-hex', 'aria-label': 'Hex', maxlength: 7,
      oninput: () => { const v = normalizeHex(hex.value); if (v) set(sw.id, { hex: v }, 'hex'); }, onchange: () => store.settle() });
    const cmyk = ['C', 'M', 'Y', 'K'].map((ch, i) => h('input', { type: 'number', min: 0, max: 100, class: 'sw-cmyk', 'aria-label': ch, title: ch,
      oninput: () => set(sw.id, { cmyk: cmyk.map((c) => Number(c.value) || 0) }, 'cmyk'), onchange: () => store.settle() }));
    const spot = h('input', { type: 'text', class: 'sw-spot', placeholder: 'Pantone / spot name', 'aria-label': 'Spot colour',
      oninput: () => set(sw.id, { spot: spot.value }, 'spot'), onchange: () => store.settle() });
    const uses = h('span', { class: 'sw-uses' });
    const autoCmyk = h('button', { class: 'ghost tiny', title: 'Fill CMYK from the hex value (approximate)', onclick: () => { set(sw.id, { cmyk: cmykFromHex(store.get().palette.find((s) => s.id === sw.id).hex) }); store.settle(); } }, 'auto');
    const up = h('button', { class: 'ghost tiny', title: 'Move up', onclick: () => store.update((d) => ({ ...d, palette: moveSwatch(d.palette, sw.id, -1) })) }, '↑');
    const down = h('button', { class: 'ghost tiny', title: 'Move down', onclick: () => store.update((d) => ({ ...d, palette: moveSwatch(d.palette, sw.id, 1) })) }, '↓');
    const asSpot = h('input', { type: 'checkbox', title: 'Print this colour as its own spot ink (a named Separation in the PDF) instead of CMYK',
      onchange: () => { set(sw.id, { asSpot: asSpot.checked }); store.settle(); } });
    const del = h('button', { class: 'ghost tiny danger', title: canDeleteSwatch(sw) ? 'Delete' : 'The window colour can be edited but not deleted', disabled: !canDeleteSwatch(sw), onclick: () => remove(sw.id) }, '✕');
    const el = h('div', { class: 'swatch', dataset: { swatch: sw.id } },
      h('div', { class: 'sw-top' }, color, name, up, down, del),
      h('div', { class: 'sw-mid' }, hex, h('span', { class: 'sw-cmyk-row' }, cmyk), autoCmyk),
      h('div', { class: 'sw-bot' }, spot, h('label', { class: 'sw-spotflag', hidden: sw.role === 'transparent' }, asSpot, 'Spot ink'), uses));
    return {
      el,
      sync(s, used) {
        syncValue(color, s.hex); syncValue(name, s.name); syncValue(hex, s.hex.toUpperCase()); syncValue(spot, s.spot); syncValue(asSpot, s.asSpot);
        cmyk.forEach((c, i) => syncValue(c, s.cmyk[i]));
        uses.textContent = s.role === 'transparent' ? 'marks the window' : used ? `used ${used}×` : 'not used';
        el.classList.toggle('unused', !used && s.role !== 'transparent');
      },
    };
  }

  async function remove(id) {
    const d = store.get();
    const parts = getParts();
    const users = slotsUsingSwatch(d, parts, id);
    const sw = d.palette.find((s) => s.id === id);
    let replacement = null;
    if (users.length) {
      const sel = h('select', {}, d.palette.filter((s) => s.id !== id && s.role !== 'transparent').map((s) => h('option', { value: s.id }, s.name)));
      const ok = await dialog(`Delete “${sw.name}”?`, h('div', {},
        h('p', {}, `${users.length} element colour${users.length === 1 ? '' : 's'} use this swatch. Choose the colour they switch to:`), sel),
        [['Cancel', null, 'ghost'], ['Replace and delete', () => sel.value, 'primary']]);
      if (!ok) return;
      replacement = ok;
    }
    try {
      store.commit(removeSwatch(d, parts, id, replacement));
      toast(`Deleted “${sw.name}”.`);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function refreshPresets() {
    const presets = await listPresets().catch(() => []);
    clear(presetSel);
    presetSel.append(h('option', { value: '__wertis' }, 'WERTIS default'));
    for (const p of presets) presetSel.append(h('option', { value: p.id }, p.name));
    presetSel._presets = presets;
  }

  function chosenPreset() {
    if (presetSel.value === '__wertis') return { id: '__wertis', name: 'WERTIS default', palette: WERTIS_PALETTE };
    return presetSel._presets?.find((p) => p.id === presetSel.value) ?? null;
  }

  async function saveAs() {
    const input = h('input', { type: 'text', value: store.get().name ? `${store.get().name} colours` : 'My colours' });
    const name = await dialog('Save colours as a preset', h('div', {}, h('p', {}, 'The preset keeps every swatch with its name, hex, CMYK and spot values.'), input),
      [['Cancel', null, 'ghost'], ['Save preset', () => input.value.trim(), 'primary']]);
    if (!name) return;
    const id = newId('preset');
    await savePreset({ id, name, palette: store.get().palette });
    await refreshPresets();
    presetSel.value = id;
    toast(`Saved preset “${name}”.`);
  }

  async function importPreset() {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const palette = Array.isArray(json) ? json : json.palette;
      if (!Array.isArray(palette) || !palette.every((s) => s.id && normalizeHex(s.hex))) throw new Error('This file has no colour palette.');
      const id = newId('preset');
      await savePreset({ id, name: json.name || file.name.replace(/\.json$/i, ''), palette: palette.map(makeSwatch) });
      await refreshPresets();
      presetSel.value = id;
      toast('Imported the preset. Press “Apply” to use it.');
    } catch (err) { toast(err.message, 'error'); }
  }

  const el = h('div', { class: 'palette-editor' },
    h('p', { class: 'help' }, 'Elements point at these swatches: change one and everything that uses it follows. Pick an element on the preview to give it another swatch or its own colour.'),
    list,
    h('button', { class: 'secondary', onclick: () => { store.update((d) => ({ ...d, palette: addSwatch(d.palette, { name: 'New colour', hex: '#888888' }) })); toast('Added a swatch at the end of the list.'); } }, '+ Add colour'),
    h('div', { class: 'preset-box' },
      h('span', { class: 'lbl' }, 'Presets'),
      presetSel,
      h('div', { class: 'btn-row' },
        h('button', { class: 'secondary', title: 'Use the chosen preset (same-id swatches take its values)', onclick: () => { const p = chosenPreset(); if (p) { store.update((d) => ({ ...d, palette: mergePalette(d.palette, p.palette) })); toast(`Applied “${p.name}”.`); } } }, 'Apply'),
        h('button', { class: 'secondary', onclick: saveAs }, 'Save as…'),
        h('button', { class: 'ghost', title: 'Delete the chosen preset', onclick: async () => { const p = chosenPreset(); if (p && p.id !== '__wertis') { await deletePreset(p.id); await refreshPresets(); toast(`Deleted preset “${p.name}”.`); } } }, 'Delete')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'ghost', onclick: () => { const d = store.get(); download(new Blob([JSON.stringify({ name: `${d.name} colours`, palette: d.palette }, null, 1)], { type: 'application/json' }), `${slug(d.name)}-colours.json`); } }, 'Export colours'),
        h('button', { class: 'ghost', onclick: () => fileIn.click() }, 'Import colours'),
        fileIn)),
  );
  refreshPresets();

  return {
    el,
    sync(design) {
      const sig = design.palette.map((s) => s.id).join('|');
      if (sig !== signature) {
        signature = sig;
        clear(list);
        rows = design.palette.map((sw) => { const r = row(sw); list.append(r.el); return r; });
      }
      const parts = getParts();
      design.palette.forEach((s, i) => rows[i].sync(s, slotsUsingSwatch(design, parts, s.id).length));
    },
  };
}

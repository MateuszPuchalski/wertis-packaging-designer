// The Colours panel: edit, add, reorder and delete swatches, and keep named presets.
// Editing a swatch recolours every element that points at it.
import { h, clear, syncValue, dialog, toast } from './dom.js';
import { addSwatch, updateSwatch, moveSwatch, canDeleteSwatch, makeSwatch, normalizeHex, cmykFromHex, mergePalette } from '../brand/palette.js';
import { WERTIS_PALETTE } from '../brand/wertis.js';
import { removeSwatch, slotsUsingSwatch } from '../design.js';
import { listPresets, savePreset, deletePreset, newId } from '../storage.js';
import { download, slug } from '../export/files.js';
import { t, msgOf } from '../i18n/index.js';

export function paletteEditor(store, getParts) {
  const list = h('div', { class: 'swatches' });
  const presetSel = h('select', { 'aria-label': t('pal.preset') });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importPreset });
  let signature = '';
  let rows = [];

  const set = (id, fields, coalesce) => store.update((d) => ({ ...d, palette: updateSwatch(d.palette, id, fields) }), { coalesce: coalesce ? `sw-${id}-${coalesce}` : null });

  function row(sw) {
    const color = h('input', { type: 'color', title: t('pal.pick'), 'aria-label': t('pal.pick'), oninput: () => set(sw.id, { hex: color.value }, 'hex'), onchange: () => store.settle() });
    const name = h('input', { type: 'text', class: 'sw-name', 'aria-label': t('pal.name'), oninput: () => set(sw.id, { name: name.value }, 'name'), onchange: () => store.settle() });
    const hex = h('input', { type: 'text', class: 'sw-hex', 'aria-label': t('pal.hex'), maxlength: 7,
      oninput: () => { const v = normalizeHex(hex.value); if (v) set(sw.id, { hex: v }, 'hex'); }, onchange: () => store.settle() });
    const cmyk = ['C', 'M', 'Y', 'K'].map((ch, i) => h('input', { type: 'number', min: 0, max: 100, class: 'sw-cmyk', 'aria-label': ch, title: ch,
      oninput: () => set(sw.id, { cmyk: cmyk.map((c) => Number(c.value) || 0) }, 'cmyk'), onchange: () => store.settle() }));
    const spot = h('input', { type: 'text', class: 'sw-spot', placeholder: t('pal.spotPlaceholder'), 'aria-label': t('pal.spotName'),
      oninput: () => set(sw.id, { spot: spot.value }, 'spot'), onchange: () => store.settle() });
    const uses = h('span', { class: 'sw-uses' });
    const autoCmyk = h('button', { class: 'ghost tiny', title: t('pal.autoTip'), onclick: () => { set(sw.id, { cmyk: cmykFromHex(store.get().palette.find((s) => s.id === sw.id).hex) }); store.settle(); } }, t('pal.auto'));
    const up = h('button', { class: 'ghost tiny', title: t('pal.up'), 'aria-label': t('pal.up'), onclick: () => store.update((d) => ({ ...d, palette: moveSwatch(d.palette, sw.id, -1) })) }, '↑');
    const down = h('button', { class: 'ghost tiny', title: t('pal.down'), 'aria-label': t('pal.down'), onclick: () => store.update((d) => ({ ...d, palette: moveSwatch(d.palette, sw.id, 1) })) }, '↓');
    const asSpot = h('input', { type: 'checkbox', title: t('pal.asSpotTip'),
      onchange: () => { set(sw.id, { asSpot: asSpot.checked }); store.settle(); } });
    const del = h('button', { class: 'ghost tiny danger', title: canDeleteSwatch(sw) ? t('common.delete') : t('pal.cantDelete'), 'aria-label': t('common.delete'), disabled: !canDeleteSwatch(sw), onclick: () => remove(sw.id) }, '✕');
    const el = h('div', { class: 'swatch', dataset: { swatch: sw.id } },
      h('div', { class: 'sw-top' }, color, name, up, down, del),
      h('div', { class: 'sw-mid' }, h('span', { class: 'sw-cmyk-row' }, cmyk), autoCmyk),
      h('div', { class: 'sw-bot' }, hex, spot, h('label', { class: 'sw-spotflag', hidden: sw.role === 'transparent' }, asSpot, t('pal.spotInk')), uses));
    return {
      el,
      sync(s, used) {
        syncValue(color, s.hex); syncValue(name, s.name); syncValue(hex, s.hex.toUpperCase()); syncValue(spot, s.spot); syncValue(asSpot, s.asSpot);
        cmyk.forEach((c, i) => syncValue(c, s.cmyk[i]));
        uses.textContent = s.role === 'transparent' ? t('pal.marksWindow') : used ? t('pal.used', { n: used }) : t('pal.unused');
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
      const sel = h('select', { 'aria-label': t('pal.replacement') }, d.palette.filter((s) => s.id !== id && s.role !== 'transparent').map((s) => h('option', { value: s.id }, s.name)));
      const ok = await dialog(t('pal.deleteTitle', { name: sw.name }), h('div', {},
        h('p', {}, t('pal.deleteUsers', { n: users.length })), sel),
        [[t('common.cancel'), null, 'ghost'], [t('pal.replaceDelete'), () => sel.value, 'primary']]);
      if (!ok) return;
      replacement = ok;
    }
    try {
      store.commit(removeSwatch(d, parts, id, replacement));
      toast(t('pal.deleted', { name: sw.name }));
    } catch (err) { toast(msgOf(err), 'error'); }
  }

  async function refreshPresets() {
    const presets = await listPresets().catch(() => []);
    clear(presetSel);
    presetSel.append(h('option', { value: '__wertis' }, t('pal.wertisDefault')));
    for (const p of presets) presetSel.append(h('option', { value: p.id }, p.name));
    presetSel._presets = presets;
  }

  function chosenPreset() {
    if (presetSel.value === '__wertis') return { id: '__wertis', name: t('pal.wertisDefault'), palette: WERTIS_PALETTE };
    return presetSel._presets?.find((p) => p.id === presetSel.value) ?? null;
  }

  async function saveAs() {
    const input = h('input', { type: 'text', 'aria-label': t('pal.name'), value: store.get().name ? t('pal.presetName', { name: store.get().name }) : t('pal.myColours') });
    const name = await dialog(t('pal.saveTitle'), h('div', {}, h('p', {}, t('pal.saveText')), input),
      [[t('common.cancel'), null, 'ghost'], [t('pal.savePreset'), () => input.value.trim(), 'primary']]);
    if (!name) return;
    const id = newId('preset');
    await savePreset({ id, name, palette: store.get().palette });
    await refreshPresets();
    presetSel.value = id;
    toast(t('pal.saved', { name }));
  }

  async function importPreset() {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const palette = Array.isArray(json) ? json : json.palette;
      if (!Array.isArray(palette) || !palette.every((s) => s.id && normalizeHex(s.hex))) throw new Error(t('pal.noPalette'));
      const id = newId('preset');
      await savePreset({ id, name: json.name || file.name.replace(/\.json$/i, ''), palette: palette.map(makeSwatch) });
      await refreshPresets();
      presetSel.value = id;
      toast(t('pal.imported'));
    } catch (err) { toast(msgOf(err), 'error'); }
  }

  const el = h('div', { class: 'palette-editor' },
    h('p', { class: 'help' }, t('pal.help')),
    list,
    h('button', { class: 'secondary', onclick: () => { store.update((d) => ({ ...d, palette: addSwatch(d.palette, { name: t('pal.newColour'), hex: '#888888' }) })); toast(t('pal.added')); } }, t('pal.add')),
    h('div', { class: 'preset-box' },
      h('span', { class: 'lbl' }, t('pal.presets')),
      presetSel,
      h('div', { class: 'btn-row' },
        h('button', { class: 'secondary', title: t('pal.applyTip'), onclick: () => { const p = chosenPreset(); if (p) { store.update((d) => ({ ...d, palette: mergePalette(d.palette, p.palette) })); toast(t('pal.applied', { name: p.name })); } } }, t('pal.apply')),
        h('button', { class: 'secondary', onclick: saveAs }, t('pal.saveAs')),
        h('button', { class: 'ghost', title: t('pal.deletePresetTip'), onclick: async () => { const p = chosenPreset(); if (p && p.id !== '__wertis') { await deletePreset(p.id); await refreshPresets(); toast(t('pal.deletedPreset', { name: p.name })); } } }, t('common.delete'))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'ghost', onclick: () => { const d = store.get(); download(new Blob([JSON.stringify({ name: t('pal.presetName', { name: d.name }), palette: d.palette }, null, 1)], { type: 'application/json' }), `${slug(d.name)}-colours.json`); } }, t('pal.export')),
        h('button', { class: 'ghost', onclick: () => fileIn.click() }, t('pal.import')),
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

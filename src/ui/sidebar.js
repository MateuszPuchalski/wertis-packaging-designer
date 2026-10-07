// The left panel: project, format and size, layout, texts, colours, pattern and proof.
import { h, clear, syncValue, toast, dialog } from './dom.js';
import { fieldControl, textControl, section } from './controls.js';
import { paletteEditor } from './paletteEditor.js';
import { FORMATS, TEMPLATES } from '../registry.js';
import { LANGS } from '../brand/wertis.js';
import { switchFormat } from '../design.js';
import { validateEan13 } from '../codes/ean13.js';
import { PATTERN_ICONS } from '../brand/patternIcons.js';
import { PATTERN_STYLES } from '../render/pattern.js';
import { PROOF_PAGES } from '../render/proof.js';
import { MOCKUP_VIEWS } from '../render/mockup.js';

export function sidebar(store, { getParts, project }) {
  const el = h('div', { class: 'sidebar-inner' });
  const syncs = [];
  const add = (sec, ...ctrls) => {
    for (const c of ctrls) { sec.body.append(c.el); syncs.push(c.sync); }
    el.append(sec.el);
    return sec;
  };

  // --- Project ---
  const proj = section('Project', { open: false, id: 'sec-project' });
  proj.body.append(project.el);
  syncs.push(project.sync);
  el.append(proj.el);

  // --- Format & size ---
  const fmt = section('Format & size', { open: true, id: 'sec-format' });
  const formatSel = h('select', { id: 'format', onchange: () => { store.commit(switchFormat(store.get(), formatSel.value)); store.settle(); } },
    Object.values(FORMATS).map((f) => h('option', { value: f.id }, f.label)));
  const templateSel = h('select', { id: 'template', onchange: () => { store.commit(switchFormat(store.get(), store.get().format, templateSel.value)); store.settle(); } });
  const dimsBox = h('div', { class: 'fields' });
  let dimsSig = '';
  let dimSyncs = [];
  fmt.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Format'), h('span', { class: 'ctl' }, formatSel)),
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Template'), h('span', { class: 'ctl' }, templateSel)), dimsBox);
  syncs.push((d) => {
    syncValue(formatSel, d.format);
    const f = FORMATS[d.format];
    const sig = `${d.format}|${d.template}`;
    if (sig !== dimsSig) {
      dimsSig = sig;
      clear(templateSel);
      for (const t of f.templates) templateSel.append(h('option', { value: t }, TEMPLATES[t].label));
      clear(dimsBox);
      dimSyncs = f.fields.map((field) => { const c = fieldControl(store, ['dims'], field); dimsBox.append(c.el); return c.sync; });
      clear(layoutBox);
      layoutSyncs = TEMPLATES[d.template].options.map((field) => { const c = fieldControl(store, ['options'], field); layoutBox.append(c.el); return c.sync; });
    }
    syncValue(templateSel, d.template);
    for (const s of dimSyncs) s(d);
    for (const s of layoutSyncs) s(d);
  });
  el.append(fmt.el);

  // --- Layout (template options) ---
  const lay = section('Layout & window', { id: 'sec-layout' });
  const layoutBox = h('div', { class: 'fields' });
  let layoutSyncs = [];
  lay.body.append(layoutBox, h('p', { class: 'help' }, 'Drag the window, logos, label and marks on the preview; pull a corner to resize. Arrow keys nudge by 1 mm (Shift: 10 mm).'));
  el.append(lay.el);

  // --- Texts ---
  const tx = section('Texts', { id: 'sec-texts' });
  const langSel = h('select', { id: 'lang', onchange: () => { store.set(['content', 'lang'], langSel.value); store.settle(); } }, LANGS.map(([k, code]) => h('option', { value: k }, code)));
  tx.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Main language'), h('span', { class: 'ctl' }, langSel)));
  syncs.push((d) => syncValue(langSel, d.content.lang));
  add(tx,
    ...LANGS.map(([k, code]) => textControl(store, ['content', 'productName', k], `Product name (${code})`)),
    textControl(store, ['content', 'sku'], 'Product code (SKU)'),
    textControl(store, ['content', 'ean'], 'EAN-13', { validate: (v) => { if (!v) return 'No barcode will be printed.'; const r = validateEan13(v); return r.ok ? `✓ ${r.code}${r.added ? ' (check digit added)' : ''}` : r.error; } }),
    textControl(store, ['content', 'qr'], 'QR code link'),
    textControl(store, ['content', 'url'], 'Website line'),
    textControl(store, ['content', 'tagline'], 'Tagline'),
    textControl(store, ['content', 'note1'], 'Front note, line 1'),
    textControl(store, ['content', 'note2'], 'Front note, line 2'),
    textControl(store, ['content', 'producedFor'], '“Produced for” heading'),
    textControl(store, ['content', 'company'], 'Company'),
    textControl(store, ['content', 'address'], 'Address'),
    textControl(store, ['content', 'email'], 'E-mail'),
    textControl(store, ['content', 'specs'], 'Technical data (one per line)', { multiline: true, parse: (v) => v.split('\n'), format: (v) => (Array.isArray(v) ? v.join('\n') : v ?? '') }),
  );

  // --- Colours ---
  const col = section('Colours', { id: 'sec-colours' });
  add(col, paletteEditor(store, getParts));

  // --- Pattern ---
  const pat = section('Parts pattern', { id: 'sec-pattern' });
  const icons = h('div', { class: 'icon-grid' });
  const iconBoxes = PATTERN_ICONS.map((ic) => {
    const cb = h('input', { type: 'checkbox', onchange: () => {
      const all = PATTERN_ICONS.map((i) => i.id);
      const cur = store.get().pattern.icons ?? all;
      let next = cb.checked ? [...new Set([...cur, ic.id])] : cur.filter((x) => x !== ic.id);
      if (!next.length) { toast('Keep at least one icon.', 'error'); cb.checked = true; return; }
      if (next.length === all.length) next = null;
      store.set(['pattern', 'icons'], next);
      store.settle();
    } });
    const thumb = `<svg viewBox="-55 -55 110 110" width="34" height="34">${ic.paths.map((p) => `<path fill="currentColor" fill-rule="${p.rule}" d="${p.d}"/>`).join('')}</svg>`;
    icons.append(h('label', { class: 'icon-pick', title: ic.label }, cb, h('span', { innerHTML: thumb })));
    return [ic.id, cb];
  });
  pat.body.append(h('p', { class: 'help' }, 'The icons from the WERTIS foil mailer. Each band takes its own pattern colour (pick the band on the preview).'), icons);
  syncs.push((d) => { for (const [id, cb] of iconBoxes) syncValue(cb, !d.pattern.icons || d.pattern.icons.includes(id)); });
  const P = (key, label, def, min, max, step, unit = 'mm') => fieldControl(store, ['pattern'], { key, label, type: 'number', default: def, min, max, step, unit });
  add(pat, fieldControl(store, ['pattern'], { key: 'style', label: 'Icon style', type: 'select', default: 'solid', options: PATTERN_STYLES }),
    fieldControl(store, ['pattern'], { key: 'outline', label: 'Outline width', type: 'number', default: 3, min: 0.5, max: 10, step: 0.5, unit: '', whenNot: ['style', 'solid'] }),
    P('size', 'Icon size', 18, 3, 120, 0.5), P('spacing', 'Spacing', 30, 6, 200, 0.5), P('rotation', 'Rotation (±)', 180, 0, 180, 5, '°'),
    P('jitter', 'Irregularity', 0.35, 0, 1, 0.05, ''), P('sizeJitter', 'Size variation', 0.2, 0, 0.6, 0.05, ''), P('seed', 'Seed', 1, 0, 99999, 1, ''));
  pat.body.append(h('button', { class: 'secondary', onclick: () => { store.set(['pattern', 'seed'], Math.floor(Math.random() * 99999)); store.settle(); } }, 'Shuffle the pattern'));

  // --- Proof ---
  const pr = section('Proof details', { id: 'sec-proof' });
  const pageSel = h('select', { id: 'proof-page', onchange: () => { store.set(['proof', 'page'], pageSel.value); store.settle(); } }, Object.entries(PROOF_PAGES).map(([k, p]) => h('option', { value: k }, p.label)));
  pr.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Page'), h('span', { class: 'ctl' }, pageSel)));
  syncs.push((d) => syncValue(pageSel, d.proof.page ?? 'a3'));
  add(pr, textControl(store, ['proof', 'version'], 'Version'), textControl(store, ['proof', 'date'], 'Date'), textControl(store, ['proof', 'author'], 'Prepared by'),
    textControl(store, ['proof', 'notes'], 'Notes for the printer', { multiline: true }));

  // --- Mockup ---
  const mk = section('Mockup', { id: 'sec-mockup' });
  const photoIn = h('input', { type: 'file', accept: 'image/*', id: 'mockup-photo', onchange: async () => {
    const file = photoIn.files[0];
    photoIn.value = '';
    if (!file) return;
    try {
      const photo = await readPhoto(file);
      store.set(['mockup', 'photo'], { ...photo, zoom: 1, dx: 0, dy: 0 });
      store.settle();
      toast('Photo added: it shows through the window on the Mockup tab.');
    } catch (err) { toast(err.message, 'error'); }
  } });
  const photoInfo = h('span', { class: 'hint' });
  const removePhoto = h('button', { class: 'ghost', id: 'mockup-remove', onclick: () => { store.set(['mockup', 'photo'], null); store.settle(); } }, 'Remove photo');
  const viewSel = h('select', { id: 'mockup-view', onchange: () => { store.set(['mockup', 'view'], viewSel.value); store.settle(); } }, MOCKUP_VIEWS.map(([k, label]) => h('option', { value: k }, label)));
  const bg = h('input', { type: 'color', id: 'mockup-bg', oninput: () => store.set(['mockup', 'background'], bg.value, { coalesce: 'mk-bg' }), onchange: () => store.settle() });
  const dpi = h('select', { id: 'mockup-dpi' }, [[96, 'Screen (96 dpi)'], [150, 'Standard (150 dpi)'], [300, 'High (300 dpi)']].map(([v, label]) => h('option', { value: v, selected: v === 150 }, label)));
  mk.body.append(
    h('label', { class: 'row stack' }, h('span', { class: 'lbl' }, 'Product photo'), photoIn, photoInfo), removePhoto,
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Show'), h('span', { class: 'ctl' }, viewSel)),
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'Background'), h('span', { class: 'ctl' }, bg)));
  syncs.push((d) => {
    const p = d.mockup?.photo;
    photoInfo.textContent = p ? `${p.name ?? 'Photo'} · ${p.w} × ${p.h} px` : 'A cut-out PNG on transparent or white works best.';
    removePhoto.hidden = !p;
    syncValue(viewSel, d.mockup?.view ?? 'front');
    syncValue(bg, d.mockup?.background ?? '#e8e4dc');
  });
  const M = (key, label, def, min, max, step, unit) => fieldControl(store, ['mockup', 'photo'], { key, label, type: 'number', default: def, min, max, step, unit, when: 'src' });
  add(mk, M('zoom', 'Photo zoom', 1, 0.2, 5, 0.05, '×'), M('dx', 'Photo left / right', 0, -1, 1, 0.02, ''), M('dy', 'Photo up / down', 0, -1, 1, 0.02, ''),
    fieldControl(store, ['mockup'], { key: 'angle', label: 'Tilt', type: 'number', default: 0, min: -15, max: 15, step: 0.5, unit: '°' }));
  mk.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, 'PNG resolution'), h('span', { class: 'ctl' }, dpi)));

  return { el, sync: (d) => { for (const s of syncs) s(d); } };
}

// Reads a photo and scales it to at most 2400 px, so projects stay small.
async function readPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG or JPG).');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), hh = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    c.getContext('2d').drawImage(img, 0, 0, w, hh);
    const png = file.type === 'image/png' || file.type === 'image/webp';
    return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w, h: hh, name: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Asks for a name; used by the project section.
export async function askName(title, value) {
  const input = h('input', { type: 'text', value });
  return dialog(title, input, [['Cancel', null, 'ghost'], ['OK', () => input.value.trim(), 'primary']]);
}

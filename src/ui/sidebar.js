// The left panel, in five tabs: Project, Format (size and layout), Colours (with the parts
// pattern), Print (prepress and proof) and Mockup. The tab is remembered. The pack's texts
// are edited on the element that shows them (the inspector's card, ui/textFields.js).
import { h, clear, syncValue, toast } from './dom.js';
import { fieldControl, textControl, section } from './controls.js';
import { paletteEditor } from './paletteEditor.js';
import { icon } from './icons.js';
import { getPref, setPref } from './prefs.js';
import { t, label, msgOf } from '../i18n/index.js';
import { FORMATS, TEMPLATES } from '../registry.js';
import { switchFormat, setIn } from '../design.js';
import { applyDieline } from '../edit/importDieline.js';
import { addPicture } from '../edit/pictures.js';
import { readDieline, readPicture } from './importFiles.js';
import { PATTERN_ICONS } from '../brand/patternIcons.js';
import { PATTERN_STYLES, PATTERN_SCALING } from '../render/pattern.js';
import { PROOF_PAGES } from '../render/proof.js';
import { MOCKUP_VIEWS } from '../render/mockup.js';
import { OUTPUT_INTENTS } from '../export/documents.js';

export function sidebar(store, { getParts, project, select }) {
  const syncs = [];
  const add = (sec, ...ctrls) => {
    for (const c of ctrls) { sec.body.append(c.el); syncs.push(c.sync); }
    return sec;
  };

  // --- Project ---
  const proj = section(t('side.projectSection'), { id: 'sec-project' });
  proj.body.append(project.el);
  syncs.push(project.sync);

  // --- Format & size ---
  const fmt = section(t('side.formatSection'), { id: 'sec-format' });
  const formatSel = h('select', { id: 'format', onchange: () => { store.commit(switchFormat(store.get(), formatSel.value)); store.settle(); } });
  let hadCustom = null;
  const templateSel = h('select', { id: 'template', onchange: () => { store.commit(switchFormat(store.get(), store.get().format, templateSel.value)); store.settle(); } });
  // The sizes the pack is made in: one pick sets width and height; any other numbers read "Custom".
  const sizeSel = h('select', { id: 'size', onchange: () => {
    const [w, hh] = sizeSel.value.split('x').map(Number);
    if (!w) return;
    store.commit(setIn(setIn(store.get(), ['dims', 'width'], w), ['dims', 'height'], hh));
    store.settle();
  } });
  const sizeRow = h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('side.size')), h('span', { class: 'ctl' }, sizeSel));
  const dimsBox = h('div', { class: 'fields' });
  let dimsSig = '';
  let dimSyncs = [];
  // Files: an .ai or PDF gives a dieline (its cyan cut and red fold lines) or a picture; images give pictures.
  const pickFile = (accept, onFile) => {
    const input = h('input', { type: 'file', accept, hidden: true, onchange: async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      document.body.classList.add('busy');
      try { await onFile(file); } catch (err) { console.error(err); toast(msgOf(err), 'error'); } finally { document.body.classList.remove('busy'); }
    } });
    return input;
  };
  const dielineInput = pickFile('.ai,.pdf,application/pdf', async (file) => {
    const { dieline, name } = await readDieline(file);
    store.commit(applyDieline(store.get(), dieline, name));
    store.settle();
    toast(t('file.dielineDone', { name, w: Math.round(dieline.w * 10) / 10, h: Math.round(dieline.h * 10) / 10 }));
  });
  const pictureInput = pickFile('.ai,.pdf,application/pdf,image/png,image/jpeg,image/webp', async (file) => {
    const pic = await readPicture(file);
    const { design, id } = addPicture(store.get(), pic);
    store.commit(design);
    store.settle();
    select(`pic.${id}`);
    toast(t('file.pictureDone', { name: pic.name }));
  });
  const fileBlock = h('div', { class: 'file-block' },
    h('button', { class: 'secondary', id: 'load-dieline', onclick: () => dielineInput.click() }, icon('upload'), t('file.dieline')),
    h('button', { class: 'secondary', id: 'add-picture', onclick: () => pictureInput.click() }, icon('image'), t('file.picture')),
    dielineInput, pictureInput, h('p', { class: 'help' }, t('file.help')));
  fmt.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('side.format')), h('span', { class: 'ctl' }, formatSel)),
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('side.template')), h('span', { class: 'ctl' }, templateSel)), sizeRow, dimsBox, fileBlock);

  // --- Layout (template options) ---
  const lay = section(t('side.layoutSection'), { id: 'sec-layout' });
  const layoutBox = h('div', { class: 'fields' });
  let layoutSyncs = [];
  lay.body.append(layoutBox, h('p', { class: 'help' }, t('side.layoutHelp')));
  syncs.push((d) => {
    // The imported dieline is a format only once a file has given one.
    const hasCustom = !!d.custom;
    if (hasCustom !== hadCustom) {
      hadCustom = hasCustom;
      clear(formatSel);
      for (const f of Object.values(FORMATS)) if (!f.custom || hasCustom) formatSel.append(h('option', { value: f.id }, label(f.label)));
    }
    syncValue(formatSel, d.format);
    const f = FORMATS[d.format];
    const sig = `${d.format}|${d.template}`;
    if (sig !== dimsSig) {
      dimsSig = sig;
      clear(templateSel);
      for (const tp of f.templates) templateSel.append(h('option', { value: tp }, label(TEMPLATES[tp].label)));
      clear(sizeSel);
      sizeRow.hidden = !f.sizes;
      for (const [w, hh] of f.sizes ?? []) sizeSel.append(h('option', { value: `${w}x${hh}` }, t('side.sizeOption', { w: w / 10, h: hh / 10 })));
      sizeSel.append(h('option', { value: 'custom' }, t('side.sizeCustom')));
      clear(dimsBox);
      dimSyncs = f.fields.map((field) => { const c = fieldControl(store, ['dims'], field); dimsBox.append(c.el); return c.sync; });
      clear(layoutBox);
      layoutSyncs = TEMPLATES[d.template].options.map((field) => { const c = fieldControl(store, ['options'], field); layoutBox.append(c.el); return c.sync; });
    }
    syncValue(templateSel, d.template);
    const key = `${d.dims.width}x${d.dims.height}`;
    syncValue(sizeSel, (f.sizes ?? []).some(([w, hh]) => `${w}x${hh}` === key) ? key : 'custom');
    for (const s of dimSyncs) s(d);
    for (const s of layoutSyncs) s(d);
  });

  // --- Colours ---
  const col = section(t('side.coloursSection'), { id: 'sec-colours' });
  add(col, paletteEditor(store, getParts));

  // --- Pattern ---
  const pat = section(t('side.patternSection'), { id: 'sec-pattern' });
  const icons = h('div', { class: 'icon-grid' });
  const iconBoxes = PATTERN_ICONS.map((ic) => {
    const cb = h('input', { type: 'checkbox', 'aria-label': label(ic.label), onchange: () => {
      const all = PATTERN_ICONS.map((i) => i.id);
      const cur = store.get().pattern.icons ?? all;
      let next = cb.checked ? [...new Set([...cur, ic.id])] : cur.filter((x) => x !== ic.id);
      if (!next.length) { toast(t('pattern.keepOne'), 'error'); cb.checked = true; return; }
      if (next.length === all.length) next = null;
      store.set(['pattern', 'icons'], next);
      store.settle();
    } });
    const thumb = `<svg viewBox="-55 -55 110 110" width="34" height="34">${ic.paths.map((p) => `<path fill="currentColor" fill-rule="${p.rule}" d="${p.d}"/>`).join('')}</svg>`;
    icons.append(h('label', { class: 'icon-pick', title: label(ic.label) }, cb, h('span', { innerHTML: thumb })));
    return [ic.id, cb];
  });
  pat.body.append(h('p', { class: 'help' }, t('pattern.help')), icons);
  syncs.push((d) => { for (const [id, cb] of iconBoxes) syncValue(cb, !d.pattern.icons || d.pattern.icons.includes(id)); });
  const P = (key, text, def, min, max, step, unit = 'mm') => fieldControl(store, ['pattern'], { key, text, type: 'number', default: def, min, max, step, unit });
  add(pat, fieldControl(store, ['pattern'], { key: 'style', text: t('pattern.style'), type: 'select', default: 'solid', options: PATTERN_STYLES }),
    fieldControl(store, ['pattern'], { key: 'outline', text: t('pattern.outline'), type: 'number', default: 3, min: 0.5, max: 10, step: 0.5, unit: '', whenNot: ['style', 'solid'] }),
    fieldControl(store, ['pattern'], { key: 'scaling', text: t('pattern.scaling'), type: 'select', default: 'auto', options: PATTERN_SCALING }),
    fieldControl(store, ['pattern'], { key: 'uniform', text: t('pattern.uniform'), type: 'checkbox', default: true }),
    P('size', t('pattern.size'), 18, 3, 120, 0.5), P('spacing', t('pattern.spacing'), 30, 6, 200, 0.5), P('rotation', t('pattern.rotation'), 180, 0, 180, 5, '°'),
    P('jitter', t('pattern.jitter'), 0.35, 0, 1, 0.05, ''), P('sizeJitter', t('pattern.sizeJitter'), 0.2, 0, 0.6, 0.05, ''), P('seed', t('pattern.seed'), 1, 0, 99999, 1, ''));
  pat.body.append(h('button', { class: 'secondary', onclick: () => { store.set(['pattern', 'seed'], Math.floor(Math.random() * 99999)); store.settle(); } }, t('pattern.shuffle')));

  // --- Print & export (prepress) ---
  const px = section(t('side.printSection'), { id: 'sec-print' });
  px.body.append(h('p', { class: 'help' }, t('print.help')));
  const X = (key, text, type, extra = {}) => fieldControl(store, ['export'], { key, text, type, ...extra });
  add(px,
    X('outputIntent', t('print.intent'), 'select', { default: 'FOGRA39', options: Object.entries(OUTPUT_INTENTS).map(([k, v]) => [k, v.label]) }),
    textControl(store, ['export', 'cutInk'], t('print.cutInk')),
    textControl(store, ['export', 'creaseInk'], t('print.creaseInk')),
    X('marks', t('print.marks'), 'checkbox', { default: true }),
    X('whitePlate', t('print.whitePlate'), 'checkbox', { default: true }),
    textControl(store, ['export', 'whiteInk'], t('print.whiteInk')),
    X('bwr', t('print.bwr'), 'number', { default: 0, min: 0, max: 0.1, step: 0.005, unit: 'mm' }),
  );

  // --- Proof ---
  const pr = section(t('side.proofSection'), { id: 'sec-proof' });
  const pageSel = h('select', { id: 'proof-page', onchange: () => { store.set(['proof', 'page'], pageSel.value); store.settle(); } }, Object.entries(PROOF_PAGES).map(([k, p]) => h('option', { value: k }, label(p.label))));
  pr.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('proof.page')), h('span', { class: 'ctl' }, pageSel)));
  syncs.push((d) => syncValue(pageSel, d.proof.page ?? 'a3'));
  add(pr, textControl(store, ['proof', 'version'], t('proof.version')), textControl(store, ['proof', 'date'], t('proof.date')), textControl(store, ['proof', 'author'], t('proof.author')),
    textControl(store, ['proof', 'notes'], t('proof.notes'), { multiline: true }));

  // --- Mockup ---
  const mk = section(t('side.mockupSection'), { id: 'sec-mockup' });
  const photoIn = h('input', { type: 'file', accept: 'image/*', id: 'mockup-photo', hidden: true, onchange: async () => {
    const file = photoIn.files[0];
    photoIn.value = '';
    if (!file) return;
    try {
      const photo = await readPhoto(file);
      store.set(['mockup', 'photo'], { ...photo, zoom: 1, dx: 0, dy: 0 });
      store.settle();
      toast(t('mockup.photoAdded'));
    } catch (err) { toast(msgOf(err), 'error'); }
  } });
  const photoInfo = h('span', { class: 'hint' });
  const removePhoto = h('button', { class: 'ghost', id: 'mockup-remove', onclick: () => { store.set(['mockup', 'photo'], null); store.settle(); } }, t('mockup.removePhoto'));
  const viewSel = h('select', { id: 'mockup-view', onchange: () => { store.set(['mockup', 'view'], viewSel.value); store.settle(); } }, MOCKUP_VIEWS.map(([k, l]) => h('option', { value: k }, label(l))));
  const bg = h('input', { type: 'color', id: 'mockup-bg', oninput: () => store.set(['mockup', 'background'], bg.value, { coalesce: 'mk-bg' }), onchange: () => store.settle() });
  const dpi = h('select', { id: 'mockup-dpi' }, [[96, t('mockup.dpiScreen')], [150, t('mockup.dpiStandard')], [300, t('mockup.dpiHigh')]].map(([v, l]) => h('option', { value: v, selected: v === 150 }, l)));
  mk.body.append(
    // The browser's own file button would speak the browser's language, not the editor's.
    h('div', { class: 'row stack' }, h('span', { class: 'lbl' }, t('mockup.photo')),
      h('div', { class: 'file-pick' }, h('button', { class: 'secondary', id: 'mockup-choose', onclick: () => photoIn.click() }, icon('image', 16), t('mockup.choosePhoto')), photoIn), photoInfo), removePhoto,
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('mockup.view')), h('span', { class: 'ctl' }, viewSel)),
    h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('mockup.background')), h('span', { class: 'ctl' }, bg)));
  syncs.push((d) => {
    const p = d.mockup?.photo;
    photoInfo.textContent = p ? t('mockup.photoInfo', { name: p.name ?? t('mockup.photoName'), w: p.w, h: p.h }) : t('mockup.photoHint');
    removePhoto.hidden = !p;
    syncValue(viewSel, d.mockup?.view ?? 'front');
    syncValue(bg, d.mockup?.background ?? '#e8e4dc');
  });
  const M = (key, text, def, min, max, step, unit) => fieldControl(store, ['mockup', 'photo'], { key, text, type: 'number', default: def, min, max, step, unit, when: 'src' });
  add(mk, M('zoom', t('mockup.zoom'), 1, 0.2, 5, 0.05, '×'), M('dx', t('mockup.dx'), 0, -1, 1, 0.02, ''), M('dy', t('mockup.dy'), 0, -1, 1, 0.02, ''),
    fieldControl(store, ['mockup'], { key: 'angle', text: t('mockup.tilt'), type: 'number', default: 0, min: -15, max: 15, step: 0.5, unit: '°' }));
  mk.body.append(h('label', { class: 'row' }, h('span', { class: 'lbl' }, t('mockup.dpi')), h('span', { class: 'ctl' }, dpi)));

  // --- the tabs ---
  const TABS = [
    { id: 'project', text: t('side.project'), icon: 'folder', sections: [proj] },
    { id: 'format', text: t('side.format'), icon: 'ruler', sections: [fmt, lay] },
    { id: 'colours', text: t('side.colours'), icon: 'palette', sections: [col, pat] },
    { id: 'print', text: t('side.print'), icon: 'printer', sections: [px, pr] },
    { id: 'mockup', text: t('side.mockup'), icon: 'image', sections: [mk] },
  ];
  const rail = h('div', { class: 'side-rail', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('side.tabs') });
  const pages = h('div', { class: 'side-pages' });
  for (const tab of TABS) {
    tab.button = h('button', { role: 'tab', id: `side-tab-${tab.id}`, 'aria-controls': `side-page-${tab.id}`, dataset: { sideTab: tab.id }, onclick: () => show(tab.id, true) },
      icon(tab.icon, 20), h('span', {}, tab.text));
    tab.page = h('div', { class: 'side-page', role: 'tabpanel', id: `side-page-${tab.id}`, 'aria-labelledby': `side-tab-${tab.id}` }, tab.sections.map((s) => s.el));
    rail.append(tab.button);
    pages.append(tab.page);
  }
  rail.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((x) => x.button === document.activeElement);
    if (i < 0) return;
    const go = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const tab = TABS[(go + TABS.length) % TABS.length];
    show(tab.id, true);
    tab.button.focus();
  });
  function show(id, remember = false) {
    const tab = TABS.find((x) => x.id === id) ?? TABS[1];
    for (const x of TABS) {
      const on = x === tab;
      x.button.setAttribute('aria-selected', String(on));
      x.button.tabIndex = on ? 0 : -1;
      x.page.hidden = !on;
    }
    if (remember) setPref('sideTab', tab.id);
    pages.scrollTop = 0;
  }
  show(getPref('sideTab'));

  // Opens the tab that holds a section (e.g. 'sec-layout') and scrolls to it.
  function showSection(secId) {
    const tab = TABS.find((x) => x.sections.some((s) => s.el.id === secId));
    if (!tab) return;
    show(tab.id, true);
    const sec = tab.sections.find((s) => s.el.id === secId).el;
    sec.open = true;
    sec.scrollIntoView({ block: 'start' });
  }

  const el = h('div', { class: 'sidebar-inner' }, rail, pages);
  return { el, showSection, showTab: (id) => show(id, true), sync: (d) => { for (const s of syncs) s(d); } };
}

// Reads a photo and scales it to at most 2400 px, so projects stay small.
async function readPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error(t('mockup.notImage'));
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


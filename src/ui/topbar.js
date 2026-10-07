// The top bar: the design's name and save state, undo and redo, the language switch,
// preflight with its badge, the Export menu (grouped by who the file is for) and the quick
// Print PDF button. It also autosaves into this browser's library.
import { h, toast, dialog } from './dom.js';
import { icon } from './icons.js';
import { menuButton } from './menu.js';
import { switchLang } from './lang.js';
import { t, msgOf, getLang, LANGUAGES } from '../i18n/index.js';
import { printSvg, printDocument, proofSvg } from '../export/documents.js';
import { mockupSvg } from '../render/mockup.js';
import { download, svgBlob, pngBlob, pdfBlob, slug } from '../export/files.js';
import { dielineDxf } from '../export/dxf.js';
import { preflight } from '../preflight.js';
import { saveProject } from '../storage.js';

export function topbar(root, { store, env, getId, project, today, select }) {
  const d0 = () => store.get();
  const name = () => slug(d0().name);

  // --- name and save state ---
  const docName = h('span', { class: 'doc-name' });
  const saved = h('span', { class: 'saved', id: 'saved', 'aria-live': 'polite' });

  // --- undo, redo ---
  const undo = h('button', { id: 'undo', class: 'icon-btn', title: t('top.undoTip'), 'aria-label': t('top.undo'), disabled: true, onclick: () => store.undo() }, icon('undo'));
  const redo = h('button', { id: 'redo', class: 'icon-btn', title: t('top.redoTip'), 'aria-label': t('top.redo'), disabled: true, onclick: () => store.redo() }, icon('redo'));

  // --- language ---
  const langs = h('div', { class: 'lang-switch', role: 'group', 'aria-label': t('top.language'), title: t('top.languageTip') },
    LANGUAGES.map(([code, full, short]) => h('button', { dataset: { lang: code }, 'aria-pressed': String(code === getLang()), title: full,
      onclick: () => switchLang(code, saveNow) }, short)));

  // --- exports ---
  const busy = async (label, fn) => {
    document.body.classList.add('busy');
    try { await fn(); toast(t('export.ready', { label })); } catch (err) { console.error(err); toast(t('export.failed', { label, error: msgOf(err) }), 'error'); } finally { document.body.classList.remove('busy'); }
  };
  const EXPORTS = {
    'print-pdf': {
      label: t('export.printPdf'), hint: t('export.printPdfHint'),
      run: async () => {
        const pf = preflight(d0(), env);
        if (pf.errors && !(await showPreflight(pf, true))) return;
        busy(t('export.printPdf'), async () => { const doc = printDocument(d0(), env, { date: today() }); download(await pdfBlob(doc.pages, doc), `${name()}-print.pdf`); });
      },
    },
    'dieline-dxf': { label: t('export.dielineDxf'), hint: t('export.dielineDxfHint'),
      run: () => busy(t('export.dielineDxf'), async () => download(new Blob([dielineDxf(d0(), env)], { type: 'application/dxf' }), `${name()}-dieline.dxf`)) },
    'print-svg': { label: t('export.printSvg'), hint: t('export.printSvgHint'),
      run: () => busy(t('export.printSvg'), async () => download(svgBlob(printSvg(d0(), env)), `${name()}-print.svg`)) },
    'proof-pdf': { label: t('export.proofPdf'), hint: t('export.proofPdfHint'),
      run: () => busy(t('export.proofPdf'), async () => download(await pdfBlob(proofSvg(d0(), env, d0().proof.page ?? 'a3'), { title: `${d0().name} proof` }), `${name()}-proof.pdf`)) },
    'proof-png': { label: t('export.proofPng'), hint: t('export.proofPngHint'),
      run: () => busy(t('export.proofPng'), async () => download(await pngBlob(proofSvg(d0(), env, d0().proof.page ?? 'a3'), { dpi: 200 }), `${name()}-proof.png`)) },
    'mockup-png': { label: t('export.mockupPng'), hint: t('export.mockupPngHint'),
      run: () => busy(t('export.mockupPng'), async () => download(await pngBlob(mockupSvg(d0(), env).svg, { dpi: Number(document.getElementById('mockup-dpi')?.value) || 150 }), `${name()}-mockup.png`)) },
  };
  const item = (key) => h('button', { role: 'menuitem', dataset: { export: key }, onclick: () => EXPORTS[key].run() },
    h('span', { class: 'mi-label' }, EXPORTS[key].label), h('span', { class: 'mi-hint' }, EXPORTS[key].hint));
  const group = (title, keys) => h('div', { class: 'menu-group', role: 'group', 'aria-label': title }, h('div', { class: 'menu-heading' }, title), keys.map(item));
  const menu = h('div', { id: 'export-menu', class: 'menu', role: 'menu', 'aria-label': t('top.export'), hidden: true },
    group(t('export.forPrinter'), ['print-pdf', 'dieline-dxf', 'print-svg']),
    group(t('export.forApproval'), ['proof-pdf', 'proof-png']),
    group(t('export.presentation'), ['mockup-png']));
  const exportButton = h('button', { id: 'export-button', class: 'secondary', 'aria-controls': 'export-menu' }, icon('download'), h('span', {}, t('top.export')), icon('chevron', 14));
  menuButton(exportButton, menu);
  const quick = h('button', { id: 'export-quick', class: 'primary', title: EXPORTS['print-pdf'].hint, onclick: () => EXPORTS['print-pdf'].run() }, icon('printer'), h('span', {}, EXPORTS['print-pdf'].label));

  // --- preflight ---
  const badge = h('span', { id: 'preflight-badge', class: 'badge' });
  const pfButton = h('button', { id: 'preflight', class: 'secondary', title: t('top.preflightTip'), onclick: () => showPreflight(preflight(d0(), env)) }, icon('shield'), h('span', {}, t('top.preflight')), badge);
  let pfTimer = null;
  const refreshPreflight = () => {
    clearTimeout(pfTimer);
    pfTimer = setTimeout(() => {
      const pf = preflight(d0(), env);
      badge.textContent = pf.errors ? pf.errors : pf.warnings ? pf.warnings : '✓';
      badge.className = `badge${pf.errors ? ' error' : pf.warnings ? ' warn' : ''}`;
      badge.title = pf.errors ? t('pf.errors', { n: pf.errors }) : pf.warnings ? t('pf.warnings', { n: pf.warnings }) : t('pf.clean');
    }, 600);
  };
  const TOPICS = { Barcode: t('pf.topic.barcode'), Colour: t('pf.topic.colour'), Text: t('pf.topic.text'), Layout: t('pf.topic.layout'), Bleed: t('pf.topic.bleed'), Images: t('pf.topic.images'), Window: t('pf.topic.window'), Summary: t('pf.topic.summary') };
  const LEVELS = { error: t('pf.level.error'), warn: t('pf.level.warn'), ok: t('pf.level.ok') };
  async function showPreflight(pf, beforeExport = false) {
    const icons = { error: '✕', warn: '!', ok: '✓' };
    const order = { error: 0, warn: 1, ok: 2 };
    let picked = null;
    const list = h('div', { class: 'preflight-list' }, [...pf.items].sort((a, b) => order[a.level] - order[b.level]).map((it) =>
      h('div', { class: `pf-item ${it.level}` }, h('span', { class: 'pf-level', title: LEVELS[it.level], 'aria-label': LEVELS[it.level] }, icons[it.level]),
        h('span', { class: 'pf-topic' }, TOPICS[it.topic] ?? it.topic), h('span', { class: 'pf-msg' }, msgOf(it)),
        it.element ? h('button', { class: 'link tiny pf-show', onclick: () => { picked = it.element; document.querySelector('.modal-back:last-child .modal-buttons button')?.click(); } }, t('pf.show')) : null)));
    const title = pf.errors ? t('pf.titleErrors', { n: pf.errors }) : pf.warnings ? t('pf.titleWarnings', { n: pf.warnings }) : t('pf.titleClean');
    const body = h('div', { class: 'pf-body' }, beforeExport ? h('p', {}, t('pf.beforeExport')) : null, list);
    const r = await dialog(title, body, beforeExport ? [[t('common.cancel'), false, 'ghost'], [t('pf.exportAnyway'), true, 'danger']] : [[t('common.close'), false, 'primary']], { wide: true });
    if (picked) { select(picked); return false; }
    return r;
  }

  // --- autosave ---
  let saveTimer = null;
  const write = async () => {
    try { await saveProject(getId(), d0()); saved.textContent = t('top.saved'); saved.classList.remove('error'); project.refresh(); } catch (err) { saved.textContent = t('top.notSaved', { error: msgOf(err) }); saved.classList.add('error'); }
  };
  const autosave = () => {
    clearTimeout(saveTimer);
    saved.textContent = t('top.saving');
    saveTimer = setTimeout(() => { saveTimer = null; write(); }, 700);
  };
  // Saves at once (before the page reloads in another language).
  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    await write();
  }

  root.append(
    h('div', { class: 'doc-info' }, docName, saved),
    h('div', { class: 'top-actions' }, undo, redo),
    h('div', { class: 'top-right' }, langs, pfButton, h('div', { class: 'menu-wrap' }, exportButton, menu), quick));

  return {
    showPreflight,
    saveNow,
    sync(d, reason) {
      docName.textContent = d.name || t('project.untitled');
      docName.title = d.name;
      undo.disabled = !store.canUndo();
      redo.disabled = !store.canRedo();
      document.title = t('app.title', { name: d.name || t('project.untitled') });
      if (reason !== 'init') autosave();
      refreshPreflight();
    },
  };
}

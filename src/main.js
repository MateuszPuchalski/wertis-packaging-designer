// Wires the editor together: the language, fonts, the store, the top bar, the panels, the
// preview, autosave and keyboard shortcuts.
import './ui/lang.js'; // first: everything below speaks the chosen language
import { t, msgOf, misses } from './i18n/index.js';
import { loadTextEngine } from './text/browserFonts.js';
import { createDesign } from './design.js';
import { Store } from './store.js';
import { panelsWithElements } from './render/sheet.js';
import { printSvg, printDocument, proofSvg } from './export/documents.js';
import { mockupSvg } from './render/mockup.js';
import { download, pngBlob, pdfBlob, slug } from './export/files.js';
import { dielineDxf } from './export/dxf.js';
import { preflight } from './preflight.js';
import { currentId, rememberCurrent, loadProject, newId } from './storage.js';
import { Stage } from './ui/stage.js';
import { sidebar } from './ui/sidebar.js';
import { inspector } from './ui/inspector.js';
import { projectSection } from './ui/project.js';
import { topbar } from './ui/topbar.js';
import { h } from './ui/dom.js';

const today = () => new Date().toISOString().slice(0, 10);

async function boot() {
  const status = document.getElementById('boot-status');
  let text;
  try {
    text = await loadTextEngine();
  } catch (err) {
    status.textContent = t('boot.fonts', { error: msgOf(err) });
    return;
  }
  const env = { text };

  let id = currentId();
  let design = id ? await loadProject(id).catch(() => null) : null;
  if (!design) {
    id = newId('project');
    design = createDesign({ date: today() });
  }
  rememberCurrent(id);
  const store = new Store(design);

  let partsCache = { design: null, parts: null };
  const getParts = () => {
    const d = store.get();
    if (partsCache.design !== d) partsCache = { design: d, parts: panelsWithElements(d, env) };
    return partsCache.parts;
  };

  const select = (sid) => { stage.select(sid); insp.sync(store.get()); };
  const stage = new Stage(document.getElementById('stage'), {
    store, env,
    onSelect: () => insp.sync(store.get()),
    renderMockup: (d) => mockupSvg(d, env),
    showSection: (sec) => side.showSection(sec),
  });
  stage.onSnapshot = (blob) => download(blob, `${slug(store.get().name)}-3d.png`);
  const insp = inspector(store, { getParts, getHit: (hid) => stage.hit(hid), select, getSelected: () => stage.selected, showSection: (sec) => side.showSection(sec) });
  stage.onRendered = () => insp.refresh();
  const project = projectSection(store, { getId: () => id, setId: (nid) => { id = nid; rememberCurrent(nid); }, today });
  const side = sidebar(store, { getParts, project });
  // Preflight's Show: the element on the Design tab.
  const show = (sid) => { if (stage.tab !== 'design') stage.setTab('design'); select(sid); };
  const top = topbar(document.querySelector('.topbar'), { store, env, getId: () => id, project, today, select: show });
  document.getElementById('sidebar').append(side.el);
  document.getElementById('inspector').append(insp.el);

  const sync = (d, reason) => {
    if (reason === 'replace') stage.select(null);
    stage.schedule();
    side.sync(d);
    insp.sync(d);
    top.sync(d, reason);
  };
  store.subscribe(sync);
  sync(store.get(), 'init');
  status.remove();
  document.body.classList.add('ready');

  window.addEventListener('keydown', (e) => {
    // AltGr (Polish letters on Windows) arrives as Ctrl+Alt: never a shortcut.
    if (e.defaultPrevented || e.isComposing || e.getModifierState?.('AltGraph')) return;
    const a = document.activeElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName) || a?.isContentEditable;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); store.redo(); return; }
    // Tabs, menus and dialogs use the arrow keys themselves.
    if (typing || a?.closest?.('[role="tablist"], [role="menu"], .modal-back')) return;
    if (e.key === 'Escape') { select(null); return; }
    if (stage.handleKey(e)) { e.preventDefault(); return; }
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (dirs[e.key] && stage.nudge(...dirs[e.key])) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    stage.keyUp(e);
    if (e.key.startsWith('Arrow')) store.settle();
  });

  // Test hooks (scripts/playtest.js drives the app through these).
  window.wertis = { store, env, stage, misses, saveNow: () => top.saveNow(), printSvg: () => printSvg(store.get(), env), printDocument: () => printDocument(store.get(), env), preflight: () => preflight(store.get(), env), dxf: () => dielineDxf(store.get(), env), proofSvg: (page) => proofSvg(store.get(), env, page), mockupSvg: () => mockupSvg(store.get(), env).svg, pdfBlob, pngBlob };
}

boot().catch((err) => {
  console.error(err);
  const s = document.getElementById('boot-status');
  if (s) s.textContent = t('boot.failed', { error: msgOf(err) });
  document.body.append(h('pre', {}, String(err.stack ?? err)));
});

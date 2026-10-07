// Wires the editor together: fonts, the store, the panels, the preview, exports, autosave
// and keyboard shortcuts.
import { loadTextEngine } from './text/browserFonts.js';
import { createDesign } from './design.js';
import { Store } from './store.js';
import { panelsWithElements } from './render/sheet.js';
import { printSvg, printDocument, proofSvg } from './export/documents.js';
import { mockupSvg } from './render/mockup.js';
import { download, svgBlob, pngBlob, pdfBlob, slug } from './export/files.js';
import { currentId, rememberCurrent, loadProject, saveProject, newId } from './storage.js';
import { Stage } from './ui/stage.js';
import { sidebar } from './ui/sidebar.js';
import { inspector } from './ui/inspector.js';
import { projectSection } from './ui/project.js';
import { h, toast } from './ui/dom.js';

const today = () => new Date().toISOString().slice(0, 10);

async function boot() {
  const status = document.getElementById('boot-status');
  let text;
  try {
    text = await loadTextEngine();
  } catch (err) {
    status.textContent = `The fonts did not load: ${err.message}. Start the app with “npm start” and open http://localhost:8000.`;
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

  const stage = new Stage(document.getElementById('stage'), {
    store, env,
    onSelect: () => insp.sync(store.get()),
    renderMockup: (d) => mockupSvg(d, env),
  });
  stage.onSnapshot = (blob) => download(blob, `${slug(store.get().name)}-3d.png`);
  const insp = inspector(store, { getParts, getHit: (hid) => stage.hit(hid), select: (sid) => { stage.select(sid); insp.sync(store.get()); }, getSelected: () => stage.selected });
  const project = projectSection(store, { getId: () => id, setId: (nid) => { id = nid; rememberCurrent(nid); }, today });
  const side = sidebar(store, { getParts, project });
  document.getElementById('sidebar').append(side.el);
  document.getElementById('inspector').append(insp.el);

  // Top bar.
  const undo = document.getElementById('undo'), redo = document.getElementById('redo');
  undo.onclick = () => store.undo();
  redo.onclick = () => store.redo();
  const busy = async (label, fn) => {
    document.body.classList.add('busy');
    try { await fn(); toast(`${label} ready.`); } catch (err) { console.error(err); toast(`${label} failed: ${err.message}`, 'error'); } finally { document.body.classList.remove('busy'); }
  };
  const name = () => slug(store.get().name);
  const exportsMenu = {
    'print-pdf': () => busy('Print PDF', async () => { const doc = printDocument(store.get(), env); download(await pdfBlob(doc.pages, { title: doc.title, cmyk: doc.cmyk }), `${name()}-print.pdf`); }),
    'print-svg': () => busy('Print SVG', async () => download(svgBlob(printSvg(store.get(), env)), `${name()}-print.svg`)),
    'proof-pdf': () => busy('Proof PDF', async () => download(await pdfBlob(proofSvg(store.get(), env, store.get().proof.page ?? 'a3'), { title: `${store.get().name} proof` }), `${name()}-proof.pdf`)),
    'proof-png': () => busy('Proof PNG', async () => download(await pngBlob(proofSvg(store.get(), env, store.get().proof.page ?? 'a3'), { dpi: 200 }), `${name()}-proof.png`)),
    'mockup-png': () => busy('Mockup PNG', async () => download(await pngBlob(mockupSvg(store.get(), env).svg, { dpi: Number(document.getElementById('mockup-dpi').value) || 150 }), `${name()}-mockup.png`)),
  };
  for (const [key, fn] of Object.entries(exportsMenu)) document.querySelector(`[data-export="${key}"]`).onclick = fn;

  // Autosave into this browser's library.
  let saveTimer = null;
  const saved = document.getElementById('saved');
  const autosave = () => {
    clearTimeout(saveTimer);
    saved.textContent = 'Saving…';
    saveTimer = setTimeout(async () => {
      try { await saveProject(id, store.get()); saved.textContent = 'Saved in this browser'; project.refresh(); } catch (err) { saved.textContent = `Not saved: ${err.message}`; }
    }, 700);
  };

  const sync = (d, reason) => {
    stage.schedule();
    side.sync(d);
    insp.sync(d);
    undo.disabled = !store.canUndo();
    redo.disabled = !store.canRedo();
    document.title = `${d.name} · WERTIS Packaging Designer`;
    if (reason !== 'init') autosave();
    if (reason === 'replace') stage.select(null);
  };
  store.subscribe(sync);
  sync(store.get(), 'init');
  status.remove();
  document.body.classList.add('ready');

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); store.redo(); return; }
    if (typing) return;
    if (e.key === 'Escape') { stage.select(null); insp.sync(store.get()); }
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (dirs[e.key] && stage.nudge(...dirs[e.key])) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) store.settle(); });

  // Test hooks (scripts/playtest.js drives the app through these).
  window.wertis = { store, env, stage, printSvg: () => printSvg(store.get(), env), printDocument: () => printDocument(store.get(), env), proofSvg: (page) => proofSvg(store.get(), env, page), mockupSvg: () => mockupSvg(store.get(), env).svg, pdfBlob, pngBlob };
}

boot().catch((err) => {
  console.error(err);
  const s = document.getElementById('boot-status');
  if (s) s.textContent = `Something went wrong while starting: ${err.message}`;
  document.body.append(h('pre', {}, String(err.stack ?? err)));
});

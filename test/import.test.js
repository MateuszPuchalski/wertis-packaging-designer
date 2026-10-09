import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines, buildDieline, lineKind } from '../src/import/dieline.js';
import { createDesign, migrate, switchFormat } from '../src/design.js';
import { applyDieline } from '../src/edit/importDieline.js';
import { addPicture, removePicture, movePicture, cleanPictures, MAX_PICTURES } from '../src/edit/pictures.js';
import { renderSheet, panelsWithElements } from '../src/render/sheet.js';
import { printDocument, proofSvg } from '../src/export/documents.js';
import { dielineDxf } from '../src/export/dxf.js';
import { mockupSvg } from '../src/render/mockup.js';
import { packFaces } from '../src/render/faces.js';
import { env } from './helpers.js';

// A printer's file made on the spot: a cyan outline (a box with a notch), a red fold, and black artwork.
async function samplePdf() {
  const doc = new jsPDF({ unit: 'mm', format: [120, 80] });
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 167, 237);
  doc.lines([[60, 0], [0, 20], [-10, 0], [0, 10], [-50, 0], [0, -30]], 20, 20, [1, 1], 'S', true); // closed outline
  doc.setDrawColor(233, 48, 52);
  doc.line(20, 35, 80, 35); // a fold
  doc.setDrawColor(0, 0, 0);
  doc.line(5, 5, 60, 5); // artwork, not construction
  const page = await getDocument({ data: new Uint8Array(doc.output('arraybuffer')), verbosity: 0 }).promise.then((p) => p.getPage(1));
  return { ol: await page.getOperatorList(), height: page.getViewport({ scale: 1 }).height };
}

test('construction colours: cyan is the cut, red the fold, the rest is artwork', () => {
  assert.equal(lineKind([0, 167, 237]), 'cut');
  assert.equal(lineKind([233, 48, 52]), 'fold');
  assert.equal(lineKind([0, 0, 0]), null);
  assert.equal(lineKind([255, 145, 0]), null, 'orange is artwork');
});

test('a dieline is read from the vector data of a PDF, in mm from the top left of the lines', async () => {
  const { ol, height } = await samplePdf();
  const lines = extractLines(ol, OPS, height);
  assert.deepEqual([lines.filter((l) => l.kind === 'cut').length, lines.filter((l) => l.kind === 'fold').length], [1, 1]);
  const d = buildDieline(lines);
  assert.ok(Math.abs(d.w - 60) < 0.2 && Math.abs(d.h - 30) < 0.2, `sheet ${d.w} × ${d.h} mm`);
  assert.equal(d.cut.length, 1);
  assert.equal(d.fold.length, 1);
  assert.equal(d.outline.length, 1, 'the closed cut outline is found');
  assert.match(d.cut[0], /^M[-\d. ]+(L[-\d. ]+)+Z?$/);
  const nums = d.cut[0].match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.min(...nums) >= -0.01, 'starts at the top left');
  assert.equal(buildDieline([]), null, 'no lines, no dieline');
});

test('pieces that meet end to end make one closed outline', () => {
  const seg = (a, b) => ({ kind: 'cut', pts: [a, b], closed: false });
  const d = buildDieline([seg([0, 0], [72, 0]), seg([72, 72], [72, 0]), seg([72, 72], [0, 72]), seg([0, 72], [0, 0])]);
  assert.equal(d.outline.length, 1);
  assert.equal(d.cut.length, 4);
});

test('an imported dieline becomes the design: its own format, the lines kept, texts and palette too', async () => {
  const { ol, height } = await samplePdf();
  const dieline = buildDieline(extractLines(ol, OPS, height));
  const base = createDesign({ format: 'flatPouch' });
  const d = applyDieline(base, dieline, 'Test box');
  assert.equal(d.format, 'customDieline');
  assert.equal(d.template, 'customSheet');
  assert.equal(d.custom.name, 'Test box');
  assert.equal(d.content, base.content);
  assert.equal(d.palette, base.palette);
  const back = migrate(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back.custom, d.custom, 'saved with the project');
  assert.equal(migrate(JSON.parse(JSON.stringify(base))).custom, null, 'older projects have none');
  // Everything the app makes from a design works on it.
  const r = renderSheet(d, env());
  assert.ok(r.svg.includes(dieline.cut[0].slice(0, 20)), 'the printer’s lines are drawn');
  assert.deepEqual([r.geo.size.w, r.geo.size.h], [d.custom.w, d.custom.h]);
  assert.equal(printDocument(d, env(), { date: '2026-10-09' }).pages.length, 3);
  assert.ok(proofSvg(d, env(), 'a3').length > 1000);
  assert.ok(dielineDxf(d, env()).includes('LINE') || dielineDxf(d, env()).includes('LWPOLYLINE'));
  assert.ok(mockupSvg(d, env()).svg.length > 1000);
  assert.throws(() => packFaces(d, env()), /no 3D view/);
  // Going back to a pouch keeps the imported lines for later.
  assert.deepEqual(switchFormat(d, 'flatPouch').custom, d.custom);
});

test('pictures: added, placed in the safe area, moved to another panel, removed, and cleaned on load', () => {
  const src = 'data:image/jpeg;base64,/9j/4AAQ';
  const base = createDesign({ format: 'flatPouch' });
  const { design: one, id } = addPicture(base, { src, name: 'Hose', ratio: 2 });
  assert.equal(one.pictures[id].panel, 'front');
  const el = (d, pid) => panelsWithElements(d, env()).flatMap((p) => p.elements).find((e) => e.id === `pic.${pid}`);
  const e = el(one, id);
  assert.ok(e.movable && e.resizable && e.keepAspect && e.type === 'image');
  assert.ok(Math.abs(e.box.w / e.box.h - 2) < 1e-6, 'keeps its shape');
  const S = panelsWithElements(one, env())[0].panel.info.safe;
  assert.ok(e.box.x >= S.x - 1e-6 && e.box.x + e.box.w <= S.x + S.w + 1e-6, 'inside the safe area');
  assert.ok(renderSheet(one, env()).svg.includes('<image'), 'drawn');
  const moved = movePicture({ ...one, layout: { [`pic.${id}`]: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } } }, id, 'back');
  assert.equal(moved.pictures[id].panel, 'back');
  assert.equal(moved.layout[`pic.${id}`], undefined, 'its old place means nothing on the new panel');
  assert.ok(el(moved, id) && !panelsWithElements(moved, env())[0].elements.some((x) => x.id === `pic.${id}`));
  const gone = removePicture({ ...one, hidden: { [`pic.${id}`]: true } }, id);
  assert.deepEqual([gone.pictures, gone.hidden], [{}, {}]);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(one))).pictures, one.pictures);
  // Only images of a sane size and kind load.
  assert.deepEqual(cleanPictures({ ok: { src, panel: 'front', ratio: 1 }, bad: { src: 'https://x/y.png', panel: 'front' }, 'not ok': { src, panel: 'front' } }), { ok: { panel: 'front', src, name: '', ratio: 1 } });
  // Switching format keeps the picture on the new format's first panel.
  assert.equal(switchFormat(one, 'tuckBox').pictures[id].panel, 'body');
  let many = base;
  for (let i = 0; i < MAX_PICTURES; i++) many = addPicture(many, { src, ratio: 1 }).design;
  assert.throws(() => addPicture(many, { src, ratio: 1 }), /At most/);
});

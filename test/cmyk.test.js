import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printDocument } from '../src/export/documents.js';
import { updateSwatch } from '../src/brand/palette.js';
import { design, env } from './helpers.js';

const colours = (svg) => [...new Set([...svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-f]{6})"/g)].map((m) => m[1]))];

test('every colour in the print file has its CMYK', () => {
  for (const format of ['flatPouch', 'standUpPouch', 'tuckBox']) {
    const doc = printDocument(design({ format }), env());
    for (const page of doc.pages) {
      for (const hex of colours(page)) assert.ok(doc.cmyk.has(hex), `${format}: ${hex} has no CMYK`);
    }
  }
});

test('swatches print with their own CMYK numbers, not a conversion', () => {
  const d = design({ format: 'tuckBox' });
  d.palette = updateSwatch(d.palette, 'boxOrange', { cmyk: [0, 57, 98, 0] });
  const doc = printDocument(d, env());
  assert.deepEqual(doc.cmyk.get('#f8992c'), [0, 57, 98, 0]);
  assert.deepEqual(doc.cmyk.get('#231f20'), [0, 0, 0, 100], 'band black is pure K');
  assert.deepEqual(doc.colors.get('#00aff0'), { spot: 'Dieline', tint: 1, overprint: true }, 'cut lines are the Dieline spot ink, overprinting');
  assert.deepEqual(doc.colors.get('#eb3540'), { spot: 'Crease', tint: 1, overprint: true }, 'folds are the Crease spot ink');
});

test('print files carry no gradients: the metal look is tint strips of the swatch', () => {
  const doc = printDocument(design(), env());
  assert.ok(!doc.pages[0].includes('Gradient'));
  const silver = design().palette.find((s) => s.id === 'silver');
  const tints = [...doc.cmyk.entries()].filter(([hex]) => hex !== silver.hex && colours(doc.pages[0]).includes(hex))
    .filter(([, k]) => k[0] === 0 && k[1] === 0 && k[2] === 0 && k[3] !== silver.cmyk[3] && k[3] > 0 && k[3] < 100);
  assert.ok(tints.length >= 4, 'lighter and darker greys made from the silver swatch');
});

test('page 2 is the dieline alone, page 3 the white plate (clear film only)', () => {
  const doc = printDocument(design(), env());
  assert.equal(doc.pages.length, 3);
  assert.ok(doc.pages[1].includes('id="dieline"'));
  const art = doc.pages[1].replace(/<g id="marks">.*<\/g>$/s, '').replace(/fill="none"/g, '');
  assert.ok(!/fill="#(?!ffffff)[0-9a-f]{6}"/.test(art.replace(/<g id="marks">[\s\S]*/, '')), 'no artwork on the dieline page');
  const size = (svg) => svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/).slice(1).map(Number);
  assert.deepEqual(size(doc.pages[1]), size(doc.pages[0]));
  assert.deepEqual(size(doc.pages[0]), [506 + 24, 356 + 24], 'bleed plus a 12 mm slug for the crop marks');
  assert.ok(doc.pages[2].includes('id="white-underprint"') && doc.pages[2].includes('fill-rule="evenodd"'), 'the white plate leaves the windows out');
  assert.deepEqual(doc.colors.get('#fffffe').spot, 'White');
  assert.equal(printDocument(design({ format: 'tuckBox' }), env()).pages.length, 2, 'board needs no white plate');
});

test('PDF/X-1a settings, page boxes and spot inks', () => {
  const d = design();
  d.palette = d.palette.map((s) => (s.id === 'silver' ? { ...s, asSpot: true, spot: 'PANTONE 877 C' } : s));
  const doc = printDocument(d, env());
  assert.deepEqual(doc.pdfx, { version: 'PDF/X-1a:2001', intent: 'FOGRA39', info: 'Coated FOGRA39 (ISO 12647-2:2004)' });
  assert.deepEqual(doc.boxes.trim, { x: 15, y: 15, w: 500, h: 350 }, 'slug 12 + bleed 3');
  assert.deepEqual(doc.boxes.bleed, { x: 12, y: 12, w: 506, h: 356 });
  assert.deepEqual(doc.spots.map((s) => s.name), ['Dieline', 'Crease', 'PANTONE 877 C', 'All', 'White']);
  const silver = d.palette.find((s) => s.id === 'silver').hex;
  assert.deepEqual(doc.colors.get(silver), { spot: 'PANTONE 877 C', tint: 1 });
  const tints = [...doc.colors.values()].filter((v) => v && v.spot === 'PANTONE 877 C' && v.tint < 1);
  assert.ok(tints.length >= 3, 'the metallic strips are tints of the spot silver');
  d.export = { ...d.export, marks: false, outputIntent: 'FOGRA51' };
  const plain = printDocument(d, env());
  assert.equal(plain.pdfx.intent, 'FOGRA51');
  assert.deepEqual(plain.boxes.trim, { x: 3, y: 3, w: 500, h: 350 });
});

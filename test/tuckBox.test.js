import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, FIELDS } from '../src/formats/tuckBox.js';
import { normalizeDims } from '../src/formats/common.js';
import { printSvg } from '../src/export/documents.js';
import { renderProof } from '../src/render/proof.js';
import { renderSheet, panelsWithElements } from '../src/render/sheet.js';
import { mockupSvg } from '../src/render/mockup.js';
import { design, env } from './helpers.js';

const defaults = normalizeDims(FIELDS, {});

test('the walls add up to glue flap + 2L + 2W', () => {
  for (const [L, W, H] of [[95, 65, 50], [200, 120, 150], [40, 25, 120]]) {
    const g = layout({ ...defaults, length: L, width: W, height: H, board: 0 });
    const body = g.panels.find((p) => p.id === 'body');
    assert.equal(body.w, 2 * L + 2 * W);
    assert.equal(body.h, H);
    assert.equal(g.size.w, defaults.glue + 2 * L + 2 * W);
    assert.deepEqual(body.info.faces.map((f) => [f.id, f.x, f.w]), [['back', 0, L], ['side1', L, W], ['front', L + W, L], ['side2', 2 * L + W, W]]);
  }
  const g = layout(defaults);
  assert.equal(g.panels.find((p) => p.id === 'body').info.faces[3].w, 65 - 0.4, 'the last wall is narrower by the board allowance');
});

test('the lid hangs on the back wall and the dust flaps on the sides', () => {
  const g = layout(defaults);
  const body = g.panels.find((p) => p.id === 'body');
  const lid = g.panels.find((p) => p.id === 'lid');
  assert.deepEqual([lid.x, lid.y + lid.h, lid.w, lid.h], [body.x, body.y, 95, 65]);
  for (const id of ['dust1', 'dust2']) {
    const d = g.panels.find((p) => p.id === id);
    assert.equal(d.y + d.h, body.y);
    assert.ok(d.h <= 65);
  }
  assert.equal(lid.y, defaults.tuck, 'the tuck flap is above the lid');
});

test('snap-lock and tuck bottoms', () => {
  const snap = layout(defaults);
  assert.ok(Math.abs(snap.size.h - (65 + 18 + 50 + 0.757 * 65)) < 1e-9);
  const tuck = layout({ ...defaults, bottom: 'tuck' });
  assert.equal(tuck.size.h, 65 + 18 + 50 + 65 + 18);
  for (const g of [snap, tuck]) {
    const all = [...g.sheetLines.cut, ...g.sheetLines.fold, ...g.trims].join('');
    assert.ok(!all.includes('NaN'));
    for (const t of g.trims) assert.ok(t.endsWith('Z'), 'every piece is a closed shape');
    assert.equal(g.colors.cut, '#00aff0');
  }
});

test('a new box is the universal one: L95 W65 H50, no technical data, product name or PAP mark', () => {
  const d = design({ format: 'tuckBox' });
  assert.equal(d.template, 'boxGeneric');
  assert.deepEqual([d.dims.length, d.dims.width, d.dims.height], [95, 65, 50]);
  assert.equal(d.options.recycle, 'none', 'no PAP mark');
  const els = renderSheet(d, env()).hits.map((h) => h.id);
  for (const id of ['back.specs', 'back.specsTitle', 'front.name', 'front.subtitle', 'front.sku', 'front.ean']) assert.ok(!els.includes(id), `${id} is not on the universal box`);
  assert.ok(els.includes('back.category') && els.includes('front.logo'), 'it keeps the spare-parts category and the logo');
});

test('the product box (W09-0414 style) still carries the carburettor and its data', () => {
  const d = design({ format: 'tuckBox', template: 'boxProduct' });
  assert.equal(d.content.sku, 'W09-0414');
  assert.equal(d.content.ean, '5905947594658');
  assert.equal(d.content.productName.pl, 'Gaźnik do kosy spalinowej 15mm');
  const els = renderSheet(d, env()).hits.map((h) => h.id);
  for (const id of ['back.specs', 'front.name', 'front.ean']) assert.ok(els.includes(id), `${id} is on the product box`);
});

test('both box templates render to print, proof and mockup', () => {
  for (const template of ['boxProduct', 'boxGeneric']) {
    const d = design({ format: 'tuckBox', template });
    const svg = printSvg(d, env());
    assert.ok(!/<filter|<pattern|<mask|NaN/.test(svg), template);
    assert.ok(svg.includes('stroke="#00aff0"') && svg.includes('stroke="#eb3540"'), 'cyan cuts and red folds');
    // The product box turns its lid logo; the universal box leaves the lid plain.
    assert.equal(svg.includes('rotate(180'), template === 'boxProduct', 'the lid is turned');
    const ids = panelsWithElements(d, env()).flatMap((p) => p.elements.map((e) => e.id));
    assert.equal(new Set(ids).size, ids.length, `${template}: ids are unique`);
    assert.ok(renderProof(d, env()).svg.includes('<svg'));
    d.mockup.view = 'both';
    assert.ok(mockupSvg(d, env()).svg.includes('matrix('), 'walls and lid are projected');
  }
});

test('the box EAN keeps at least 80 % width', () => {
  const d = design({ format: 'tuckBox', template: 'boxProduct', dims: undefined });
  d.dims = { ...d.dims, height: 30 };
  const hit = renderSheet(d, env()).hits.find((h) => h.id === 'front.ean');
  assert.ok(hit.box.w >= 113 * 0.264 - 1e-6, `EAN is ${hit.box.w} mm wide`);
});

test('the universal box looks like the standard one: plain lid, the black band shaded, no white field', async () => {
  const { renderSheet } = await import('../src/render/sheet.js');
  const d = design({ format: 'tuckBox' });
  assert.deepEqual(d.hidden, { 'lid.logo': true, 'lid.tagline': true }, 'no logo on the lid');
  assert.deepEqual(d.gradients, { 'body.band': { to: 'patternGrey', dir: 'up' } }, 'the band runs from black into dark grey');
  const r = renderSheet(d, env(), { mode: 'print' });
  assert.ok(r.hits.every((h) => !/window/.test(h.type ?? '')), 'no clear window or white field on the lid');
  const product = design({ format: 'tuckBox', template: 'boxProduct' });
  assert.deepEqual([product.hidden, product.gradients], [{}, {}], 'the product box keeps its own look');
  // Shading the band does not add inks beyond mixes of its two swatches.
  assert.ok(r.svg.length > renderSheet({ ...d, gradients: {} }, env(), { mode: 'print' }).svg.length);
});

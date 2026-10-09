import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, FIELDS } from '../src/formats/flatPouch.js';
import { normalizeDims } from '../src/formats/common.js';
import { geometry, panelsWithElements } from '../src/render/sheet.js';
import { design, env } from './helpers.js';

const defaults = normalizeDims(FIELDS, {});

test('front and back sit side by side, like the factory proof', () => {
  for (const [w, h] of [[250, 350], [100, 150], [160, 230]]) {
    const g = layout({ ...defaults, width: w, height: h });
    assert.deepEqual(g.size, { w: 2 * w, h });
    assert.deepEqual(g.panels.map((p) => [p.id, p.x, p.w, p.h]), [['front', 0, w, h], ['back', w, w, h]]);
    assert.equal(g.panels[0].bleedSides.r, false, 'no bleed across the shared edge');
    assert.equal(g.panels[1].bleedSides.l, false);
  }
});

test('zip, hole, notches and safe area follow the numbers', () => {
  const g = layout({ ...defaults, zipOffset: 30, holeOffset: 12, notchOffset: 20 });
  const p = g.panels[0];
  assert.equal(p.lines.zip[0].y, 30);
  assert.equal(p.info.hole.box.y + p.info.hole.box.h / 2, 12);
  assert.equal(p.info.hole.box.x + p.info.hole.box.w / 2, 125);
  assert.equal(p.lines.notches.length, 2);
  assert.equal(p.info.safe.y, 30 + 3 + 3, 'below the zip track plus the margin');
  assert.equal(p.info.safe.x, 5 + 3);
  assert.equal(p.info.safe.y + p.info.safe.h, 350 - 5 - 3);
});

test('options switch parts off', () => {
  const g = layout({ ...defaults, zip: false, hole: 'none', tearNotch: false });
  const p = g.panels[0];
  assert.deepEqual([p.lines.zip.length, p.lines.holes.length, p.lines.notches.length], [0, 0, 0]);
  assert.equal(p.info.safe.y, 8 + 3, 'without a zip the safe area starts under the top seal');
});

test('dimension lines cover the total, each panel and the height', () => {
  const g = layout(defaults);
  const labels = g.measures.map((m) => m.label);
  assert.ok(labels.includes('500'));
  assert.equal(labels.filter((l) => l === '250').length, 2);
  assert.ok(labels.includes('350'));
  assert.ok(labels.includes('zip 25'));
});

test('numbers outside the limits are clamped', () => {
  assert.equal(layout({ width: 5, height: 99999 }).dims.width, 40);
  assert.equal(layout({ width: 5, height: 99999 }).dims.height, 1000);
});

test('a QR code on the back links to the website: above the website line, at the right, large', () => {
  const d = design();
  const parts = panelsWithElements(d, env(), geometry(d));
  const byId = (id) => parts.flatMap((p) => p.elements).find((e) => e.id === id);
  const qr = byId('back.urlQr');
  const url = byId('back.url');
  assert.equal(qr.type, 'qr');
  assert.equal(qr.text, d.content.qr, 'the link field is the QR code’s text');
  assert.ok(qr.box.y + qr.box.h <= url.box.y + 1e-9, 'the QR code sits above the website line');
  assert.ok(Math.abs(qr.box.x + qr.box.w - (url.box.x + url.box.w)) < 1e-9, 'both end at the right edge of the footer');
  assert.ok(qr.box.w >= 30, `the QR code is ${qr.box.w.toFixed(1)} mm`);
  const back = parts.find(({ elements }) => elements.some((e) => e.id === 'back.url'));
  assert.ok(qr.box.x + qr.box.w <= back.panel.w && qr.box.y >= back.panel.info.safe.y, 'inside the panel and its safe area');
  // Moved by hand, it goes where it is put.
  const moved = panelsWithElements({ ...d, layout: { 'back.urlQr': { x: 0.2, y: 0.5, w: 0.1, h: 0.1 } } }, env(), geometry(d));
  const q2 = moved.flatMap((p) => p.elements).find((e) => e.id === 'back.urlQr');
  assert.ok(q2.box.x < qr.box.x, 'the box is where it was put');
});

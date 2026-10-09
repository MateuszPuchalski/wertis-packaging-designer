import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS } from '../src/registry.js';
import { createDesign } from '../src/design.js';
import { panelsWithElements } from '../src/render/sheet.js';
import { env } from './helpers.js';

// Every element that prints words or codes says which texts it shows, so the editor can
// offer them on the element itself (the inspector's card).
test('every text on every template names the content it shows', () => {
  for (const f of Object.values(FORMATS)) {
    for (const tp of f.templates) {
      const d = createDesign({ format: f.id, template: tp });
      for (const { elements } of panelsWithElements(d, env())) {
        for (const e of elements) {
          if (!['text', 'label', 'ean', 'qr'].includes(e.type)) continue;
          assert.ok(e.edits?.length, `${tp} ${e.id} has no edits`);
          for (const k of e.edits) assert.ok(k in d.content, `${tp} ${e.id}: ${k} is not a content key`);
        }
      }
    }
  }
});

test('the label offers its name, codes and link; Produced for its address', () => {
  const d = createDesign();
  const els = panelsWithElements(d, env()).flatMap((p) => p.elements);
  const byId = Object.fromEntries(els.map((e) => [e.id, e]));
  assert.deepEqual(byId['back.label'].edits, ['productName', 'sku', 'ean', 'qr', 'url']);
  assert.deepEqual(byId['back.address'].edits, ['company', 'address', 'email'], 'the pouch’s address has no heading');
  assert.equal(byId['back.address'].text, 'WERTIS Sp. z o.o.\nSienkiewicze 4\n16-070 Sienkiewicze\nbiuro@wertis.com.pl', 'the postcode and town run under the street');
  // The box drops its barcode when the EAN is empty; its product code still offers the EAN.
  const box = createDesign({ format: 'tuckBox' });
  box.content.ean = '';
  const boxEls = panelsWithElements(box, env()).flatMap((p) => p.elements);
  assert.ok(!boxEls.some((e) => e.type === 'ean'));
  assert.ok(boxEls.find((e) => e.id === 'front.sku').edits.includes('ean'));
});

test('every text can be moved and resized, and a stored box applies to it', () => {
  for (const f of Object.values(FORMATS)) {
    for (const tp of f.templates) {
      const d = createDesign({ format: f.id, template: tp });
      for (const { elements } of panelsWithElements(d, env())) {
        for (const e of elements) if (e.type === 'text' && !e.rotate) assert.ok(e.movable && e.resizable, `${tp} ${e.id} is fixed`);
      }
    }
  }
  const d = createDesign({ format: 'flatPouch' });
  const find = (x) => panelsWithElements(x, env()).flatMap((p) => p.elements).find((e) => e.id === 'back.url');
  const before = find(d);
  const moved = find({ ...d, layout: { 'back.url': { x: 0.1, y: 0.1, w: 0.2, h: before.box.h * 2 / 350 } } });
  assert.ok(Math.abs(moved.box.x - 25) < 1e-6);
  assert.ok(moved.size > 0);
});

test('the tagline prints on the front and the back of the pouch, under the logo', () => {
  for (const format of ['flatPouch', 'standUpPouch']) {
    const els = panelsWithElements(createDesign({ format }), env()).flatMap((p) => p.elements);
    for (const side of ['front', 'back']) {
      const tag = els.find((e) => e.id === `${side}.tagline`);
      const logo = els.find((e) => e.id === `${side}.logo`);
      assert.ok(tag && tag.edits.includes('tagline'), `${format} ${side} tagline`);
      assert.ok(tag.box.y >= logo.box.y, `${format} ${side}: under the top of the logo`);
    }
  }
});

test('the pouches offer the four sizes, and each one builds and prints', async () => {
  const { renderSheet } = await import('../src/render/sheet.js');
  assert.deepEqual(FORMATS.flatPouch.sizes, [[100, 150], [140, 200], [200, 280], [250, 350]]);
  assert.deepEqual(FORMATS.standUpPouch.sizes, FORMATS.flatPouch.sizes);
  assert.equal(FORMATS.tuckBox.sizes, undefined);
  for (const format of ['flatPouch', 'standUpPouch']) {
    for (const [w, h] of FORMATS[format].sizes) {
      const d = createDesign({ format });
      d.dims = { ...d.dims, width: w, height: h };
      const r = renderSheet(d, env());
      assert.ok(r.svg.length > 1000, `${format} ${w}×${h} renders`);
      for (const { elements } of panelsWithElements(d, env())) {
        for (const e of elements) assert.ok(Number.isFinite(e.box.x + e.box.y + e.box.w + e.box.h) && e.box.w > 0 && e.box.h > 0, `${format} ${w}×${h} ${e.id}`);
      }
    }
  }
});

test('a clear back is bare film: one window over the whole face, no bands, small print in dark ink', async () => {
  const { packFaces } = await import('../src/render/faces.js');
  for (const format of ['flatPouch', 'standUpPouch']) {
    const d = createDesign({ format });
    d.options = { ...d.options, backStyle: 'clear' };
    const back = panelsWithElements(d, env()).find((p) => p.panel.role === 'back');
    const ids = back.elements.map((e) => e.id);
    assert.ok(ids.includes('back.window'), `${format} back window`);
    assert.ok(!ids.some((id) => /header|body|footer|gear|edge/.test(id)), `${format} no bands, pattern or gear`);
    const win = back.elements.find((e) => e.id === 'back.window');
    assert.deepEqual([win.box.w, win.box.h], [back.panel.w, back.panel.h]);
    assert.equal(back.elements.find((e) => e.id === 'back.url').colors.fill, 'black', 'dark ink on clear film');
    const faces = packFaces(d, env());
    assert.match(faces.faces.filmBack, /<path d="M/, `${format} the 3D back is film`);
  }
  const printed = panelsWithElements(createDesign({ format: 'flatPouch' }), env()).find((p) => p.panel.role === 'back');
  assert.ok(printed.elements.some((e) => e.id === 'back.header') && !printed.elements.some((e) => e.id === 'back.window'), 'printed stays the default');
});

test('a window on the back replaces the big gear, so both sides are clear windows', () => {
  const back = (o) => { const d = createDesign({ format: 'flatPouch' }); d.options = { ...d.options, ...o }; return panelsWithElements(d, env()).find((p) => p.panel.role === 'back').elements.map((e) => e.id); };
  assert.ok(back({}).includes('back.gear'), 'the gear stays by default');
  const both = back({ backWindow: true });
  assert.ok(both.includes('back.window') && !both.includes('back.gear'), 'window on the back, no gear');
});

test('a band can run into another swatch: flat strips, each an exact CMYK mix, saved with the project', async () => {
  const { renderSheet } = await import('../src/render/sheet.js');
  const { migrate } = await import('../src/design.js');
  const { resetColors, hasOwnColors } = await import('../src/edit/actions.js');
  const d = createDesign({ format: 'flatPouch' });
  assert.deepEqual(d.gradients, {});
  const flat = renderSheet(d, env(), { mode: 'print' });
  const g = { ...d, gradients: { 'front.header': { to: 'black', dir: 'down' } } };
  const run = renderSheet(g, env(), { mode: 'print' });
  assert.ok(run.svg.length > flat.svg.length, 'strips instead of one fill');
  assert.ok(!/linearGradient/.test(run.svg), 'no gradient objects in the print file');
  const from = d.palette.find((s) => s.id === 'boxOrange').cmyk, to = d.palette.find((s) => s.id === 'black').cmyk;
  const mixes = [...run.cmyk.values()].filter((v) => Array.isArray(v) && v[3] > from[3] && v[3] < to[3]);
  assert.ok(mixes.length > 8, 'steps between the two swatches, each with its own CMYK');
  for (const v of mixes) assert.ok(v.length === 4 && v.every(Number.isFinite));
  assert.ok(run.used.has('black'), 'the target swatch counts as used');
  for (const dir of ['up', 'left', 'right']) assert.ok(renderSheet({ ...g, gradients: { 'front.header': { to: 'black', dir } } }, env(), { mode: 'print' }).svg.length > flat.svg.length, dir);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(g))).gradients, g.gradients, 'saved and loaded back');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(d))).gradients, {}, 'older projects have none');
  assert.ok(hasOwnColors(g, 'front.header'));
  assert.deepEqual(resetColors(g, 'front.header').gradients, {}, 'reset colours drops it');
  const missing = renderSheet({ ...d, gradients: { 'front.header': { to: 'nope', dir: 'down' } } }, env(), { mode: 'print' });
  assert.equal(missing.svg.length, flat.svg.length, 'a swatch that was deleted falls back to the flat colour');
});

test('the box address block starts with the company and ends with the country, no "Produced for" heading', () => {
  const box = createDesign({ format: 'tuckBox' });
  const addr = panelsWithElements(box, env()).flatMap((p) => p.elements).filter((e) => e.id.endsWith('.address'));
  assert.ok(addr.length >= 2, 'the box repeats it on its panels');
  for (const e of addr) {
    assert.deepEqual(e.edits, ['company', 'address', 'country', 'email']);
    assert.equal(e.text, 'WERTIS Sp. z o.o.\nSienkiewicze 4\n16-070 Sienkiewicze\nPoland\nbiuro@wertis.com.pl');
  }
});

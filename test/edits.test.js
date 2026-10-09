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

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
  assert.equal(byId['back.address'].text, [d.content.company, d.content.address, d.content.email].join('\n'));
  // The box drops its barcode when the EAN is empty; its product code still offers the EAN.
  const box = createDesign({ format: 'tuckBox' });
  box.content.ean = '';
  const boxEls = panelsWithElements(box, env()).flatMap((p) => p.elements);
  assert.ok(!boxEls.some((e) => e.type === 'ean'));
  assert.ok(boxEls.find((e) => e.id === 'front.sku').edits.includes('ean'));
});

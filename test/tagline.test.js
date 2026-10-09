import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometry, panelsWithElements } from '../src/render/sheet.js';
import { renderSheet } from '../src/render/sheet.js';
import { design, env } from './helpers.js';

function tagline(d, id) {
  for (const { elements } of panelsWithElements(d, env(), geometry(d))) {
    const e = elements.find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

for (const [format, template, ids] of [['flatPouch', 'pouchWindow', ['back.tagline']], ['tuckBox', 'boxProduct', ['lid.tagline']], ['tuckBox', 'boxGeneric', ['front.tagline', 'lid.tagline']]]) {
  test(`“Quality You Can Trust” takes its size from the configuration (${template})`, () => {
    const d = design({ format, template });
    assert.equal(d.options.taglineSize, 100);
    for (const id of ids) {
      const base = tagline(d, id);
      const big = tagline({ ...d, options: { ...d.options, taglineSize: 200 } }, id);
      const small = tagline({ ...d, options: { ...d.options, taglineSize: 50 } }, id);
      assert.ok(Math.abs(big.size / base.size - 2) < 1e-9 && Math.abs(small.size / base.size - 0.5) < 1e-9, id);
      // It stays right-aligned with the end of the WERTIS word and grows to the left.
      assert.ok(Math.abs(big.box.x + big.box.w - (base.box.x + base.box.w)) < 1e-9);
      assert.ok(big.box.w >= base.box.w * 2 - 1e-9);
    }
    // And the artwork changes with it.
    const a = renderSheet(d, env(), { mode: 'print' }).svg;
    const b = renderSheet({ ...d, options: { ...d.options, taglineSize: 160 } }, env(), { mode: 'print' }).svg;
    assert.notEqual(a, b);
  });
}

test('the back tagline can be moved and resized: its box sets the type size', () => {
  const d = design({ format: 'flatPouch', template: 'pouchWindow' });
  const base = tagline(d, 'back.tagline');
  assert.ok(base.movable && base.resizable, 'it has the handles and the position fields');
  assert.ok(Math.abs(base.size - base.box.h / 0.7) < 1e-9, 'the type fills the box height');
  // The panel the tagline sits on, to store boxes as fractions of it (as the editor does).
  const panel = panelsWithElements(d, env(), geometry(d)).find(({ elements }) => elements.some((e) => e.id === 'back.tagline')).panel;
  const stored = (b) => ({ x: b.x / panel.w, y: b.y / panel.h, w: b.w / panel.w, h: b.h / panel.h });
  // The same box, twice as tall (the top and the right end kept): twice the type.
  const tall = { x: base.box.x, y: base.box.y, w: base.box.w, h: base.box.h * 2 };
  const big = tagline({ ...d, layout: { 'back.tagline': stored(tall) } }, 'back.tagline');
  assert.ok(Math.abs(big.size / base.size - 2) < 1e-9, `size ${big.size.toFixed(2)} mm, default ${base.size.toFixed(2)} mm`);
  // The artwork follows the box, and taking the position back brings the default.
  const a = renderSheet(d, env(), { mode: 'print' }).svg;
  const b = renderSheet({ ...d, layout: { 'back.tagline': stored(tall) } }, env(), { mode: 'print' }).svg;
  assert.notEqual(a, b);
  assert.equal(tagline({ ...d, layout: {} }, 'back.tagline').size, base.size);
});

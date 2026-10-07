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

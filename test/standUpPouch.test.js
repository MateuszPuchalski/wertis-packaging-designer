import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, FIELDS } from '../src/formats/standUpPouch.js';
import { normalizeDims } from '../src/formats/common.js';
import { printSvg } from '../src/export/documents.js';
import { renderProof } from '../src/render/proof.js';
import { panelsWithElements } from '../src/render/sheet.js';
import { mockupSvg } from '../src/render/mockup.js';
import { design, env } from './helpers.js';

const defaults = normalizeDims(FIELDS, {});

test('faces side by side and the gusset strip below them', () => {
  const g = layout(defaults);
  assert.deepEqual(g.panels.map((p) => [p.id, p.w, p.h]), [['front', 160, 230], ['back', 160, 230], ['gusset', 160, 80]]);
  const gus = g.panels[2];
  assert.ok(gus.y > 230, 'below the faces');
  assert.equal(gus.info.fold, 40, 'folded in half');
  assert.equal(gus.lines.fold[0], 'M0 40H160');
  assert.deepEqual(gus.bleedSides, { l: true, t: true, r: true, b: true }, 'a separate piece: bleed all round');
});

test('text stays above the part of the face that folds under', () => {
  const p = layout(defaults).panels[0];
  assert.equal(p.info.bottomZone, 40);
  assert.equal(p.info.safe.y + p.info.safe.h, 230 - 40 - 3);
  assert.equal(p.lines.fold[0], 'M0 190H160');
});

test('each bottom seal style draws its corners', () => {
  for (const bottom of ['k', 'round', 'plow']) {
    const g = layout({ ...defaults, bottom });
    assert.ok(g.panels[0].lines.seal.length >= 4, bottom);
    assert.ok(g.panels[2].lines.seal.length >= 2, bottom);
    assert.ok(!g.panels[2].lines.seal.join('').includes('NaN'));
  }
});

test('the whole stand-up design renders to print, proof and mockup', () => {
  const d = design({ format: 'standUpPouch' });
  const svg = printSvg(d, env());
  assert.match(svg, /width="326mm" height="330mm"/, '2 × 160 + bleed by 230 + 14 + 80 + bleed');
  assert.ok(!/<filter|<pattern|<mask|NaN/.test(svg));
  const ids = panelsWithElements(d, env()).flatMap((p) => p.elements.map((e) => e.id));
  assert.ok(ids.includes('gusset.logoTop') && ids.includes('gusset.logoBottom'));
  assert.ok(svg.includes('rotate(180'), 'the top gusset logo is turned to read from outside');
  assert.ok(renderProof(d, env()).svg.includes('<svg'));
  d.mockup.view = 'both';
  const m = mockupSvg(d, env());
  assert.ok(m.svg.includes('<ellipse'), 'a floor shadow under the standing pouch');
});

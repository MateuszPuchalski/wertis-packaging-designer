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
  assert.deepEqual(doc.cmyk.get('#f68c1e'), [0, 57, 98, 0]);
  assert.deepEqual(doc.cmyk.get('#231f20'), [0, 0, 0, 100], 'band black is pure K');
  assert.deepEqual(doc.cmyk.get('#00aff0'), [100, 0, 0, 0], 'the box cut line is pure cyan');
  assert.deepEqual(doc.cmyk.get('#eb3540'), [0, 100, 100, 0], 'the fold line is pure red');
});

test('print files carry no gradients: the metal look is tint strips of the swatch', () => {
  const doc = printDocument(design(), env());
  assert.ok(!doc.pages[0].includes('Gradient'));
  const silver = design().palette.find((s) => s.id === 'silver');
  const tints = [...doc.cmyk.entries()].filter(([hex]) => hex !== silver.hex && colours(doc.pages[0]).includes(hex))
    .filter(([, k]) => k[0] === 0 && k[1] === 0 && k[2] === 0 && k[3] !== silver.cmyk[3] && k[3] > 0 && k[3] < 100);
  assert.ok(tints.length >= 4, 'lighter and darker greys made from the silver swatch');
});

test('page 2 is the dieline alone', () => {
  const doc = printDocument(design(), env());
  assert.equal(doc.pages.length, 2);
  assert.ok(doc.pages[1].includes('id="dieline"'));
  assert.ok(!/fill="#(?!ffffff)[0-9a-f]{6}"/.test(doc.pages[1].replace(/fill="none"/g, '')), 'no artwork on the dieline page');
  assert.match(doc.pages[1], /width="506mm" height="356mm"/, 'the same size as page 1');
});

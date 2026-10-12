import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONT_SETS, FONT_FILES } from '../src/text/textEngine.js';
import { createDesign, migrate } from '../src/design.js';
import { design, env } from './helpers.js';
import { printSvg } from '../src/export/documents.js';

test('the printer-file set resolves roles to the look-alike files and Barlow does not', () => {
  const { text } = env();
  const w = text.view('wertis');
  const b = text.view('barlow');
  assert.notEqual(w.line('WERTIS 123', 'regular', 5).width, b.line('WERTIS 123', 'regular', 5).width);
  assert.equal(b.font('web'), text.fonts.regular);
  assert.equal(w.font('digits'), text.fonts.digits);
  for (const set of Object.values(FONT_SETS)) for (const k of Object.values(set)) assert.ok(FONT_FILES[k], k);
});

test('a font set is saved with the design; unknown or missing sets fall back', () => {
  assert.equal(createDesign({ date: '2026-01-01' }).fonts, 'wertis');
  assert.equal(migrate({ ...createDesign({ date: '2026-01-01' }), fonts: 'barlow' }).fonts, 'barlow');
  assert.equal(migrate({ ...createDesign({ date: '2026-01-01' }), fonts: 'nope' }).fonts, 'wertis');
});

test('setting the design font changes the drawing; an own font takes over a role and can be removed', () => {
  const e = env();
  const d = design({});
  const a = printSvg(d, e);
  const b = printSvg({ ...d, fonts: 'barlow' }, e);
  assert.notEqual(a, b);
  const bold = e.text.fonts.myriadBold;
  e.text.setFont('myriadBold', e.text.fonts.cg, 'x.ttf');
  assert.equal(e.text.own.myriadBold, 'x.ttf');
  assert.notEqual(printSvg(d, e), a);
  e.text.setFont('myriadBold', null);
  assert.equal(e.text.fonts.myriadBold, bold);
  assert.equal(printSvg(d, e), a);
});

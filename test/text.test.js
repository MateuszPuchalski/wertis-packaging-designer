import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathData } from '../src/text/textEngine.js';
import { env } from './helpers.js';

test('text shrinks to fit its box', () => {
  const t = env().text;
  const r = t.layout({ text: 'Starter do kosiarki BS Classic Sprint', x: 0, y: 0, w: 60, size: 8, minSize: 2, font: 'bold' });
  assert.ok(r.size < 8 && r.width <= 60 + 1e-6);
  const floor = t.layout({ text: 'Starter do kosiarki BS Classic Sprint', x: 0, y: 0, w: 10, size: 8, minSize: 3, font: 'bold' });
  assert.equal(floor.size, 3, 'never below the minimum');
});

test('wrapping and alignment', () => {
  const t = env().text;
  const r = t.layout({ text: 'Starter do kosiarki BS Classic Sprint', x: 10, y: 0, w: 60, size: 6, wrap: true, align: 'right' });
  assert.ok(r.lines.length >= 2);
  assert.ok(Math.abs(r.box.x + r.width - 70) < 0.5, 'right-aligned to the box');
  const c = t.layout({ text: 'WERTIS', x: 0, y: 0, w: 100, size: 10, align: 'center', valign: 'middle', h: 20 });
  assert.ok(Math.abs(c.box.x + c.width / 2 - 50) < 0.01);
  assert.ok(Math.abs(c.box.y + c.height / 2 - 10) < 0.01);
});

test('Polish, Czech, Slovak, Hungarian and Romanian letters are all drawn', () => {
  const t = env().text;
  for (const s of ['ĄĆĘŁŃÓŚŹŻ', 'ŘřČčŠšŽž', 'ĽľŤť', 'ŐőŰű', 'ȘșȚțĂăÎî']) {
    for (const font of ['regular', 'bold', 'blackItalic', 'condBold']) {
      const f = t.font(font);
      for (const ch of s) assert.notEqual(f.charToGlyphIndex(ch), 0, `${font} has ${ch}`);
    }
  }
});

test('glyph paths never contain NaN (opentype.js toPathData bug)', () => {
  const t = env().text;
  for (const size of [5.2, 6 / 0.7, 8.571428, 13.3]) {
    assert.ok(!t.line('Starter do kosiarki BS Classic Sprint', 'bold', size).d.includes('NaN'));
  }
  assert.equal(pathData([{ type: 'M', x: 1, y: 2 }, { type: 'Q', x1: 1, y1: 1, x: 2, y: 2 }, { type: 'Z' }]), 'M1 2Q1 1 2 2Z');
});

test('uppercasing keeps Polish letters', () => {
  const r = env().text.layout({ text: 'zamiennik wysokiej jakości', upper: true, size: 4 });
  assert.deepEqual(r.lines, ['ZAMIENNIK WYSOKIEJ JAKOŚCI']);
});

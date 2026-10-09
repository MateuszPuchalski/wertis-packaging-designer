import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColor, normalizeHex, updateSwatch, addSwatch, mergePalette, cmykFromHex, makeSwatch, canDeleteSwatch, moveSwatch } from '../src/brand/palette.js';
import { WERTIS_PALETTE } from '../src/brand/wertis.js';

const pal = WERTIS_PALETTE;

test('colour references resolve', () => {
  assert.equal(resolveColor('boxOrange', pal), '#f8992c');
  assert.equal(resolveColor({ swatch: 'dark' }, pal), '#303030');
  assert.equal(resolveColor({ custom: '#ABC' }, pal), '#aabbcc');
  assert.equal(resolveColor({ none: true }, pal), 'none');
  assert.equal(resolveColor('missing', pal, '#123456'), '#123456');
});

test('hex input is cleaned up', () => {
  assert.equal(normalizeHex('F8992C'), '#f8992c');
  assert.equal(normalizeHex(' #fff '), '#ffffff');
  assert.equal(normalizeHex('orange'), null);
});

test('editing a swatch keeps its id and role, and clamps CMYK', () => {
  const next = updateSwatch(pal, 'transparent', { hex: '#00ff00', cmyk: [120, -5, '7', 0], name: 'Clear', role: 'x', id: 'y' });
  const s = next.find((x) => x.id === 'transparent');
  assert.deepEqual([s.hex, s.cmyk, s.name, s.role], ['#00ff00', [100, 0, 7, 0], 'Clear', 'transparent']);
  assert.equal(updateSwatch(pal, 'dark', { hex: 'nope' }).find((x) => x.id === 'dark').hex, '#303030');
});

test('new swatches get unique ids', () => {
  const a = addSwatch(pal, { name: 'Box Orange', hex: '#000000' });
  assert.equal(a.at(-1).id, 'box-orange');
  const b = addSwatch(a, { name: 'Box Orange', hex: '#000000' });
  assert.equal(b.at(-1).id, 'box-orange-2');
});

test('presets merge by id and keep extra swatches', () => {
  const mine = addSwatch(updateSwatch(pal, 'boxOrange', { hex: '#000000' }), { name: 'Extra', hex: '#123456' });
  const merged = mergePalette(mine, [makeSwatch({ id: 'boxOrange', name: 'Box Orange', hex: '#f8992c' }), makeSwatch({ id: 'brandNew', name: 'New', hex: '#abcdef' })]);
  assert.equal(merged.find((s) => s.id === 'boxOrange').hex, '#f8992c');
  assert.ok(merged.some((s) => s.id === 'extra'));
  assert.ok(merged.some((s) => s.id === 'brandNew'));
});

test('helpers', () => {
  assert.deepEqual(cmykFromHex('#000000'), [0, 0, 0, 100]);
  assert.deepEqual(cmykFromHex('#ff0000'), [0, 100, 100, 0]);
  assert.equal(canDeleteSwatch(pal.find((s) => s.id === 'transparent')), false);
  assert.equal(canDeleteSwatch(pal.find((s) => s.id === 'dark')), true);
  assert.equal(moveSwatch(pal, 'orangeTone', -1)[0].id, 'orangeTone');
  assert.equal(moveSwatch(pal, pal[0].id, -1), pal);
});

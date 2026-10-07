import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placements, patternSvg, ICON_IDS } from '../src/render/pattern.js';
import { PATTERN_ICONS } from '../src/brand/patternIcons.js';

const box = { x: 0, y: 0, w: 250, h: 100 };

test('the pattern is the same every time for a seed, and differs per area', () => {
  const a = placements(box, { seed: 3 }, 'front.body');
  assert.deepEqual(placements(box, { seed: 3 }, 'front.body'), a);
  assert.notDeepEqual(placements(box, { seed: 3 }, 'back.body'), a);
  assert.notDeepEqual(placements(box, { seed: 4 }, 'front.body'), a);
});

test('the icons cover the whole area, edges included', () => {
  const ps = placements(box, { spacing: 30 });
  assert.ok(ps.some((p) => p.x < 0) && ps.some((p) => p.x > 250));
  assert.ok(ps.some((p) => p.y < 0) && ps.some((p) => p.y > 100));
  assert.ok(ps.length >= (250 / 30) * (100 / 26));
});

test('only the chosen icons are used, and neighbours differ', () => {
  const ps = placements(box, { icons: ['spring', 'sparkPlug'] });
  assert.deepEqual([...new Set(ps.map((p) => p.icon))].sort(), ['sparkPlug', 'spring']);
  const all = placements(box, {});
  let same = 0;
  for (let i = 1; i < all.length; i++) if (all[i].icon === all[i - 1].icon) same++;
  assert.ok(same / all.length < 0.05);
});

test('icons are defined once per colour and placed with <use>', () => {
  const defs = new Map();
  const svg = patternSvg(box, {}, '#e27814', defs, 'k');
  assert.ok(svg.includes('<use href="#pi-'));
  assert.ok(defs.size <= ICON_IDS.length);
  assert.equal(patternSvg(box, {}, 'none', defs), '');
});

test('the imported icons fit their 100-unit box', () => {
  assert.ok(PATTERN_ICONS.length >= 12);
  for (const ic of PATTERN_ICONS) assert.ok(Math.max(ic.w, ic.h) === 100 && ic.paths.length, ic.id);
});

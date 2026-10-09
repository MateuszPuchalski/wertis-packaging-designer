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

test('the pattern scales with the pack: partly by default, fixed or fully on request, with a floor', async () => {
  const { scaledPattern, patternScale, PATTERN_DEFAULTS } = await import('../src/render/pattern.js');
  assert.equal(PATTERN_DEFAULTS.scaling, 'auto');
  assert.equal(patternScale({ scaling: 'auto' }, 350), 1, 'the reference pouch is unchanged');
  assert.ok(Math.abs(patternScale({ scaling: 'auto' }, 150) - Math.sqrt(150 / 350)) < 1e-9);
  assert.equal(patternScale({ scaling: 'fixed' }, 150), 1);
  assert.ok(Math.abs(patternScale({ scaling: 'full' }, 175) - 0.5) < 1e-9);
  const small = scaledPattern({ scaling: 'auto' }, 150);
  assert.ok(small.size < 18 && small.size >= 7 && small.spacing < 30 && small.spacing >= 12);
  assert.deepEqual(scaledPattern({ scaling: 'fixed', size: 18 }, 150), { scaling: 'fixed', size: 18 });
  assert.equal(scaledPattern({ scaling: 'auto', size: 18 }, null).size, 18, 'boxes keep their size');
  assert.equal(scaledPattern({ scaling: 'full', size: 18, spacing: 30 }, 50).size, 7, 'never below the floor');
  assert.equal(scaledPattern({ scaling: 'full', size: 4, spacing: 30 }, 50).size, 4, 'unless the user asked for smaller');
});

test('a smaller pouch draws more, smaller icons than a fixed one; saved projects stay fixed', async () => {
  const { createDesign, migrate } = await import('../src/design.js');
  const { renderSheet } = await import('../src/render/sheet.js');
  const { env } = await import('./helpers.js');
  const make = (scaling) => { const d = createDesign({ format: 'flatPouch' }); d.dims = { ...d.dims, width: 100, height: 150 }; d.pattern = { ...d.pattern, scaling }; return d; };
  const count = (d) => (renderSheet(d, env()).svg.match(/<use /g) ?? []).length;
  assert.ok(count(make('auto')) > count(make('fixed')), 'denser on the small pouch');
  const old = JSON.parse(JSON.stringify(createDesign({ format: 'flatPouch' })));
  delete old.pattern.scaling;
  assert.equal(migrate(old).pattern.scaling, 'fixed');
  assert.equal(createDesign({ format: 'flatPouch' }).pattern.scaling, 'auto');
});

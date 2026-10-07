import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPpm, clampPpm, wheelFactor, anchorScroll, percent, ppmForPercent, stepZoom, MIN_PPM, MAX_PPM } from '../src/edit/view.js';
import { rulerTicks, rulerStep } from '../src/edit/rulers.js';
import { hide, show, showAll, resetLayout, resetColors, hasOwnColors, hiddenCount } from '../src/edit/actions.js';
import { design } from './helpers.js';

test('fit, limits, percent', () => {
  // The old formula: the smaller of the two ratios, with 48 px to spare.
  assert.equal(fitPpm(1048, 748, { w: 500, h: 350 }), 2);
  assert.equal(fitPpm(10, 10, { w: 500, h: 350 }), MIN_PPM);
  assert.equal(clampPpm(100), MAX_PPM);
  assert.equal(percent(96 / 25.4), 100);
  assert.equal(percent(ppmForPercent(250)), 250);
  assert.ok(stepZoom(2, 1) > 2 && stepZoom(2, -1) < 2);
  assert.ok(Math.abs(stepZoom(stepZoom(2, 1), -1) - 2) < 1e-9);
});

test('the wheel zooms in for a turn towards the screen, and never by much at once', () => {
  assert.ok(wheelFactor(-100) > 1 && wheelFactor(100) < 1);
  assert.ok(Math.abs(wheelFactor(100) * wheelFactor(-100) - 1) < 1e-9);
  assert.ok(wheelFactor(-3, 1) > 1, 'a line counts too');
  assert.ok(wheelFactor(-1e6) <= 2.02 && wheelFactor(1e6) >= 0.49);
});

test('zooming around the cursor keeps the point under it', () => {
  // The drawing starts 24 px into the scrolled area; the cursor is 300 px in; scrolled 100.
  const ppm = 2, ppm2 = 3.1, origin = 24, origin2 = 24, cursor = 300, scroll = 100;
  const mm = (scroll + cursor - origin) / ppm;
  const s2 = anchorScroll(cursor, scroll, origin, ppm, origin2, ppm2);
  assert.ok(Math.abs((s2 + cursor - origin2) / ppm2 - mm) < 1e-9);
  // When the drawing was centred (origin moves), the point still stays.
  const s3 = anchorScroll(cursor, 0, 180, ppm, 24, ppm2);
  assert.ok(Math.abs((s3 + cursor - 24) / ppm2 - (cursor - 180) / ppm) < 1e-9);
});

test('ruler ticks: a round step, numbered ticks far enough apart, finer ones between', () => {
  assert.equal(rulerStep(2), 50);
  assert.equal(rulerStep(10), 10);
  const r = rulerTicks(-3, 253, 2);
  const majors = r.ticks.filter((x) => x.major);
  assert.deepEqual(majors.map((x) => x.v), [0, 50, 100, 150, 200, 250]);
  assert.deepEqual(majors.map((x) => x.label), ['0', '50', '100', '150', '200', '250']);
  assert.ok(r.minor * 2 >= 6, 'minor ticks at least 6 px apart');
  assert.equal(r.ticks[0].v, 0, 'the first tick at or after the start');
  for (const x of r.ticks.filter((x) => !x.major)) assert.equal(x.label, undefined);
  // Zoomed far in: 1 mm steps, 0.1 mm or 0.2 mm ticks.
  const z = rulerTicks(10, 12, 60);
  assert.equal(z.step, 1);
  assert.ok(z.minor < 1);
});

test('quick actions: hide, show all, reset the position or the colours', () => {
  const d = { ...design(), layout: { win: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, colors: { 'win.fill': { swatch: 'x' }, 'winter.fill': { swatch: 'y' }, 'win.edge': { none: true } } };
  const h1 = hide(d, 'logo');
  assert.equal(h1.hidden.logo, true);
  assert.equal(hiddenCount(hide(h1, 'win')), 2);
  assert.equal(show(h1, 'logo').hidden.logo, undefined);
  assert.equal(show(d, 'logo'), d, 'nothing to do: the same design');
  assert.deepEqual(showAll(hide(h1, 'win')).hidden, {});
  assert.equal(showAll(d), d);
  assert.equal(resetLayout(d, 'win').layout.win, undefined);
  assert.equal(resetLayout(d, 'logo'), d);
  assert.ok(hasOwnColors(d, 'win'));
  const c = resetColors(d, 'win');
  assert.deepEqual(Object.keys(c.colors), ['winter.fill'], 'only this element’s colours');
  assert.ok(!hasOwnColors(c, 'win'));
  assert.equal(resetColors(c, 'win'), c);
});

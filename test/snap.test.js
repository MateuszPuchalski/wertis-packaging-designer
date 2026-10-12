import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTargets, snapMove, snapResize } from '../src/edit/snap.js';
import { geometry, panelsWithElements } from '../src/render/sheet.js';
import { design, env } from './helpers.js';

const panel = { id: 'front', x: 0, y: 0, w: 250, h: 350, info: { safe: { x: 8, y: 36, w: 234, h: 306 } } };
const others = [{ id: 'logo', panel: 'front', box: { x: 40, y: 50, w: 60, h: 20 } }, { id: 'bg', panel: 'front', box: { x: 0, y: 0, w: 250, h: 350 } }];
const T = snapTargets({ panels: [panel] }, panel, others, 'win');
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('targets: the panel, its safe area and the other elements on it', () => {
  const xs = T.x.map((t) => t.v);
  for (const v of [0, 125, 250, 8, 242, 40, 70, 100]) assert.ok(xs.some((x) => near(x, v)), `x ${v}`);
  const ys = T.y.map((t) => t.v);
  for (const v of [0, 175, 350, 36, 342, 50, 60, 70]) assert.ok(ys.some((y) => near(y, v)), `y ${v}`);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.equal(new Set(xs).size, xs.length, 'no duplicates');
  // Itself and other panels' elements are not targets.
  const self = snapTargets({ panels: [panel] }, panel, [{ id: 'win', panel: 'front', box: { x: 13, y: 13, w: 13, h: 13 } }, { id: 'x', panel: 'back', box: { x: 17, y: 17, w: 9, h: 9 } }], 'win');
  assert.ok(!self.x.some((t) => near(t.v, 13) || near(t.v, 17)));
});

test('a dragged box snaps its centre or an edge to the nearest line', () => {
  // Centre 2 mm off the panel's centre line: it lands on it, with a guide.
  const r = snapMove({ x: 102, y: 120, w: 50, h: 40 }, T, { threshold: 3 });
  assert.ok(near(r.box.x + 25, 125));
  // Its left edge now lines up with the logo's right edge too: both guides show.
  assert.deepEqual(r.guides.filter((g) => g.axis === 'x').map((g) => g.v), [100, 125]);
  assert.equal(r.guides[0].from, 0);
  assert.equal(r.guides[0].to, 350);
  // The left edge 1 mm from the logo's left: the edge wins over the farther centre line.
  const e = snapMove({ x: 41, y: 200.3, w: 30, h: 10 }, T, { threshold: 3 });
  assert.equal(e.box.x, 40);
  // Away from every line: the 0.5 mm grid.
  assert.equal(e.box.y, 200.5);
  assert.deepEqual(e.guides.filter((g) => g.axis === 'y'), []);
});

test('no snap past the threshold, and lines: false keeps to the grid', () => {
  const far = snapMove({ x: 102, y: 120.2, w: 50, h: 40 }, T, { threshold: 1.5 });
  assert.equal(far.box.x, 102);
  assert.equal(far.box.y, 120);
  assert.deepEqual(far.guides, []);
  const off = snapMove({ x: 100.3, y: 120, w: 50, h: 40 }, T, { threshold: 3, lines: false });
  assert.equal(off.box.x, 100.5);
  assert.deepEqual(off.guides, []);
});

test('the box stays inside the panel, and a line it was pushed off drops its guide', () => {
  const r = snapMove({ x: 230, y: -4, w: 50, h: 40 }, T, { threshold: 3 });
  assert.equal(r.box.x, 200);
  assert.equal(r.box.y, 0);
  // Pushed back to the right edge: that is a line too, but it is the clamp, not a snap.
  assert.deepEqual(r.guides, []);
});

test('resizing snaps the moving edges only; keepAspect keeps the shape', () => {
  const b0 = { x: 40, y: 100, w: 60, h: 40 };
  // Pull the bottom right corner to 1 mm short of the centre line and the safe edge.
  const r = snapResize(b0, 'se', 24, 0.7, T, { threshold: 3 });
  assert.equal(r.box.x, 40);
  assert.equal(r.box.y, 100);
  assert.ok(near(r.box.x + r.box.w, 125));
  assert.equal(r.box.h, 40.5, 'no line near the bottom: the grid');
  assert.deepEqual(r.guides.map((g) => [g.axis, g.v]), [['x', 125]]);
  // The top left corner: the right and bottom edges stay put.
  const nw = snapResize(b0, 'nw', -31, 0, T, { threshold: 3 });
  assert.equal(nw.box.x, 8, 'onto the safe area');
  assert.equal(nw.box.x + nw.box.w, 100);
  assert.equal(nw.box.y + nw.box.h, 140);
  // keepAspect: 3 : 2 whatever the pointer does.
  const k = snapResize(b0, 'se', 24, 2, T, { threshold: 3, keepAspect: true });
  assert.ok(near(k.box.w / k.box.h, 1.5));
  assert.ok(near(k.box.x + k.box.w, 125));
  // Never under the minimum, never out of the panel.
  assert.equal(snapResize(b0, 'se', -200, -200, T).box.w, 5);
  const big = snapResize(b0, 'se', 900, 900, T, { keepAspect: true });
  assert.ok(big.box.x + big.box.w <= 250 + 1e-9 && big.box.y + big.box.h <= 350 + 1e-9);
  assert.ok(near(big.box.w / big.box.h, 1.5));
});

test('on a box the walls are one panel, and each face is a target of its own', () => {
  const d = design({ format: 'tuckBox' });
  const geo = geometry(d);
  const walls = geo.panels.find((p) => p.id === 'body');
  const parts = panelsWithElements(d, env(), geo);
  const hits = parts.flatMap(({ panel, elements }) => elements.map((e) => ({ id: e.id, panel: panel.id, box: { ...e.box, x: e.box.x + panel.x, y: e.box.y + panel.y } })));
  const t = snapTargets(geo, walls, hits, 'none');
  for (const v of [95, 170, 265]) assert.ok(t.x.some((x) => near(x.v, walls.x + v)), `the fold at ${v} mm`);
  // A box just right of the front face's left fold snaps onto it.
  const r = snapMove({ x: walls.x + 170.3, y: walls.y + 10, w: 20, h: 10 }, t, { threshold: 3 });
  // (an element's centre line can be a hair nearer than the fold, so within half a millimetre)
  assert.ok(near(r.box.x, walls.x + 170, 0.5));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placements, scenesFor, shopLayout, SHOP, MAX_COUNT, MAX_POUCHES, UNIT } from '../src/three/scenes.js';
import { packFaces } from '../src/render/faces.js';
import { design, env } from './helpers.js';

const box = { kind: 'box', size: { x: 95, y: 50, z: 65 } };
const pouch = { kind: 'pouch', size: { x: 250, y: 350, z: 7.5 }, hole: { x: 125, y: 10 } };

test('the shop comes first; boxes also stack and pile; pouches also hang on a peg', () => {
  assert.deepEqual(scenesFor('box'), ['shop', 'stack', 'pile']);
  assert.deepEqual(scenesFor('pouch'), ['shop', 'peg', 'pile', 'stack']);
});

test('in the shop, pouches hang one product per hook in a grid, clear of each other', () => {
  const ps = placements('shop', { ...pouch, thick: 38.6 }, 6);
  const L = shopLayout(pouch, 6);
  assert.equal(L.hooks.length, 6);
  assert.deepEqual([L.cols, L.rows], [3, 2]);
  // Every pack on its own hook, its hole on the wire, inside the hook's length.
  const used = new Set(ps.map((s) => `${s.hang.world[0]},${s.hang.world[1]}`));
  assert.equal(used.size, 6);
  for (const s of ps) {
    const hk = L.hooks.find((h) => h.x === s.hang.world[0] && h.y === s.hang.world[1]);
    assert.ok(hk, 'on a hook');
    assert.ok(Math.abs(s.p[0] + s.hang.local[0] - hk.x) < 1e-9 && Math.abs(s.p[1] + s.hang.local[1] - hk.y) < 1e-9);
    assert.ok(s.hang.world[2] > 0 && s.hang.world[2] < hk.len);
  }
  // Side by side the packs do not touch; the top row's bottoms clear the next row's hooks.
  const xs = [...new Set(L.hooks.map((h) => h.x))].sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] > pouch.size.x / UNIT + 0.3);
  const rows = [...new Set(L.hooks.map((h) => h.y))].sort((a, b) => b - a);
  assert.ok(rows[0] - pouch.size.y / UNIT - 0.1 > rows[1] + 0.5);
  assert.ok(Math.min(...ps.map((s) => s.p[1] - pouch.size.y / UNIT / 2)) > SHOP.deckY, 'above the deck');
  // More packs than hooks: a second one behind the first on the same hook.
  const seven = placements('shop', { ...pouch, thick: 38.6 }, 7);
  assert.deepEqual(seven[6].hang.world.slice(0, 2), seven[0].hang.world.slice(0, 2));
  assert.ok(seven[6].hang.world[2] < seven[0].hang.world[2] - 0.3);
  assert.equal(placements('shop', pouch, 99).length, MAX_POUCHES);
});

test('in the shop, boxes stand front out on the shelves, the eye-level one first', () => {
  const ps = placements('shop', box, 20);
  const L = shopLayout(box, 20);
  const h = { x: 0.95 / 2, y: 0.5 / 2, z: 0.65 / 2 };
  for (const s of ps) {
    assert.ok(L.shelves.some((y) => Math.abs(s.p[1] - h.y - y) < 0.01), 'standing on a shelf');
    assert.ok(Math.abs(s.p[0]) + h.x < L.width / 2, 'inside the uprights');
    assert.ok(s.p[2] - h.z > 0 && s.p[2] + h.z < SHOP.shelfDepth, 'on the shelf, clear of the panel');
    assert.equal(s.r[0], 0);
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const [a, b] = [ps[i].p, ps[j].p];
      assert.ok(!(Math.abs(a[0] - b[0]) < 2 * h.x && Math.abs(a[1] - b[1]) < 2 * h.y && Math.abs(a[2] - b[2]) < 2 * h.z), `${i} and ${j} overlap`);
    }
  }
  assert.ok(ps.slice(0, 16).every((s) => Math.abs(s.p[1] - h.y - SHOP.shelfYs[0]) < 0.01), 'the eye-level shelf fills first');
});

test('a neat stack starts with no box inside another, resting on the floor', () => {
  const ps = placements('stack', box, 14);
  assert.equal(ps.length, 14);
  const h = { x: 0.95 / 2, y: 0.5 / 2, z: 0.65 / 2 };
  for (let i = 0; i < ps.length; i++) {
    assert.ok(ps[i].p[1] - h.y >= 0, 'above the floor');
    for (let j = i + 1; j < ps.length; j++) {
      const [a, b] = [ps[i].p, ps[j].p];
      const overlap = Math.abs(a[0] - b[0]) < 2 * h.x - 1e-6 && Math.abs(a[1] - b[1]) < 2 * h.y - 1e-6 && Math.abs(a[2] - b[2]) < 2 * h.z - 1e-6;
      assert.ok(!overlap, `${i} and ${j} overlap`);
    }
  }
  assert.ok(ps.filter((p) => p.p[1] < 0.3).length === 6, 'six on the bottom layer');
});

test('hanging pouches have their hole on the rod', () => {
  const ps = placements('peg', pouch, 5);
  for (const s of ps) {
    assert.deepEqual(s.hang.world.slice(0, 2), [0, ps[0].hang.world[1]]);
    const [lx, ly] = s.hang.local;
    assert.ok(Math.abs(s.p[0] + lx - 0) < 1e-9);
    assert.ok(Math.abs(s.p[1] + ly - s.hang.world[1]) < 1e-9);
    assert.ok(Math.abs(ly - (3.5 / 2 - 10 / UNIT)) < 1e-9, 'the hole is 10 mm under the top edge');
  }
  assert.ok(ps[0].p[1] - 3.5 / 2 > 0, 'they hang clear of the floor');
  assert.equal(placements('peg', pouch, 99).length, Math.min(MAX_COUNT.peg, MAX_POUCHES));
});

test('a pile is the same for a seed, and drops one pack after another', () => {
  assert.deepEqual(placements('pile', box, 6, 3), placements('pile', box, 6, 3));
  assert.notDeepEqual(placements('pile', box, 6, 3), placements('pile', box, 6, 4));
  const ys = placements('pile', box, 6).map((s) => s.p[1]);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test('every format gives the 3D view its faces', () => {
  const b = packFaces(design({ format: 'tuckBox' }), env());
  assert.deepEqual(Object.keys(b.faces).sort(), ['back', 'bottom', 'front', 'left', 'right', 'top']);
  assert.deepEqual(b.size, { x: 95, y: 50, z: 65 });
  for (const svg of Object.values(b.faces)) assert.match(svg, /^<svg [^>]*width="[\d.]+mm"/);
  const p = packFaces(design(), env());
  assert.equal(p.kind, 'pouch');
  assert.deepEqual(p.hole, { x: 125, y: 10 });
  assert.equal(packFaces(design({ format: 'standUpPouch' }), env()).kind, 'standup');
});

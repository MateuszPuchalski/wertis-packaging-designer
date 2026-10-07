import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placements, scenesFor, MAX_COUNT, UNIT } from '../src/three/scenes.js';
import { packFaces } from '../src/render/faces.js';
import { design, env } from './helpers.js';

const box = { kind: 'box', size: { x: 95, y: 50, z: 65 } };
const pouch = { kind: 'pouch', size: { x: 250, y: 350, z: 7.5 }, hole: { x: 125, y: 10 } };

test('boxes stack and pile; pouches also hang on a peg', () => {
  assert.deepEqual(scenesFor('box'), ['stack', 'pile']);
  assert.deepEqual(scenesFor('pouch'), ['peg', 'pile', 'stack']);
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
  assert.equal(placements('peg', pouch, 99).length, MAX_COUNT.peg);
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

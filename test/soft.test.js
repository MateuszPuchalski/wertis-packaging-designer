import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOFT, FILMS, MATERIAL, laminate, plateFor, createBag, createSoftWorld, stepSoft, shove, quatFromEuler,
  filmInside, maxStretch, volumeOf, renderLayout, writeRender, followPart,
} from '../src/three/softPouch.js';
import { PRODUCTS, arrange } from '../src/three/products.js';
import { placements } from '../src/three/scenes.js';
import { design } from './helpers.js';

const d = design();
const W = d.dims.width, H = d.dims.height;
const kit = () => arrange(PRODUCTS.clutchDrum, { x: 22.5, y: 100, w: 205, h: 190 });
const hanging = (opts = {}) => createBag({ W, H, dims: d.dims, hole: { x: W / 2, y: d.dims.holeOffset }, pose: { p: [0, 600, 0], q: [0, 0, 0, 1] }, parts: kit(), pinned: true, ...opts });
const run = (sim, frames) => { for (let f = 0; f < frames; f++) stepSoft(sim, 1 / 60); };

// Is each part between its bag's two films where it lies?
function partsInside(bag) {
  const { F, B, p, normals } = bag;
  return bag.parts.every((pt) => {
    const f = 3 * F[pt.cell], b = 3 * B[pt.cell];
    const n = [normals[f] - normals[b], normals[f + 1] - normals[b + 1], normals[f + 2] - normals[b + 2]];
    const front = (p[f] - pt.c[0]) * n[0] + (p[f + 1] - pt.c[1]) * n[1] + (p[f + 2] - pt.c[2]) * n[2];
    const back = (pt.c[0] - p[b]) * n[0] + (pt.c[1] - p[b + 1]) * n[1] + (pt.c[2] - p[b + 2]) * n[2];
    return front > -1 && back > -1;
  });
}

test('the film stiffness comes from the laminate: bending stiffness, weight, bending length', () => {
  // One layer: D = E t³ / 12 / (1 − ν²).
  const pe = laminate([['PE', 100]]);
  assert.ok(Math.abs(pe.D - (MATERIAL.PE.E * 1e-12) / 12 / (1 - MATERIAL.nu ** 2)) < 1e-12);
  assert.ok(Math.abs(pe.mass - 0.0925) < 1e-9, '92.5 g/m²');
  // The stiff PET outside makes the laminate much stiffer than the PE alone.
  assert.ok(laminate([['PET', 12], ['PE', 100]]).D > 2 * pe.D);
  // More PE, stiffer film; all in the range real zip pouches feel like.
  const cs = Object.values(FILMS).map((f) => f.c);
  assert.deepEqual(cs, [...cs].sort((a, b) => a - b));
  assert.ok(cs[0] > 30 && cs.at(-1) < 70);
  assert.ok(Math.abs(FILMS.heavy.c - 55) < 2 && FILMS.heavy.thickness === 162);
  assert.equal(plateFor(0), 0);
  assert.equal(plateFor(500), 1);
  assert.ok(plateFor(50) > plateFor(45));
});

test('the cantilever test gives the bending length the film is calibrated to', () => {
  // A strip held flat by its top edge, sticking out sideways: Peirce's c from the droop.
  const W2 = 150, H2 = 140, dims = { sideSeal: 4, topSeal: 6, bottomSeal: 4, zip: false };
  const q = [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)];
  const bag = createBag({ W: W2, H: H2, dims, hole: { x: W2 / 2, y: 3 }, pose: { p: [0, 500, 0], q }, parts: [], pinned: true, air: 0, film: 'heavy' });
  for (const k of bag.rail.idx) bag.w[k] = 0;
  const sim = createSoftWorld([bag]);
  run(sim, 300);
  const { F, nx, ny, p } = bag;
  const i = Math.floor(nx / 2), j0 = bag.rail.idx.length / nx | 0;
  const root = 3 * F[j0 * nx + i], tip = 3 * F[(ny - 1) * nx + i];
  const theta = Math.atan2(p[root + 1] - p[tip + 1], Math.hypot(p[tip] - p[root], p[tip + 2] - p[root + 2]));
  const L = (ny - 1 - j0) * bag.dy;
  const c = L * Math.cbrt(Math.cos(theta / 2) / (8 * Math.tan(theta)));
  assert.ok(Math.abs(c - FILMS.heavy.c) < 6, `bending length ${c.toFixed(0)} mm, the laminate's is ${FILMS.heavy.c.toFixed(0)} mm`);
});

test('a hanging bag stays flat on its rail, and the parts sag to the bottom inside it', () => {
  const bag = hanging();
  const sim = createSoftWorld([bag], { floor: 0 });
  const start = bag.parts.map((pt) => pt.c[1]);
  run(sim, 200);
  for (const v of bag.p) assert.ok(Number.isFinite(v));
  // Every part ends lower; the drum starts low already, the others fall a long way.
  bag.parts.forEach((pt, k) => assert.ok(pt.c[1] < start[k] - (pt.id === 'drum' ? 5 : 100), `${pt.id} sagged ${(start[k] - pt.c[1]).toFixed(0)} mm`));
  const bottom = 600 - H / 2;
  assert.ok(bag.parts.every((pt) => pt.c[1] < bottom + 150), 'all in the lower part of the bag');
  assert.ok(partsInside(bag), 'between the films');
  assert.ok(filmInside(sim) < 2, 'the film is never inside a part');
  // The rail keeps the top straight and the bag does not fold up.
  const { F, nx, ny, p } = bag;
  const width = (j) => Math.hypot(p[3 * F[j * nx + nx - 1]] - p[3 * F[j * nx]], p[3 * F[j * nx + nx - 1] + 2] - p[3 * F[j * nx] + 2]);
  assert.ok(width(0) > 0.98 * W && width(Math.round(ny / 2)) > 0.9 * W);
  // The pin holds; the air keeps the bag a little puffed; the film hardly stretches.
  assert.deepEqual([...bag.p.slice(3 * bag.pins[0], 3 * bag.pins[0] + 3)].map(Math.round), [0, 775, 0]);
  assert.ok(volumeOf(bag) > 0.8 * bag.volume);
  assert.ok(maxStretch(bag) < 0.3);
});

test('stiffer film bends less', () => {
  const sag = (film) => {
    const bag = hanging({ film });
    const sim = createSoftWorld([bag], { floor: 0 });
    run(sim, 150);
    // How far the bottom edge's middle swings out of the bag's plane.
    const { F, nx, ny, p } = bag;
    return Math.abs(p[3 * F[(ny - 1) * nx + Math.floor(nx / 2)] + 2]);
  };
  assert.ok(sag('extra') <= sag('light') + 1);
});

test('bags lying in a stack keep their parts inside, and come to rest', () => {
  const pack = { kind: 'pouch', size: { x: W, y: H, z: 7.5 }, thick: 38.6, hole: { x: W / 2, y: 10 } };
  const bags = placements('stack', pack, 3, 1).map((s) => createBag({ W, H, dims: d.dims, pose: { p: s.p.map((v) => v * 100), q: quatFromEuler(...s.r) }, parts: kit() }));
  const sim = createSoftWorld(bags, { floor: 0 });
  run(sim, 180);
  for (const bag of bags) {
    for (const v of bag.p) assert.ok(Number.isFinite(v));
    assert.ok(partsInside(bag));
    assert.ok(bag.parts.every((pt) => pt.c[1] > 0), 'nothing through the floor');
  }
  assert.ok(filmInside(sim, { others: false }) < 2);
  // Everything rests a few seconds after the last shove; a shove wakes it again.
  run(sim, Math.ceil(SOFT.settle * 60) + 10);
  assert.ok(bags.every((b) => !b.awake));
  assert.deepEqual(stepSoft(sim, 1 / 60), []);
  shove(sim, () => [0, 300, 0]);
  assert.ok(bags.every((b) => b.awake));
});

test('the same bag does the same thing every time', () => {
  const a = hanging(), b = hanging();
  run(createSoftWorld([a]), 60);
  run(createSoftWorld([b]), 60);
  assert.deepEqual([...a.p], [...b.p]);
});

test('the surface to draw: both films, smooth, closed at the seals, normals outwards', () => {
  const bag = hanging();
  const layout = renderLayout(bag);
  assert.equal(layout.rx, 2 * bag.nx - 1);
  assert.equal(layout.index.length, layout.groups[0][1] + layout.groups[1][1]);
  const pos = new Float32Array(6 * layout.per), nor = new Float32Array(6 * layout.per);
  writeRender(bag, layout, pos, nor, 1);
  for (const v of pos) assert.ok(Number.isFinite(v));
  // The front film's middle faces +z, the back film's -z (the bag hangs facing +z).
  const mid = (Math.floor(layout.ry / 3) * layout.rx + Math.floor(layout.rx / 2)) * 3;
  assert.ok(nor[mid + 2] > 0.5 && nor[3 * layout.per + mid + 2] < -0.5);
  // At the seal round the edge the two films meet.
  const corner = 3 * (layout.rx - 1);
  assert.deepEqual([...pos.slice(corner, corner + 3)], [...pos.slice(3 * layout.per + corner, 3 * layout.per + corner + 3)]);
});

// How the parts move in the second after `settle` frames: the worst part's biggest jump in a
// frame, the E-clip's, and how far any part slid sideways.
function restless(bags, settle = 150) {
  const sim = createSoftWorld(bags, { floor: 0 });
  run(sim, settle);
  const parts = bags.flatMap((b) => b.parts);
  const last = parts.map((p) => [...p.c]), start = parts.map((p) => [...p.c]);
  let hop = 0, clip = 0;
  for (let f = 0; f < 60; f++) {
    stepSoft(sim, 1 / 60);
    parts.forEach((p, k) => {
      const m = Math.hypot(p.c[0] - last[k][0], p.c[1] - last[k][1], p.c[2] - last[k][2]);
      hop = Math.max(hop, m);
      if (p.id === 'eclip') clip = Math.max(clip, m);
      last[k] = [...p.c];
    });
  }
  const slid = Math.max(...parts.map((p, k) => Math.hypot(p.c[0] - start[k][0], p.c[2] - start[k][2])));
  return { hop, clip, slid };
}

test('parts lying in a bag keep still: the light E-clip does not hop, nothing creeps', () => {
  // The floor once held a part lower than its film allows, and the two rules fought every
  // substep: the 0.5 g E-clip hopped up to 4 mm a frame and the bag crept 6 mm a second.
  const pack = { kind: 'pouch', size: { x: W, y: H, z: 7.5 }, thick: 38.6, hole: { x: W / 2, y: 10 } };
  const lying = (n) => placements('stack', pack, n, 1).map((s) => createBag({ W, H, dims: d.dims, pose: { p: s.p.map((v) => v * 100), q: quatFromEuler(...s.r) }, parts: kit() }));
  const one = restless(lying(1));
  assert.ok(one.clip < 0.5, `the E-clip jumps ${one.clip.toFixed(2)} mm a frame`);
  assert.ok(one.hop < 1.5, `a part jumps ${one.hop.toFixed(2)} mm a frame`);
  assert.ok(one.slid < 1, `a part slid ${one.slid.toFixed(2)} mm in a second`);
  // A stack settles (static friction, PET on PET), where it used to creep on at 15 mm a
  // second until the timer stopped it. In the first seconds it may still topple off the bumps.
  const three = restless(lying(3), 240);
  assert.ok(three.slid < 6, `the stack slid ${three.slid.toFixed(2)} mm in its fifth second`);
  assert.ok(three.hop < 2, `a part in the stack jumps ${three.hop.toFixed(2)} mm a frame`);
});

test('on screen a part follows the simulation, easing only sub-millimetre shiver', () => {
  const part = { c: new Float64Array([0, 0, 0]), quat: new Float64Array([0, 0, 0, 1]) };
  let shown = followPart(null, part);
  // A 0.4 mm back-and-forth every frame shows as much less.
  let spread = 0;
  for (let f = 0; f < 20; f++) {
    part.c[1] = f % 2 ? 0.4 : 0;
    shown = followPart(shown, part);
    if (f > 10) spread = Math.max(spread, Math.abs(shown.c[1] - 0.2));
  }
  assert.ok(spread < 0.1, `shown shiver ${spread.toFixed(3)} mm`);
  // A real move (a drop, a drag) is drawn as it happens.
  part.c[1] = 50;
  part.quat.set([0, Math.sin(0.5), 0, Math.cos(0.5)]);
  shown = followPart(shown, part);
  assert.deepEqual([...shown.c], [...part.c]);
  assert.ok(Math.abs(Math.hypot(...shown.quat) - 1) < 1e-9 && Math.abs(shown.quat[1] - part.quat[1]) < 1e-9);
});

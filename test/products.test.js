import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import { PRODUCTS, PARTS, productOf, bulge, partBulge, thicknessWith, arrange, rimShape, RIM, MATERIALS } from '../src/three/products.js';
import { packFaces } from '../src/render/faces.js';
import { placements, UNIT } from '../src/three/scenes.js';
import { createDesign, migrate } from '../src/design.js';
import { design, env } from './helpers.js';

const kit = PRODUCTS.clutchDrum;

// The pouch with the Stihl clutch kit in it (a new design starts without it).
const withKit = (d) => ({ ...d, mockup: { ...d.mockup, product3d: 'clutchDrum' } });

test('the clutch kit is built at its real size: the drum is Ø69 mm', () => {
  const size = (id) => {
    const b = new THREE.Box3();
    for (const g of Object.values(PARTS[id].build(THREE))) { g.computeBoundingBox(); b.union(g.boundingBox); }
    return b;
  };
  const drum = size('drum');
  assert.ok(Math.abs(drum.max.x - 34.5) < 0.01 && Math.abs(drum.min.x + 34.5) < 0.01, 'Ø69');
  assert.ok(Math.abs(drum.max.z - drum.min.z - 36.2) < 0.01 && Math.abs(drum.max.z + drum.min.z) < 0.01, '36 mm tall, centred on the pouch');
  const reach = (id) => Math.max(...Object.values(PARTS[id].build(THREE)).map((g) => {
    const p = g.attributes.position;
    let r = 0;
    for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getY(i)));
    return r;
  }));
  assert.ok(Math.abs(reach('clutch') - 31.9) < 0.05, 'the clutch, Ø64, fits the drum');
  assert.ok(reach('clutch') < 32.7, 'inside the bore of the drum');
  assert.ok(Math.abs(size('rim').max.x - 18.3) < 0.05);
  const b = size('bearing');
  assert.ok(Math.abs(b.max.x - b.min.x - 10) < 0.01, 'the bearing lies on its side: 10 mm long across the face');
  assert.deepEqual([...new Set(kit.layout.map((it) => it.part))].sort(), ['bearing', 'clutch', 'drum', 'eclip', 'rim', 'washer']);
  for (const id of Object.keys(PARTS)) {
    const used = Object.keys(PARTS[id].build(THREE));
    for (const key of used) assert.ok(MATERIALS[key], `${id} uses a known material (${key})`);
  }
});

test('the rim sprocket has 7 pockets and a splined bore', () => {
  const s = rimShape(THREE);
  assert.equal(s.holes.length, 8, 'the bore and 7 pockets');
  assert.equal(RIM.pockets, 7);
});

test('the film never cuts into a part', () => {
  for (const [id, part] of Object.entries(PARTS)) {
    for (const g of Object.values(part.build(THREE))) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        assert.ok(Number.isFinite(x + y + z));
        assert.ok(partBulge(part, z > 0 ? 'front' : 'back', Math.hypot(x, y)) >= Math.abs(z) - 1e-6, `${id}: film under the part at r ${Math.hypot(x, y).toFixed(1)}, z ${z.toFixed(1)}`);
      }
    }
  }
  assert.ok(Math.abs(thicknessWith(kit) - 38.6) < 1e-9, 'the drum is the thickest part');
  assert.equal(thicknessWith(null), 0);
  assert.equal(productOf('none'), null);
  assert.equal(productOf('nonsense'), null);
});

test('the kit is laid out inside the window with no two parts touching', () => {
  const box = { x: 22.5, y: 100, w: 205, h: 190 };
  const placed = arrange(kit, box);
  for (const p of placed) {
    const r = PARTS[p.part].radius;
    assert.ok(p.x - r >= box.x && p.x + r <= box.x + box.w && p.y - r >= box.y && p.y + r <= box.y + box.h, `${p.part} inside the window`);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i], placed[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= PARTS[a.part].radius + PARTS[b.part].radius, `${a.part} and ${b.part} apart`);
    }
  }
  assert.ok(bulge(placed, 'front', placed[5].x, placed[5].y) > 19, 'the film stands over the drum');
  assert.equal(bulge(placed, 'front', 0, 0), 0, 'and lies flat away from the parts');
  // A small window squeezes the set together; the parts stay their size.
  const small = arrange(kit, { x: 10, y: 40, w: 100, h: 110 });
  for (const p of small) assert.ok(p.x > 10 && p.x < 110 && p.y > 40 && p.y < 150);
});

test('the parts sit behind the front window, and the pouch is lined', () => {
  const d = design();
  const p = packFaces(withKit(d), env());
  assert.deepEqual(Object.keys(p.faces).sort(), ['back', 'filmBack', 'filmFront', 'front', 'insideBack', 'insideFront']);
  assert.match(p.faces.filmFront, /<path d="M/, 'the front film covers the window');
  assert.doesNotMatch(p.faces.filmBack, /<path/, 'no back window, no film there');
  assert.equal(p.product.id, 'clutchDrum');
  assert.equal(p.product.parts.length, 6);
  const win = d.layout['front.window'];
  assert.equal(win, undefined, 'the default window');
  const xs = p.product.parts.map((q) => q.x);
  assert.ok(Math.min(...xs) > 22 && Math.max(...xs) < 228, 'across the window');
  assert.ok(Math.abs(p.thick - 38.6) < 1e-9);
  // Without a product the pouch stays as thin as before.
  const empty = packFaces({ ...d, mockup: { ...d.mockup, product3d: 'none' } }, env());
  assert.equal(empty.product, null);
  assert.equal(empty.thick, empty.size.z);
  // A stand-up pouch holds it too; a box never does.
  assert.equal(packFaces(withKit(design({ format: 'standUpPouch' })), env()).product.id, 'clutchDrum');
  assert.equal(packFaces(design({ format: 'tuckBox' }), env()).product, undefined);
  // With no window the parts still lie inside the seals.
  const shut = design();
  shut.options.windowShape = 'none';
  const closed = packFaces(withKit(shut), env());
  assert.doesNotMatch(closed.faces.filmFront, /<path/);
  for (const q of closed.product.parts) assert.ok(q.x > 5 && q.x < 245 && q.y > 31 && q.y < 345);
});

test('pouches with a part are spaced by its thickness on the peg and in the stack', () => {
  const pouch = { kind: 'pouch', size: { x: 250, y: 350, z: 7.5 }, thick: 38.6, hole: { x: 125, y: 10 } };
  const peg = placements('peg', pouch, 4);
  assert.ok(peg[0].p[2] - peg[1].p[2] >= 38.6 / UNIT, 'one behind another, not inside');
  const stack = placements('stack', pouch, 10);
  const ys = stack.filter((s) => Math.abs(s.p[0] - stack[0].p[0]) < 0.05).map((s) => s.p[1]);
  assert.equal(ys.length, 5, 'piles of 5');
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 38.6 / UNIT);
  assert.ok(ys[0] >= 38.6 / UNIT / 2, 'resting on the floor');
});

test('new designs start without the kit, so the pack is universal; a kit saved in a project stays', () => {
  assert.equal(createDesign({ format: 'flatPouch' }).mockup.product3d, 'none');
  assert.equal(createDesign({ format: 'tuckBox' }).mockup.product3d, 'none');
  assert.equal(migrate({ schema: 'wertis-packaging', version: 1, format: 'flatPouch', mockup: { background: '#ffffff' } }).mockup.product3d, 'none');
  const d = withKit(createDesign({ format: 'flatPouch' }));
  assert.equal(migrate(JSON.parse(JSON.stringify(d))).mockup.product3d, 'clutchDrum');
});

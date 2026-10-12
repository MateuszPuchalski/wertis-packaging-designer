import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setIn, migrate, layoutKey, layoutOf } from '../src/design.js';
import { panelsWithElements } from '../src/render/sheet.js';
import { resetLayout } from '../src/edit/actions.js';
import { bundlePlan } from '../src/export/bundle.js';
import { design, env } from './helpers.js';

const at = (d, w, h) => setIn(setIn(d, ['dims', 'width'], w), ['dims', 'height'], h);
const find = (d, id) => panelsWithElements(d, env()).flatMap((p) => p.elements).find((e) => e.id === id);

test('a move is kept for the size it was made at; the other sizes keep their own fit', () => {
  const a = at(design({ format: 'flatPouch' }), 140, 200);
  const moved = { ...a, layout: { [layoutKey(a, 'back.address')]: { x: 0.3, y: 0.3, w: 0.3, h: 0.1 } } };
  assert.ok(Math.abs(find(moved, 'back.address').box.x - 0.3 * 140) < 1e-6);
  // The same project at another size: the template's own, bottom-aligned place again.
  const other = at(moved, 250, 350);
  assert.deepEqual(find(other, 'back.address').box, find(at(design({ format: 'flatPouch' }), 250, 350), 'back.address').box);
  assert.equal(layoutOf(other, 'back.address'), undefined);
  assert.ok(layoutOf(at(other, 140, 200), 'back.address'), 'and back again, the move is still there');
  // Every size of the zip takes its own.
  for (const e of bundlePlan(moved)) assert.equal(!!layoutOf(e.design, 'back.address'), e.size[0] === 140);
});

test('resetting the position at one size leaves the others', () => {
  const a = at(design({ format: 'flatPouch' }), 140, 200);
  const b = at(a, 250, 350);
  const both = { ...a, layout: { [layoutKey(a, 'back.url')]: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, [layoutKey(b, 'back.url')]: { x: 0.2, y: 0.2, w: 0.2, h: 0.1 } } };
  const r = resetLayout(both, 'back.url');
  assert.equal(layoutOf(r, 'back.url'), undefined);
  assert.ok(layoutOf(at(r, 250, 350), 'back.url'));
});

test('a project saved with one set of moves keeps them for the size it was saved at', () => {
  const d = at(design({ format: 'flatPouch' }), 140, 200);
  const old = JSON.parse(JSON.stringify({ ...d, layout: { 'back.url': { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } } }));
  const m = migrate(old);
  assert.ok(layoutOf(m, 'back.url'));
  assert.equal(layoutOf(at(m, 250, 350), 'back.url'), undefined);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(m))).layout, m.layout, 'loading a new file changes nothing');
});

test('the pouch address grows with its box height; stretching it sideways leaves the type alone', () => {
  const d = design({ format: 'flatPouch' });
  const a = find(d, 'back.address');
  const store = (box) => ({ ...d, layout: { [layoutKey(d, 'back.address')]: { x: box.x / 250, y: box.y / 350, w: box.w / 250, h: box.h / 350 } } });
  const wide = find(store({ ...a.box, w: a.box.w * 1.5 }), 'back.address');
  assert.ok(Math.abs(wide.size - a.size) < 1e-9, 'wider: same size');
  const tall = find(store({ ...a.box, h: a.box.h * 1.5, y: a.box.y - a.box.h * 0.5 }), 'back.address');
  assert.ok(Math.abs(tall.size / a.size - 1.5) < 1e-9, 'taller by half: type bigger by half');
});

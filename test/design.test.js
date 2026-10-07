import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, serialize, setIn, removeSwatch, slotsUsingSwatch, colorSlots, switchFormat, SCHEMA_VERSION } from '../src/design.js';
import { panelsWithElements } from '../src/render/sheet.js';
import { Store } from '../src/store.js';
import { design, env } from './helpers.js';

test('a new design has the WERTIS defaults', () => {
  const d = design();
  assert.equal(d.version, SCHEMA_VERSION);
  assert.equal(d.format, 'flatPouch');
  assert.equal(d.dims.width, 250);
  assert.equal(d.dims.height, 350);
  assert.equal(d.content.ean, '5905947596676');
  assert.ok(d.palette.some((s) => s.role === 'transparent'));
});

test('a saved project loads back the same', () => {
  const d = design();
  d.content.sku = 'W09-0414';
  d.layout['front.window'] = { x: 0.1, y: 0.4, w: 0.5, h: 0.3 };
  assert.deepEqual(migrate(serialize(d)), d);
});

test('old or partial projects are completed; foreign or newer files are rejected', () => {
  const d = migrate({ schema: 'wertis-packaging', version: 1, name: 'Old', dims: { width: 9999, height: 'x' }, content: { sku: 'A1' } });
  assert.equal(d.dims.width, 800, 'clamped to the field maximum');
  assert.equal(d.dims.height, 350, 'bad numbers fall back to the default');
  assert.equal(d.content.sku, 'A1');
  assert.equal(d.content.productName.pl, 'Starter do kosiarki BS Classic Sprint');
  assert.throws(() => migrate({ hello: 1 }), /not a WERTIS packaging project/);
  assert.throws(() => migrate({ schema: 'wertis-packaging', version: 99 }), /newer version/);
  assert.throws(() => migrate('{"schema":"wertis-packaging"}'), /valid version/);
});

test('setIn shares untouched branches', () => {
  const d = design();
  const n = setIn(d, ['content', 'sku'], 'X');
  assert.equal(n.content.sku, 'X');
  assert.equal(d.content.sku, 'W43-0508');
  assert.equal(n.palette, d.palette);
  assert.equal(setIn(n, ['colors', 'a'], undefined).colors.a, undefined);
});

test('deleting a used swatch moves its users to the replacement', () => {
  const d = design();
  const parts = panelsWithElements(d, env());
  const users = slotsUsingSwatch(d, parts, 'boxOrange');
  assert.ok(users.length >= 4, 'header and footer bands use box orange');
  assert.throws(() => removeSwatch(d, parts, 'boxOrange', null), /Pick another colour/);
  const n = removeSwatch(d, parts, 'boxOrange', 'orange');
  assert.ok(!n.palette.some((s) => s.id === 'boxOrange'));
  for (const u of users) assert.deepEqual(n.colors[u.key], { swatch: 'orange' });
  assert.equal(slotsUsingSwatch(n, parts, 'boxOrange').length, 0);
  assert.throws(() => removeSwatch(d, parts, 'transparent', 'white'), /can be edited but not deleted/);
});

test('an unused swatch deletes without a replacement', () => {
  const d = design();
  const n = removeSwatch(d, panelsWithElements(d, env()), 'green', null);
  assert.ok(!n.palette.some((s) => s.id === 'green'));
});

test('every element colour is listed with its default', () => {
  const d = design();
  const slots = colorSlots(d, panelsWithElements(d, env()));
  const header = slots.find((s) => s.key === 'front.header.fill');
  assert.deepEqual([header.ref, header.isDefault], ['boxOrange', true]);
});

test('switching format keeps texts and palette', () => {
  const d = design();
  d.content.sku = 'KEEP';
  const n = switchFormat(d, 'flatPouch');
  assert.equal(n.content.sku, 'KEEP');
  assert.equal(n.palette, d.palette);
});

test('the store undoes, redoes and coalesces bursts', () => {
  const s = new Store(design());
  s.set(['content', 'sku'], 'A', { coalesce: 'k' });
  s.set(['content', 'sku'], 'AB', { coalesce: 'k' });
  s.settle();
  s.set(['content', 'sku'], 'ABC');
  assert.equal(s.past.length, 2);
  s.undo();
  assert.equal(s.get().content.sku, 'AB');
  s.undo();
  assert.equal(s.get().content.sku, 'W43-0508');
  s.redo();
  assert.equal(s.get().content.sku, 'AB');
  s.set(['name'], 'x');
  assert.equal(s.canRedo(), false);
});

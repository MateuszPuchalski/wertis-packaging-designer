import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setLang, getLang, t, label, plural, fmtNum, pickLang, msgOf, misses, clearMisses, catalogs } from '../src/i18n/index.js';
import { FORMATS, TEMPLATES } from '../src/registry.js';
import { PROOF_PAGES } from '../src/render/proof.js';
import { MOCKUP_VIEWS } from '../src/render/mockup.js';
import { OUTPUT_INTENTS } from '../src/export/documents.js';
import { SCENES } from '../src/three/scenes.js';
import { PRODUCTS } from '../src/three/products.js';
import { PATTERN_STYLES } from '../src/render/pattern.js';
import { PATTERN_ICONS } from '../src/brand/patternIcons.js';
import { LOGO_PRESETS } from '../src/brand/wertis.js';
import { geometry, panelsWithElements } from '../src/render/sheet.js';
import { createDesign } from '../src/design.js';
import { env } from './helpers.js';

const { en: EN, pl: PL } = catalogs;
const placeholders = (m) => [...new Set([...JSON.stringify(m).matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();

test('messages: interpolation, numbers, plurals and the English fallback', () => {
  setLang('pl');
  assert.equal(getLang(), 'pl');
  assert.equal(t('app.name'), 'Projektant opakowań WERTIS');
  assert.equal(t('no.such.key'), 'no.such.key', 'unknown keys show themselves');
  assert.ok(misses().includes('pl:no.such.key'));
  clearMisses();
  assert.equal(fmtNum(0.5), '0,5');
  assert.equal(fmtNum(12.3456, 1), '12,3');
  assert.equal(fmtNum('x'), 'x');
  setLang('en');
  assert.equal(fmtNum(0.5), '0.5');
  assert.equal(setLang('de'), 'en', 'only Polish and English');
});

test('Polish plurals: one, few, many', () => {
  const want = { 0: 'many', 1: 'one', 2: 'few', 4: 'few', 5: 'many', 12: 'many', 14: 'many', 22: 'few', 25: 'many', 112: 'many', 1.5: 'other' };
  for (const [n, cat] of Object.entries(want)) assert.equal(plural(Number(n), 'pl'), cat, `${n}`);
  assert.equal(plural(1, 'en'), 'one');
  assert.equal(plural(2, 'en'), 'other');
  // Every Polish plural message has the three forms; every English one has one and other.
  for (const [k, m] of Object.entries(PL)) if (typeof m === 'object') assert.deepEqual(Object.keys(m).sort(), ['few', 'many', 'one', 'other'], k);
  for (const [k, m] of Object.entries(EN)) if (typeof m === 'object') assert.deepEqual(Object.keys(m).sort(), ['one', 'other'], k);
});

test('the starting language: the saved one, else Polish for a Polish browser', () => {
  assert.equal(pickLang('en', ['pl-PL']), 'en');
  assert.equal(pickLang(null, ['pl-PL', 'en']), 'pl');
  assert.equal(pickLang(null, ['de-DE', 'pl']), 'pl');
  assert.equal(pickLang('xx', ['en-US']), 'en');
  assert.equal(pickLang(undefined, []), 'en');
});

test('English and Polish have the same messages with the same placeholders', () => {
  assert.deepEqual(Object.keys(PL).sort(), Object.keys(EN).sort());
  for (const k of Object.keys(EN)) assert.deepEqual(placeholders(PL[k]), placeholders(EN[k]), k);
  for (const [k, m] of Object.entries(PL)) for (const s of typeof m === 'object' ? Object.values(m) : [m]) assert.ok(s.trim().length, `${k} is empty`);
});

// Every label the core data holds, the way the UI shows them.
function dataLabels() {
  const out = new Set();
  const add = (s) => typeof s === 'string' && out.add(s);
  for (const f of Object.values(FORMATS)) {
    add(f.label);
    for (const fl of f.fields) { add(fl.label); for (const o of fl.options ?? []) add(o[1]); }
  }
  for (const tp of Object.values(TEMPLATES)) {
    add(tp.label);
    for (const fl of tp.options) { add(fl.label); for (const o of fl.options ?? []) add(o[1]); }
  }
  for (const p of Object.values(PROOF_PAGES)) add(p.label);
  for (const [, l] of MOCKUP_VIEWS) add(l);
  for (const p of Object.values(OUTPUT_INTENTS)) add(p.label);
  for (const p of Object.values(SCENES)) add(p.label);
  for (const p of Object.values(PRODUCTS)) add(p.label);
  for (const [, l] of PATTERN_STYLES) add(l);
  for (const p of PATTERN_ICONS) add(p.label);
  for (const p of Object.values(LOGO_PRESETS)) add(p.label);
  for (const f of Object.values(FORMATS)) {
    for (const tp of f.templates) {
      const d = createDesign({ format: f.id, template: tp });
      const geo = geometry(d);
      for (const { panel, elements } of panelsWithElements(d, env(), geo)) {
        add(panel.label);
        for (const fc of panel.info?.faces ?? []) add(fc.label);
        for (const e of elements) add(e.label);
      }
    }
  }
  return out;
}

test('every label in the core data has its Polish name', () => {
  const missing = [...dataLabels()].filter((l) => !(l in catalogs.labels.pl));
  assert.deepEqual(missing, []);
  setLang('pl');
  assert.equal(label('Hang hole'), 'Otwór do zawieszenia');
  assert.equal(label('Something new'), 'Something new', 'unknown labels stay English');
  setLang('en');
  assert.equal(label('Hang hole'), 'Hang hole');
  clearMisses();
});

test('a finding with a descriptor reads in the current language; without one, its message', () => {
  setLang('en');
  assert.equal(msgOf({ message: 'Plain.' }), 'Plain.');
  assert.equal(msgOf({ message: 'x', i18n: { key: 'no.such' } }), 'x');
  assert.equal(msgOf('Just text'), 'Just text');
});

// The source files that hold UI strings.
function files(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('every message the code asks for exists', () => {
  const src = [...files('src'), 'index.html'].filter((p) => !p.includes('i18n')).map((p) => [p, readFileSync(p, 'utf8')]);
  const asked = new Set();
  for (const [p, s] of src) {
    for (const m of s.matchAll(/\bt\(\s*'([^']+)'/g)) asked.add(`${m[1]}\t${p}`);
    for (const m of s.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)) asked.add(`${m[1]}\t${p}`);
    for (const m of s.matchAll(/i18n: \{ key: '([^']+)'/g)) asked.add(`${m[1]}\t${p}`);
  }
  const missing = [...asked].filter((x) => !(x.split('\t')[0] in EN));
  assert.deepEqual(missing, []);
});

// Designs that between them set off most preflight findings.
function troubledDesigns() {
  const out = [];
  const base = () => createDesign({ date: '2026-10-07' });
  out.push(base(), createDesign({ format: 'tuckBox' }), createDesign({ format: 'standUpPouch' }));
  for (const ean of ['59059475966', '5905947596677', '59O5947594658', '5905947594658', '', '2000000000008']) {
    const d = base();
    d.content.ean = ean;
    out.push(d);
  }
  const d = base();
  d.dims = { ...d.dims, bleed: 1 };
  d.export = { ...d.export, bwr: 0.02 };
  d.palette = d.palette.map((s) => (s.id === 'silver' ? { ...s, asSpot: true, spot: '' } : s.id === 'black' ? { ...s, cmyk: [100, 100, 100, 100] } : s.role || s.spot ? s : { ...s, spot: 'PANTONE 151 C' }));
  // Pushed into the seals; shrunk under 5 pt.
  d.layout = { 'front-logo': { x: 0, y: 0, w: 0.5, h: 0.1 }, window: { x: 0, y: 0, w: 1, h: 0.5 } };
  d.content.sku = 'A very long product code that has to shrink a lot to fit its box on the front of the bag';
  out.push(d);
  return out;
}

test('every preflight finding and EAN error reads in both languages, and the English is the message itself', async () => {
  const { preflight } = await import('../src/preflight.js');
  const keys = new Set();
  for (const d of troubledDesigns()) {
    for (const item of preflight(d, env()).items) {
      assert.ok(item.i18n?.key, `no descriptor: ${item.message}`);
      keys.add(item.i18n.key);
      setLang('en');
      assert.equal(msgOf(item), item.message);
      setLang('pl');
      const pl = msgOf(item);
      assert.ok(pl && !/\{\w+\}/.test(pl) && pl !== item.i18n.key, `${item.i18n.key}: ${pl}`);
    }
  }
  setLang('en');
  assert.deepEqual(misses(), []);
  for (const k of ['pf.ean.bad', 'pf.ean.ok', 'pf.ean.none', 'pf.ean.store', 'pf.ean.bwr', 'pf.colour.noSpot', 'pf.colour.tac', 'pf.colour.namedSpot', 'pf.colour.inksWhite', 'pf.bleed.low', 'pf.bleed.ok', 'pf.colour.richBlack']) assert.ok(keys.has(k), k);
  // Errors thrown by the core carry one too.
  const { migrate } = await import('../src/design.js');
  for (const input of ['{"schema":"x"}', '{"schema":"wertis-packaging","version":0}', '{"schema":"wertis-packaging","version":99}']) {
    try { migrate(input); assert.fail('should throw'); } catch (err) {
      assert.equal(msgOf(err), err.message);
      setLang('pl');
      assert.notEqual(msgOf(err), err.message);
      setLang('en');
    }
  }
});

test('the language never changes what is printed or sent to the factory', async () => {
  const { printSvg, proofSvg } = await import('../src/export/documents.js');
  const { dielineDxf } = await import('../src/export/dxf.js');
  const { preflight } = await import('../src/preflight.js');
  const out = () => {
    const d = createDesign({ date: '2026-10-07' });
    const b = createDesign({ format: 'tuckBox', date: '2026-10-07' });
    return [printSvg(d, env()), proofSvg(d, env(), 'a3'), dielineDxf(d, env()), printSvg(b, env()), JSON.stringify(preflight(d, env()).items.map((i) => i.message))];
  };
  setLang('en');
  const en = out();
  setLang('pl');
  const pl = out();
  setLang('en');
  en.forEach((s, i) => assert.ok(s === pl[i], `output ${i} differs`));
});

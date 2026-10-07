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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eanCheckDigit, validateEan13, ean13Modules, ean13Svg } from '../src/codes/ean13.js';
import { env } from './helpers.js';

// An independent reader: the right-hand codes are the complement of the left odd-parity
// codes, and even-parity codes are the right-hand codes reversed, so one table decodes all.
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function read(bits) {
  assert.equal(bits.length, 95);
  assert.equal(bits.slice(0, 3), '101');
  assert.equal(bits.slice(45, 50), '01010');
  assert.equal(bits.slice(92), '101');
  const flip = (s) => [...s].map((b) => (b === '1' ? '0' : '1')).join('');
  let parity = '', left = '', right = '';
  for (let i = 0; i < 6; i++) {
    const c = bits.slice(3 + 7 * i, 10 + 7 * i);
    const l = R.indexOf(flip(c)), g = R.indexOf([...c].reverse().join(''));
    assert.ok(l >= 0 || g >= 0, `left digit ${i} decodes`);
    parity += l >= 0 ? 'L' : 'G';
    left += l >= 0 ? l : g;
  }
  for (let i = 0; i < 6; i++) right += R.indexOf(bits.slice(50 + 7 * i, 57 + 7 * i));
  return PARITY.indexOf(parity) + left + right;
}

test('check digit of the WERTIS codes', () => {
  assert.equal(eanCheckDigit('590594759667'), 6);
  assert.equal(eanCheckDigit('590594759465'), 8);
  assert.equal(eanCheckDigit('400638133393'), 1);
});

test('validation adds or verifies the check digit', () => {
  assert.deepEqual(validateEan13('590594759667'), { ok: true, code: '5905947596676', added: true });
  assert.equal(validateEan13('5 905947 596676').ok, true);
  assert.match(validateEan13('5905947596677').error, /should be 6/);
  assert.match(validateEan13('59059').error, /13 digits/);
  assert.match(validateEan13('59059A7596676').error, /only digits/);
});

test('the bars decode back to the code', () => {
  for (const code of ['5905947596676', '5905947594658', '4006381333931', '0000000000000', '9780201379624']) {
    assert.equal(read(ean13Modules(code)), code);
  }
});

test('the symbol is 113 modules wide with its quiet zones', () => {
  const r = ean13Svg({ code: '5905947596676', module: 0.33, text: env().text });
  assert.ok(Math.abs(r.w - 37.29) < 1e-9);
  assert.ok(r.svg.includes('<path'));
  assert.equal(ean13Svg({ code: '123' }).error, 'An EAN-13 has 13 digits (this has 3).');
});

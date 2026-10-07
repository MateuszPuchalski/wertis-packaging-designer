// EAN-13 barcodes, drawn as rectangles in mm. At 100 % size a module is 0.33 mm and the
// symbol with its quiet zones is 37.29 × 25.93 mm; GS1 allows 80 % to 200 %.
import { el, n } from '../render/svg.js';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((c) => [...c].map((b) => (b === '1' ? '0' : '1')).join(''));
const G = R.map((c) => [...c].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const EAN_MODULE = 0.33; // mm at 100 %
export const EAN_QUIET = [11, 7]; // modules left and right
export const EAN_WIDTH_MODULES = 95 + 11 + 7;

export function eanCheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

// Accepts 12 digits (the check digit is added) or 13 (the check digit is verified).
// Spaces and dashes are ignored. An error carries an i18n descriptor for the editor; the
// English `error` is what the artwork prints.
export function validateEan13(input) {
  const code = String(input ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return { ok: false, error: 'An EAN-13 has only digits.', i18n: { key: 'ean.digits' } };
  if (code.length === 12) return { ok: true, code: code + eanCheckDigit(code), added: true };
  if (code.length !== 13) return { ok: false, error: `An EAN-13 has 13 digits (this has ${code.length}).`, i18n: { key: 'ean.length', params: { n: code.length } } };
  const check = eanCheckDigit(code.slice(0, 12));
  if (Number(code[12]) !== check) return { ok: false, error: `Wrong check digit: the last digit should be ${check}.`, i18n: { key: 'ean.check', params: { check } } };
  return { ok: true, code };
}

// The 95 modules as a string of 0 and 1.
export function ean13Modules(code13) {
  const d = [...code13].map(Number);
  const parity = PARITY[d[0]];
  let s = '101';
  for (let i = 1; i <= 6; i++) s += (parity[i - 1] === 'L' ? L : G)[d[i]];
  s += '01010';
  for (let i = 7; i <= 12; i++) s += R[d[i]];
  return s + '101';
}

// Modules that belong to the guard bars, which run longer than the others.
function isGuard(i) {
  return i < 3 || (i >= 45 && i < 50) || i >= 92;
}

// The barcode with its quiet zones at (x, y). Returns { svg, w, h } or { error }.
//   module      module width in mm          barHeight  normal bar height in mm (22.85 at 100 %)
//   text        the TextEngine, to draw the digits (they are left out without it)
// bwr: bar width reduction in mm (GS1), the ink spread on press taken off each bar.
export function ean13Svg({ code, x = 0, y = 0, module = EAN_MODULE, barHeight, color = '#000000', bg = '#ffffff', text, font = 'regular', marker = true, bwr = 0 }) {
  const v = validateEan13(code);
  if (!v.ok) return { error: v.error };
  const m = module;
  const bh = barHeight ?? 69.24 * m;
  const bits = ean13Modules(v.code);
  const x0 = x + EAN_QUIET[0] * m;
  let bars = '';
  for (let i = 0; i < 95;) {
    if (bits[i] !== '1') { i++; continue; }
    let j = i;
    while (j < 95 && bits[j] === '1' && isGuard(j) === isGuard(i)) j++;
    const h = isGuard(i) ? bh + 5 * m : bh;
    const bw = Math.max((j - i) * m - bwr, m * 0.3);
    bars += `M${n(x0 + i * m + ((j - i) * m - bw) / 2)} ${n(y)}h${n(bw)}v${n(h)}h${n(-bw)}Z`;
    i = j;
  }
  const w = EAN_WIDTH_MODULES * m;
  const h = bh + 9 * m; // digits sit under the normal bars, beside the longer guards
  let digits = '';
  if (text) {
    const size = 9.5 * m / 0.95; // caps about 7 modules tall
    const top = y + bh + 1.2 * m;
    const put = (s, cx, align = 'center') => text.layout({ text: s, x: cx, y: top, font, size, align }).svg;
    digits += put(v.code[0], x0 - 7 * m);
    for (let i = 0; i < 6; i++) digits += put(v.code[1 + i], x0 + (3 + 7 * i + 3.5) * m);
    for (let i = 0; i < 6; i++) digits += put(v.code[7 + i], x0 + (50 + 7 * i + 3.5) * m);
    if (marker) digits += put('>', x0 + 98.5 * m);
  }
  const svg = (bg === 'none' ? '' : el('rect', { x, y: y - m, width: w, height: h + 2 * m, fill: bg }))
    + el('path', { d: bars, fill: color }) + (digits ? el('g', { fill: color }, digits) : '');
  return { svg, w, h: h + m, code: v.code };
}

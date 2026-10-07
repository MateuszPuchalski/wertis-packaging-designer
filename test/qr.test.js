import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { qrMatrix, qrSvg } from '../src/codes/qr.js';

// Rasterises the matrix with a quiet zone and reads it back with jsQR.
function decode(text) {
  const m = qrMatrix(text);
  const px = 6, q = 4, size = (m.size + 2 * q) * px;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.rows[r][c]) continue;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = (((q + r) * px + y) * size + (q + c) * px + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return jsQR(data, size, size)?.data;
}

test('the QR code reads back as the link', () => {
  assert.equal(decode('https://www.wertis.com.pl'), 'https://www.wertis.com.pl');
  assert.equal(decode('https://www.wertis.com.pl/produkt/W43-0508'), 'https://www.wertis.com.pl/produkt/W43-0508');
});

test('Polish letters survive (UTF-8 byte mode)', () => {
  assert.equal(decode('Części zamienne – gaźnik'), 'Części zamienne – gaźnik');
});

test('the SVG fills the requested size', () => {
  const r = qrSvg({ text: 'https://www.wertis.com.pl', size: 20 });
  assert.equal(r.w, 20);
  assert.ok(r.svg.startsWith('<rect'));
  assert.ok(qrSvg({ text: '  ' }).error);
});

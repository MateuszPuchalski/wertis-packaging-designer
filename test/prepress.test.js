import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfName, addInfoKeys } from '../src/export/pdfx.js';
import { flattenPath, dielineDxf, dielineShapes } from '../src/export/dxf.js';
import { preflight } from '../src/preflight.js';
import { ean13Svg } from '../src/codes/ean13.js';
import { qrSvg } from '../src/codes/qr.js';
import { rectPath } from '../src/render/svg.js';
import { design, env } from './helpers.js';

test('spot ink names become valid PDF names', () => {
  assert.equal(pdfName('PANTONE 151 C'), 'PANTONE#20151#20C');
  assert.equal(pdfName('Dieline'), 'Dieline');
  assert.equal(pdfName('Złoto (gold)'), 'Z#C5#82oto#20#28gold#29');
});

test('Info keys go in and every xref offset after them moves along', () => {
  const objs = ['1 0 obj\n<< /Type /Catalog >>\nendobj\n', '2 0 obj\n<<\n/Producer (jsPDF 4)\n/CreationDate (D:2026)\n>>\nendobj\n', '3 0 obj\n<< /Foo 1 >>\nendobj\n'];
  let pdf = '%PDF-1.3\n';
  const offs = [];
  for (const o of objs) { offs.push(pdf.length); pdf += o; }
  const xref = pdf.length;
  pdf += `xref\n0 4\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 4 /Root 1 0 R /Info 2 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const out = addInfoKeys(pdf, '/Trapped /False\n/ModDate ($CREATED)');
  assert.ok(out.includes('/Trapped /False\n/ModDate (D:2026)\n>>'));
  const table = out.slice(out.indexOf('xref\n'), out.indexOf('trailer')).split('\n').slice(3, 6).map((l) => Number(l.slice(0, 10)));
  for (const [i, o] of table.entries()) assert.ok(out.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} found at its offset`);
  const sx = Number(out.slice(out.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
  assert.ok(out.startsWith('xref', sx));
});

test('paths flatten into polylines, arcs included', () => {
  const [p] = flattenPath(rectPath(0, 0, 100, 50, 10));
  assert.ok(p.closed);
  const xs = p.points.map((q) => q[0]), ys = p.points.map((q) => q[1]);
  assert.ok(Math.abs(Math.min(...xs)) < 1e-6 && Math.abs(Math.max(...xs) - 100) < 1e-6 && Math.abs(Math.max(...ys) - 50) < 1e-6);
  for (const [x, y] of p.points) {
    const cx = Math.min(Math.max(x, 10), 90), cy = Math.min(Math.max(y, 10), 40);
    const inCorner = (x < 10 || x > 90) && (y < 10 || y > 40);
    if (inCorner) assert.ok(Math.abs(Math.hypot(x - cx, y - cy) - 10) < 0.15, 'corner points lie on the radius');
  }
  assert.deepEqual(flattenPath('M1 1h4v4h-4z', 10, 0)[0].points.map(([x, y]) => [x, y]), [[11, 1], [15, 1], [15, 5], [11, 5]]);
});

test('the DXF has the cut and crease layers, in mm, the right way up', () => {
  const dxf = dielineDxf(design({ format: 'tuckBox' }), env());
  assert.ok(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER'));
  assert.ok(dxf.trimEnd().endsWith('0\r\nEOF'));
  for (const layer of ['CUT', 'CREASE']) assert.ok(dxf.includes(`\r\n8\r\n${layer}\r\n`), layer);
  assert.ok(!dxf.includes('NaN'));
  const { geo, shapes } = dielineShapes(design({ format: 'tuckBox' }), env());
  assert.ok(shapes.CUT.length > 10 && shapes.CREASE.length > 5);
  const ys = [...dxf.matchAll(/\r\n20\r\n(-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) <= geo.size.h + geo.bleed + 1e-6 && Math.min(...ys) >= -geo.bleed - 1e-6);
  const pouch = dielineShapes(design(), env()).shapes;
  assert.ok(pouch.ZIP.length === 2 && pouch.WINDOW.length === 1, 'zip and window on their own layers');
});

test('preflight finds what would print wrong', () => {
  const ok = preflight(design({ format: 'tuckBox' }), env());
  assert.equal(ok.errors, 0);
  const d = design();
  d.content.ean = '5905947596677';
  d.palette = d.palette.map((s) => (s.id === 'silver' ? { ...s, asSpot: true, spot: '' } : s));
  d.palette = d.palette.map((s) => (s.id === 'black' ? { ...s, cmyk: [100, 100, 100, 100] } : s));
  const bad = preflight(d, env());
  const msgs = bad.items.map((i) => `${i.level}: ${i.message}`).join('\n');
  assert.match(msgs, /error: EAN-13 .*check digit/);
  assert.match(msgs, /error: “Silver” prints as a spot ink but has no spot name/);
  assert.match(msgs, /warn: “Band Black” has 400 % total ink/);
  assert.match(preflight(design(), env()).items.map((i) => i.message).join('\n'), /in-store range/);
});

test('GS1: bar width reduction thins the bars; QR codes keep 4 modules of quiet zone', () => {
  const widths = (svg) => [...svg.matchAll(/h([\d.]+)v/g)].map((m) => Number(m[1]));
  const a = widths(ean13Svg({ code: '5905947594658', module: 0.33 }).svg);
  const b = widths(ean13Svg({ code: '5905947594658', module: 0.33, bwr: 0.03 }).svg);
  assert.equal(a.length, b.length);
  a.forEach((w, i) => assert.ok(Math.abs(w - b[i] - 0.03) < 1e-6));
  const q = qrSvg({ text: 'https://www.wertis.com.pl', size: 29 });
  assert.equal(Math.round((29 / q.unit - q.modules) / 2), 4);
});

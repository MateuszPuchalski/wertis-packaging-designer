// QR codes as one path of merged runs, in mm.
import qrcode from '../../vendor/qrcode-generator/qrcode.mjs';
import { el, n } from '../render/svg.js';

// Text goes in as UTF-8 bytes, so Polish letters survive in byte mode.
function utf8Bytes(s) {
  return String.fromCharCode(...new TextEncoder().encode(s));
}

export function qrMatrix(text, ecc = 'M') {
  const qr = qrcode(0, ecc);
  qr.addData(utf8Bytes(String(text ?? '')), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < size; r++) {
    const row = new Array(size);
    for (let c = 0; c < size; c++) row[c] = qr.isDark(r, c);
    rows.push(row);
  }
  return { size, rows };
}

// The code at (x, y), `size` mm wide including the quiet zone of `quiet` modules.
export function qrSvg({ text, x = 0, y = 0, size = 20, color = '#000000', bg = '#ffffff', quiet = 2, ecc = 'M' }) {
  if (!String(text ?? '').trim()) return { error: 'The QR code needs some text or a link.' };
  const m = qrMatrix(text, ecc);
  const unit = size / (m.size + quiet * 2);
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size;) {
      if (!m.rows[r][c]) { c++; continue; }
      let e = c;
      while (e < m.size && m.rows[r][e]) e++;
      d += `M${n(x + (quiet + c) * unit)} ${n(y + (quiet + r) * unit)}h${n((e - c) * unit)}v${n(unit)}h${n(-(e - c) * unit)}Z`;
      c = e;
    }
  }
  const svg = (bg === 'none' ? '' : el('rect', { x, y, width: size, height: size, fill: bg })) + el('path', { d, fill: color });
  return { svg, w: size, h: size, modules: m.size, unit };
}

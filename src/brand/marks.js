// Disposal marks as vector shapes: the recycling triangle with the material code (PAP 22 on
// the boxes, LDPE 4 on the foil bags) and the "tidyman" putting litter in a bin. All drawn
// as filled shapes (no strokes), so they print the same everywhere.
import { el, n, polyPath, ellipsePath, rectPath } from '../render/svg.js';

export const MATERIALS = {
  none: { label: 'No recycling mark' },
  ldpe4: { label: 'LDPE 4 (foil bags)', code: '4', name: 'LDPE' },
  pp5: { label: 'PP 5', code: '5', name: 'PP' },
  pet1: { label: 'PET 1', code: '1', name: 'PET' },
  other7: { label: 'O 7 (laminates)', code: '7', name: 'O' },
  pap20: { label: 'PAP 20 (corrugated)', code: '20', name: 'PAP' },
  pap21: { label: 'PAP 21 (folding board)', code: '21', name: 'PAP' },
  pap22: { label: 'PAP 22 (paper)', code: '22', name: 'PAP' },
};

// Three chasing arrows along a triangle, in a 100-unit box, plus the code inside and the
// material name under it. Returns { svg, w, h } at (x, y), `size` mm wide.
export function recycleMark({ x, y, size, code, name, color, text }) {
  const s = size / 100;
  const P = [[50, 6], [94, 80], [6, 80]];
  const t = 8.5, gap = 7, head = 13;
  let d = '';
  for (let i = 0; i < 3; i++) {
    const a = P[i], b = P[(i + 1) % 3];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const nrm = [-u[1], u[0]];
    const st = [a[0] + u[0] * gap, a[1] + u[1] * gap];
    const en = [b[0] - u[0] * (gap + head), b[1] - u[1] * (gap + head)];
    const off = (p, k) => [p[0] + nrm[0] * k, p[1] + nrm[1] * k];
    d += polyPath([off(st, -t / 2), off(en, -t / 2), off(en, -t * 1.15), [en[0] + u[0] * head, en[1] + u[1] * head], off(en, t * 1.15), off(en, t / 2), off(st, t / 2)]);
  }
  let svg = el('path', { d, fill: color });
  if (text && code) svg += el('g', { fill: color }, text.layout({ text: code, x: 0, y: 43, w: 100, h: 24, font: 'bold', size: 30, align: 'center', valign: 'middle' }).svg);
  if (text && name) svg += el('g', { fill: color }, text.layout({ text: name, x: 0, y: 86, w: 100, h: 14, font: 'bold', size: 18, align: 'center', valign: 'top' }).svg);
  return { svg: el('g', { transform: `translate(${n(x)} ${n(y)}) scale(${n(s)})` }, svg), w: size, h: size };
}

// A person dropping litter into a bin, in a 100-unit box.
export function tidyman({ x, y, size, color }) {
  const s = size / 100;
  const bin = polyPath([[56, 52], [94, 52], [89, 99], [61, 99]]);
  const lid = rectPath(53, 45, 44, 5, 1.5);
  const slots = [64, 72, 80].map((sx) => polyPath([[sx, 58], [sx + 3, 58], [sx + 2.4, 93], [sx + 0.6, 93]])).join('');
  const head = ellipsePath(30, 11, 9, 9);
  const body = polyPath([[22, 23], [36, 23], [42, 58], [27, 58]]);
  const legL = polyPath([[27, 56], [35, 56], [29, 99], [21, 99]]);
  const legR = polyPath([[34, 56], [42, 56], [50, 97], [42, 99]]);
  const arm = polyPath([[33, 26], [37, 23], [58, 36], [55, 40]]);
  const litter = rectPath(58, 32, 7, 7, 1);
  return {
    svg: el('g', { transform: `translate(${n(x)} ${n(y)}) scale(${n(s)})`, fill: color },
      el('path', { d: bin + slots, 'fill-rule': 'evenodd' }) + el('path', { d: lid + head + body + legL + legR + arm + litter })),
    w: size, h: size,
  };
}

// A flat zip pouch (three-side seal with a zip and a hang hole), like the KEULE 25 × 35 cm
// bag: front and back panels side by side, as the factory proof lays them out.
import { rectPath, slotPath, sombreroPath, ellipsePath, polyPath } from '../render/svg.js';
import { num, choice, toggle, normalizeDims, dim } from './common.js';

// The sizes the pouches are made in, width × height in mm (10 × 15, 14 × 20, 20 × 28 and 25 × 35 cm).
export const POUCH_SIZES = [[100, 150], [140, 200], [200, 280], [250, 350]];

export const HOLES = [['euro', 'Euro slot'], ['sombrero', 'Sombrero (euro hole)'], ['round', 'Round'], ['none', 'None']];

export const FIELDS = [
  num('width', 'Width', 250, 40, 800),
  num('height', 'Height', 350, 50, 1000),
  num('sideSeal', 'Side seals', 5, 0, 30, 0.5),
  num('bottomSeal', 'Bottom seal', 5, 0, 40, 0.5),
  num('topSeal', 'Top seal', 8, 0, 40, 0.5),
  toggle('zip', 'Zip', true),
  num('zipOffset', 'Zip from top', 25, 5, 200, 0.5, { when: 'zip' }),
  num('zipWidth', 'Zip track width', 6, 2, 20, 0.5, { when: 'zip' }),
  choice('hole', 'Hang hole', 'euro', HOLES),
  num('holeWidth', 'Hole width', 30, 4, 80, 0.5, { whenNot: ['hole', 'none'] }),
  num('holeHeight', 'Hole height', 8, 3, 30, 0.5, { whenNot: ['hole', 'none'] }),
  num('holeOffset', 'Hole centre from top', 10, 3, 100, 0.5, { whenNot: ['hole', 'none'] }),
  num('corner', 'Corner radius', 6, 0, 30, 0.5),
  toggle('tearNotch', 'Tear notches', true),
  num('notchOffset', 'Notch from top', 18, 3, 200, 0.5, { when: 'tearNotch' }),
  num('bleed', 'Bleed', 3, 0, 10, 0.5),
  num('safe', 'Safe margin', 3, 0, 20, 0.5),
];

export function holePath(kind, cx, cy, w, h) {
  if (kind === 'round') return ellipsePath(cx, cy, h / 2, h / 2);
  if (kind === 'sombrero') return sombreroPath(cx, cy, w, h);
  if (kind === 'euro') return slotPath(cx, cy, w, h);
  return '';
}

// The parts of one pouch face that both pouch formats share, in the face's own coordinates.
export function pouchFace(d, W, H) {
  const zipY = d.zip ? d.zipOffset : null;
  const hole = d.hole === 'none' ? null : {
    d: holePath(d.hole, W / 2, d.holeOffset, d.hole === 'round' ? d.holeHeight : d.holeWidth, d.holeHeight),
    box: { x: W / 2 - (d.hole === 'round' ? d.holeHeight : d.holeWidth) / 2, y: d.holeOffset - d.holeHeight / 2, w: d.hole === 'round' ? d.holeHeight : d.holeWidth, h: d.holeHeight },
  };
  const notch = d.tearNotch ? [
    polyPath([[0, d.notchOffset - 2], [3, d.notchOffset], [0, d.notchOffset + 2]]),
    polyPath([[W, d.notchOffset - 2], [W - 3, d.notchOffset], [W, d.notchOffset + 2]]),
  ] : [];
  // Print can go anywhere on the face; the safe area is where text and codes belong: inside
  // the seals, below the zip, plus the margin.
  const top = (zipY !== null ? zipY + d.zipWidth / 2 : d.topSeal) + d.safe;
  const safe = { x: d.sideSeal + d.safe, y: top, w: W - 2 * (d.sideSeal + d.safe), h: H - d.bottomSeal - d.safe - top };
  return { zipY, hole, notch, safe };
}

export function layout(input) {
  const d = normalizeDims(FIELDS, input);
  const W = d.width, H = d.height;
  const face = pouchFace(d, W, H);
  const lines = {
    cut: [rectPath(0, 0, W, H, d.corner)],
    seal: [
      d.sideSeal && rectPath(0, 0, d.sideSeal, H), d.sideSeal && rectPath(W - d.sideSeal, 0, d.sideSeal, H),
      d.bottomSeal && rectPath(0, H - d.bottomSeal, W, d.bottomSeal), d.topSeal && rectPath(0, 0, W, d.topSeal),
    ].filter(Boolean),
    zip: face.zipY !== null ? [{ y: face.zipY, w: d.zipWidth }] : [],
    holes: face.hole ? [face.hole.d] : [],
    notches: face.notch,
    fold: [],
  };
  const panel = (id, label, x, bleedSides) => ({ id, label, role: id, x, y: 0, w: W, h: H, bleedSides, lines, info: { ...face, corner: d.corner } });
  return {
    format: 'flatPouch',
    dims: d,
    size: { w: 2 * W, h: H },
    bleed: d.bleed,
    panels: [
      panel('front', 'Front', 0, { l: true, t: true, r: false, b: true }),
      panel('back', 'Back', W, { l: false, t: true, r: true, b: true }),
    ],
    sheetLines: { fold: [] },
    measures: [
      dim(0, 0, 2 * W, 0, -16, `${fmt(2 * W)}`),
      dim(0, 0, W, 0, -8), dim(W, 0, 2 * W, 0, -8),
      dim(0, 0, 0, H, -8),
      ...(face.zipY !== null ? [dim(0, 0, 0, face.zipY, -16, `zip ${fmt(face.zipY)}`)] : []),
      ...(face.hole ? [dim(2 * W, 0, 2 * W, d.holeOffset, 8, `hole ${fmt(d.holeOffset)}`)] : []),
    ],
    title: `Flat zip pouch ${fmt(W)} × ${fmt(H)} mm`,
  };
}

function fmt(v) {
  return String(Math.round(v * 10) / 10);
}

export const flatPouch = { id: 'flatPouch', label: 'Flat zip pouch', example: 'pouch', fields: FIELDS, sizes: POUCH_SIZES, layout, templates: ['pouchWindow'] };

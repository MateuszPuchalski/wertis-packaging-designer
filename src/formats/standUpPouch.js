// A stand-up pouch (doypack), W × H + G: front and back faces side by side, and the bottom
// gusset as its own strip below them (the usual three-web build), folded in half when the
// pouch is made. The lowest G/2 of each face is where the gusset is sealed in and the bottom
// curves under, so text keeps above it.
import { rectPath, polyPath } from '../render/svg.js';
import { num, choice, toggle, normalizeDims, dim } from './common.js';
import { HOLES, POUCH_SIZES, pouchFace } from './flatPouch.js';

export const BOTTOMS = [['k', 'K-seal'], ['round', 'Round bottom'], ['plow', 'Plain (plough) bottom']];

export const FIELDS = [
  num('width', 'Width', 160, 60, 500),
  num('height', 'Height', 230, 80, 700),
  num('gusset', 'Bottom gusset (open)', 80, 20, 300),
  choice('bottom', 'Bottom seal', 'k', BOTTOMS),
  num('sideSeal', 'Side seals', 6, 0, 30, 0.5),
  num('topSeal', 'Top seal', 8, 0, 40, 0.5),
  toggle('zip', 'Zip', true),
  num('zipOffset', 'Zip from top', 30, 5, 200, 0.5, { when: 'zip' }),
  num('zipWidth', 'Zip track width', 6, 2, 20, 0.5, { when: 'zip' }),
  choice('hole', 'Hang hole', 'none', HOLES),
  num('holeWidth', 'Hole width', 30, 4, 80, 0.5, { whenNot: ['hole', 'none'] }),
  num('holeHeight', 'Hole height', 8, 3, 30, 0.5, { whenNot: ['hole', 'none'] }),
  num('holeOffset', 'Hole centre from top', 10, 3, 100, 0.5, { whenNot: ['hole', 'none'] }),
  num('corner', 'Corner radius', 4, 0, 30, 0.5),
  toggle('tearNotch', 'Tear notches', true),
  num('notchOffset', 'Notch from top', 20, 3, 200, 0.5, { when: 'tearNotch' }),
  num('bleed', 'Bleed', 3, 0, 10, 0.5),
  num('safe', 'Safe margin', 3, 0, 20, 0.5),
];

const GAP = 14; // between the faces and the gusset strip on the sheet

// The seals where the gusset meets the face at its corners: along an edge at `edge`,
// reaching `depth` into the panel in direction `dir` (-1 up, +1 down).
function cornerSeals(kind, W, edge, depth, dir, seal) {
  const y = (k) => edge + dir * k;
  if (kind === 'k') {
    return [polyPath([[0, y(depth)], [depth * 0.55, edge], [0, edge]]), polyPath([[W, y(depth)], [W - depth * 0.55, edge], [W, edge]])];
  }
  if (kind === 'round') {
    const r = depth * 0.9;
    const arc = (sx) => {
      const pts = [[sx === 1 ? 0 : W, edge]];
      for (let i = 0; i <= 12; i++) {
        const a = (Math.PI / 2) * (i / 12);
        pts.push([sx === 1 ? r - r * Math.cos(a) : W - r + r * Math.cos(a), y(r - r * Math.sin(a))]);
      }
      return polyPath(pts);
    };
    return [arc(1), arc(-1)];
  }
  const h = Math.min(depth, seal * 2);
  return [rectPath(0, dir < 0 ? edge - h : edge, W, h)];
}

export function layout(input) {
  const d = normalizeDims(FIELDS, input);
  const W = d.width, H = d.height, G = d.gusset, half = G / 2;
  const face = pouchFace({ ...d, bottomSeal: half }, W, H);
  const faceLines = {
    cut: [rectPath(0, 0, W, H, [d.corner, d.corner, 0, 0])],
    seal: [
      d.sideSeal && rectPath(0, 0, d.sideSeal, H), d.sideSeal && rectPath(W - d.sideSeal, 0, d.sideSeal, H),
      d.topSeal && rectPath(0, 0, W, d.topSeal), ...cornerSeals(d.bottom, W, H, half, -1, d.sideSeal),
    ].filter(Boolean),
    zip: face.zipY !== null ? [{ y: face.zipY, w: d.zipWidth }] : [],
    holes: face.hole ? [face.hole.d] : [],
    notches: face.notch,
    fold: [`M0 ${H - half}H${W}`],
  };
  const gussetLines = {
    cut: [rectPath(0, 0, W, G)],
    seal: [...cornerSeals(d.bottom, W, 0, half, 1, d.sideSeal), ...cornerSeals(d.bottom, W, G, half, -1, d.sideSeal)],
    zip: [], holes: [], notches: [],
    fold: [`M0 ${half}H${W}`],
  };
  const gussetSafe = { x: d.sideSeal + d.safe, y: d.safe, w: W - 2 * (d.sideSeal + d.safe), h: G - 2 * d.safe };
  const facePanel = (id, label, x, bleedSides) => ({ id, label, role: id, x, y: 0, w: W, h: H, bleedSides, lines: faceLines, info: { ...face, corner: d.corner, bottomZone: half } });
  return {
    format: 'standUpPouch',
    dims: d,
    size: { w: 2 * W, h: H + GAP + G },
    bleed: d.bleed,
    panels: [
      facePanel('front', 'Front', 0, { l: true, t: true, r: false, b: true }),
      facePanel('back', 'Back', W, { l: false, t: true, r: true, b: true }),
      { id: 'gusset', label: 'Bottom gusset', role: 'gusset', x: W / 2, y: H + GAP, w: W, h: G, bleedSides: { l: true, t: true, r: true, b: true }, lines: gussetLines, info: { safe: gussetSafe, fold: half } },
    ],
    sheetLines: { fold: [] },
    measures: [
      dim(0, 0, 2 * W, 0, -16, `${2 * W}`),
      dim(0, 0, W, 0, -8), dim(W, 0, 2 * W, 0, -8),
      dim(0, 0, 0, H, -8),
      dim(0, H - half, 0, H, -18, `gusset ${half}`),
      ...(face.zipY !== null ? [dim(0, 0, 0, face.zipY, -18, `zip ${face.zipY}`)] : []),
      dim(W / 2 + W, H + GAP, W / 2 + W, H + GAP + G, 8, `${G}`),
    ],
    title: `Stand-up pouch ${W} × ${H} + ${G} mm`,
  };
}

export const standUpPouch = { id: 'standUpPouch', label: 'Stand-up pouch (doypack)', example: 'pouch', fields: FIELDS, sizes: POUCH_SIZES, layout, templates: ['pouchWindow'] };

// A folding carton, L × W × H, laid out like the WERTIS boxes (W09-0414 and the generic
// "CZĘŚCI ZAMIENNE" box): glue flap, back (L), side (W), front (L), side (W). The lid hangs on
// the back panel with its tuck flap; the dust flaps sit on the sides; a thumb notch is cut
// into the front panel. The bottom is either a snap-lock (1-2-3) bottom, as on W09-0414, or a
// tuck end (which makes a reverse tuck end box).
//
// The flap shapes are scaled from the W09-0414 dieline. Cut lines are cyan and folds red, as
// in that printer's files. Printed: the walls, the lid and the top dust flaps (the tuck and
// the bottom flaps stay unprinted, as on the real boxes).
import { polyPath } from '../render/svg.js';
import { num, choice, toggle, normalizeDims, dim } from './common.js';

export const BOTTOMS = [['snap', 'Snap-lock bottom (1-2-3)'], ['tuck', 'Tuck end (reverse tuck)']];

export const FIELDS = [
  num('length', 'Length L (front)', 95, 20, 600),
  num('width', 'Width W (side)', 65, 15, 400),
  num('height', 'Height H', 50, 15, 600),
  choice('bottom', 'Bottom', 'snap', BOTTOMS),
  num('tuck', 'Tuck flap', 18, 8, 60, 0.5),
  num('dust', 'Dust flap depth', 29, 8, 200, 0.5),
  num('glue', 'Glue flap', 15, 8, 40, 0.5),
  toggle('thumb', 'Thumb notch', true),
  num('board', 'Board allowance', 0.4, 0, 3, 0.1),
  num('bleed', 'Bleed', 3, 0, 10, 0.5),
  num('safe', 'Safe margin', 3, 0, 15, 0.5),
];

export const BOX_COLORS = { cut: '#00aff0', fold: '#eb3540' };

const P = (pts) => polyPath(pts, false);
const line = (x1, y1, x2, y2) => `M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}`;
function r(v) { return Math.round(v * 1000) / 1000; }

// Top dust flap of a side panel from x to x + W, hinged at y, slanting on the side that
// faces the front panel.
function dustFlap(x, W, y, D, slantRight) {
  const pts = [[0.04, 0], [0.04, -1], [0.85, -1], [0.93, -0.28], [0.97, -0.18], [0.97, 0]];
  return pts.map(([u, v]) => [x + (slantRight ? u : 1 - u) * W, y + v * D]);
}

// The three snap-lock bottom flaps, from the W09-0414 proportions.
function snapFlaps(xs, L, W, y, c) {
  const dA = 0.757 * W, d1 = 0.49 * W, dB = 0.441 * W, xa = 0.25;
  const A = [[0, 0], [0, dA], [xa * L - c, dA], [xa * L, dA - c], [xa * L, d1], [(1 - xa) * L, d1], [(1 - xa) * L, dA - c], [(1 - xa) * L + c, dA], [L, dA], [L, 0]]
    .map(([u, v]) => [xs[0] + u, y + v]);
  const C = [[0.015, 0], [0.258, d1 / L], [0.258, (dA - c) / L], [0.258 + c / L, dA / L], [0.742 - c / L, dA / L], [0.742, (dA - c) / L], [0.742, d1 / L], [0.985, 0]]
    .map(([u, v]) => [xs[2] + u * L, y + v * L]);
  const side = (x0, mirror) => [[0.019, 0], [0.513, 0.283], [0.513, 0.375], [0.513 + c / W, 0.441], [0.987, 0.441], [0.987, 0]]
    .map(([u, v]) => [x0 + (mirror ? 1 - u : u) * W, y + v * W]);
  return { A, C, B1: side(xs[1], false), B2: side(xs[3], true), depth: dA, dB };
}

export function layout(input) {
  const d = normalizeDims(FIELDS, input);
  const { length: L, width: W, height: H, tuck: T, glue: g } = d;
  const D = Math.min(d.dust, W * 0.95);
  const W2 = W - d.board; // the last panel is a touch narrower so the glue joint closes
  const xs = [g, g + L, g + L + W, g + 2 * L + W, g + 2 * L + W + W2];
  const y0 = W + T; // top of the walls
  const y1 = y0 + H; // bottom of the walls
  const yL = y0 - W; // lid / tuck fold
  const ch = Math.min(10, T * 0.5); // tuck corner chamfer
  const cut = [], fold = [], trims = [];

  // Glue flap.
  const gc = Math.min(10, H * 0.2);
  const glue = [[xs[0], y0], [0, y0 + gc], [0, y1 - gc], [xs[0], y1]];
  cut.push(P(glue));
  trims.push(polyPath(glue));
  // Walls: the folds between panels, the outer right edge.
  for (let i = 0; i < 4; i++) fold.push(line(xs[i], y0, xs[i], y1));
  cut.push(line(xs[4], y0, xs[4], y1));
  trims.push(polyPath([[xs[0], y0], [xs[4], y0], [xs[4], y1], [xs[0], y1]]));

  // Lid and tuck on the back panel.
  fold.push(line(xs[0], y0, xs[1], y0), line(xs[0] + 1, yL, xs[1] - 1, yL));
  const tuck = [[xs[0] + 1, yL], [xs[0] + 1, yL - T + ch], [xs[0] + 1 + ch, yL - T], [xs[1] - 1 - ch, yL - T], [xs[1] - 1, yL - T + ch], [xs[1] - 1, yL]];
  cut.push(line(xs[0], y0, xs[0], yL), line(xs[1], y0, xs[1], yL), line(xs[0], yL, xs[0] + 1, yL), line(xs[1] - 1, yL, xs[1], yL), P(tuck));
  trims.push(polyPath([[xs[0], y0], [xs[0], yL], ...tuck, [xs[1], yL], [xs[1], y0]]));

  // Top dust flaps on both sides, slanting towards the front panel.
  const dustL = dustFlap(xs[1], W, y0, D, true);
  const dustR = dustFlap(xs[3], W2, y0, D, false);
  for (const [flap, x0, x1] of [[dustL, xs[1], xs[2]], [dustR, xs[3], xs[4]]]) {
    const a = flap[0][0], b = flap[flap.length - 1][0];
    const [lo, hi] = a < b ? [a, b] : [b, a];
    cut.push(P(flap), line(x0, y0, lo, y0), line(hi, y0, x1, y0));
    fold.push(line(lo, y0, hi, y0));
    trims.push(polyPath(flap));
  }
  // Front panel top edge, with the thumb notch.
  const nr = d.thumb ? Math.min(L * 0.1, 9) : 0;
  const cx = (xs[2] + xs[3]) / 2;
  cut.push(nr ? `M${r(xs[2])} ${r(y0)}H${r(cx - nr)}A${r(nr)} ${r(nr)} 0 0 0 ${r(cx + nr)} ${r(y0)}H${r(xs[3])}` : line(xs[2], y0, xs[3], y0));

  // Bottom.
  let bottomDepth;
  if (d.bottom === 'snap') {
    const c = Math.min(5, W * 0.067);
    const f = snapFlaps(xs, L, W, y1, c);
    bottomDepth = f.depth;
    for (const flap of [f.A, f.B1, f.C, f.B2]) {
      cut.push(P(flap));
      trims.push(polyPath(flap));
      fold.push(line(flap[0][0], y1, flap[flap.length - 1][0], y1));
    }
    // The bits of the wall bottom between flaps are cut.
    const edges = [f.A, f.B1, f.C, f.B2].flatMap((fl) => [fl[0][0], fl[fl.length - 1][0]]).sort((a, b) => a - b);
    let x = xs[0];
    for (let i = 0; i < edges.length; i += 2) {
      if (edges[i] - x > 0.01) cut.push(line(x, y1, edges[i], y1));
      x = edges[i + 1];
    }
    if (xs[4] - x > 0.01) cut.push(line(x, y1, xs[4], y1));
  } else {
    // A tuck end on the front panel, dust flaps on the sides: a reverse tuck end box.
    bottomDepth = W + T;
    const yB = y1 + W;
    const btuck = [[xs[2] + 1, yB], [xs[2] + 1, yB + T - ch], [xs[2] + 1 + ch, yB + T], [xs[3] - 1 - ch, yB + T], [xs[3] - 1, yB + T - ch], [xs[3] - 1, yB]];
    fold.push(line(xs[2], y1, xs[3], y1), line(xs[2] + 1, yB, xs[3] - 1, yB));
    cut.push(line(xs[2], y1, xs[2], yB), line(xs[3], y1, xs[3], yB), line(xs[2], yB, xs[2] + 1, yB), line(xs[3] - 1, yB, xs[3], yB), P(btuck));
    trims.push(polyPath([[xs[2], y1], [xs[2], yB], ...btuck, [xs[3], yB], [xs[3], y1]]));
    const flip = (flap) => flap.map(([x, y]) => [x, 2 * y1 - y]);
    const bl = flip(dustFlap(xs[1], W, y1, D, true)), br = flip(dustFlap(xs[3], W2, y1, D, false));
    for (const [flap, x0, x1] of [[bl, xs[1], xs[2]], [br, xs[3], xs[4]]]) {
      const a = flap[0][0], b = flap[flap.length - 1][0];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      cut.push(P(flap), line(x0, y1, lo, y1), line(hi, y1, x1, y1));
      fold.push(line(lo, y1, hi, y1));
      trims.push(polyPath(flap));
    }
    cut.push(line(xs[0], y1, xs[1], y1));
  }

  const empty = { cut: [], seal: [], zip: [], holes: [], notches: [], fold: [] };
  const s = d.safe;
  const faces = [
    { id: 'back', label: 'Back', x: 0, w: L },
    { id: 'side1', label: 'Left side', x: L, w: W },
    { id: 'front', label: 'Front', x: L + W, w: L },
    { id: 'side2', label: 'Right side', x: 2 * L + W, w: W2 },
  ].map((f) => ({ ...f, safe: { x: f.x + s, y: s, w: f.w - 2 * s, h: H - 2 * s } }));
  const all = { l: true, t: true, r: true, b: true };
  return {
    format: 'tuckBox',
    dims: d,
    labels: false, // the flaps say what they are; names would sit on the dust flaps
    size: { w: xs[4], h: y1 + bottomDepth },
    bleed: d.bleed,
    colors: BOX_COLORS,
    panels: [
      { id: 'body', label: 'Walls', role: 'boxBody', x: xs[0], y: y0, w: xs[4] - xs[0], h: H, bleedSides: all, lines: empty, info: { faces, safe: { x: s, y: s, w: xs[4] - xs[0] - 2 * s, h: H - 2 * s } } },
      { id: 'lid', label: 'Lid', role: 'boxLid', x: xs[0], y: yL, w: L, h: W, bleedSides: { l: true, t: true, r: true, b: false }, lines: empty, info: { safe: { x: s, y: s, w: L - 2 * s, h: W - 2 * s } } },
      { id: 'dust1', label: 'Dust flap', role: 'boxDust', x: xs[1], y: y0 - D, w: W, h: D, bleedSides: { l: true, t: true, r: true, b: false }, lines: empty, info: { safe: { x: 0, y: 0, w: W, h: D } } },
      { id: 'dust2', label: 'Dust flap', role: 'boxDust', x: xs[3], y: y0 - D, w: W2, h: D, bleedSides: { l: true, t: true, r: true, b: false }, lines: empty, info: { safe: { x: 0, y: 0, w: W2, h: D } } },
    ],
    sheetLines: { cut, fold },
    trims,
    measures: [
      dim(xs[2], y0, xs[3], y0, -(D + 10), `${L}`),
      dim(xs[1], y0, xs[2], y0, -(D + 10), `${W}`),
      dim(0, y0, 0, y1, -8, `${H}`),
      dim(0, 0, xs[4], 0, -10, `${Math.round(xs[4] * 10) / 10}`),
    ],
    title: `Folding box ${L} × ${W} × ${H} mm (${d.bottom === 'snap' ? 'snap-lock bottom' : 'reverse tuck end'})`,
  };
}

export const tuckBox = { id: 'tuckBox', label: 'Folding box', example: 'box', fields: FIELDS, layout, templates: ['boxGeneric', 'boxProduct'] };

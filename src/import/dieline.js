// Finds a dieline in the vector data of an .ai or PDF file. Printers draw the cut lines in cyan and the
// folds in red (like the W09-0414 file); everything else on the page is artwork and is left alone.
//
// Takes pdf.js's operator list (`fnArray` / `argsArray`) and its `OPS` table, so this stays DOM-free
// and testable; the page (ui/importFiles.js) hands it over. Lengths come out in mm, with the top left
// of the drawn lines at 0, 0.
import { clamp } from '../render/svg.js';

const PT = 25.4 / 72;

// pdf.js's path operator codes (the sub-ops inside a constructPath).
const MOVE = 13, LINE = 14, CURVE = 15, CURVE2 = 16, CURVE3 = 17, CLOSE = 18, RECT = 19;

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Cyan (the cut) and red or magenta (the fold) by their RGB; anything else is not construction.
export function lineKind([r, g, b]) {
  if (b > 150 && r < 90 && g > 110 && g < 230) return 'cut';
  if (r > 170 && g < 110 && b < 140) return 'fold';
  return null;
}

function bezier(p0, p1, p2, p3, out) {
  for (let i = 1; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
}

// The subpaths of one constructPath, as { pts, closed } in the file's own space.
function subpaths(ops, args) {
  const out = [];
  let cur = null, a = 0, at = [0, 0];
  const start = (x, y) => { cur = { pts: [[x, y]], closed: false }; out.push(cur); at = [x, y]; };
  for (const op of ops) {
    if (op === MOVE) { start(args[a], args[a + 1]); a += 2; }
    else if (op === LINE) { if (!cur) start(at[0], at[1]); cur.pts.push([args[a], args[a + 1]]); at = [args[a], args[a + 1]]; a += 2; }
    else if (op === CURVE) { if (!cur) start(at[0], at[1]); bezier(at, [args[a], args[a + 1]], [args[a + 2], args[a + 3]], [args[a + 4], args[a + 5]], cur.pts); at = [args[a + 4], args[a + 5]]; a += 6; }
    else if (op === CURVE2) { if (!cur) start(at[0], at[1]); bezier(at, at, [args[a], args[a + 1]], [args[a + 2], args[a + 3]], cur.pts); at = [args[a + 2], args[a + 3]]; a += 4; }
    else if (op === CURVE3) { if (!cur) start(at[0], at[1]); bezier(at, [args[a], args[a + 1]], [args[a + 2], args[a + 3]], [args[a + 2], args[a + 3]], cur.pts); at = [args[a + 2], args[a + 3]]; a += 4; }
    else if (op === RECT) {
      const [x, y, w, h] = args.slice(a, a + 4); a += 4;
      out.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], closed: true });
      cur = null; at = [x, y];
    } else if (op === CLOSE) { if (cur) { cur.closed = true; at = cur.pts[0]; cur = null; } }
  }
  return out;
}

// Walks the operator list keeping the transform and the stroke colour, and collects every stroked
// subpath in a construction colour. `height` is the page height in points (the file's y runs up).
export function extractLines(ol, OPS, height) {
  const stroke = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const found = [];
  let ctm = [1, 0, 0, -1, 0, height]; // file space (y up) → page space (y down)
  let colour = [0, 0, 0];
  let path = [];
  const stack = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm, colour });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, colour } = s); }
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.setStrokeRGBColor) colour = [args[0], args[1], args[2]];
    else if (fn === OPS.setStrokeGray) colour = [args[0], args[0], args[0]];
    else if (fn === OPS.constructPath) {
      // Several path segments can be built before one paint; keep them until it comes.
      for (const sp of subpaths(args[0], args[1])) path.push({ ...sp, pts: sp.pts.map(([x, y]) => apply(ctm, x, y)) });
    } else if (stroke.has(fn)) {
      const kind = lineKind(colour);
      if (kind) for (const sp of path) found.push({ kind, ...sp, closed: sp.closed || fn === OPS.closeStroke || fn === OPS.closeFillStroke });
      path = [];
    } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath || fn === OPS.clip || fn === OPS.eoClip) {
      if (fn !== OPS.clip && fn !== OPS.eoClip) path = [];
    }
  }
  return found;
}

const r2 = (v) => Math.round(v * 100) / 100;
const dOf = (pts, closed) => `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L')}${closed ? 'Z' : ''}`;
const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + (x * y2 - x2 * y); }, 0) / 2);

// Joins cut paths that meet end to end (a printer's file draws the outline in many pieces) into longer
// ones; a chain that comes back to its start is a closed outline.
function chain(paths) {
  const pool = paths.map((p) => p.pts.slice());
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.06;
  const out = [];
  while (pool.length) {
    let cur = pool.pop();
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (near(cur.at(-1), q[0])) cur = cur.concat(q.slice(1));
        else if (near(cur.at(-1), q.at(-1))) cur = cur.concat(q.slice(0, -1).reverse());
        else if (near(cur[0], q.at(-1))) cur = q.concat(cur.slice(1));
        else if (near(cur[0], q[0])) cur = q.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push({ pts: cur, closed: near(cur[0], cur.at(-1)) && cur.length > 3 });
  }
  return out;
}

// A dieline for the app: path strings in mm from the top left of the lines, the sheet size, and the
// outline (the biggest closed cut path) the artwork is trimmed to. Null when the file has no lines.
export function buildDieline(lines) {
  const kept = lines.filter((l) => l.pts.length >= 2);
  if (!kept.some((l) => l.kind === 'cut')) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of kept) for (const [x, y] of l.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const mm = (l) => ({ ...l, pts: l.pts.map(([x, y]) => [(x - x0) * PT, (y - y0) * PT]) });
  const moved = kept.map(mm);
  const closedCut = chain(moved.filter((l) => l.kind === 'cut')).filter((l) => l.closed);
  closedCut.sort((a, b) => area(b.pts) - area(a.pts));
  const w = clamp((x1 - x0) * PT, 5, 2000), h = clamp((y1 - y0) * PT, 5, 2000);
  return {
    w: r2(w), h: r2(h),
    cut: moved.filter((l) => l.kind === 'cut').map((l) => dOf(l.pts, l.closed)),
    fold: moved.filter((l) => l.kind === 'fold').map((l) => dOf(l.pts, l.closed)),
    outline: closedCut.length ? [dOf(closedCut[0].pts, true)] : [],
  };
}

// Snapping while an element is dragged or resized on the preview: its edges and centre
// lines catch on the panel's edges and centre lines, the safe area, a box's face folds and
// the other elements on the same panel. Away from every line it falls back to a 0.5 mm grid.
// Everything is in sheet mm; the caller turns the screen threshold into mm. DOM-free.

export const GRID = 0.5;

const gridSnap = (v, grid) => (grid > 0 ? Math.round(v / grid) * grid : v);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// The lines a box in `panel` can snap to: { x: [{ v, kind }], y: [...] }, sheet mm.
export function snapTargets(geo, panel, hits = [], selfId = null) {
  const x = [], y = [];
  const box = (b, kind) => {
    x.push({ v: b.x, kind }, { v: b.x + b.w / 2, kind }, { v: b.x + b.w, kind });
    y.push({ v: b.y, kind }, { v: b.y + b.h / 2, kind }, { v: b.y + b.h, kind });
  };
  const P = panel;
  box(P, 'panel');
  const rel = (b, kind) => box({ x: P.x + b.x, y: P.y + b.y, w: b.w, h: b.h }, kind);
  if (P.info?.safe) rel(P.info.safe, 'safe');
  // A box's walls are one panel; each face (back, sides, front) is its own area.
  for (const f of P.info?.faces ?? []) {
    rel({ x: f.x, y: 0, w: f.w, h: P.h }, 'face');
    if (f.safe) rel(f.safe, 'safe');
  }
  for (const h of hits) {
    if (h.id === selfId || h.panel !== P.id || !(h.box.w > 0 && h.box.h > 0)) continue;
    // A background that fills the whole panel adds nothing the panel edges don't.
    if (Math.abs(h.box.w - P.w) < 0.01 && Math.abs(h.box.h - P.h) < 0.01) continue;
    box(h.box, 'element');
  }
  const uniq = (list) => {
    const seen = new Map();
    for (const t of list) {
      const k = Math.round(t.v * 100);
      if (!seen.has(k)) seen.set(k, t);
    }
    return [...seen.values()].sort((a, b) => a.v - b.v);
  };
  return { x: uniq(x), y: uniq(y), bounds: { x: P.x, y: P.y, w: P.w, h: P.h } };
}

// The nearest target to any of `points` within `threshold`: { delta, v } or null.
function nearest(points, targets, threshold) {
  let best = null;
  for (const p of points) {
    for (const t of targets) {
      const d = t.v - p;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, v: t.v };
    }
  }
  return best;
}

// Every target a set of points sits on exactly (after snapping): the guide lines to draw.
function onLines(points, targets, axis, bounds) {
  const out = [];
  for (const t of targets) {
    if (points.some((p) => Math.abs(p - t.v) < 0.01) && !out.some((g) => Math.abs(g.v - t.v) < 0.01)) {
      out.push(axis === 'x' ? { axis, v: t.v, from: bounds.y, to: bounds.y + bounds.h } : { axis, v: t.v, from: bounds.x, to: bounds.x + bounds.w });
    }
  }
  return out;
}

// Moves `box` (already offset by the drag) to the nearest line, else to the grid, then keeps
// it inside the panel. Returns { box, guides }. lines: false snaps to the grid only.
export function snapMove(box, targets, { threshold = 0, grid = GRID, lines = true } = {}) {
  const B = targets.bounds;
  const b = { ...box };
  const xs = () => [b.x, b.x + b.w / 2, b.x + b.w], ys = () => [b.y, b.y + b.h / 2, b.y + b.h];
  const sx = lines ? nearest(xs(), targets.x, threshold) : null;
  const sy = lines ? nearest(ys(), targets.y, threshold) : null;
  b.x = sx ? b.x + sx.delta : gridSnap(b.x, grid);
  b.y = sy ? b.y + sy.delta : gridSnap(b.y, grid);
  const cx = clamp(b.x, B.x, B.x + B.w - b.w), cy = clamp(b.y, B.y, B.y + B.h - b.h);
  // Pushed back inside the panel: whatever it snapped to no longer holds.
  const keepX = sx && Math.abs(cx - b.x) < 1e-9, keepY = sy && Math.abs(cy - b.y) < 1e-9;
  b.x = cx;
  b.y = cy;
  const guides = [...(keepX ? onLines(xs(), targets.x, 'x', B) : []), ...(keepY ? onLines(ys(), targets.y, 'y', B) : [])];
  return { box: b, guides };
}

// Resizes `box0` by pulling the corner `mode` ('nw', 'ne', 'sw', 'se') by (dx, dy): the
// moving edges snap, the opposite ones stay put. keepAspect scales both sides together and
// snaps the side that moved most. Returns { box, guides }.
export function snapResize(box0, mode, dx, dy, targets, { threshold = 0, grid = GRID, lines = true, keepAspect = false, min = 5 } = {}) {
  const B = targets.bounds;
  const left = mode.includes('w'), top = mode.includes('n');
  // The fixed corner, and the size a moving edge at e gives (negative past the fixed edge).
  const ax = left ? box0.x + box0.w : box0.x, ay = top ? box0.y + box0.h : box0.y;
  const sizeAt = (e, a, back) => (back ? a - e : e - a);
  const edgeAt = (s, a, back) => (back ? a - s : a + s);
  const maxW = left ? ax - B.x : B.x + B.w - ax, maxH = top ? ay - B.y : B.y + B.h - ay;
  // A size along one axis: the moving edge on the nearest line, else the size on the grid.
  const pick = (size, a, back, list, max) => {
    const s = lines ? nearest([edgeAt(size, a, back)], list, threshold) : null;
    const want = s ? sizeAt(s.v, a, back) : gridSnap(size, grid);
    const got = Math.min(Math.max(min, want), max);
    return { size: got, snapped: !!s && Math.abs(got - want) < 1e-9 };
  };
  const rawW = box0.w + (left ? -dx : dx), rawH = box0.h + (top ? -dy : dy);
  let w, h, snapX = false, snapY = false;
  if (keepAspect) {
    const k = Math.max(rawW / box0.w, rawH / box0.h);
    if (rawW / box0.w >= rawH / box0.h) {
      const r = pick(box0.w * k, ax, left, targets.x, maxW);
      w = r.size; h = w * box0.h / box0.w; snapX = r.snapped;
    } else {
      const r = pick(box0.h * k, ay, top, targets.y, maxH);
      h = r.size; w = h * box0.w / box0.h; snapY = r.snapped;
    }
    // Too big for the panel the other way: shrink both together.
    const fit = Math.min(1, maxW / w, maxH / h);
    if (fit < 1) { w *= fit; h *= fit; snapX = snapY = false; }
  } else {
    const rx = pick(rawW, ax, left, targets.x, maxW), ry = pick(rawH, ay, top, targets.y, maxH);
    w = rx.size; h = ry.size; snapX = rx.snapped; snapY = ry.snapped;
  }
  const b = { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
  const guides = [...(snapX ? onLines([edgeAt(w, ax, left)], targets.x, 'x', B) : []), ...(snapY ? onLines([edgeAt(h, ay, top)], targets.y, 'y', B) : [])];
  return { box: b, guides };
}

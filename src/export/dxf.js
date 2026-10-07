// The dieline as a DXF file for the die maker (AutoCAD R12, which every die-making and CAD
// program reads): cut lines on layer CUT, folds on CREASE, and for pouches the zip and the
// windows on layers of their own (for information; they are not cut). Millimetres, y up.
import { geometry, renderSheet } from '../render/sheet.js';

// --- SVG path → polylines -------------------------------------------------------------

const TOKENS = /[MmLlHhVvAaZzCcQq]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

// Points of an SVG arc, by the endpoint-to-centre conversion of the SVG spec (F.6.5).
function arcPoints(x1, y1, rx, ry, phi, large, sweep, x2, y2, tol = 0.1) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const r = Math.max(rx, ry);
  const steps = Math.max(4, Math.ceil(Math.abs(dt) / (2 * Math.acos(Math.max(-1, 1 - tol / r)))));
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = t1 + (dt * i) / steps;
    pts.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]);
  }
  pts[pts.length - 1] = [x2, y2];
  return pts;
}

// An SVG path (M L H V A C Q Z, absolute or relative) → [{ points, closed }].
export function flattenPath(d, dx = 0, dy = 0) {
  const t = String(d).match(TOKENS) ?? [];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null;
  const num = () => Number(t[i++]);
  const push = (px, py) => cur.points.push([px + dx, py + dy]);
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) cmd = t[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = num() + (rel ? x : 0); y = num() + (rel ? y : 0);
        sx = x; sy = y;
        cur = { points: [], closed: false };
        out.push(cur);
        push(x, y);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); push(x, y); break;
      case 'H': x = num() + (rel ? x : 0); push(x, y); break;
      case 'V': y = num() + (rel ? y : 0); push(x, y); break;
      case 'A': {
        const rx = num(), ry = num(), rot = (num() * Math.PI) / 180, large = num(), sweep = num();
        const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0);
        for (const [px, py] of arcPoints(x, y, rx, ry, rot, !!large, !!sweep, nx, ny)) push(px, py);
        x = nx; y = ny;
        break;
      }
      case 'Q': case 'C': {
        const cubic = cmd.toUpperCase() === 'C';
        const pts = [];
        for (let k = 0; k < (cubic ? 3 : 2); k++) pts.push([num() + (rel ? x : 0), num() + (rel ? y : 0)]);
        const p0 = [x, y];
        for (let s = 1; s <= 12; s++) {
          const u = s / 12, v = 1 - u;
          const [px, py] = cubic
            ? [0, 1].map((j) => v * v * v * p0[j] + 3 * v * v * u * pts[0][j] + 3 * v * u * u * pts[1][j] + u * u * u * pts[2][j])
            : [0, 1].map((j) => v * v * p0[j] + 2 * v * u * pts[0][j] + u * u * pts[1][j]);
          push(px, py);
        }
        [x, y] = pts[pts.length - 1];
        break;
      }
      case 'Z':
        if (cur) cur.closed = true;
        x = sx; y = sy;
        break;
      default: i++;
    }
  }
  return out.filter((p) => p.points.length > 1);
}

// --- DXF -----------------------------------------------------------------------------

export const DXF_LAYERS = { CUT: 1, CREASE: 5, ZIP: 3, WINDOW: 4 }; // name → ACI colour

// The design's dieline as { layer: [polyline] } in sheet millimetres (y down).
export function dielineShapes(design, env) {
  const geo = geometry(design);
  const shapes = { CUT: [], CREASE: [], ZIP: [], WINDOW: [] };
  for (const p of geo.panels) {
    const L = p.lines;
    for (const d of [...L.cut, ...L.holes, ...L.notches]) shapes.CUT.push(...flattenPath(d, p.x, p.y));
    for (const d of L.fold ?? []) shapes.CREASE.push(...flattenPath(d, p.x, p.y));
    for (const z of L.zip) shapes.ZIP.push({ points: [[p.x, p.y + z.y], [p.x + p.w, p.y + z.y]], closed: false });
  }
  for (const d of geo.sheetLines?.cut ?? []) shapes.CUT.push(...flattenPath(d));
  for (const d of geo.sheetLines?.fold ?? []) shapes.CREASE.push(...flattenPath(d));
  if (env) {
    for (const w of renderSheet(design, env, { mode: 'print', dieline: false }).windows) shapes.WINDOW.push(...flattenPath(w.d, w.px, w.py));
  }
  return { geo, shapes };
}

export function dielineDxf(design, env) {
  const { geo, shapes } = dielineShapes(design, env);
  const H = geo.size.h;
  const f = (v) => String(Math.round(v * 10000) / 10000);
  const lines = [];
  const g = (code, value) => lines.push(String(code), String(value));
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4); // millimetres
  g(9, '$EXTMIN'); g(10, f(-geo.bleed)); g(20, f(-geo.bleed));
  g(9, '$EXTMAX'); g(10, f(geo.size.w + geo.bleed)); g(20, f(H + geo.bleed));
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(DXF_LAYERS).length);
  for (const [name, color] of Object.entries(DXF_LAYERS)) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const [layer, list] of Object.entries(shapes)) {
    for (const pl of list) {
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(70, pl.closed ? 1 : 0);
      for (const [x, y] of pl.points) { g(0, 'VERTEX'); g(8, layer); g(10, f(x)); g(20, f(H - y)); }
      g(0, 'SEQEND'); g(8, layer);
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return `${lines.join('\r\n')}\r\n`;
}

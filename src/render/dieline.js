// The construction drawing over the artwork: cut lines, seals, the zip, holes, notches,
// folds and the safe area, plus the dimension lines of the proof.
//
// In a print file it is its own group ("dieline"), stroked in a spot-like magenta that the
// printer recognises as non-printing; previews draw it lighter and add the guides.
import { el, n, rectPath } from './svg.js';

export const DIELINE_COLOR = '#ec008c';
export const FOLD_COLOR = '#00a0e3';
export const SAFE_COLOR = '#00b3a4';

function panelGroup(p, inner) {
  return inner ? el('g', { transform: `translate(${n(p.x)} ${n(p.y)})` }, inner) : '';
}

// style: 'print' (lines only), 'design' (lines, seals, safe area) or 'proof'.
export function dielineColors(geo) {
  return { cut: geo.colors?.cut ?? DIELINE_COLOR, fold: geo.colors?.fold ?? FOLD_COLOR };
}

export function dielineSvg(geo, { style = 'design', windows = [] } = {}) {
  const w = style === 'print' ? 0.25 : 0.35;
  const C = dielineColors(geo);
  const cut = { fill: 'none', stroke: C.cut, 'stroke-width': w };
  let out = '';
  for (const p of geo.panels) {
    const L = p.lines;
    let g = '';
    if (style !== 'print') {
      for (const d of L.seal) g += el('path', { d, fill: '#ffffff', 'fill-opacity': 0.22, stroke: DIELINE_COLOR, 'stroke-width': 0.15, 'stroke-dasharray': '0.8 0.8', 'stroke-opacity': 0.8 });
      if (style === 'design' && p.info?.safe) {
        const s = p.info.safe;
        g += el('path', { d: rectPath(s.x, s.y, s.w, s.h), fill: 'none', stroke: SAFE_COLOR, 'stroke-width': 0.25, 'stroke-dasharray': '2 1.2' });
      }
    }
    for (const z of L.zip) {
      g += el('path', { d: `M0 ${n(z.y - z.w / 2)}H${n(p.w)}M0 ${n(z.y + z.w / 2)}H${n(p.w)}`, fill: 'none', stroke: DIELINE_COLOR, 'stroke-width': w * 0.8, 'stroke-dasharray': '3 1.5' });
    }
    for (const d of L.fold ?? []) g += el('path', { d, fill: 'none', stroke: C.fold, 'stroke-width': w, 'stroke-dasharray': '4 2' });
    for (const d of L.cut) g += el('path', { d, ...cut });
    for (const d of L.holes) g += el('path', { d, ...cut, fill: style === 'print' ? 'none' : '#ffffff' });
    for (const d of L.notches) g += el('path', { d, ...cut });
    out += panelGroup(p, g);
  }
  for (const d of geo.sheetLines?.fold ?? []) out += el('path', { d, fill: 'none', stroke: C.fold, 'stroke-width': w, 'stroke-dasharray': '4 2' });
  for (const d of geo.sheetLines?.cut ?? []) out += el('path', { d, ...cut });
  if (style === 'design') {
    for (const p of geo.panels) {
      if (p.lines.cut.length || !p.info?.safe) continue;
      for (const f of p.info.faces ?? [{ safe: p.info.safe }]) {
        const s = f.safe;
        out += el('path', { d: rectPath(p.x + s.x, p.y + s.y, s.w, s.h), fill: 'none', stroke: SAFE_COLOR, 'stroke-width': 0.25, 'stroke-dasharray': '2 1.2' });
      }
    }
  }
  // In a print file the window is marked too (no ink there), as a dashed outline.
  if (style === 'print') {
    for (const win of windows) out += el('path', { d: win.d, fill: 'none', stroke: C.cut, 'stroke-width': 0.2, 'stroke-dasharray': '2 1', transform: `translate(${n(win.px)} ${n(win.py)})` });
  }
  return out;
}

// Dimension lines with arrowheads and labels; `text` is the TextEngine. A measure's offset
// moves the line away from the object (negative: up or left).
export function measuresSvg(geo, text, { color = '#2a7ab9', size = 3.2 } = {}) {
  let out = '';
  const a = size * 0.55;
  const sw = size * 0.06;
  for (const m of geo.measures ?? []) {
    const horiz = Math.abs(m.y2 - m.y1) < 1e-6;
    const label = /^[\d.]+$/.test(m.label) ? `${m.label} mm` : m.label;
    let lines, arrows, tag;
    if (horiz) {
      const y = m.y1 + m.offset;
      lines = `M${n(m.x1)} ${n(y)}H${n(m.x2)}M${n(m.x1)} ${n(m.y1)}V${n(y - Math.sign(m.offset) * 1.2)}M${n(m.x2)} ${n(m.y2)}V${n(y - Math.sign(m.offset) * 1.2)}`;
      arrows = `M${n(m.x1)} ${n(y)}l${n(a * 1.7)} ${n(-a / 2)}v${n(a)}ZM${n(m.x2)} ${n(y)}l${n(-a * 1.7)} ${n(-a / 2)}v${n(a)}Z`;
      tag = text.layout({ text: label, x: (m.x1 + m.x2) / 2, y: y - size * 0.45, font: 'semibold', size, align: 'center', valign: 'baseline' }).svg;
    } else {
      const x = m.x1 + m.offset;
      lines = `M${n(x)} ${n(m.y1)}V${n(m.y2)}M${n(m.x1)} ${n(m.y1)}H${n(x - Math.sign(m.offset) * 1.2)}M${n(m.x2)} ${n(m.y2)}H${n(x - Math.sign(m.offset) * 1.2)}`;
      arrows = `M${n(x)} ${n(m.y1)}l${n(-a / 2)} ${n(a * 1.7)}h${n(a)}ZM${n(x)} ${n(m.y2)}l${n(-a / 2)} ${n(-a * 1.7)}h${n(a)}Z`;
      const side = m.offset < 0 ? -size * 0.45 : size * 0.45 + size * 0.7;
      tag = el('g', { transform: `translate(${n(x + side)} ${n((m.y1 + m.y2) / 2)}) rotate(-90)` },
        text.layout({ text: label, x: 0, y: 0, font: 'semibold', size, align: 'center', valign: 'baseline' }).svg);
    }
    out += el('path', { d: lines, fill: 'none', stroke: color, 'stroke-width': sw }) + el('path', { d: arrows, fill: color }) + el('g', { fill: color }, tag);
  }
  return out;
}

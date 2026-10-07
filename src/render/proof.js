// The printer proof, like the factory proofs WERTIS gets: a header table (product, code,
// size, version, date, colours) with a swatch for every ink the design uses plus the
// transparent window, the artwork with its dieline, the dimensions in mm, a legend and a
// sign-off box.
import { el, n, rectPath } from './svg.js';
import { renderSheet, wrapSvg } from './sheet.js';
import { measuresSvg, DIELINE_COLOR, FOLD_COLOR } from './dieline.js';
import { logoSvg } from '../brand/logo.js';
import { TRANSPARENT, luminance } from '../brand/palette.js';
import { FORMATS } from '../registry.js';

export const PROOF_PAGES = {
  a3: { label: 'A3 landscape (scaled to fit)', w: 420, h: 297 },
  a4: { label: 'A4 landscape (scaled to fit)', w: 297, h: 210 },
  full: { label: 'Full size (1:1)', w: 0, h: 0 },
};

const INK = '#2b2b2b';
const MUTED = '#6d6a66';
const LINE = '#b9b4ad';

export function renderProof(design, env, { page = 'a3' } = {}) {
  const t = env.text;
  const art = renderSheet(design, env, { mode: 'art', dieline: true, guides: false, labels: false });
  const geo = art.geo;
  const pad = 26; // room for the dimension lines around the bleed box
  const artBox = { x: art.box.x - pad, y: art.box.y - pad, w: art.box.w + 2 * pad, h: art.box.h + 2 * pad };

  const spec = PROOF_PAGES[page] ?? PROOF_PAGES.a3;
  const M = 10, headerH = 52, legendH = 12;
  let P = { w: spec.w, h: spec.h };
  let s;
  if (!spec.w) {
    s = 1;
    P = { w: Math.max(artBox.w + 2 * M, 297), h: artBox.h + 2 * M + headerH + legendH };
  } else {
    s = Math.min((P.w - 2 * M) / artBox.w, (P.h - 2 * M - headerH - legendH) / artBox.h, 1);
  }

  // Swatches in use, in palette order, with the window last.
  const used = design.palette.filter((sw) => art.used.has(sw.id) && sw.role !== TRANSPARENT);
  const transparent = art.used.size && design.palette.find((sw) => sw.role === TRANSPARENT && art.used.has(sw.id));

  let out = el('rect', { x: 0, y: 0, width: P.w, height: P.h, fill: '#ffffff' });

  // --- header table ---
  const hx = M, hy = M, hw = P.w - 2 * M;
  const row1 = 18, row2 = headerH - row1 - 4;
  out += el('path', { d: rectPath(hx, hy, hw, row1 + row2), fill: 'none', stroke: LINE, 'stroke-width': 0.3 });
  out += el('path', { d: `M${n(hx)} ${n(hy + row1)}H${n(hx + hw)}`, stroke: LINE, 'stroke-width': 0.3 });
  const logo = logoSvg({ box: { x: hx + 3, y: hy + 2.5, w: 34, h: row1 - 5 }, layout: 'full', colors: { gear: '#303030', arc: '#ff9100', word: '#303030', line: '#ff9100' } });
  out += logo.svg;
  const content = design.content;
  const f = FORMATS[design.format];
  const cells = [
    ['Product', content.productName?.[content.lang] || design.name, 3],
    ['Code', content.sku || '—', 1],
    ['Format', geo.title ?? f.label, 2.2],
    ['Version', design.proof.version || '—', 0.8],
    ['Date', design.proof.date || '—', 1],
    ['Prepared by', design.proof.author || '—', 1.2],
    ['Colours', `${used.length} ${used.length === 1 ? 'colour' : 'colours'}${transparent ? ' + transparent' : ''}`, 1.4],
    ['Approved (sign / date)', '', 1.6],
  ];
  const cx0 = hx + 40;
  const unit = (hw - 40) / cells.reduce((a, c) => a + c[2], 0);
  let cx = cx0;
  for (const [label, value, weight] of cells) {
    const cw = unit * weight;
    out += el('path', { d: `M${n(cx)} ${n(hy)}V${n(hy + row1)}`, stroke: LINE, 'stroke-width': 0.3 });
    out += el('g', { fill: MUTED }, t.layout({ text: label.toUpperCase(), x: cx + 2, y: hy + 2.6, w: cw - 4, font: 'semibold', size: 2.2, spacing: 0.06 }).svg);
    out += el('g', { fill: INK }, t.layout({ text: value, x: cx + 2, y: hy + 7.5, w: cw - 4, h: row1 - 9.5, font: 'bold', size: 3.6, minSize: 2, wrap: true, maxLines: 2, lineHeight: 1.15 }).svg);
    cx += cw;
  }

  // Swatch chips.
  let sx = hx + 3;
  const sy = hy + row1 + 3;
  const chipW = 9, chipH = row2 - 6;
  const chips = [...used, ...(transparent ? [transparent] : [])];
  const cellW = Math.min(46, (hw * 0.62) / Math.max(chips.length, 1));
  for (const sw of chips) {
    out += el('path', { d: rectPath(sx, sy, chipW, chipH, 0.8), fill: sw.hex, stroke: luminance(sw.hex) > 0.8 ? LINE : 'none', 'stroke-width': 0.3 });
    if (sw.role === TRANSPARENT) out += el('g', { fill: '#5b8ba6' }, t.layout({ text: 'NO INK', x: sx, y: sy, w: chipW, h: chipH, font: 'bold', size: 1.6, align: 'center', valign: 'middle' }).svg);
    const tx = sx + chipW + 1.8, tw = cellW - chipW - 3;
    out += el('g', { fill: INK }, t.layout({ text: sw.name, x: tx, y: sy + 0.4, w: tw, font: 'bold', size: 2.6, minSize: 1.6 }).svg);
    const lines = [sw.hex.toUpperCase(), `C${sw.cmyk[0]} M${sw.cmyk[1]} Y${sw.cmyk[2]} K${sw.cmyk[3]}`, sw.spot].filter(Boolean);
    out += el('g', { fill: MUTED }, t.layout({ text: lines.join('\n'), x: tx, y: sy + 4.6, w: tw, font: 'regular', size: 2.2, minSize: 1.4, lineHeight: 1.3 }).svg);
    sx += cellW;
  }
  // Notes.
  const nx = hx + hw * 0.64;
  out += el('path', { d: `M${n(nx)} ${n(hy + row1)}V${n(hy + row1 + row2)}`, stroke: LINE, 'stroke-width': 0.3 });
  const notes = [design.proof.notes, `Dimensions are finished sizes in mm. Bleed ${n(geo.bleed)} mm. All text is converted to outlines.`].filter(Boolean).join('\n');
  out += el('g', { fill: '#b3261e' }, t.layout({ text: notes, x: nx + 3, y: hy + row1 + 3, w: hw * 0.36 - 6, h: row2 - 5, font: 'semibold', size: 2.6, minSize: 1.6, wrap: true, lineHeight: 1.3 }).svg);

  // --- artwork with dimensions ---
  const areaY = M + headerH;
  const areaH = P.h - areaY - M - legendH;
  const ox = (P.w - artBox.w * s) / 2 - artBox.x * s;
  const oy = areaY + (areaH - artBox.h * s) / 2 - artBox.y * s;
  const dims = measuresSvg(geo, t, { size: 3.2 / s });
  const names = geo.panels.map((p) => el('g', { fill: MUTED }, t.layout({ text: p.label.toUpperCase(), x: p.x + p.w / 2, y: p.y + p.h + geo.bleed + 6 / s, font: 'bold', size: 3 / s, align: 'center', valign: 'baseline', spacing: 0.08 }).svg)).join('');
  out += el('g', { transform: `translate(${n(ox)} ${n(oy)}) scale(${Number(s.toPrecision(6))})` }, art.inner + dims + names);

  // --- legend ---
  const ly = P.h - M - legendH + 4;
  let lx = M;
  const legend = [
    ['line', DIELINE_COLOR, 'Cut line', null],
    ['dash', DIELINE_COLOR, 'Zip', '3 1.5'],
    ['dash', FOLD_COLOR, 'Fold', '4 2'],
    ['seal', '#ffffff', 'Seal area', null],
    ['box', transparent?.hex ?? '#cfe9f7', 'Transparent window (no ink)', null],
  ];
  for (const [kind, color, label, dash] of legend) {
    if (kind === 'line' || kind === 'dash') out += el('path', { d: `M${n(lx)} ${n(ly + 2)}h10`, stroke: color, 'stroke-width': 0.5, 'stroke-dasharray': dash, fill: 'none' });
    else out += el('path', { d: rectPath(lx, ly, 10, 4, 0.6), fill: color, stroke: kind === 'seal' ? DIELINE_COLOR : 'none', 'stroke-width': 0.2, 'stroke-dasharray': kind === 'seal' ? '0.8 0.8' : null });
    const laid = t.layout({ text: label, x: lx + 12, y: ly + 0.6, font: 'semibold', size: 2.8 });
    out += el('g', { fill: INK }, laid.svg);
    lx += 12 + laid.width + 8;
  }
  const scaleText = s === 1 ? 'Scale 1:1' : `Scale ${Math.round(s * 100)} %`;
  out += el('g', { fill: MUTED }, t.layout({ text: `${scaleText} · WERTIS Packaging Designer`, x: P.w - M, y: ly + 0.6, font: 'regular', size: 2.6, align: 'right' }).svg);

  return { svg: wrapSvg(out, { x: 0, y: 0, w: P.w, h: P.h }), w: P.w, h: P.h, scale: s, used: chips.map((c) => c.id) };
}

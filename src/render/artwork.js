// Template elements → SVG for one panel, in the panel's own millimetres.
//
// Background elements (bands, patterns, the big gear) are clipped to the panel and knocked
// out where a window is: no ink at all there, as the film stays clear. Foreground elements
// (logo, texts, label) are drawn on top and may cross a window's edge.
import { el, n, rectPath, ellipsePath, gearPath, clamp } from './svg.js';
import { patternSvg, scaledPattern } from './pattern.js';
import { FORMATS } from '../registry.js';
import { logoSvg, fitLogo, partBox, LOGO_LAYOUTS } from '../brand/logo.js';
import { resolveColor, refSwatchId, findSwatch, mix, cmykFromHex } from '../brand/palette.js';
import { ean13Svg } from '../codes/ean13.js';
import { qrSvg } from '../codes/qr.js';
import { recycleMark, tidyman } from '../brand/marks.js';

// rc (render context): { design, text, defs: Map, used: Set, cmyk: Map, mode, uid() }
// Besides the hex colour, every colour drawn is noted with its CMYK (the swatch's own numbers;
// a custom colour gets the simple conversion), so the print PDF can be written in CMYK.
export function colorOf(rc, elem, slot) {
  const ref = rc.design.colors?.[`${elem.id}.${slot}`] ?? elem.colors?.[slot];
  const id = refSwatchId(ref);
  const sw = id ? findSwatch(rc.design.palette, id) : null;
  if (sw) rc.used.add(id);
  const hex = resolveColor(ref, rc.design.palette);
  if (rc.cmyk && hex !== 'none' && !rc.cmyk.has(hex)) rc.cmyk.set(hex, sw && !(ref && typeof ref === 'object' && ref.custom) ? sw.cmyk : cmykFromHex(hex));
  return hex;
}

// The metallic look (silver edges, the big gear). Previews use a gradient; print files get
// the same light and shade as thin strips of tints of the swatch, so every ink stays an
// exact CMYK mix (and a spot silver stays a tint of that spot).
const METAL = [[0, 0.45], [0.35, 0], [0.5, 0.7], [0.7, 0], [1, -0.35]];
function metalAt(t) {
  for (let i = 1; i < METAL.length; i++) {
    const [t1, s1] = METAL[i];
    if (t <= t1) {
      const [t0, s0] = METAL[i - 1];
      return s0 + ((s1 - s0) * (t - t0)) / (t1 - t0);
    }
  }
  return METAL[METAL.length - 1][1];
}

// A band that runs from its own colour into another swatch, as `dir` says. Previews and print files
// alike get thin strips of flat colour (no gradient objects), each an exact CMYK mix of the two swatches,
// so the print PDF keeps every ink a plain process mix; a spot swatch takes part by its CMYK numbers.
export const GRADIENT_DIRS = [['down', 'Top to bottom'], ['up', 'Bottom to top'], ['right', 'Left to right'], ['left', 'Right to left']];

function gradientSvg(rc, e, box, r, from, g) {
  const to = findSwatch(rc.design.palette, g.to);
  if (!to || from === 'none') return null;
  rc.used.add(to.id);
  const horizontal = g.dir === 'right' || g.dir === 'left';
  const reverse = g.dir === 'up' || g.dir === 'left';
  const len = horizontal ? box.w : box.h;
  const count = Math.round(clamp(len / 0.5, 8, 80));
  const step = len / count;
  const c0 = rc.cmyk?.get(from) ?? cmykFromHex(from), c1 = to.cmyk;
  let strips = '';
  for (let i = 0; i < count; i++) {
    const t0 = (i + 0.5) / count, t = reverse ? 1 - t0 : t0;
    const hex = mix(from, to.hex, t);
    if (rc.cmyk && !rc.cmyk.has(hex)) rc.cmyk.set(hex, c0.map((v, k) => Math.round((v + (c1[k] - v) * t) * 10) / 10));
    // Each strip runs on to the far end and the next one paints over it, so no hairline shows between them.
    const x = horizontal ? box.x + i * step : box.x, y = horizontal ? box.y : box.y + i * step;
    strips += el('path', { d: rectPath(x, y, horizontal ? len - i * step : box.w, horizontal ? box.h : len - i * step), fill: hex });
  }
  return el('g', { 'clip-path': clipDef(rc, rectPath(box.x, box.y, box.w, box.h, r)) }, strips);
}

function metalSvg(rc, base, box, shape, rule = 'nonzero') {
  if (rc.mode !== 'print') return el('path', { d: shape ?? rectPath(box.x, box.y, box.w, box.h), fill: silverGradient(rc, base), 'fill-rule': rule });
  const v0 = rc.cmyk?.get(base);
  const cmyk = Array.isArray(v0) ? v0 : cmykFromHex(base);
  // A swatch printed as a spot ink: the strips become tints of that ink.
  const spotSwatch = rc.design.palette.find((sw) => sw.hex === base && sw.asSpot);
  const n = Math.round(clamp(box.h / 0.25, 6, 60));
  const step = box.h / n;
  let strips = '';
  for (let i = 0; i < n; i++) {
    const s = metalAt((i + 0.5) / n);
    const hex = s >= 0 ? mix(base, '#ffffff', s) : mix(base, '#000000', -s);
    const k = s >= 0 ? cmyk.map((v) => Math.round(v * (1 - s) * 10) / 10) : [cmyk[0], cmyk[1], cmyk[2], Math.round((cmyk[3] + (100 - cmyk[3]) * -s) * 10) / 10];
    if (rc.cmyk && !rc.cmyk.has(hex)) rc.cmyk.set(hex, spotSwatch ? { spotOf: spotSwatch.id, tint: s >= 0 ? Math.round((1 - s) * 1000) / 1000 : 1, cmyk: k } : k);
    strips += el('path', { d: rectPath(box.x, box.y + i * step, box.w, step + 0.02), fill: hex });
  }
  return el('g', { 'clip-path': clipDef(rc, shape ?? rectPath(box.x, box.y, box.w, box.h), rule) }, strips);
}

// Where this panel sits on the whole sheet, for the pattern that runs on across the panels. A pouch's
// front and back are joined at the sheet's middle and its two ends close into a tube, so its pattern
// wraps over the width of the two panels.
function patternSheet(rc, panel) {
  if (!rc.patternSheet) {
    const geo = FORMATS[rc.design.format].layout(rc.design.dims, rc.design);
    const x0 = Math.min(...geo.panels.map((p) => p.x)), y0 = Math.min(...geo.panels.map((p) => p.y));
    const x1 = Math.max(...geo.panels.map((p) => p.x + p.w)), y1 = Math.max(...geo.panels.map((p) => p.y + p.h));
    const pad = geo.bleed ?? 3;
    const round = rc.design.format !== 'tuckBox';
    const front = geo.panels.find((p) => p.role === 'front'), back = geo.panels.find((p) => p.role === 'back');
    rc.patternSheet = { area: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }, wrap: round && front && back ? front.w + back.w : null, cache: new Map() };
  }
  return { ...rc.patternSheet, ox: panel.x ?? 0, oy: panel.y ?? 0 };
}

export function windowPath(w) {
  if (w.shape === 'oval') return ellipsePath(w.box.x + w.box.w / 2, w.box.y + w.box.h / 2, w.box.w / 2, w.box.h / 2);
  return rectPath(w.box.x, w.box.y, w.box.w, w.box.h, clamp(w.r ?? 0, 0, Math.min(w.box.w, w.box.h) / 2));
}

// Grows a band into the bleed on the sides where it touches the panel edge.
function bleedBox(box, panel, bleed) {
  const s = panel.bleedSides ?? { l: true, t: true, r: true, b: true };
  const e = 0.01;
  const x0 = s.l && box.x <= e ? -bleed : box.x;
  const y0 = s.t && box.y <= e ? -bleed : box.y;
  const x1 = s.r && box.x + box.w >= panel.w - e ? panel.w + bleed : box.x + box.w;
  const y1 = s.b && box.y + box.h >= panel.h - e ? panel.h + bleed : box.y + box.h;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function clipDef(rc, d, rule = 'nonzero') {
  const id = rc.uid('clip');
  rc.defs.set(id, el('clipPath', { id }, el('path', { d, 'clip-rule': rule })));
  return `url(#${id})`;
}

function silverGradient(rc, base) {
  const id = `silver-${base.replace('#', '')}`;
  if (!rc.defs.has(id)) {
    const stops = [[0, mix(base, '#ffffff', 0.45)], [0.35, base], [0.5, mix(base, '#ffffff', 0.7)], [0.7, base], [1, mix(base, '#000000', 0.35)]];
    rc.defs.set(id, el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, stops.map(([o, c]) => el('stop', { offset: o, 'stop-color': c })).join('')));
  }
  return `url(#${id})`;
}

function textSvg(rc, e, color) {
  const laid = rc.text.layout({ ...e.box, text: e.text, font: e.font, size: e.size, minSize: e.minSize, align: e.align, valign: e.valign,
    upper: e.upper, wrap: e.wrap, spacing: e.spacing, lineHeight: e.lineHeight, maxLines: e.maxLines });
  return { svg: laid.svg ? el('g', { fill: color }, laid.svg) : '', box: laid.box };
}

// The white label: product name and code, the other languages, then EAN and QR at the
// bottom. Everything scales with the label; it shrinks to fit (the barcode never below
// 80 %, the smallest size GS1 allows).
function labelSvg(rc, e) {
  const { x, y, w, h } = e.box;
  const fill = colorOf(rc, e, 'fill'), ink = colorOf(rc, e, 'text'), accent = colorOf(rc, e, 'accent'), bars = colorOf(rc, e, 'bars');
  const t = rc.text;
  const c = e.content;
  const pad = clamp(w * 0.045, 2.5, 8);
  const iw = w - 2 * pad;
  const build = (k) => {
    let out = '';
    const nameCap = clamp(iw * 0.03, 1.8, 6) * k;
    const smallCap = clamp(iw * 0.016, 1.2, 3.4) * k;
    let cy = y + pad;
    const sku = c.sku ? t.layout({ text: c.sku, x: x + pad, y: cy, w: iw, font: 'bold', size: (nameCap * 0.8) / 0.7, align: 'right' }) : null;
    if (sku) out += el('g', { fill: accent }, sku.svg);
    const name = t.layout({ text: c.name, x: x + pad, y: cy, w: iw - (sku ? sku.width + nameCap : 0), font: 'bold', size: nameCap / 0.7, minSize: nameCap / 0.7 * 0.7, wrap: true, maxLines: 3, lineHeight: 1.15 });
    out += el('g', { fill: ink }, name.svg);
    cy += name.height + smallCap * 1.4;
    if (c.others.length) {
      out += el('path', { d: `M${n(x + pad)} ${n(cy - smallCap * 0.7)}h${n(iw)}`, stroke: accent, 'stroke-width': n(Math.max(0.25 * k, 0.15)), fill: 'none' });
      cy += smallCap * 0.5;
      const codeW = t.measure('MM:', 'bold', smallCap / 0.7) + smallCap * 0.6;
      for (const [code, text] of c.others) {
        out += el('g', { fill: ink }, t.layout({ text: `${code}:`, x: x + pad, y: cy, font: 'bold', size: smallCap / 0.7 }).svg
          + t.layout({ text, x: x + pad + codeW, y: cy, w: iw - codeW, font: 'regular', size: smallCap / 0.7, minSize: smallCap / 0.7 * 0.75 }).svg);
        cy += smallCap * 1.75;
      }
    }
    const textBottom = cy;
    // Codes along the bottom.
    const m = Math.max(0.264, clamp((iw * 0.5) / 113, 0.264, 0.5) * k);
    const ean = c.ean ? ean13Svg({ code: c.ean, x: x + pad, y: 0, module: m, color: bars, bg: fill, text: t, bwr: rc.design.export?.bwr ?? 0 }) : null;
    const codesH = ean && !ean.error ? ean.h : clamp(iw * 0.2, 10, 30) * k;
    const by = y + h - pad - codesH;
    if (ean && !ean.error) out += el('g', { transform: `translate(0 ${n(by)})` }, ean.svg);
    else if (c.ean) out += el('g', { fill: '#d0021b' }, t.layout({ text: ean.error, x: x + pad, y: by, w: iw * 0.55, font: 'semibold', size: smallCap / 0.7, wrap: true }).svg);
    const urlCap = smallCap;
    const qrSize = codesH - urlCap * 1.8;
    if (c.qr && qrSize > 4) {
      const q = qrSvg({ text: c.qr, x: x + w - pad - qrSize, y: by, size: qrSize, color: bars, bg: fill, quiet: 4 });
      if (!q.error) out += q.svg;
      if (c.url) out += el('g', { fill: ink }, t.layout({ text: c.url, x: x + w - pad - qrSize * 1.6, y: by + qrSize + urlCap * 0.5, w: qrSize * 1.6, font: 'semibold', size: urlCap / 0.7, align: 'right' }).svg);
    }
    return { out, overflow: textBottom - (by - smallCap) };
  };
  let k = 1;
  let r = build(k);
  for (let i = 0; i < 4 && r.overflow > 0 && k > 0.5; i++) {
    k = Math.max(0.5, k * (1 - r.overflow / Math.max(h, 1)) - 0.03);
    r = build(k);
  }
  const bg = fill === 'none' ? '' : el('path', { d: rectPath(x, y, w, h, clamp(w * 0.02, 1, 4)), fill });
  return { svg: bg + r.out, box: e.box };
}

// A standalone EAN-13, as big as its box allows but never under 80 % (GS1's minimum).
function eanSvg(rc, e) {
  const k = e.bars ?? 1; // bar height as a share of the nominal (truncated codes on small boxes)
  const m = Math.max(0.264, Math.min(e.box.w / 113, e.box.h / (69.24 * k + 11.3)));
  const w = 113 * m, h = (69.24 * k + 11) * m;
  const x = e.align === 'right' ? e.box.x + e.box.w - w : e.align === 'left' ? e.box.x : e.box.x + (e.box.w - w) / 2;
  const y = e.valign === 'bottom' ? e.box.y + e.box.h - h : e.valign === 'top' ? e.box.y : e.box.y + (e.box.h - h) / 2;
  const r = ean13Svg({ code: e.code, x, y: y + m, module: m, barHeight: 69.24 * k * m, color: colorOf(rc, e, 'bars'), bg: colorOf(rc, e, 'bg'), text: rc.text, bwr: rc.design.export?.bwr ?? 0 });
  if (r.error) return { svg: el('g', { fill: '#d0021b' }, rc.text.layout({ text: r.error, ...e.box, font: 'semibold', size: 2.4, minSize: 1.2, wrap: true }).svg), box: e.box };
  return { svg: r.svg, box: { x, y, w, h } };
}

function qrElementSvg(rc, e) {
  const size = Math.min(e.box.w, e.box.h);
  const x = e.box.x + (e.box.w - size) / 2, y = e.box.y + (e.box.h - size) / 2;
  const r = qrSvg({ text: e.text, x, y, size, color: colorOf(rc, e, 'dots'), bg: colorOf(rc, e, 'bg'), quiet: 4 });
  return { svg: r.error ? '' : r.svg, box: { x, y, w: size, h: size } };
}

// A picture (the product photo on a box lid), fitted inside its box.
function imageSvg(e) {
  if (!e.src) return { svg: '', box: e.box };
  const s = Math.min(e.box.w / (e.pw || 1), e.box.h / (e.ph || 1));
  const w = (e.pw || 1) * s, h = (e.ph || 1) * s;
  const x = e.box.x + (e.box.w - w) / 2, y = e.box.y + (e.box.h - h) / 2;
  return { svg: el('image', { href: e.src, x, y, width: w, height: h, preserveAspectRatio: 'none' }), box: { x, y, w, h } };
}

// The disposal marks in a row, as tall as the box.
function marksSvg(rc, e) {
  const color = colorOf(rc, e, 'fill');
  if (color === 'none') return { svg: '', box: e.box };
  const size = Math.min(e.box.h, e.box.w / (e.marks.length + (e.marks.length - 1) * 0.25));
  let x = e.box.x, svg = '';
  for (const m of e.marks) {
    svg += m === 'recycle'
      ? recycleMark({ x, y: e.box.y, size, code: e.material.code, name: e.material.name, color, text: rc.text }).svg
      : tidyman({ x, y: e.box.y, size, color }).svg;
    x += size * 1.25;
  }
  return { svg, box: { x: e.box.x, y: e.box.y, w: x - size * 0.25 - e.box.x, h: size } };
}

function elementSvg(rc, e, panel) {
  switch (e.type) {
    case 'rect': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const fill = colorOf(rc, e, 'fill');
      const grad = rc.design.gradients?.[e.id];
      const svg = (grad && gradientSvg(rc, e, box, e.r ?? 0, fill, grad)) || (fill === 'none' ? '' : el('path', { d: rectPath(box.x, box.y, box.w, box.h, e.r ?? 0), fill }));
      return { svg, box: e.box };
    }
    case 'silver': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const base = colorOf(rc, e, 'fill');
      return { svg: base === 'none' ? '' : metalSvg(rc, base, box), box: e.box };
    }
    case 'pattern': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const ink = colorOf(rc, e, 'ink');
      const body = patternSvg(box, scaledPattern(rc.design.pattern, rc.design.format === 'tuckBox' ? null : rc.design.dims?.height), ink, rc.defs, `${e.id}`, { inline: !!rc.inlineUses, sheet: patternSheet(rc, panel) });
      return { svg: body ? el('g', { 'clip-path': clipDef(rc, rectPath(box.x, box.y, box.w, box.h)) }, body) : '', box: e.box };
    }
    case 'gear': {
      const fill = colorOf(rc, e, 'fill');
      const d = gearPath(e.cx, e.cy, e.r1, e.r2, e.teeth, e.hole);
      const g = e.metallic && fill !== 'none'
        ? metalSvg(rc, fill, { x: e.cx - e.r2, y: e.cy - e.r2, w: 2 * e.r2, h: 2 * e.r2 }, d, 'evenodd')
        : el('path', { d, fill, 'fill-rule': 'evenodd' });
      return { svg: fill === 'none' ? '' : (e.clip ? el('g', { 'clip-path': clipDef(rc, rectPath(e.clip.x, e.clip.y, e.clip.w, e.clip.h)) }, g) : g), box: e.box };
    }
    case 'logo': {
      const colors = {};
      for (const role of ['gear', 'arc', 'word', 'line']) colors[role] = colorOf(rc, e, role);
      const align = e.align ?? 'center', valign = e.valign ?? 'middle';
      const logo = logoSvg({ box: e.box, layout: e.layout, colors, align, valign });
      // The registered mark ®, a small raised one just after the WERTIS word, in the word's colour.
      if (e.registered && colors.word !== 'none' && LOGO_LAYOUTS[e.layout ?? 'full']?.parts.includes('word')) {
        const word = partBox(fitLogo(e.box, e.layout, align, valign), 'word');
        const size = word.h * 0.62;
        const reg = rc.text.layout({ text: '®', x: word.x + word.w + word.h * 0.05, y: word.y - word.h * 0.02, font: 'web', size, align: 'left', valign: 'top' });
        logo.svg += el('g', { fill: colors.word }, reg.svg);
      }
      return logo;
    }
    case 'text': return textSvg(rc, e, colorOf(rc, e, 'fill'));
    case 'label': return labelSvg(rc, e);
    case 'marks': return marksSvg(rc, e);
    case 'image': return imageSvg(e);
    case 'ean': return eanSvg(rc, e);
    case 'qr': return qrElementSvg(rc, e);
    default: return { svg: '', box: e.box };
  }
}

// One panel: returns { svg, hits, windows } in panel coordinates.
export function panelArt(rc, panel, elements) {
  const b = rc.bleed;
  const s = panel.bleedSides ?? { l: true, t: true, r: true, b: true };
  const art = { x: s.l ? -b : 0, y: s.t ? -b : 0 };
  art.w = panel.w + (s.r ? b : 0) - art.x;
  art.h = panel.h + (s.b ? b : 0) - art.y;
  const outer = rectPath(art.x, art.y, art.w, art.h);
  const shown = elements.filter((e) => !rc.design.hidden?.[e.id]);
  const windows = shown.filter((e) => e.type === 'window');
  const hits = [];
  let bg = '', fg = '';
  for (const e of shown) {
    if (e.type === 'window') continue;
    const r = elementSvg(rc, e, panel);
    // Turned elements (the lid's content reads the right way once the box is closed).
    if (e.rotate && r.svg) {
      const pivot = e.pivot ?? { x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h / 2 };
      r.svg = el('g', { transform: `rotate(${e.rotate} ${n(pivot.x)} ${n(pivot.y)})` }, r.svg);
      if (Math.abs(e.rotate) === 180) r.box = { x: 2 * pivot.x - r.box.x - r.box.w, y: 2 * pivot.y - r.box.y - r.box.h, w: r.box.w, h: r.box.h };
    }
    if (r.svg) {
      const g = rc.mode === 'design' ? el('g', { 'data-el': e.id }, r.svg) : r.svg;
      if (e.layer === 'bg') bg += g; else fg += g;
    }
    hits.push(hitOf(e, r.box));
  }
  for (const w of windows) hits.push(hitOf(w, w.box));
  const knockout = windows.map(windowPath).join('');
  let svg = '';
  if (bg) svg += el('g', { 'clip-path': clipDef(rc, outer + knockout, 'evenodd') }, bg);
  // The window itself: clear film. Previews and the proof mark it in the transparent swatch.
  if (rc.mode !== 'print' && rc.mode !== 'mockup' && windows.length) {
    const tr = rc.design.palette.find((p) => p.role === 'transparent');
    if (tr) rc.used.add(tr.id);
    let mark = el('path', { d: knockout, fill: tr?.hex ?? '#cfe9f7' });
    if (rc.mode === 'design') {
      for (const w of windows) {
        const size = Math.min(w.box.w, w.box.h) * 0.06;
        mark += el('g', { fill: mix(tr?.hex ?? '#cfe9f7', '#000000', 0.25) }, rc.text.layout({ text: rc.labelOf ? rc.labelOf('TRANSPARENT') : 'TRANSPARENT', x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h, font: 'bold', size, align: 'center', valign: 'middle', spacing: 0.15 }).svg);
      }
    }
    svg += rc.mode === 'design' ? el('g', { 'data-el': windows[0].id }, mark) : mark;
  }
  if (fg) svg += el('g', { 'clip-path': clipDef(rc, outer) }, fg);
  return { svg, hits, windows: windows.map((w) => ({ id: w.id, d: windowPath(w), box: w.box })) };
}

function hitOf(e, box) {
  return { id: e.id, label: e.label, type: e.type, layer: e.layer, box: box ?? e.box, movable: !!e.movable, resizable: !!e.resizable, keepAspect: !!e.keepAspect, slots: Object.keys(e.colors ?? {}), edits: e.edits ?? [] };
}

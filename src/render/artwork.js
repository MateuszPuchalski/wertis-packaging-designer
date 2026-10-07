// Template elements → SVG for one panel, in the panel's own millimetres.
//
// Background elements (bands, patterns, the big gear) are clipped to the panel and knocked
// out where a window is: no ink at all there, as the film stays clear. Foreground elements
// (logo, texts, badge, label) are drawn on top and may cross a window's edge, like the
// KEULE badge does.
import { el, n, rectPath, ellipsePath, gearPath, clamp } from './svg.js';
import { patternSvg } from './pattern.js';
import { logoSvg } from '../brand/logo.js';
import { resolveColor, refSwatchId, findSwatch, mix } from '../brand/palette.js';
import { ean13Svg } from '../codes/ean13.js';
import { qrSvg } from '../codes/qr.js';

// rc (render context): { design, text, defs: Map, used: Set, mode, uid() }
export function colorOf(rc, elem, slot) {
  const ref = rc.design.colors?.[`${elem.id}.${slot}`] ?? elem.colors?.[slot];
  const id = refSwatchId(ref);
  if (id && findSwatch(rc.design.palette, id)) rc.used.add(id);
  return resolveColor(ref, rc.design.palette);
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

// "QUALITY / YOU CAN TRUST": heavy italic words with an outline, and slanted stripes that
// fill the second line out to the first line's width.
function badgeSvg(rc, e) {
  const { x, y, w, h } = e.box;
  const textC = colorOf(rc, e, 'text'), accent = colorOf(rc, e, 'accent'), outline = colorOf(rc, e, 'outline');
  const t = rc.text;
  const l1 = t.layout({ text: e.top, x, y, w, h: h * 0.58, font: 'blackItalic', size: (h * 0.58) / 0.7, upper: true, align: 'left' });
  const gap = h * 0.12;
  const l2 = t.layout({ text: e.bottom, x: x + l1.size * 0.04, y: y + l1.height + gap, w: l1.width, h: h * 0.3, font: 'extraboldItalic', size: (h * 0.3) / 0.7, upper: true, align: 'left', spacing: 0.02 });
  const stroke = Math.max(l1.size * 0.09, 0.2);
  let stripes = '';
  const room = x + l1.width - (l2.box.x + l2.width) - l2.size * 0.25;
  if (room > l2.height) {
    const sh = l2.height, sw = sh * 0.38, step = sw * 1.9;
    for (let sx = l2.box.x + l2.width + l2.size * 0.3; sx + sw + sh * 0.35 <= x + l1.width; sx += step) {
      stripes += `M${n(sx + sh * 0.35)} ${n(l2.box.y)}h${n(sw)}l${n(-sh * 0.35)} ${n(sh)}h${n(-sw)}Z`;
    }
  }
  const outlined = (paths, fill) => (outline === 'none' ? '' : el('g', { fill: 'none', stroke: outline, 'stroke-width': stroke * 2, 'stroke-linejoin': 'round' }, paths)) + el('g', { fill }, paths);
  const svg = outlined(l1.svg, textC) + outlined(l2.svg + (stripes ? el('path', { d: stripes }) : ''), accent);
  return { svg, box: { x, y, w: Math.max(l1.width, 1), h: l1.height + gap + l2.height } };
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
    const ean = c.ean ? ean13Svg({ code: c.ean, x: x + pad, y: 0, module: m, color: bars, bg: fill, text: t }) : null;
    const codesH = ean && !ean.error ? ean.h : clamp(iw * 0.2, 10, 30) * k;
    const by = y + h - pad - codesH;
    if (ean && !ean.error) out += el('g', { transform: `translate(0 ${n(by)})` }, ean.svg);
    else if (c.ean) out += el('g', { fill: '#d0021b' }, t.layout({ text: ean.error, x: x + pad, y: by, w: iw * 0.55, font: 'semibold', size: smallCap / 0.7, wrap: true }).svg);
    const urlCap = smallCap;
    const qrSize = codesH - urlCap * 1.8;
    if (c.qr && qrSize > 4) {
      const q = qrSvg({ text: c.qr, x: x + w - pad - qrSize, y: by, size: qrSize, color: bars, bg: fill, quiet: 2 });
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

function elementSvg(rc, e, panel) {
  switch (e.type) {
    case 'rect': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const fill = colorOf(rc, e, 'fill');
      return { svg: fill === 'none' ? '' : el('path', { d: rectPath(box.x, box.y, box.w, box.h, e.r ?? 0), fill }), box: e.box };
    }
    case 'silver': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const base = colorOf(rc, e, 'fill');
      return { svg: base === 'none' ? '' : el('path', { d: rectPath(box.x, box.y, box.w, box.h), fill: silverGradient(rc, base) }), box: e.box };
    }
    case 'pattern': {
      const box = e.bleed ? bleedBox(e.box, panel, rc.bleed) : e.box;
      const ink = colorOf(rc, e, 'ink');
      const body = patternSvg(box, rc.design.pattern, ink, rc.defs, `${e.id}`);
      return { svg: body ? el('g', { 'clip-path': clipDef(rc, rectPath(box.x, box.y, box.w, box.h)) }, body) : '', box: e.box };
    }
    case 'gear': {
      const fill = colorOf(rc, e, 'fill');
      const d = gearPath(e.cx, e.cy, e.r1, e.r2, e.teeth, e.hole);
      const g = el('path', { d, fill: e.metallic && fill !== 'none' ? silverGradient(rc, fill) : fill, 'fill-rule': 'evenodd' });
      return { svg: fill === 'none' ? '' : (e.clip ? el('g', { 'clip-path': clipDef(rc, rectPath(e.clip.x, e.clip.y, e.clip.w, e.clip.h)) }, g) : g), box: e.box };
    }
    case 'logo': {
      const colors = {};
      for (const role of ['gear', 'arc', 'word', 'line']) colors[role] = colorOf(rc, e, role);
      return logoSvg({ box: e.box, layout: e.layout, colors, align: e.align ?? 'center', valign: e.valign ?? 'middle' });
    }
    case 'text': return textSvg(rc, e, colorOf(rc, e, 'fill'));
    case 'badge': return badgeSvg(rc, e);
    case 'label': return labelSvg(rc, e);
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
        mark += el('g', { fill: mix(tr?.hex ?? '#cfe9f7', '#000000', 0.25) }, rc.text.layout({ text: 'TRANSPARENT', x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h, font: 'bold', size, align: 'center', valign: 'middle', spacing: 0.15 }).svg);
      }
    }
    svg += rc.mode === 'design' ? el('g', { 'data-el': windows[0].id }, mark) : mark;
  }
  if (fg) svg += el('g', { 'clip-path': clipDef(rc, outer) }, fg);
  return { svg, hits, windows: windows.map((w) => ({ id: w.id, d: windowPath(w), box: w.box })) };
}

function hitOf(e, box) {
  return { id: e.id, label: e.label, type: e.type, layer: e.layer, box: box ?? e.box, movable: !!e.movable, resizable: !!e.resizable, keepAspect: !!e.keepAspect, slots: Object.keys(e.colors ?? {}) };
}

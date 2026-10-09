// A whole design as one SVG sheet: every panel's artwork in its place, plus the dieline.
//
//   mode 'design'  the editor preview: bleed dimmed, dieline, seals, safe area, panel names
//   mode 'print'   the file for the printer: artwork with bleed, a separate dieline group,
//                  windows left empty, nothing else
//   mode 'art'     artwork with the window marked (the proof and the mockups use it)
import { FORMATS, TEMPLATES } from '../registry.js';
import { el, n, rectPath } from './svg.js';
import { panelArt } from './artwork.js';
import { dielineSvg, dielineColors } from './dieline.js';
import { cmykFromHex } from '../brand/palette.js';

export function geometry(design) {
  return FORMATS[design.format].layout(design.dims, design);
}

// The template's elements for every panel.
export function panelsWithElements(design, env, geo = geometry(design)) {
  const t = TEMPLATES[design.template];
  return geo.panels.map((panel) => {
    const make = t.panels[panel.role];
    const ctx = {
      panel, geo, design, text: env.text, options: design.options,
      box(id, def) {
        const o = design.layout?.[id];
        return o ? { x: o.x * panel.w, y: o.y * panel.h, w: o.w * panel.w, h: o.h * panel.h } : def;
      },
    };
    return { panel, elements: [...(make ? make(ctx).map((e) => freeText(e, ctx)) : []), ...pictureElements(ctx)] };
  });
}

// The pictures the project holds for this panel, on top of the template's own pieces. They start fitted
// into the safe area, centred; the stored box (a drag or resize) wins like for every element.
function pictureElements(ctx) {
  const out = [];
  for (const [id, p] of Object.entries(ctx.design.pictures ?? {})) {
    if (p.panel !== ctx.panel.id) continue;
    const S = ctx.panel.info?.safe ?? { x: 0, y: 0, w: ctx.panel.w, h: ctx.panel.h };
    const w = Math.min(S.w, S.h * p.ratio), h = w / p.ratio;
    out.push({ id: `pic.${id}`, label: p.name || 'Picture', type: 'image', layer: 'fg', movable: true, resizable: true, keepAspect: true, src: p.src, pw: p.ratio, ph: 1, colors: {},
      box: ctx.box(`pic.${id}`, { x: S.x + (S.w - w) / 2, y: S.y + (S.h - h) / 2, w, h }) });
  }
  return out;
}

// Text a template left fixed (the boxes' own lines) can be moved and resized like the rest:
// the stored box applies and the type grows or shrinks with its height. Turned text keeps its pivot.
function freeText(e, ctx) {
  if (e.type !== 'text' || e.movable || e.rotate) return e;
  const box = ctx.box(e.id, e.box);
  const k = box === e.box || !e.box.h ? 1 : box.h / e.box.h;
  return { ...e, movable: true, resizable: true, box, size: e.size * k, minSize: e.minSize && e.minSize * k };
}

function renderContext(design, env, mode, labelOf) {
  let i = 0;
  return { design, text: env.text, defs: new Map(), used: new Set(), cmyk: new Map(), mode, labelOf, bleed: geometryBleed(design), uid: (p) => `${p}${++i}` };
}

function geometryBleed(design) {
  return Number(design.dims?.bleed ?? 3);
}

// Returns { svg, inner, defs, hits, used, geo, box } where box is the drawn area in mm.
// `art: false` draws only the dieline (the second page of the print PDF). `labelOf` turns
// the preview's own words (panel names, the window mark) into the editor's language; files
// for the printer always use the English ones.
export function renderSheet(design, env, { mode = 'design', margin = 0, dieline = true, guides = true, labels = true, art: withArt = true, inlineUses = false, labelOf = (s) => s } = {}) {
  const geo = geometry(design);
  const rc = renderContext(design, env, mode, labelOf);
  rc.inlineUses = inlineUses;
  // The construction lines print in pure process colours.
  const lines = dielineColors(geo);
  for (const hex of [lines.cut, lines.fold]) rc.cmyk.set(hex, cmykFromHex(hex).map((v) => (v >= 50 ? 100 : 0)));
  const b = geo.bleed;
  const parts = panelsWithElements(design, env, geo);
  let art = '';
  const hits = [];
  const windows = [];
  for (const { panel, elements } of withArt ? parts : []) {
    const r = panelArt(rc, panel, elements);
    art += el('g', { transform: `translate(${n(panel.x)} ${n(panel.y)})`, 'data-panel': mode === 'print' ? null : panel.id }, r.svg);
    for (const h of r.hits) hits.push({ ...h, panel: panel.id, box: { ...h.box, x: h.box.x + panel.x, y: h.box.y + panel.y } });
    for (const w of r.windows) windows.push({ ...w, px: panel.x, py: panel.y });
  }
  let over = '';
  if (mode === 'design') {
    // Dim the bleed: it is printed but cut away.
    const outer = rectPath(-b, -b, geo.size.w + 2 * b, geo.size.h + 2 * b);
    const trims = geo.trims
      ? geo.trims.map((d) => el('path', { d })).join('')
      : geo.panels.map((p) => p.lines.cut.map((d) => el('path', { d, transform: `translate(${n(p.x)} ${n(p.y)})` })).join('')).join('');
    over += el('mask', { id: 'bleed-mask' }, el('path', { d: outer, fill: '#fff' }) + el('g', { fill: '#000' }, trims));
    over += el('path', { d: outer, fill: '#ffffff', 'fill-opacity': 0.55, mask: 'url(#bleed-mask)' });
  }
  if (dieline) over += el('g', { id: mode === 'print' ? 'dieline' : null, 'data-layer': 'dieline' }, dielineSvg(geo, { style: mode === 'print' ? 'print' : guides ? 'design' : 'proof', windows }));
  if (mode === 'design' && labels && geo.labels !== false) {
    for (const p of geo.panels) {
      const t = env.text.layout({ text: labelOf(p.label).toUpperCase(), x: p.x + p.w / 2, y: p.y - b - 2.2, font: 'bold', size: 3.4, align: 'center', valign: 'baseline', spacing: 0.08 });
      over += el('g', { fill: '#7a7570' }, t.svg);
    }
  }
  const defs = [...rc.defs.values()].join('');
  // The overlay is for looking at; clicks go through to the artwork below.
  const inner = (defs ? el('defs', {}, defs) : '') + el('g', { id: mode === 'print' ? 'artwork' : null }, art)
    + (mode === 'design' ? el('g', { 'pointer-events': 'none' }, over) : over);
  const box = { x: -b - margin, y: -b - margin, w: geo.size.w + 2 * (b + margin), h: geo.size.h + 2 * (b + margin) };
  return { svg: wrapSvg(inner, box), inner, hits, used: rc.used, cmyk: rc.cmyk, geo, box, windows };
}

export function wrapSvg(inner, box, extra = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${Object.entries(extra).map(([k, v]) => ` ${k}="${v}"`).join('')} width="${n(box.w)}mm" height="${n(box.h)}mm" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">${inner}</svg>`;
}

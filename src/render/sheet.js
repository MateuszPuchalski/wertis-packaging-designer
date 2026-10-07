// A whole design as one SVG sheet: every panel's artwork in its place, plus the dieline.
//
//   mode 'design'  the editor preview: bleed dimmed, dieline, seals, safe area, panel names
//   mode 'print'   the file for the printer: artwork with bleed, a separate dieline group,
//                  windows left empty, nothing else
//   mode 'art'     artwork with the window marked (the proof and the mockups use it)
import { FORMATS, TEMPLATES } from '../registry.js';
import { el, n, rectPath } from './svg.js';
import { panelArt } from './artwork.js';
import { dielineSvg } from './dieline.js';

export function geometry(design) {
  return FORMATS[design.format].layout(design.dims);
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
    return { panel, elements: make ? make(ctx) : [] };
  });
}

function renderContext(design, env, mode) {
  let i = 0;
  return { design, text: env.text, defs: new Map(), used: new Set(), mode, bleed: geometryBleed(design), uid: (p) => `${p}${++i}` };
}

function geometryBleed(design) {
  return Number(design.dims?.bleed ?? 3);
}

// Returns { svg, inner, defs, hits, used, geo, box } where box is the drawn area in mm.
export function renderSheet(design, env, { mode = 'design', margin = 0, dieline = true, guides = true, labels = true } = {}) {
  const geo = geometry(design);
  const rc = renderContext(design, env, mode);
  const b = geo.bleed;
  const parts = panelsWithElements(design, env, geo);
  let art = '';
  const hits = [];
  const windows = [];
  for (const { panel, elements } of parts) {
    const r = panelArt(rc, panel, elements);
    art += el('g', { transform: `translate(${n(panel.x)} ${n(panel.y)})`, 'data-panel': mode === 'print' ? null : panel.id }, r.svg);
    for (const h of r.hits) hits.push({ ...h, panel: panel.id, box: { ...h.box, x: h.box.x + panel.x, y: h.box.y + panel.y } });
    for (const w of r.windows) windows.push({ ...w, px: panel.x, py: panel.y });
  }
  let over = '';
  if (mode === 'design') {
    // Dim the bleed: it is printed but cut away.
    const outer = rectPath(-b, -b, geo.size.w + 2 * b, geo.size.h + 2 * b);
    const trims = geo.panels.map((p) => p.lines.cut.map((d) => el('path', { d, transform: `translate(${n(p.x)} ${n(p.y)})` })).join('')).join('');
    over += el('mask', { id: 'bleed-mask' }, el('path', { d: outer, fill: '#fff' }) + el('g', { fill: '#000' }, trims));
    over += el('path', { d: outer, fill: '#ffffff', 'fill-opacity': 0.55, mask: 'url(#bleed-mask)' });
  }
  if (dieline) over += el('g', { id: mode === 'print' ? 'dieline' : null, 'data-layer': 'dieline' }, dielineSvg(geo, { style: mode === 'print' ? 'print' : guides ? 'design' : 'proof', windows }));
  if (mode === 'design' && labels) {
    for (const p of geo.panels) {
      const t = env.text.layout({ text: p.label.toUpperCase(), x: p.x + p.w / 2, y: p.y - b - 2.2, font: 'bold', size: 3.4, align: 'center', valign: 'baseline', spacing: 0.08 });
      over += el('g', { fill: '#7a7570' }, t.svg);
    }
  }
  const defs = [...rc.defs.values()].join('');
  // The overlay is for looking at; clicks go through to the artwork below.
  const inner = (defs ? el('defs', {}, defs) : '') + el('g', { id: mode === 'print' ? 'artwork' : null }, art)
    + (mode === 'design' ? el('g', { 'pointer-events': 'none' }, over) : over);
  const box = { x: -b - margin, y: -b - margin, w: geo.size.w + 2 * (b + margin), h: geo.size.h + 2 * (b + margin) };
  return { svg: wrapSvg(inner, box), inner, hits, used: rc.used, geo, box, windows };
}

export function wrapSvg(inner, box, extra = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${Object.entries(extra).map(([k, v]) => ` ${k}="${v}"`).join('')} width="${n(box.w)}mm" height="${n(box.h)}mm" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">${inner}</svg>`;
}

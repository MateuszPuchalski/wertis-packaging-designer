// Realistic previews for the Mockup tab and the PNG export: the finished pouch with the
// product photo seen through the window film, gloss, crimped seals, the zip ridge, the hang
// hole cut through, and a soft shadow. (Filters and gradients are fine here: a mockup is
// only ever a picture, never a print file.)
import { el, n, rectPath } from './svg.js';
import { geometry, panelsWithElements, wrapSvg } from './sheet.js';
import { panelArt } from './artwork.js';
import { PATTERN_ICONS } from '../brand/patternIcons.js';

export const MOCKUP_VIEWS = [['front', 'Front'], ['back', 'Back'], ['both', 'Front and back']];

function rc(design, env) {
  let i = 0;
  return { design, text: env.text, defs: new Map(), used: new Set(), mode: 'mockup', bleed: 0, uid: (p) => `m${p}${++i}` };
}

// The product behind the window: the photo (cover-fitted, then zoomed and moved by the
// user), or a placeholder fuel-filter icon when there is no photo yet.
function productLayer(win, photo) {
  const { x, y, w, h } = win.box;
  if (photo?.src) {
    const pw = photo.w || 1000, ph = photo.h || 1000;
    const zoom = photo.zoom ?? 1;
    const s = Math.max(w / pw, h / ph) * zoom;
    const iw = pw * s, ih = ph * s;
    const ix = x + (w - iw) / 2 + (photo.dx ?? 0) * w, iy = y + (h - ih) / 2 + (photo.dy ?? 0) * h;
    return el('image', { href: photo.src, x: ix, y: iy, width: iw, height: ih, preserveAspectRatio: 'none' });
  }
  const icon = PATTERN_ICONS.find((i) => i.id === 'fuelFilter') ?? PATTERN_ICONS[0];
  const s = (Math.min(w, h) * 0.78) / 100;
  return el('g', { transform: `translate(${n(x + w / 2)} ${n(y + h / 2)}) rotate(-12) scale(${n(s)})`, fill: '#3a3a3c' }, icon.paths.map((p) => el('path', { 'fill-rule': p.rule, d: p.d })).join(''));
}

// Fine crimp lines across a seal strip.
function crimp(x, y, w, h, vertical) {
  let d = '';
  const step = 0.9;
  if (vertical) for (let yy = y + step / 2; yy < y + h; yy += step) d += `M${n(x)} ${n(yy)}h${n(w)}`;
  else for (let xx = x + step / 2; xx < x + w; xx += step) d += `M${n(xx)} ${n(y)}v${n(h)}`;
  return d;
}

function pouchFace(design, env, part, ctx, defs, ids) {
  const { panel, elements } = part;
  const W = panel.w, H = panel.h;
  const dims = design.dims;
  const art = panelArt(ctx, { ...panel, bleedSides: { l: false, t: false, r: false, b: false } }, elements);
  const outline = panel.lines.cut[0];
  const holes = panel.lines.holes.join('');
  const clipId = ids('face');
  defs.push(el('clipPath', { id: clipId }, el('path', { d: outline + holes, 'clip-rule': 'evenodd' })));
  const photo = design.mockup?.photo;
  let inside = '';
  for (const w of art.windows) {
    // What shows through: the inside of the back panel (white film) or, with a matching
    // back window, the background; then the product; then the film's sheen.
    const seeThrough = elements.some((e) => e.type === 'window' && e.id !== w.id) ? 'none' : '#f4f3f1';
    const wClip = ids('win');
    defs.push(el('clipPath', { id: wClip }, el('path', { d: w.d })));
    inside += el('g', { 'clip-path': `url(#${wClip})` },
      (seeThrough === 'none' ? '' : el('path', { d: rectPath(w.box.x, w.box.y, w.box.w, w.box.h), fill: seeThrough }))
      + el('g', { filter: `url(#${ids.shadowSoft})` }, productLayer(w, photo)));
  }
  const gloss = ids('gloss'), shade = ids('shade'), glare = ids('glare');
  defs.push(
    el('linearGradient', { id: gloss, x1: 0, y1: 0, x2: 1, y2: 1 },
      [[0, '#ffffff', 0.0], [0.28, '#ffffff', 0.16], [0.36, '#ffffff', 0.02], [0.62, '#ffffff', 0.0], [0.78, '#ffffff', 0.1], [1, '#ffffff', 0]]
        .map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })).join('')),
    el('radialGradient', { id: shade, cx: 0.5, cy: 0.55, r: 0.75 },
      [[0, '#000000', 0], [0.7, '#000000', 0.06], [1, '#000000', 0.22]].map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })).join('')),
    el('linearGradient', { id: glare, x1: 0, y1: 0, x2: 1, y2: 0.6 },
      [[0, '#ffffff', 0.0], [0.42, '#ffffff', 0.0], [0.47, '#ffffff', 0.38], [0.53, '#ffffff', 0.05], [0.6, '#ffffff', 0.18], [0.64, '#ffffff', 0], [1, '#ffffff', 0]]
        .map(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a })).join('')),
  );
  let film = el('path', { d: rectPath(0, 0, W, H), fill: `url(#${shade})` }) + el('path', { d: rectPath(0, 0, W, H), fill: `url(#${gloss})` });
  for (const w of art.windows) film += el('path', { d: w.d, fill: `url(#${glare})` }) + el('path', { d: w.d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 0.6 });
  // Seals and zip.
  const seal = dims.sideSeal ?? 0, bottom = dims.bottomSeal ?? 0, top = dims.topSeal ?? 0;
  let marks = '';
  const cr = crimp(0, 0, seal, H, true) + crimp(W - seal, 0, seal, H, true) + crimp(0, H - bottom, W, bottom, false) + crimp(0, 0, W, top, false);
  if (cr) marks += el('path', { d: cr, stroke: '#000000', 'stroke-opacity': 0.12, 'stroke-width': 0.3, fill: 'none' });
  for (const z of panel.lines.zip) {
    marks += el('path', { d: rectPath(seal, z.y - z.w / 2, W - 2 * seal, z.w), fill: '#000000', 'fill-opacity': 0.05 })
      + el('path', { d: `M${n(seal)} ${n(z.y - z.w * 0.18)}H${n(W - seal)}`, stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': z.w * 0.18 })
      + el('path', { d: `M${n(seal)} ${n(z.y + z.w * 0.2)}H${n(W - seal)}`, stroke: '#000000', 'stroke-opacity': 0.18, 'stroke-width': z.w * 0.14 });
  }
  marks += el('path', { d: outline, fill: 'none', stroke: '#000000', 'stroke-opacity': 0.25, 'stroke-width': 0.4 });
  for (const hd of panel.lines.holes) marks += el('path', { d: hd, fill: 'none', stroke: '#000000', 'stroke-opacity': 0.35, 'stroke-width': 0.5 });

  return el('g', { 'clip-path': `url(#${clipId})` }, inside + art.svg + film + marks);
}

export function mockupSvg(design, env) {
  const geo = geometry(design);
  const parts = panelsWithElements(design, env, geo);
  const ctx = rc(design, env);
  const view = design.mockup?.view ?? 'front';
  const shown = parts.filter((p) => (view === 'both' ? true : p.panel.role === view));
  const faces = shown.length ? shown : parts.slice(0, 1);
  const defs = [];
  let k = 0;
  const ids = (p) => `${p}${++k}`;
  ids.shadow = 'mk-shadow';
  ids.shadowSoft = 'mk-shadow-soft';
  const W = faces[0].panel.w, H = faces[0].panel.h;
  const gap = W * 0.12;
  const total = faces.length * W + (faces.length - 1) * gap;
  const m = Math.max(W, H) * 0.16;
  const box = { x: -m, y: -m, w: total + 2 * m, h: H + 2 * m };
  defs.push(
    el('filter', { id: ids.shadow, x: '-20%', y: '-20%', width: '140%', height: '140%' }, el('feGaussianBlur', { stdDeviation: n(Math.max(W, H) * 0.018) })),
    el('filter', { id: ids.shadowSoft, x: '-10%', y: '-10%', width: '120%', height: '120%' }, el('feDropShadow', { dx: 0, dy: n(Math.min(W, H) * 0.012), stdDeviation: n(Math.min(W, H) * 0.012), 'flood-opacity': 0.35 })),
  );
  const angle = Number(design.mockup?.angle ?? 0);
  let body = '';
  faces.forEach((part, i) => {
    const x = i * (W + gap);
    const face = pouchFace(design, env, part, ctx, defs, ids);
    const holes = part.panel.lines.holes.join('');
    const shadowClip = ids('sh');
    defs.push(el('clipPath', { id: shadowClip }, el('path', { d: rectPath(-m, -m, W + 2 * m, H + 2 * m) + holes, 'clip-rule': 'evenodd' })));
    const shadow = el('path', { d: part.panel.lines.cut[0], fill: '#000000', 'fill-opacity': 0.32, filter: `url(#${ids.shadow})`, transform: `translate(${n(W * 0.012)} ${n(H * 0.022)})` });
    const tilt = angle ? ` rotate(${n(i % 2 ? -angle : angle)} ${n(W / 2)} ${n(H / 2)})` : '';
    body += el('g', { transform: `translate(${n(x)} 0)${tilt}` }, el('g', { 'clip-path': `url(#${shadowClip})` }, shadow) + face);
  });
  const bg = design.mockup?.background ?? '#e8e4dc';
  const backdrop = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: bg })
    + el('ellipse', { cx: n(total / 2), cy: n(H * 0.45), rx: n(total * 0.8), ry: n(H * 0.75), fill: '#ffffff', 'fill-opacity': 0.25 });
  const allDefs = [...ctx.defs.values(), ...defs].join('');
  return { svg: wrapSvg(el('defs', {}, allDefs) + backdrop + body, box), box };
}


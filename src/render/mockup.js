// Realistic previews for the Mockup tab and the PNG export: the finished pouch with the
// product photo seen through the window film, gloss, crimped seals, the zip ridge, the hang
// hole cut through, and a soft shadow. (Filters and gradients are fine here: a mockup is
// only ever a picture, never a print file.)
import { el, n, rectPath } from './svg.js';
import { geometry, panelsWithElements, wrapSvg } from './sheet.js';
import { panelArt } from './artwork.js';

export const MOCKUP_VIEWS = [['front', 'Front'], ['back', 'Back'], ['both', 'Front and back']];

export function rc(design, env) {
  let i = 0;
  return { design, text: env.text.view(design.fonts), defs: new Map(), used: new Set(), mode: 'mockup', bleed: 0, uid: (p) => `m${p}${++i}` };
}

// The product behind the window: the photo, cover-fitted, then zoomed and moved by the
// user. Without a photo the window stays empty: just the clear film.
export function productLayer(win, photo) {
  if (!photo?.src) return '';
  const { x, y, w, h } = win.box;
  const pw = photo.w || 1000, ph = photo.h || 1000;
  const zoom = photo.zoom ?? 1;
  const s = Math.max(w / pw, h / ph) * zoom;
  const iw = pw * s, ih = ph * s;
  const ix = x + (w - iw) / 2 + (photo.dx ?? 0) * w, iy = y + (h - ih) / 2 + (photo.dy ?? 0) * h;
  return el('image', { href: photo.src, x: ix, y: iy, width: iw, height: ih, preserveAspectRatio: 'none' });
}

export function standUpOutline(W, H, zone, r) {
  const y = H - zone * 0.55;
  return `M0 ${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0H${n(W - r)}A${n(r)} ${n(r)} 0 0 1 ${n(W)} ${n(r)}V${n(y)}Q${n(W / 2)} ${n(y + zone * 0.5)} 0 ${n(y)}Z`;
}

// Fine crimp lines across a seal strip.
function crimp(x, y, w, h, vertical) {
  let d = '';
  const step = 0.9;
  if (vertical) for (let yy = y + step / 2; yy < y + h; yy += step) d += `M${n(x)} ${n(yy)}h${n(w)}`;
  else for (let xx = x + step / 2; xx < x + w; xx += step) d += `M${n(xx)} ${n(y)}v${n(h)}`;
  return d;
}

// The finished face of a pouch. `open`: for the 3D view, the windows are left clear (the
// view puts the film, the inside and the part behind them itself).
export function pouchFace(design, env, part, ctx, defs, ids, { open = false } = {}) {
  const { panel, elements } = part;
  const W = panel.w, H = panel.h;
  const dims = design.dims;
  const art = panelArt(ctx, { ...panel, bleedSides: { l: false, t: false, r: false, b: false } }, elements);
  const zone = panel.info?.bottomZone ?? 0;
  // A stand-up pouch's bottom curves under: the face ends in a shallow bulge part-way into
  // the gusset zone.
  const outline = zone ? standUpOutline(W, H, zone, dims.corner ?? 0) : panel.lines.cut[0];
  const holes = panel.lines.holes.join('');
  const clipId = ids('face');
  defs.push(el('clipPath', { id: clipId }, el('path', { d: outline + holes, 'clip-rule': 'evenodd' })));
  const photo = design.mockup?.photo;
  let inside = '';
  for (const w of open ? [] : art.windows) {
    // What shows through: the inside of the back panel (white film) or, with a matching
    // back window, the background; then the product; then the film's sheen.
    const seeThrough = elements.some((e) => e.type === 'window' && e.id !== w.id) ? 'none' : '#f4f3f1';
    const wClip = ids('win');
    defs.push(el('clipPath', { id: wClip }, el('path', { d: w.d })));
    inside += el('g', { 'clip-path': `url(#${wClip})` },
      (seeThrough === 'none' ? '' : el('path', { d: rectPath(w.box.x, w.box.y, w.box.w, w.box.h), fill: seeThrough }))
      + (photo?.src ? el('g', { filter: `url(#${ids.shadowSoft})` }, productLayer(w, photo)) : ''));
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
  if (zone) {
    const curve = ids('curve');
    const top = (H - zone * 1.6) / H;
    defs.push(el('linearGradient', { id: curve, x1: 0, y1: 0, x2: 0, y2: 1 },
      [[0, 0], [top, 0], [1, 0.38]].map(([o, a]) => el('stop', { offset: o, 'stop-color': '#000000', 'stop-opacity': a })).join('')));
    film += el('path', { d: rectPath(0, 0, W, H), fill: `url(#${curve})` });
  }
  for (const w of open ? [] : art.windows) film += el('path', { d: w.d, fill: `url(#${glare})` }) + el('path', { d: w.d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': 0.6 });
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

// A box in a three-quarter view: one wall facing you, the next wall to the right and the lid
// on top, each drawn from the flat artwork through an affine transform (so it is exact and
// exports cleanly). "Back" turns the box round.
function boxMockup(design, env, geo, parts) {
  const ctx = rc(design, env);
  const body = parts.find((p) => p.panel.role === 'boxBody');
  const lid = parts.find((p) => p.panel.role === 'boxLid');
  const flat = (part) => panelArt(ctx, { ...part.panel, bleedSides: { l: false, t: false, r: false, b: false } }, part.elements).svg;
  const bodyArt = flat(body), lidArt = flat(lid);
  const { length: L, width: W, height: H } = geo.dims;
  const faces = body.panel.info.faces;
  const cx = Math.cos(Math.PI / 6) * 0.72, cy = Math.sin(Math.PI / 6) * 0.72;
  const views = (design.mockup?.view ?? 'front') === 'both' ? ['front', 'back'] : [(design.mockup?.view === 'back' ? 'back' : 'front')];
  const defs = [];
  let k = 0;
  const clip = (d) => { const id = `bx${++k}`; defs.push(el('clipPath', { id }, el('path', { d }))); return `url(#${id})`; };
  const spanW = L + W * cx;
  const gap = spanW * 0.25;
  let body3d = '';
  views.forEach((view, i) => {
    const ox = i * (spanW + gap);
    const [fa, fb] = view === 'front' ? [faces[2], faces[3]] : [faces[0], faces[1]];
    // Facing wall: body coordinates shifted so the wall starts at 0.
    const facing = el('g', { transform: `translate(${n(-fa.x)} 0)` }, el('g', { 'clip-path': clip(rectPath(fa.x, 0, fa.w, H)) }, bodyArt));
    // Side wall: x runs away from the viewer.
    const side = el('g', { transform: `matrix(${n(cx)} ${n(-cy)} 0 1 ${n(L - fb.x * cx)} ${n(fb.x * cy)})` },
      el('g', { 'clip-path': clip(rectPath(fb.x, 0, fb.w, H)) }, bodyArt + el('path', { d: rectPath(fb.x, 0, fb.w, H), fill: '#000000', 'fill-opacity': 0.2 })));
    // Lid: its tuck edge is at the front; seen from the back the hinge is nearest.
    const lt = view === 'front' ? `matrix(-1 0 ${n(cx)} ${n(-cy)} ${n(L)} 0)` : `matrix(1 0 ${n(-cx)} ${n(cy)} ${n(W * cx)} ${n(-W * cy)})`;
    const top = el('g', { transform: lt }, el('g', { 'clip-path': clip(rectPath(0, 0, L, W)) }, lidArt + el('path', { d: rectPath(0, 0, L, W), fill: '#ffffff', 'fill-opacity': 0.08 })));
    const edges = `M0 0H${n(L)}V${n(H)}H0Z M${n(L)} 0l${n(W * cx)} ${n(-W * cy)}V${n(H - W * cy)}L${n(L)} ${n(H)} M0 0l${n(W * cx)} ${n(-W * cy)}H${n(L + W * cx)}`;
    const shadow = el('path', { d: `M${n(-L * 0.04)} ${n(H)}L${n(L + W * cx * 1.1)} ${n(H - W * cy * 0.9)}L${n(L + W * cx * 1.6)} ${n(H + H * 0.05)}L${n(L * 0.25)} ${n(H + H * 0.12)}Z`, fill: '#000000', 'fill-opacity': 0.35, filter: 'url(#mk-shadow)' });
    body3d += el('g', { transform: `translate(${n(ox)} 0)` }, shadow + facing + side + top + el('path', { d: edges, fill: 'none', stroke: '#000000', 'stroke-opacity': 0.25, 'stroke-width': 0.35, 'stroke-linejoin': 'round' }));
  });
  const total = views.length * spanW + (views.length - 1) * gap;
  const m = Math.max(total, H) * 0.14;
  const box = { x: -m, y: -W * cy - m, w: total + 2 * m, h: H + W * cy + 2 * m + H * 0.1 };
  defs.push(el('filter', { id: 'mk-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, el('feGaussianBlur', { stdDeviation: n(Math.max(L, H) * 0.03) })));
  const bg = design.mockup?.background ?? '#e8e4dc';
  const backdrop = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: bg })
    + el('ellipse', { cx: n(total / 2), cy: n(H * 0.3), rx: n(total * 0.8), ry: n((H + W * cy) * 0.9), fill: '#ffffff', 'fill-opacity': 0.25 });
  return { svg: wrapSvg(el('defs', {}, [...ctx.defs.values(), ...defs].join('')) + backdrop + body3d, box), box };
}

// An imported dieline has no folded pack to show: the flat sheet as it will print, with a soft shadow.
function sheetMockup(design, env, geo, parts) {
  const ctx = rc(design, env);
  const part = parts[0];
  const W = part.panel.w, H = part.panel.h;
  const m = Math.max(W, H) * 0.08;
  const box = { x: -m, y: -m, w: W + 2 * m, h: H + 2 * m };
  const art = panelArt(ctx, { ...part.panel, bleedSides: { l: false, t: false, r: false, b: false } }, part.elements).svg;
  const defs = el('filter', { id: 'mk-sheet-shadow', x: '-10%', y: '-10%', width: '120%', height: '120%' }, el('feDropShadow', { dx: 0, dy: n(H * 0.012), stdDeviation: n(H * 0.012), 'flood-opacity': 0.35 }));
  const bg = design.mockup?.background ?? '#e8e4dc';
  const body = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: bg })
    + el('g', { filter: 'url(#mk-sheet-shadow)' }, el('path', { d: rectPath(0, 0, W, H), fill: '#ffffff' })) + art;
  return { svg: wrapSvg(el('defs', {}, [...ctx.defs.values(), defs].join('')) + body, box), box };
}

export function mockupSvg(design, env) {
  const geo = geometry(design);
  const parts = panelsWithElements(design, env, geo);
  if (geo.format === 'tuckBox') return boxMockup(design, env, geo, parts);
  if (geo.format === 'customDieline') return sheetMockup(design, env, geo, parts);
  const ctx = rc(design, env);
  const view = design.mockup?.view ?? 'front';
  const faces0 = parts.filter((p) => p.panel.role === 'front' || p.panel.role === 'back');
  const shown = faces0.filter((p) => (view === 'both' ? true : p.panel.role === view));
  const faces = shown.length ? shown : faces0.slice(0, 1);
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
    const zone = part.panel.info?.bottomZone ?? 0;
    const shadow = zone
      ? el('ellipse', { cx: n(W / 2), cy: n(H - zone * 0.4), rx: n(W * 0.56), ry: n(zone * 0.3), fill: '#000000', 'fill-opacity': 0.4, filter: `url(#${ids.shadow})` })
      : el('path', { d: part.panel.lines.cut[0], fill: '#000000', 'fill-opacity': 0.32, filter: `url(#${ids.shadow})`, transform: `translate(${n(W * 0.012)} ${n(H * 0.022)})` });
    const tilt = angle ? ` rotate(${n(i % 2 ? -angle : angle)} ${n(W / 2)} ${n(H / 2)})` : '';
    body += el('g', { transform: `translate(${n(x)} 0)${tilt}` }, el('g', { 'clip-path': `url(#${shadowClip})` }, shadow) + face);
  });
  const bg = design.mockup?.background ?? '#e8e4dc';
  const backdrop = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: bg })
    + el('ellipse', { cx: n(total / 2), cy: n(H * 0.45), rx: n(total * 0.8), ry: n(H * 0.75), fill: '#ffffff', 'fill-opacity': 0.25 });
  const allDefs = [...ctx.defs.values(), ...defs].join('');
  return { svg: wrapSvg(el('defs', {}, allDefs) + backdrop + body, box), box };
}


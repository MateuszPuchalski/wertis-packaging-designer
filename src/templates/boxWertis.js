// The WERTIS box look, from the W09-0414 carburettor box and the generic "CZĘŚCI ZAMIENNE /
// SPARE PARTS" box: orange board with the tonal parts pattern everywhere, a black band with
// silver edges running round all four walls, and the lid with the white WERTIS word.
//
// Two templates share this file:
//   boxProduct  the product box. Back: technical data on the band, "Produced for", the
//               recycling marks and the EAN. Sides: the QR code and the website. Front: the
//               product name and subtitle on the band, the code above it, the EAN below.
//   boxGeneric  the generic box. Back: "CZĘŚCI ZAMIENNE / SPARE PARTS". Front: the white
//               logo on the band with the gear sitting on its top edge.
import { clamp } from '../render/svg.js';
import { MATERIALS } from '../brand/marks.js';
import { fitLogo, partBox, taglineUnder } from '../brand/logo.js';
import { num, choice, toggle } from '../formats/common.js';

export const OPTIONS = [
  num('bandTopPct', 'Band starts at', 35, 5, 80, 1, { unit: '%' }),
  num('bandPct', 'Band height', 38, 15, 80, 1, { unit: '%' }),
  toggle('silverEdges', 'Silver edges on the band', true),
  num('taglineSize', '“Quality You Can Trust” size', 100, 40, 300, 5, { unit: '%' }),
  choice('recycle', 'Recycling mark', 'pap21', Object.entries(MATERIALS).map(([k, m]) => [k, m.label])),
  toggle('tidyman', 'Tidyman (bin) mark', true),
  toggle('lidPhoto', 'Product photo on the lid (from Mockup)', false),
];

const WHITE = { fill: 'white' };

function band(ctx) {
  const H = ctx.panel.h;
  const top = H * clamp(ctx.options.bandTopPct / 100, 0.02, 0.9);
  const h = Math.min(H * clamp(ctx.options.bandPct / 100, 0.1, 0.95), H - top - 1);
  return { top, h, bottom: top + h, edge: clamp(H * 0.022, 0.5, 2) };
}

function walls(ctx) {
  const { w: W, h: H } = ctx.panel;
  const B = band(ctx);
  const els = [
    { id: 'body.fill', label: 'Board colour', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: H }, colors: { fill: 'boxOrange' } },
    { id: 'body.pattern', label: 'Pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: H }, colors: { ink: 'orangeTone' } },
    { id: 'body.band', label: 'Black band', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: B.top, w: W, h: B.h }, colors: { fill: 'black' } },
  ];
  if (ctx.options.silverEdges) {
    els.push(
      { id: 'body.edgeTop', label: 'Silver edge (top)', type: 'silver', layer: 'bg', bleed: true, box: { x: 0, y: B.top, w: W, h: B.edge }, colors: { fill: 'silver' } },
      { id: 'body.edgeBottom', label: 'Silver edge (bottom)', type: 'silver', layer: 'bg', bleed: true, box: { x: 0, y: B.bottom - B.edge, w: W, h: B.edge }, colors: { fill: 'silver' } },
    );
  }
  return { els, B };
}

// Pieces both templates use.
function produced(ctx, id, f, B) {
  const c = ctx.design.content;
  const top = B.bottom + 1;
  return { id, label: 'Produced for', type: 'text', layer: 'fg', font: 'regular', align: 'left', valign: 'middle', lineHeight: 1.22,
    text: [c.producedFor, c.company, c.address, c.email].filter(Boolean).join('\n'),
    box: { x: f.safe.x, y: top, w: f.safe.w * 0.5, h: f.safe.y + f.safe.h - top }, size: (ctx.panel.h * 0.045) / 0.7, minSize: 1.1, colors: WHITE };
}

function marks(ctx, id, box) {
  const material = MATERIALS[ctx.options.recycle];
  const list = [material?.code ? 'recycle' : null, ctx.options.tidyman ? 'tidyman' : null].filter(Boolean);
  if (!list.length) return [];
  const size = Math.min(box.h, box.w / (list.length * 1.25));
  return [{ id, label: 'Recycling marks', type: 'marks', layer: 'fg', marks: list, material, movable: true, resizable: true, keepAspect: true,
    box: ctx.box(id, { x: box.x, y: box.y + (box.h - size) / 2, w: size * (list.length + (list.length - 1) * 0.25), h: size }), colors: { fill: 'black' } }];
}

function ean(ctx, id, f, B) {
  const c = ctx.design.content;
  if (!c.ean) return [];
  const h = Math.min(ctx.panel.h * 0.36, f.safe.y + f.safe.h - B.top - B.h * 0.6);
  return [{ id, label: 'EAN barcode', type: 'ean', layer: 'fg', code: c.ean, bars: 0.72, movable: true, resizable: true, keepAspect: true,
    box: ctx.box(id, { x: f.safe.x + f.safe.w * 0.48, y: f.safe.y + f.safe.h - h, w: f.safe.w * 0.52, h }), align: 'right', valign: 'bottom',
    colors: { bars: 'black', bg: 'white' } }];
}

function qr(ctx, id, f, B) {
  const size = Math.min(B.h * 0.84, f.safe.w * 0.8);
  return { id, label: 'QR code', type: 'qr', layer: 'fg', text: ctx.design.content.qr, movable: true, resizable: true, keepAspect: true,
    box: ctx.box(id, { x: f.x + (f.w - size) / 2, y: B.top + (B.h - size) / 2, w: size, h: size }), colors: { dots: 'black', bg: 'white' } };
}

function url(ctx, id, box) {
  return { id, label: 'Website', type: 'text', layer: 'fg', text: ctx.design.content.url, font: 'regular', align: 'center', valign: 'middle', box, size: box.h / 0.7, minSize: 1.2, colors: WHITE };
}

function sku(ctx, id, f, B) {
  const top = f.safe.y;
  return { id, label: 'Product code', type: 'text', layer: 'fg', text: ctx.design.content.sku, font: 'regular', align: 'right', valign: 'middle', spacing: 0.02,
    box: { x: f.safe.x, y: top, w: f.safe.w, h: Math.max(B.top - top - 1, 2) }, size: Math.min(Math.max(B.top - top - 1, 2) * 0.42, ctx.panel.h * 0.08) / 0.7, minSize: 1.4, colors: WHITE };
}

function faceOf(ctx, id) {
  return ctx.panel.info.faces.find((f) => f.id === id);
}

export function productBody(ctx) {
  const c = ctx.design.content;
  const { els, B } = walls(ctx);
  const back = faceOf(ctx, 'back'), s1 = faceOf(ctx, 'side1'), front = faceOf(ctx, 'front'), s2 = faceOf(ctx, 'side2');
  const pad = Math.min(B.h * 0.12, 4);
  const below = { y: B.bottom + 1, h: back.safe.y + back.safe.h - B.bottom - 1 };

  // Back: technical data on the band.
  els.push(sku(ctx, 'back.sku', back, B));
  const specs = (Array.isArray(c.specs) ? c.specs : String(c.specs ?? '').split('\n')).filter((x) => String(x).trim());
  const titleH = B.h * 0.17;
  els.push({ id: 'back.specsTitle', label: 'Technical data heading', type: 'text', layer: 'fg', text: c.specsTitle, font: 'semibold', align: 'left', valign: 'top',
    box: { x: back.safe.x, y: B.top + pad, w: back.safe.w, h: titleH }, size: titleH / 0.7, minSize: 1.3, colors: WHITE });
  if (specs.length) {
    const top = B.top + pad + titleH * 1.5;
    els.push({ id: 'back.specs', label: 'Technical data', type: 'text', layer: 'fg', text: specs.map((x) => `•  ${x}`).join('\n'), font: 'regular', align: 'left', valign: 'top', lineHeight: 1.3,
      box: { x: back.safe.x + back.safe.w * 0.04, y: top, w: back.safe.w * 0.94, h: B.bottom - pad - top }, size: (B.h * 0.12) / 0.7, minSize: 1.1, colors: WHITE });
  }
  els.push(produced(ctx, 'back.address', back, B));
  els.push(...marks(ctx, 'back.marks', { x: back.safe.x + back.safe.w * 0.5, y: below.y, w: back.safe.w * 0.2, h: Math.min(below.h, back.safe.w * 0.1) }));
  els.push(...ean(ctx, 'back.ean', back, B).map((e) => ({ ...e, box: ctx.box('back.ean', { ...e.box, x: back.safe.x + back.safe.w * 0.72, w: back.safe.w * 0.28 }) })));

  // Sides: QR code on the band, the website under it (the right side also has the marks).
  const urlH = Math.min(below.h * 0.32, s1.safe.w * 0.07);
  els.push(qr(ctx, 'side1.qr', s1, B), qr(ctx, 'side2.qr', s2, B));
  els.push(url(ctx, 'side1.url', { x: s1.safe.x, y: below.y + (below.h - urlH) / 2, w: s1.safe.w, h: urlH }));
  const m = marks(ctx, 'side2.marks', { x: s2.safe.x, y: below.y, w: s2.safe.w * 0.28, h: Math.min(below.h, s2.safe.w * 0.12) });
  els.push(...m);
  const ux = m.length ? m[0].box.x + m[0].box.w + 1.5 : s2.safe.x;
  els.push(url(ctx, 'side2.url', { x: ux, y: below.y + (below.h - urlH) / 2, w: s2.safe.x + s2.safe.w - ux, h: urlH }));

  // Front: product name and subtitle on the band, code above, EAN below.
  els.push(sku(ctx, 'front.sku', front, B));
  els.push({ id: 'front.name', label: 'Product name', type: 'text', layer: 'fg', text: c.productName?.[c.lang] ?? '', font: 'bold', align: 'left', valign: 'top', wrap: true, maxLines: 2, lineHeight: 1.1,
    box: { x: front.safe.x, y: B.top + B.h * 0.18, w: front.safe.w, h: B.h * 0.4 }, size: (B.h * 0.24) / 0.7, minSize: 1.8, colors: WHITE });
  els.push({ id: 'front.subtitle', label: 'Subtitle', type: 'text', layer: 'fg', text: c.subtitle, font: 'regular', align: 'left', valign: 'top',
    box: { x: front.safe.x, y: B.top + B.h * 0.62, w: front.safe.w, h: B.h * 0.18 }, size: (B.h * 0.18) / 0.7, minSize: 1.4, colors: WHITE });
  els.push(produced(ctx, 'front.address', front, B));
  els.push(...ean(ctx, 'front.ean', front, B).map((e) => ({ ...e, box: ctx.box('front.ean', { ...e.box, x: front.safe.x + front.safe.w * 0.72, w: front.safe.w * 0.28 }) })));
  return els;
}

export function genericBody(ctx) {
  const c = ctx.design.content;
  const { els, B } = walls(ctx);
  const back = faceOf(ctx, 'back'), s1 = faceOf(ctx, 'side1'), front = faceOf(ctx, 'front'), s2 = faceOf(ctx, 'side2');
  const below = { y: B.bottom + 1, h: back.safe.y + back.safe.h - B.bottom - 1 };

  els.push({ id: 'back.category', label: 'Category', type: 'text', layer: 'fg', text: c.category, font: 'bold', align: 'center', valign: 'middle',
    box: { x: back.safe.x, y: B.top + B.h * 0.16, w: back.safe.w, h: B.h * 0.3 }, size: (B.h * 0.3) / 0.7, minSize: 1.6, colors: WHITE });
  els.push({ id: 'back.categoryEn', label: 'Category (English)', type: 'text', layer: 'fg', text: c.categoryEn, font: 'bold', align: 'center', valign: 'middle',
    box: { x: back.safe.x, y: B.top + B.h * 0.56, w: back.safe.w, h: B.h * 0.24 }, size: (B.h * 0.24) / 0.7, minSize: 1.4, colors: WHITE });
  els.push(produced(ctx, 'back.address', back, B));

  els.push(qr(ctx, 'side1.qr', s1, B));
  els.push(url(ctx, 'side1.url', { x: s1.safe.x, y: below.y + below.h * 0.12, w: s1.safe.w, h: Math.min(below.h * 0.3, s1.safe.w * 0.07) }));
  els.push(...marks(ctx, 'side1.marks', { x: s1.safe.x, y: below.y + below.h * 0.5, w: s1.safe.w * 0.4, h: below.h * 0.5 }));

  // Front: the white WERTIS on the band, the dark gear on the band's top edge, the tagline.
  const logoBox = ctx.box('front.logo', { x: front.safe.x + front.safe.w * 0.1, y: B.top + B.h * 0.18, w: front.safe.w * 0.8, h: B.h * 0.5 });
  const fit = fitLogo(logoBox, 'word');
  els.push({ id: 'front.logo', label: 'Logo', type: 'logo', layer: 'fg', layout: 'word', movable: true, resizable: true, keepAspect: true, box: logoBox,
    colors: { gear: 'white', arc: 'white', word: 'white', line: 'white' } });
  const markW = fit.w * 0.5;
  els.push({ id: 'front.gear', label: 'Gear', type: 'logo', layer: 'fg', layout: 'mark', align: 'center', valign: 'bottom',
    box: { x: fit.x + (fit.w - markW) / 2, y: B.top - markW * 0.19 + B.edge, w: markW, h: markW * 0.19 }, colors: { gear: 'black', arc: { none: true }, word: 'black', line: 'black' } });
  const tag = taglineUnder(partBox(fit, 'word'), { scale: (ctx.options.taglineSize ?? 100) / 100, ratio: 0.22 });
  els.push({ id: 'front.tagline', label: 'Tagline', type: 'text', layer: 'fg', text: c.tagline, font: 'condSemibold', align: 'right', valign: 'top', spacing: 0.02,
    box: tag.box, size: tag.size, minSize: 1.2, colors: WHITE });
  els.push(produced(ctx, 'side2.address', s2, B));
  return els;
}

// The lid: everything turned 180°, so it reads the right way once the box is closed.
export function lid(ctx) {
  const { w: L, h: W } = ctx.panel;
  const c = ctx.design.content;
  const S = ctx.panel.info.safe;
  const pivot = { x: L / 2, y: W / 2 };
  const els = [
    { id: 'lid.fill', label: 'Lid colour', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: L, h: W }, colors: { fill: 'boxOrange' } },
    { id: 'lid.pattern', label: 'Lid pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: L, h: W }, colors: { ink: 'orangeTone' } },
  ];
  const photo = ctx.design.mockup?.photo;
  const hasPhoto = ctx.options.lidPhoto && photo?.src;
  // Laid out upright, then turned: the photo above, the logo below.
  const logoBox = { x: S.x + S.w * 0.06, y: hasPhoto ? S.y + S.h * 0.55 : S.y + S.h * 0.22, w: S.w * 0.88, h: hasPhoto ? S.h * 0.3 : S.h * 0.42 };
  if (hasPhoto) {
    els.push({ id: 'lid.photo', label: 'Product photo', type: 'image', layer: 'fg', rotate: 180, pivot, src: photo.src, pw: photo.w, ph: photo.h,
      box: { x: S.x + S.w * 0.1, y: S.y + S.h * 0.02, w: S.w * 0.8, h: S.h * 0.5 }, colors: {} });
  }
  const fit = fitLogo(logoBox, 'markWord');
  els.push({ id: 'lid.logo', label: 'Lid logo', type: 'logo', layer: 'fg', layout: 'markWord', rotate: 180, pivot, box: logoBox,
    colors: { gear: 'dark', arc: { none: true }, word: 'white', line: 'white' } });
  const tag = taglineUnder(partBox(fit, 'word'), { scale: (ctx.options.taglineSize ?? 100) / 100 });
  els.push({ id: 'lid.tagline', label: 'Lid tagline', type: 'text', layer: 'fg', rotate: 180, pivot, text: c.tagline, font: 'condSemibold', align: 'right', valign: 'top', spacing: 0.02,
    box: tag.box, size: tag.size, minSize: 1.2, colors: { fill: 'dark' } });
  return els;
}

export function dust(ctx) {
  const { w, h } = ctx.panel;
  return [
    { id: `${ctx.panel.id}.fill`, label: 'Dust flap colour', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w, h }, colors: { fill: 'boxOrange' } },
    { id: `${ctx.panel.id}.pattern`, label: 'Dust flap pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w, h }, colors: { ink: 'orangeTone' } },
  ];
}

export const boxProduct = { id: 'boxProduct', label: 'Product box (W09-0414 style)', options: OPTIONS, panels: { boxBody: productBody, boxLid: lid, boxDust: dust } };
export const boxGeneric = { id: 'boxGeneric', label: 'Generic box: CZĘŚCI ZAMIENNE / SPARE PARTS', options: OPTIONS, panels: { boxBody: genericBody, boxLid: lid, boxDust: dust } };

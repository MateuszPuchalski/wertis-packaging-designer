// "Window pouch": the KEULE-style layout in WERTIS colours. An orange header with the logo,
// a black band with the parts pattern and a see-through window, and an orange footer. The back carries a big gear, the label with the
// product name in six languages, the EAN and the QR code, and the "Produced for" address.
//
// A template returns, for one panel, a list of elements in the panel's own millimetres.
// Positions are fractions of the panel, so the layout follows any bag size. Elements the
// user can move read their box through ctx.box(id, default), which applies the override.
// `edits` names the design.content keys an element shows, so the editor can offer exactly
// those texts when the element is selected.
import { clamp } from '../render/svg.js';
import { LANGS } from '../brand/wertis.js';
import { MATERIALS } from '../brand/marks.js';
import { fitLogo, partBox, taglineUnder } from '../brand/logo.js';
import { num, choice, toggle } from '../formats/common.js';

// The pouch's address block: the company, the street and the e-mail (no "Produced for" heading).
const ADDRESS_LINES = ['company', 'address', 'email'];

export const OPTIONS = [
  num('headerPct', 'Header height', 30, 12, 60, 1, { unit: '%' }),
  num('footerPct', 'Footer height', 17, 8, 40, 1, { unit: '%' }),
  choice('windowShape', 'Window shape', 'rect', [['rect', 'Rounded rectangle'], ['oval', 'Oval'], ['none', 'No window']]),
  num('windowRadius', 'Window corner radius', 10, 0, 100, 0.5, { whenNot: ['windowShape', 'oval'] }),
  toggle('backWindow', 'Matching window on the back', false),
  toggle('silverEdges', 'Silver edges on the black band', true),
  toggle('backGear', 'Big gear on the back', true),
  num('taglineSize', '“Quality You Can Trust” size', 100, 40, 300, 5, { unit: '%' }),
  toggle('otherLangs', 'Other languages on the label', true),
  choice('recycle', 'Recycling mark', 'ldpe4', Object.entries(MATERIALS).map(([k, m]) => [k, m.label])),
  toggle('tidyman', 'Tidyman (bin) mark', true),
];

// Band heights are shares of the visible face: on a stand-up pouch the lowest part folds
// under into the gusset, so the footer band starts above it and runs on to the bottom.
function bands(ctx) {
  const { w: W, h: H } = ctx.panel;
  const o = ctx.options;
  const VH = H - (ctx.panel.info.bottomZone ?? 0);
  const headerH = VH * clamp(o.headerPct / 100, 0.05, 0.9);
  const footerTop = VH * (1 - clamp(o.footerPct / 100, 0.05, 0.9));
  return { W, H, headerH, footerTop: Math.max(footerTop, headerH + 10) };
}

// The bands and patterns both faces share.
function background(ctx, side, B) {
  const { W, H, headerH, footerTop } = B;
  const edge = clamp(H * 0.008, 1.2, 4);
  const els = [
    { id: `${side}.header`, label: 'Header band', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: headerH }, colors: { fill: 'boxOrange' } },
    { id: `${side}.headerPattern`, label: 'Header pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: headerH }, colors: { ink: 'orangeTone' } },
    { id: `${side}.body`, label: 'Black band', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: headerH, w: W, h: footerTop - headerH }, colors: { fill: 'black' } },
    { id: `${side}.bodyPattern`, label: 'Band pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: headerH, w: W, h: footerTop - headerH }, colors: { ink: 'patternGrey' } },
    { id: `${side}.footer`, label: 'Footer band', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: footerTop, w: W, h: H - footerTop }, colors: { fill: 'boxOrange' } },
    { id: `${side}.footerPattern`, label: 'Footer pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: footerTop, w: W, h: H - footerTop }, colors: { ink: 'orangeTone' } },
  ];
  if (ctx.options.silverEdges) {
    els.push(
      { id: `${side}.edgeTop`, label: 'Silver edge (top)', type: 'silver', layer: 'bg', bleed: true, box: { x: 0, y: headerH, w: W, h: edge }, colors: { fill: 'silver' } },
      { id: `${side}.edgeBottom`, label: 'Silver edge (bottom)', type: 'silver', layer: 'bg', bleed: true, box: { x: 0, y: footerTop - edge, w: W, h: edge }, colors: { fill: 'silver' } },
    );
  }
  return els;
}

function windowBox(ctx, B) {
  return ctx.box('front.window', { x: B.W * 0.09, y: B.headerH + (B.footerTop - B.headerH) * 0.09, w: B.W * 0.82, h: (B.footerTop - B.headerH) * 0.78 });
}

function windowEl(ctx, id, box) {
  const shape = ctx.options.windowShape;
  if (shape === 'none') return [];
  return [{ id, label: 'Window', type: 'window', layer: 'window', box, shape, r: ctx.options.windowRadius, movable: id === 'front.window', resizable: id === 'front.window', colors: {} }];
}

export function front(ctx) {
  const B = bands(ctx);
  const { headerH, footerTop } = B;
  const S = ctx.panel.info.safe;
  const c = ctx.design.content;
  const els = background(ctx, 'front', B);
  const win = windowBox(ctx, B);
  els.push(...windowEl(ctx, 'front.window', win));

  const headTop = S.y;
  const headH = Math.max(headerH - headTop, 8);
  els.push({
    id: 'front.logo', label: 'Logo', type: 'logo', layer: 'fg', layout: 'full', movable: true, resizable: true, keepAspect: true,
    box: ctx.box('front.logo', { x: S.x + S.w * 0.08, y: headTop + headH * 0.1, w: S.w * 0.84, h: headH * 0.78 }),
    colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'white' },
  });

  // Footer: the product code on top, then the product name.
  const F = { x: S.x, y: footerTop + 2, w: S.w, h: Math.max(S.y + S.h - footerTop - 2, 6) };
  const skuBox = ctx.box('front.sku', { x: F.x + F.w * 0.5, y: F.y + F.h * 0.08, w: F.w * 0.5, h: F.h * 0.14 });
  els.push({ id: 'front.sku', label: 'Product code', edits: ['sku'], type: 'text', layer: 'fg', movable: true, resizable: true, text: c.sku, font: 'semibold', align: 'right', valign: 'middle',
    box: skuBox, size: skuBox.h / 0.7, colors: { fill: 'white' } });
  const nameBox = ctx.box('front.name', { x: F.x, y: F.y + F.h * 0.4, w: F.w, h: F.h * 0.16 });
  els.push({ id: 'front.name', label: 'Product name', edits: ['productName'], type: 'text', layer: 'fg', movable: true, resizable: true, text: c.productName?.[c.lang] ?? '', font: 'bold', align: 'center', valign: 'middle',
    box: nameBox, size: nameBox.h / 0.7, minSize: 2, colors: { fill: 'dark' } });
  return els;
}

export function back(ctx) {
  const B = bands(ctx);
  const { W, headerH, footerTop } = B;
  const S = ctx.panel.info.safe;
  const c = ctx.design.content;
  const els = background(ctx, 'back', B);
  const bodyH = footerTop - headerH;

  if (ctx.options.backGear) {
    const r2 = Math.min(W * 0.36, bodyH * 0.42);
    const cx = W * 0.8, cy = headerH + bodyH * 0.25;
    els.push({ id: 'back.gear', label: 'Big gear', type: 'gear', layer: 'bg', metallic: true, clip: { x: 0, y: headerH, w: W, h: bodyH },
      cx, cy, r1: r2 * 0.86, r2, teeth: 14, hole: r2 * 0.3,
      box: { x: cx - r2, y: Math.max(cy - r2, headerH), w: Math.min(2 * r2, W - cx + r2), h: Math.min(2 * r2, cy + r2 - headerH) }, colors: { fill: 'silver' } });
  }
  if (ctx.options.backWindow) {
    const f = windowBox(ctx, B);
    els.push(...windowEl(ctx, 'back.window', { x: W - f.x - f.w, y: f.y, w: f.w, h: f.h }));
  }

  const headTop = S.y;
  const headH = Math.max(headerH - headTop, 8);
  const logo = ctx.box('back.logo', { x: S.x + S.w * 0.15, y: headTop + headH * 0.12, w: S.w * 0.7, h: headH * 0.6 });
  els.push({ id: 'back.logo', label: 'Logo', type: 'logo', layer: 'fg', layout: 'markWord', movable: true, resizable: true, keepAspect: true, box: logo,
    colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'white' } });
  // The tagline sits under the right end of WERTIS, small, as on the boxes. Its box can be
  // moved and resized like the logo: its height is the type's, so a taller box is a bigger
  // tagline, and the text shrinks to fit a narrower one. The template's size sets the start.
  const fit = fitLogo(logo, 'markWord');
  const tag = taglineUnder(partBox(fit, 'word'), { scale: (ctx.options.taglineSize ?? 100) / 100, gap: 0.55 });
  const tagBox = ctx.box('back.tagline', tag.box);
  els.push({ id: 'back.tagline', label: 'Tagline', edits: ['tagline'], type: 'text', layer: 'fg', movable: true, resizable: true, keepAspect: true,
    text: c.tagline, font: 'condSemibold', align: 'right', valign: 'top', spacing: 0.02,
    box: tagBox, size: tagBox.h / 0.7, minSize: 1.4, colors: { fill: 'white' } });

  els.push({ id: 'back.label', label: 'Label', edits: ['productName', 'sku', 'ean', 'qr', 'url'], type: 'label', layer: 'fg', movable: true, resizable: true,
    box: ctx.box('back.label', { x: S.x + S.w * 0.02, y: headerH + bodyH * 0.38, w: S.w * 0.96, h: bodyH * 0.56 }),
    content: {
      name: c.productName?.[c.lang] ?? '', sku: c.sku, ean: c.ean, qr: c.qr, url: c.url,
      others: ctx.options.otherLangs ? LANGS.filter(([k]) => k !== c.lang && c.productName?.[k]).map(([k, code]) => [code, c.productName[k]]) : [],
    },
    colors: { fill: 'white', text: 'dark', accent: 'boxOrange', bars: 'black' } });

  const F = { x: S.x, y: footerTop + 2, w: S.w, h: Math.max(S.y + S.h - footerTop - 2, 6) };
  // The address without a heading: three lines, so they run larger than the four did.
  const addrBox = ctx.box('back.address', { x: F.x, y: F.y + F.h * 0.12, w: F.w * 0.46, h: F.h * 0.76 });
  els.push({ id: 'back.address', label: 'Address', edits: ADDRESS_LINES, type: 'text', layer: 'fg', movable: true, resizable: true, font: 'regular', align: 'left', valign: 'middle', lineHeight: 1.25,
    text: [c.company, c.address, c.email].filter(Boolean).join('\n'),
    box: addrBox, size: (F.h * 0.1 / 0.7) * 4 / 3 * Math.sqrt((addrBox.w * addrBox.h) / (F.w * 0.46 * F.h * 0.76)), minSize: 1.4, colors: { fill: 'white' } });
  const material = MATERIALS[ctx.options.recycle];
  // The disposal marks in the middle of the footer.
  const markSize = Math.min(F.h * 0.55, F.w * 0.075);
  const marks = [material?.code ? 'recycle' : null, ctx.options.tidyman ? 'tidyman' : null].filter(Boolean);
  if (marks.length) {
    const mw = marks.length * markSize + (marks.length - 1) * markSize * 0.25;
    const mb = ctx.box('back.marks', { x: F.x + F.w * 0.49, y: F.y + (F.h - markSize) / 2, w: mw, h: markSize });
    els.push({ id: 'back.marks', label: 'Recycling marks', type: 'marks', layer: 'fg', marks, material, movable: true, resizable: true, keepAspect: true, box: mb, colors: { fill: 'black' } });
  }
  // At the right: a QR code, bigger than before, with the website line under it. Both end at the
  // footer's right edge. The QR links to the site (the link field, which is the code's text).
  const right = F.x + F.w, colW = F.w * 0.2;
  const qrSize = Math.min(F.h * 0.66, F.w * 0.15), gap = F.h * 0.02, webH = F.h * 0.24;
  const top = F.y + Math.max(0, (F.h - (qrSize + gap + webH)) / 2);
  const qrBox = ctx.box('back.urlQr', { x: right - qrSize, y: top, w: qrSize, h: qrSize });
  els.push({ id: 'back.urlQr', label: 'QR code', edits: ['qr'], type: 'qr', layer: 'fg', text: c.qr, movable: true, resizable: true, keepAspect: true,
    box: qrBox, colors: { dots: 'black', bg: 'white' } });
  const urlBox = ctx.box('back.url', { x: right - colW, y: qrBox.y + qrBox.h + gap, w: colW, h: webH });
  els.push({ id: 'back.url', label: 'Website', edits: ['url'], type: 'text', layer: 'fg', movable: true, resizable: true, text: c.url, font: 'bold', align: 'right', valign: 'middle',
    box: urlBox, size: (F.h * 0.15 / 0.7) * (urlBox.h / webH), minSize: 1.6, colors: { fill: 'white' } });
  return els;
}

// The bottom gusset of a stand-up pouch: orange with the pattern, and the WERTIS word on
// each half, the top one turned so both read right from outside once folded.
export function gusset(ctx) {
  const { w: W, h: G } = ctx.panel;
  const half = ctx.panel.info.fold;
  const els = [
    { id: 'gusset.fill', label: 'Gusset fill', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: G }, colors: { fill: 'boxOrange' } },
    { id: 'gusset.pattern', label: 'Gusset pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: G }, colors: { ink: 'orangeTone' } },
  ];
  const lw = Math.min(W * 0.4, half * 0.5 * 4.4);
  const lh = lw / 4.4;
  els.push(
    { id: 'gusset.logoTop', label: 'Gusset logo (top half)', type: 'logo', layer: 'fg', layout: 'word', rotate: 180,
      box: { x: (W - lw) / 2, y: (half - lh) / 2, w: lw, h: lh }, colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'dark' } },
    { id: 'gusset.logoBottom', label: 'Gusset logo (bottom half)', type: 'logo', layer: 'fg', layout: 'word',
      box: { x: (W - lw) / 2, y: half + (half - lh) / 2, w: lw, h: lh }, colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'dark' } },
  );
  return els;
}

// The product's own details: its name, code and label. A new pouch starts with them switched off
// (hidden), so the default pack is universal; each shows again with its checkbox in the inspector.
const PRODUCT_ELEMENTS = ['front.sku', 'front.name', 'back.label'];

export const pouchWindow = { id: 'pouchWindow', label: 'Window pouch (KEULE style)', options: OPTIONS, panels: { front, back, gusset }, hiddenByDefault: PRODUCT_ELEMENTS };

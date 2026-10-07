// "Window pouch": the KEULE-style layout in WERTIS colours. An orange header with the logo,
// a black band with the parts pattern and a see-through window, a quality badge over the
// window's corner, and an orange footer. The back carries a big gear, the label with the
// product name in six languages, the EAN and the QR code, and the "Produced for" address.
//
// A template returns, for one panel, a list of elements in the panel's own millimetres.
// Positions are fractions of the panel, so the layout follows any bag size. Elements the
// user can move read their box through ctx.box(id, default), which applies the override.
import { clamp } from '../render/svg.js';
import { LANGS } from '../brand/wertis.js';
import { num, choice, toggle } from '../formats/common.js';

export const OPTIONS = [
  num('headerPct', 'Header height', 30, 12, 60, 1, { unit: '%' }),
  num('footerPct', 'Footer height', 17, 8, 40, 1, { unit: '%' }),
  choice('windowShape', 'Window shape', 'rect', [['rect', 'Rounded rectangle'], ['oval', 'Oval'], ['none', 'No window']]),
  num('windowRadius', 'Window corner radius', 10, 0, 100, 0.5, { whenNot: ['windowShape', 'oval'] }),
  toggle('backWindow', 'Matching window on the back', false),
  toggle('silverEdges', 'Silver edges on the black band', true),
  toggle('badge', 'Quality badge', true),
  toggle('backGear', 'Big gear on the back', true),
  toggle('otherLangs', 'Other languages on the label', true),
];

function bands(ctx) {
  const { w: W, h: H } = ctx.panel;
  const o = ctx.options;
  const headerH = H * clamp(o.headerPct / 100, 0.05, 0.9);
  const footerTop = H * (1 - clamp(o.footerPct / 100, 0.05, 0.9));
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
  const { W, headerH, footerTop } = B;
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

  if (ctx.options.badge) {
    els.push({
      id: 'front.badge', label: 'Quality badge', type: 'badge', layer: 'fg', movable: true, resizable: true, keepAspect: true,
      box: ctx.box('front.badge', { x: W * 0.47, y: win.y + win.h - (footerTop - headerH) * 0.12, w: W * 0.46, h: (footerTop - headerH) * 0.19 }),
      top: c.badgeTop, bottom: c.badgeBottom,
      colors: { text: 'white', accent: 'orange', outline: 'black' },
    });
  }

  // Footer: small logo and the code on top, the product name, then the two notes.
  const F = { x: S.x, y: footerTop + 2, w: S.w, h: Math.max(S.y + S.h - footerTop - 2, 6) };
  els.push({
    id: 'front.footerLogo', label: 'Footer logo', type: 'logo', layer: 'fg', layout: 'word', movable: true, resizable: true, keepAspect: true,
    box: ctx.box('front.footerLogo', { x: F.x, y: F.y + F.h * 0.06, w: F.w * 0.3, h: F.h * 0.18 }), align: 'left',
    colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'dark' },
  });
  els.push({ id: 'front.sku', label: 'Product code', type: 'text', layer: 'fg', text: c.sku, font: 'semibold', align: 'right', valign: 'middle',
    box: { x: F.x + F.w * 0.5, y: F.y + F.h * 0.08, w: F.w * 0.5, h: F.h * 0.14 }, size: F.h * 0.14 / 0.7, colors: { fill: 'white' } });
  els.push({ id: 'front.name', label: 'Product name', type: 'text', layer: 'fg', text: c.productName?.[c.lang] ?? '', font: 'bold', align: 'center', valign: 'middle',
    box: { x: F.x, y: F.y + F.h * 0.36, w: F.w, h: F.h * 0.15 }, size: F.h * 0.15 / 0.7, minSize: 2, colors: { fill: 'dark' } });
  els.push({ id: 'front.note1', label: 'Note (line 1)', type: 'text', layer: 'fg', text: c.note1, font: 'bold', upper: true, align: 'center', valign: 'middle', spacing: 0.02,
    box: { x: F.x, y: F.y + F.h * 0.64, w: F.w, h: F.h * 0.1 }, size: F.h * 0.1 / 0.7, minSize: 1.6, colors: { fill: 'white' } });
  els.push({ id: 'front.note2', label: 'Note (line 2)', type: 'text', layer: 'fg', text: c.note2, font: 'extrabold', upper: true, align: 'center', valign: 'middle', spacing: 0.02,
    box: { x: F.x, y: F.y + F.h * 0.82, w: F.w, h: F.h * 0.1 }, size: F.h * 0.1 / 0.7, minSize: 1.6, colors: { fill: 'dark' } });
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
      cx, cy, r1: r2 * 0.87, r2, teeth: 16, hole: r2 * 0.5,
      box: { x: cx - r2, y: Math.max(cy - r2, headerH), w: Math.min(2 * r2, W - cx + r2), h: Math.min(2 * r2, cy + r2 - headerH) }, colors: { fill: 'silver' } });
  }
  if (ctx.options.backWindow) {
    const f = windowBox(ctx, B);
    els.push(...windowEl(ctx, 'back.window', { x: W - f.x - f.w, y: f.y, w: f.w, h: f.h }));
  }

  const headTop = S.y;
  const headH = Math.max(headerH - headTop, 8);
  const logo = ctx.box('back.logo', { x: S.x + S.w * 0.15, y: headTop + headH * 0.1, w: S.w * 0.7, h: headH * 0.56 });
  els.push({ id: 'back.logo', label: 'Logo', type: 'logo', layer: 'fg', layout: 'markWord', movable: true, resizable: true, keepAspect: true, box: logo,
    colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'white' } });
  els.push({ id: 'back.tagline', label: 'Tagline', type: 'text', layer: 'fg', text: c.tagline, font: 'condBold', align: 'center', valign: 'top',
    box: { x: S.x, y: logo.y + logo.h + headH * 0.06, w: S.w, h: headH * 0.16 }, size: headH * 0.16 / 0.7, minSize: 2, colors: { fill: 'white' } });

  els.push({ id: 'back.label', label: 'Label', type: 'label', layer: 'fg', movable: true, resizable: true,
    box: ctx.box('back.label', { x: S.x + S.w * 0.02, y: headerH + bodyH * 0.38, w: S.w * 0.96, h: bodyH * 0.56 }),
    content: {
      name: c.productName?.[c.lang] ?? '', sku: c.sku, ean: c.ean, qr: c.qr, url: c.url,
      others: ctx.options.otherLangs ? LANGS.filter(([k]) => k !== c.lang && c.productName?.[k]).map(([k, code]) => [code, c.productName[k]]) : [],
    },
    colors: { fill: 'white', text: 'dark', accent: 'boxOrange', bars: 'black' } });

  const F = { x: S.x, y: footerTop + 2, w: S.w, h: Math.max(S.y + S.h - footerTop - 2, 6) };
  els.push({ id: 'back.address', label: 'Produced for', type: 'text', layer: 'fg', font: 'regular', align: 'left', valign: 'middle', lineHeight: 1.25,
    text: [c.producedFor, c.company, c.address, c.email].filter(Boolean).join('\n'),
    box: { x: F.x, y: F.y + F.h * 0.12, w: F.w * 0.52, h: F.h * 0.76 }, size: F.h * 0.1 / 0.7, minSize: 1.4, colors: { fill: 'white' } });
  els.push({ id: 'back.url', label: 'Website', type: 'text', layer: 'fg', text: c.url, font: 'bold', align: 'right', valign: 'middle',
    box: { x: F.x + F.w * 0.55, y: F.y + F.h * 0.35, w: F.w * 0.45, h: F.h * 0.3 }, size: F.h * 0.15 / 0.7, minSize: 1.6, colors: { fill: 'white' } });
  return els;
}

export const pouchWindow = { id: 'pouchWindow', label: 'Window pouch (KEULE style)', options: OPTIONS, panels: { front, back } };

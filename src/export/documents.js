// The files a design exports, as SVG strings plus what the PDF writer needs (DOM-free;
// files.js turns them into SVG, PDF or PNG downloads).
//
// The print PDF follows the usual prepress norms (PDF/X-1a):
//   page 1  artwork with bleed, the dieline in its own spot inks ("Dieline" for cuts,
//           "Crease" for folds) set to overprint, crop marks in registration colour and a
//           slug line with the file's details
//   page 2  the dieline alone, same size and marks
//   page 3  for clear film: the white underprint plate (spot "White"): everywhere except
//           the windows and the holes
// Every colour is CMYK (a swatch's own numbers), or a named spot ink when the swatch is set
// to print as one. TrimBox and BleedBox mark the finished size and the bleed.
import { renderSheet, wrapSvg, panelsWithElements } from '../render/sheet.js';
import { renderProof } from '../render/proof.js';
import { dielineColors } from '../render/dieline.js';
import { windowPath } from '../render/artwork.js';
import { el, n, rectPath } from '../render/svg.js';
import { exportDefaults } from '../design.js';

// Printing conditions registered with the ICC (so a PDF/X-1a file can name them without
// embedding the profile), with the total ink limit their standard profiles use.
export const OUTPUT_INTENTS = {
  FOGRA39: { label: 'Coated, ISO 12647-2:2004 (FOGRA39)', info: 'Coated FOGRA39 (ISO 12647-2:2004)', tac: 330 },
  FOGRA51: { label: 'Coated, PSO v3, ISO 12647-2:2013 (FOGRA51)', info: 'PSO Coated v3 (FOGRA51)', tac: 300 },
  FOGRA52: { label: 'Uncoated, PSO v3 (FOGRA52)', info: 'PSO Uncoated v3 (FOGRA52)', tac: 300 },
  FOGRA47: { label: 'Uncoated, ISO 12647-2:2004 (FOGRA47)', info: 'PSO Uncoated ISO12647 (FOGRA47)', tac: 300 },
  'CGATS21-2-CRPC6': { label: 'GRACoL 2013, coated (CRPC6)', info: 'GRACoL2013 (CGATS 21-2 CRPC6)', tac: 320 },
};

export const REGISTRATION = '#000001'; // crop marks: every plate
export const WHITE_PLATE = '#fffffe'; // the white underprint
const SLUG_INK = '#1a1a1b'; // slug text: pure black

function printRender(design, env, opts = {}) {
  const r = renderSheet(design, env, { mode: 'print', ...opts });
  const note = `<!-- WERTIS Packaging Designer · ${esc(design.name)} · ${esc(r.geo.title ?? design.format)} · bleed ${r.geo.bleed} mm · trim box starts at (0, 0) · group "dieline" is non-printing · windows have no ink -->`;
  return { r, svg: r.svg.replace(/^<svg([^>]*)>/, (m) => `${m}${note}`) };
}

export function printSvg(design, env) {
  return printRender(design, env).svg;
}

// Crop marks at the corners of the trim box, outside the bleed, and the slug line.
function marksSvg(geo, text, slugText) {
  const { w, h } = geo.size;
  const off = geo.bleed + 2, len = 6, sw = 0.1;
  let d = '';
  for (const [x, y, sx, sy] of [[0, 0, -1, -1], [w, 0, 1, -1], [0, h, -1, 1], [w, h, 1, 1]]) {
    d += `M${n(x + sx * off)} ${n(y)}h${n(sx * len)}M${n(x)} ${n(y + sy * off)}v${n(sy * len)}`;
  }
  const slug = text.layout({ text: slugText, x: 0, y: h + off + 1.5, w, font: 'regular', size: 2.2, minSize: 1.2, align: 'left' });
  return el('g', { id: 'marks' }, el('path', { d, fill: 'none', stroke: REGISTRATION, 'stroke-width': sw }) + el('g', { fill: SLUG_INK }, slug.svg));
}

// Everywhere ink goes on clear film, except the windows and the holes.
function whitePlateSvg(design, env, geo) {
  const b = geo.bleed;
  let out = '';
  for (const { panel, elements } of panelsWithElements(design, env, geo)) {
    const s = panel.bleedSides ?? { l: true, t: true, r: true, b: true };
    const x0 = s.l ? -b : 0, y0 = s.t ? -b : 0;
    const area = rectPath(x0, y0, panel.w + (s.r ? b : 0) - x0, panel.h + (s.b ? b : 0) - y0);
    const holes = elements.filter((e) => e.type === 'window' && !design.hidden?.[e.id]).map(windowPath).join('') + panel.lines.holes.join('');
    out += el('path', { d: area + holes, 'fill-rule': 'evenodd', fill: WHITE_PLATE, transform: `translate(${n(panel.x)} ${n(panel.y)})` });
  }
  return el('g', { id: 'white-underprint' }, out);
}

function spotName(sw) {
  return (sw.spot || sw.name || sw.id).trim();
}

// Everything the print PDF needs: the pages, the colour of every hex on them (CMYK in %, or
// { spot, tint }), the spot inks, the page boxes and the PDF/X settings.
export function printDocument(design, env, { date = '' } = {}) {
  const ex = { ...exportDefaults(design.format), ...(design.export ?? {}) };
  const slug = ex.marks ? 12 : 0;
  const { r } = printRender(design, env, { margin: slug, inlineUses: true });
  const geo = r.geo;
  const lines = renderSheet(design, env, { mode: 'print', art: false, margin: slug });
  const intent = OUTPUT_INTENTS[ex.outputIntent] ? ex.outputIntent : 'FOGRA39';

  // Colours: CMYK from the render, then the spot inks on top.
  const colors = new Map([...r.cmyk, ...lines.cmyk]);
  const spots = [];
  const addSpot = (name, cmyk) => {
    const key = String(name ?? '').trim() || 'Spot';
    if (!spots.some((s) => s.name === key)) spots.push({ name: key, cmyk });
    return key;
  };
  const dl = dielineColors(geo);
  colors.set(dl.cut, { spot: addSpot(ex.cutInk || 'Dieline', [0, 100, 0, 0]), tint: 1, overprint: true });
  colors.set(dl.fold, { spot: addSpot(ex.creaseInk || 'Crease', [100, 0, 0, 0]), tint: 1, overprint: true });
  for (const sw of design.palette) {
    if (!sw.asSpot || sw.role === 'transparent') continue;
    const name = addSpot(spotName(sw), sw.cmyk);
    for (const [hex, v] of colors) {
      if (hex === sw.hex) colors.set(hex, { spot: name, tint: 1 });
      else if (v && v.spotOf === sw.id) colors.set(hex, { spot: name, tint: v.tint });
    }
  }
  const white = geo.format !== 'tuckBox' && ex.whitePlate;
  if (ex.marks) colors.set(REGISTRATION, { spot: addSpot('All', [100, 100, 100, 100]), tint: 1, overprint: true });
  colors.set(SLUG_INK, [0, 0, 0, 100]);
  // The White ink shows as light grey on screen (its alternate colour); it is its own plate.
  if (white) colors.set(WHITE_PLATE, { spot: addSpot(ex.whiteInk || 'White', [0, 0, 0, 25]), tint: 1 });
  // Strips of a swatch that prints as CMYK carry their CMYK; drop the helper key.
  for (const [hex, v] of colors) if (v && !Array.isArray(v) && v.spotOf && !v.spot) colors.set(hex, v.cmyk);

  const slugText = [
    `WERTIS · ${design.name}`, geo.title, `${design.proof?.version ?? ''} ${design.proof?.date || date}`.trim(),
    `Output intent ${intent}`, `Dieline: spot “${ex.cutInk}” (cut), “${ex.creaseInk}” (crease), overprint`,
    white ? `White underprint: spot “${ex.whiteInk}”, page 3` : null, `Bleed ${geo.bleed} mm`,
  ].filter(Boolean).join('  ·  ');
  const marks = ex.marks ? marksSvg(geo, env.text, slugText) : '';
  const page = (inner) => wrapSvg(inner + marks, r.box);
  const pages = [page(r.inner), page(lines.inner)];
  if (white) pages.push(page(whitePlateSvg(design, env, geo) + lines.inner));

  // Page boxes in mm from the page's top left.
  const ox = -r.box.x, oy = -r.box.y;
  const trim = { x: ox, y: oy, w: geo.size.w, h: geo.size.h };
  const bleed = { x: ox - geo.bleed, y: oy - geo.bleed, w: geo.size.w + 2 * geo.bleed, h: geo.size.h + 2 * geo.bleed };
  const images = /<image/.test(r.inner);
  return {
    pages, colors, spots, boxes: { trim, bleed },
    // PDF/X-1a takes CMYK and spot colours only; a photo (RGB) makes the file plain PDF.
    pdfx: images ? null : { version: 'PDF/X-1a:2001', intent, info: OUTPUT_INTENTS[intent].info },
    images, title: design.name, cmyk: colors,
  };
}

export function proofSvg(design, env, page) {
  return renderProof(design, env, { page }).svg;
}

function esc(s) {
  return String(s ?? '').replace(/--/g, '–').replace(/[<>&]/g, '');
}

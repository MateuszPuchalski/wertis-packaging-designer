// The files a design exports, as SVG strings (DOM-free; files.js turns them into SVG, PDF
// or PNG downloads).
import { renderSheet } from '../render/sheet.js';
import { renderProof } from '../render/proof.js';

// The print file: artwork with bleed in the group "artwork", the construction lines in the
// group "dieline" (non-printing magenta), windows left without ink, text as outlines.
function printRender(design, env) {
  const r = renderSheet(design, env, { mode: 'print' });
  const note = `<!-- WERTIS Packaging Designer · ${esc(design.name)} · ${esc(r.geo.title ?? design.format)} · bleed ${r.geo.bleed} mm · trim box starts at (0, 0) · group "dieline" is non-printing · windows have no ink · colours are CMYK in the PDF -->`;
  return { r, svg: r.svg.replace(/^<svg([^>]*)>/, (m) => `${m}${note}`) };
}

export function printSvg(design, env) {
  return printRender(design, env).svg;
}

// Everything the print PDF needs: page 1 (artwork and dieline), page 2 (the dieline alone)
// and the CMYK of every colour on them.
export function printDocument(design, env) {
  const { r, svg } = printRender(design, env);
  const lines = renderSheet(design, env, { mode: 'print', art: false });
  return { pages: [svg, lines.svg], cmyk: new Map([...r.cmyk, ...lines.cmyk]), title: design.name };
}

export function proofSvg(design, env, page) {
  return renderProof(design, env, { page }).svg;
}

function esc(s) {
  return String(s ?? '').replace(/--/g, '–').replace(/[<>&]/g, '');
}

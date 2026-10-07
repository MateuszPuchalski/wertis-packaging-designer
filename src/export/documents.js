// The files a design exports, as SVG strings (DOM-free; files.js turns them into SVG, PDF
// or PNG downloads).
import { renderSheet } from '../render/sheet.js';
import { renderProof } from '../render/proof.js';

// The print file: artwork with bleed in the group "artwork", the construction lines in the
// group "dieline" (non-printing magenta), windows left without ink, text as outlines.
export function printSvg(design, env) {
  const r = renderSheet(design, env, { mode: 'print' });
  const note = `<!-- WERTIS Packaging Designer · ${esc(design.name)} · ${esc(r.geo.title ?? design.format)} · bleed ${r.geo.bleed} mm · trim box starts at (0, 0) · group "dieline" is non-printing · windows have no ink -->`;
  return r.svg.replace(/^<svg([^>]*)>/, (m) => `${m}${note}`);
}

export function proofSvg(design, env, page) {
  return renderProof(design, env, { page }).svg;
}

function esc(s) {
  return String(s ?? '').replace(/--/g, '–').replace(/[<>&]/g, '');
}

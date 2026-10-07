// Preflight: the checks a printer's prepress runs, done before the file leaves. Each finding
// is { level: 'error' | 'warn' | 'ok', topic, message, element? }. Errors would print wrong;
// warnings are worth a look. DOM-free.
import { renderSheet, panelsWithElements } from './render/sheet.js';
import { validateEan13 } from './codes/ean13.js';
import { luminance } from './brand/palette.js';
import { OUTPUT_INTENTS } from './export/documents.js';
import { exportDefaults } from './design.js';

const MIN_TEXT_MM = 1.76; // 5 pt: the smallest type that holds up on film and board
const MIN_EAN_MODULE = 0.264; // 80 % of nominal, GS1's minimum

function inside(b, s, tol = 0.2) {
  return b.x >= s.x - tol && b.y >= s.y - tol && b.x + b.w <= s.x + s.w + tol && b.y + b.h <= s.y + s.h + tol;
}

export function preflight(design, env) {
  const out = [];
  const add = (level, topic, message, element) => out.push({ level, topic, message, element });
  const ex = { ...exportDefaults(design.format), ...(design.export ?? {}) };
  const intent = OUTPUT_INTENTS[ex.outputIntent] ?? OUTPUT_INTENTS.FOGRA39;
  const r = renderSheet(design, env, { mode: 'print' });
  const geo = r.geo;
  const c = design.content;

  // Barcode.
  if (c.ean) {
    const v = validateEan13(c.ean);
    if (!v.ok) add('error', 'Barcode', `EAN-13 “${c.ean}”: ${v.error}`);
    else if (v.code.startsWith('2')) add('warn', 'Barcode', `EAN ${v.code} is from the in-store range (it starts with 2): fine as a placeholder, not for retail.`);
    else add('ok', 'Barcode', `EAN-13 ${v.code} is valid.`);
  } else add('warn', 'Barcode', 'There is no EAN-13 on this pack.');
  for (const h of r.hits.filter((x) => x.type === 'ean')) {
    if (h.box.w / 113 < MIN_EAN_MODULE - 1e-6) add('error', 'Barcode', `The barcode is ${(h.box.w / 113 / 0.33 * 100).toFixed(0)} % of nominal size; GS1 asks for at least 80 %.`, h.id);
  }
  if (ex.bwr > 0) add('ok', 'Barcode', `Bars are thinned by ${ex.bwr} mm for ink spread (bar width reduction).`);

  // Colours: ink limit, rich black type, spots.
  const used = design.palette.filter((s) => r.used.has(s.id) && s.role !== 'transparent');
  for (const s of used) {
    const tac = s.cmyk.reduce((a, b) => a + b, 0);
    if (tac > intent.tac) add('warn', 'Colour', `“${s.name}” has ${tac} % total ink, over the ${intent.tac} % ${ex.outputIntent} allows; it may set off or dry slowly.`);
    if (s.asSpot && !s.spot) add('error', 'Colour', `“${s.name}” prints as a spot ink but has no spot name (e.g. PANTONE 151 C).`);
    if (!s.asSpot && s.spot && /pantone|pms|hks|ral/i.test(s.spot)) add('warn', 'Colour', `“${s.name}” is named ${s.spot} but prints as CMYK; tick “Spot ink” to print it as that ink.`);
  }
  const inks = new Set();
  for (const s of used) {
    if (s.asSpot) inks.add(s.spot || s.name);
    else s.cmyk.forEach((v, i) => { if (v > 0) inks.add('CMYK'[i]); });
  }
  const order = (a) => ('CMYK'.indexOf(a) + 1 || 9);
  add('ok', 'Colour', `Inks: ${[...inks].sort((a, b) => order(a) - order(b)).join(', ') || 'none'}${geo.format !== 'tuckBox' && ex.whitePlate ? ', White underprint' : ''} (plus the dieline, which does not print).`);

  // Type size and placement.
  const parts = panelsWithElements(design, env, geo);
  for (const { panel, elements } of parts) {
    for (const e of elements) {
      if (design.hidden?.[e.id] || e.type !== 'text' || !e.text) continue;
      const laid = env.text.layout({ ...e.box, text: e.text, font: e.font, size: e.size, minSize: e.minSize, upper: e.upper, wrap: e.wrap, spacing: e.spacing, lineHeight: e.lineHeight, maxLines: e.maxLines });
      if (laid.size < MIN_TEXT_MM) add('warn', 'Text', `“${e.label}” is ${(laid.size / 0.3528).toFixed(1)} pt; under 5 pt may not print cleanly.`, e.id);
    }
    const faces = panel.info?.faces ?? (panel.info?.safe ? [{ ...panel.info.safe, safe: panel.info.safe, x0: 0 }] : []);
    for (const h of r.hits.filter((x) => x.panel === panel.id && ['text', 'label', 'ean', 'qr', 'logo', 'marks'].includes(x.type))) {
      const box = { x: h.box.x - panel.x, y: h.box.y - panel.y, w: h.box.w, h: h.box.h };
      if (box.w <= 0 || box.h <= 0 || !faces.length) continue;
      if (!faces.some((f) => inside(box, f.safe))) add('warn', 'Layout', `“${h.label}” on the ${panel.label.toLowerCase()} runs outside the safe area (seals, folds or the cut).`, h.id);
    }
  }

  // Construction.
  if (geo.bleed < 3) add('warn', 'Bleed', `Bleed is ${geo.bleed} mm; most printers ask for 3 mm.`);
  else add('ok', 'Bleed', `Bleed ${geo.bleed} mm on every outer edge.`);
  if (/<image/.test(r.inner)) add('warn', 'Images', 'A photo is placed in the print file; photos are RGB, so the PDF is not PDF/X-1a (the printer will convert it).');
  for (const w of r.windows) {
    const p = geo.panels.find((q) => Math.abs(q.x - w.px) < 1e-6 && Math.abs(q.y - w.py) < 1e-6);
    const s = p?.info?.safe;
    if (s && !inside(w.box, { x: s.x - (geo.dims.safe ?? 0), y: s.y - (geo.dims.safe ?? 0), w: s.w + 2 * (geo.dims.safe ?? 0), h: s.h + 2 * (geo.dims.safe ?? 0) })) {
      add('warn', 'Window', 'A window reaches into the seals or the zip; the film cannot be sealed there.', w.id);
    }
  }
  if (!out.some((x) => x.level !== 'ok')) add('ok', 'Summary', 'Ready to print: no problems found.');
  // Rich black on fine text would need perfect registration.
  for (const s of used) {
    if (s.cmyk[3] >= 90 && s.cmyk[0] + s.cmyk[1] + s.cmyk[2] > 0 && luminance(s.hex) < 0.05) {
      add('warn', 'Colour', `“${s.name}” is a rich black (C${s.cmyk[0]} M${s.cmyk[1]} Y${s.cmyk[2]} K${s.cmyk[3]}); small text in it needs perfect registration.`);
    }
  }
  return { items: out, errors: out.filter((x) => x.level === 'error').length, warnings: out.filter((x) => x.level === 'warn').length };
}

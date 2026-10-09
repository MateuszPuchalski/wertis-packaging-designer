// Preflight: the checks a printer's prepress runs, done before the file leaves. Each finding
// is { level: 'error' | 'warn' | 'ok', topic, message, element?, i18n }. Errors would print
// wrong; warnings are worth a look. `message` is English; `i18n` ({ key, params }) lets the
// editor say the same in its language (numbers are rounded here, so both say the same value;
// { label } params are data labels, { i18n } params nested messages). DOM-free.
import { renderSheet, panelsWithElements } from './render/sheet.js';
import { validateEan13 } from './codes/ean13.js';
import { luminance } from './brand/palette.js';
import { OUTPUT_INTENTS } from './export/documents.js';
import { exportDefaults } from './design.js';

const MIN_TEXT_MM = 2.1; // 6 pt: the smallest type that holds up on film and board, and for reversed type on a colour
const MIN_EAN_MODULE = 0.264; // 80 % of nominal, GS1's minimum

function inside(b, s, tol = 0.2) {
  return b.x >= s.x - tol && b.y >= s.y - tol && b.x + b.w <= s.x + s.w + tol && b.y + b.h <= s.y + s.h + tol;
}

export function preflight(design, env) {
  const out = [];
  const add = (level, topic, message, element, key, params) => out.push({ level, topic, message, element, i18n: { key, params } });
  const L = (label, lower = false) => ({ label, lower });
  const ex = { ...exportDefaults(design.format), ...(design.export ?? {}) };
  const intent = OUTPUT_INTENTS[ex.outputIntent] ?? OUTPUT_INTENTS.FOGRA39;
  const r = renderSheet(design, env, { mode: 'print' });
  const geo = r.geo;
  const c = design.content;

  // Barcode.
  if (c.ean) {
    const v = validateEan13(c.ean);
    if (!v.ok) add('error', 'Barcode', `EAN-13 “${c.ean}”: ${v.error}`, undefined, 'pf.ean.bad', { code: c.ean, error: { message: v.error, i18n: v.i18n } });
    else if (v.code.startsWith('2')) add('warn', 'Barcode', `EAN ${v.code} is from the in-store range (it starts with 2): fine as a placeholder, not for retail.`, undefined, 'pf.ean.store', { code: v.code });
    else add('ok', 'Barcode', `EAN-13 ${v.code} is valid.`, undefined, 'pf.ean.ok', { code: v.code });
  } else add('warn', 'Barcode', 'There is no EAN-13 on this pack.', undefined, 'pf.ean.none');
  for (const h of r.hits.filter((x) => x.type === 'ean')) {
    const pct = (h.box.w / 113 / 0.33 * 100).toFixed(0);
    if (h.box.w / 113 < MIN_EAN_MODULE - 1e-6) add('error', 'Barcode', `The barcode is ${pct} % of nominal size; GS1 asks for at least 80 %.`, h.id, 'pf.ean.small', { pct });
    else if (h.box.w / 113 < 0.33 * 0.97) add('warn', 'Barcode', `The barcode is at ${pct} % of nominal size: allowed (80 to 200 %), but 100 % reads most reliably.`, h.id, 'pf.ean.notNominal', { pct });
  }
  if (ex.bwr > 0) add('ok', 'Barcode', `Bars are thinned by ${ex.bwr} mm for ink spread (bar width reduction).`, undefined, 'pf.ean.bwr', { bwr: ex.bwr });

  // Colours: ink limit, rich black type, spots.
  const used = design.palette.filter((s) => r.used.has(s.id) && s.role !== 'transparent');
  for (const s of used) {
    const tac = s.cmyk.reduce((a, b) => a + b, 0);
    if (tac > intent.tac) add('warn', 'Colour', `“${s.name}” has ${tac} % total ink, over the ${intent.tac} % ${ex.outputIntent} allows; it may set off or dry slowly.`, undefined, 'pf.colour.tac', { name: s.name, tac, limit: intent.tac, intent: ex.outputIntent });
    if (s.asSpot && !s.spot) add('error', 'Colour', `“${s.name}” prints as a spot ink but has no spot name (e.g. PANTONE 151 C).`, undefined, 'pf.colour.noSpot', { name: s.name });
    if (!s.asSpot && s.spot && /pantone|pms|hks|ral/i.test(s.spot)) add('warn', 'Colour', `“${s.name}” is named ${s.spot} but prints as CMYK; tick “Spot ink” to print it as that ink.`, undefined, 'pf.colour.namedSpot', { name: s.name, spot: s.spot });
  }
  const inks = new Set();
  for (const s of used) {
    if (s.asSpot) inks.add(s.spot || s.name);
    else s.cmyk.forEach((v, i) => { if (v > 0) inks.add('CMYK'[i]); });
  }
  const order = (a) => ('CMYK'.indexOf(a) + 1 || 9);
  const inkList = [...inks].sort((a, b) => order(a) - order(b)).join(', ');
  const white = geo.format !== 'tuckBox' && ex.whitePlate;
  add('ok', 'Colour', `Inks: ${inkList || 'none'}${white ? ', White underprint' : ''} (plus the dieline, which does not print).`, undefined,
    white ? 'pf.colour.inksWhite' : 'pf.colour.inks', { inks: inkList || { message: 'none', i18n: { key: 'pf.colour.noInks' } } });

  // Type size and placement.
  const parts = panelsWithElements(design, env, geo);
  for (const { panel, elements } of parts) {
    for (const e of elements) {
      if (design.hidden?.[e.id] || e.type !== 'text' || !e.text) continue;
      const laid = env.text.view(design.fonts).layout({ ...e.box, text: e.text, font: e.font, size: e.size, minSize: e.minSize, upper: e.upper, wrap: e.wrap, spacing: e.spacing, lineHeight: e.lineHeight, maxLines: e.maxLines });
      const pt = (laid.size / 0.3528).toFixed(1);
      if (laid.size < MIN_TEXT_MM) add('warn', 'Text', `“${e.label}” is ${pt} pt; under 6 pt may not print cleanly.`, e.id, 'pf.text.small', { el: L(e.label), pt });
    }
    const faces = panel.info?.faces ?? (panel.info?.safe ? [{ ...panel.info.safe, safe: panel.info.safe, x0: 0 }] : []);
    for (const h of r.hits.filter((x) => x.panel === panel.id && ['text', 'label', 'ean', 'qr', 'logo', 'marks'].includes(x.type))) {
      const box = { x: h.box.x - panel.x, y: h.box.y - panel.y, w: h.box.w, h: h.box.h };
      if (box.w <= 0 || box.h <= 0 || !faces.length) continue;
      if (!faces.some((f) => inside(box, f.safe))) add('warn', 'Layout', `“${h.label}” on the ${panel.label.toLowerCase()} runs outside the safe area (seals, folds or the cut).`, h.id, 'pf.layout.safe', { el: L(h.label), panel: L(panel.label, true) });
    }
  }

  // Construction.
  if (geo.bleed < 3) add('warn', 'Bleed', `Bleed is ${geo.bleed} mm; most printers ask for 3 mm.`, undefined, 'pf.bleed.low', { bleed: geo.bleed });
  else add('ok', 'Bleed', `Bleed ${geo.bleed} mm on every outer edge.`, undefined, 'pf.bleed.ok', { bleed: geo.bleed });
  if (/<image/.test(r.inner)) add('warn', 'Images', 'A photo is placed in the print file; photos are RGB, so the PDF is not PDF/X-1a (the printer will convert it).', undefined, 'pf.images');
  for (const w of r.windows) {
    const p = geo.panels.find((q) => Math.abs(q.x - w.px) < 1e-6 && Math.abs(q.y - w.py) < 1e-6);
    const s = p?.info?.safe;
    if (s && !inside(w.box, { x: s.x - (geo.dims.safe ?? 0), y: s.y - (geo.dims.safe ?? 0), w: s.w + 2 * (geo.dims.safe ?? 0), h: s.h + 2 * (geo.dims.safe ?? 0) })) {
      add('warn', 'Window', 'A window reaches into the seals or the zip; the film cannot be sealed there.', w.id, 'pf.window.seal');
    }
  }
  if (!out.some((x) => x.level !== 'ok')) add('ok', 'Summary', 'Ready to print: no problems found.', undefined, 'pf.summary.ok');
  // Rich black on fine text would need perfect registration.
  for (const s of used) {
    if (s.cmyk[3] >= 90 && s.cmyk[0] + s.cmyk[1] + s.cmyk[2] > 0 && luminance(s.hex) < 0.05) {
      add('warn', 'Colour', `“${s.name}” is a rich black (C${s.cmyk[0]} M${s.cmyk[1]} Y${s.cmyk[2]} K${s.cmyk[3]}); small text in it needs perfect registration.`, undefined, 'pf.colour.richBlack', { name: s.name, c: s.cmyk[0], m: s.cmyk[1], y: s.cmyk[2], k: s.cmyk[3] });
    }
  }
  return { items: out, errors: out.filter((x) => x.level === 'error').length, warnings: out.filter((x) => x.level === 'warn').length };
}

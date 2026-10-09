// A dieline loaded from a printer's .ai or PDF file (import/dieline.js): its cut and fold lines as one
// sheet, kept in the project (`design.custom`). The artwork is a free canvas over the whole sheet; the
// printer's lines stay exactly as drawn.
import { num, normalizeDims, dim } from './common.js';

export const FIELDS = [
  num('bleed', 'Bleed', 3, 0, 10, 0.5),
  num('safe', 'Safe margin', 3, 0, 20, 0.5),
];

const EMPTY = { name: 'Imported dieline', w: 100, h: 100, cut: [], fold: [], outline: [] };

// What a project may carry as `custom`: path strings and the sheet size, nothing else.
export function cleanCustom(c) {
  if (!c || typeof c !== 'object') return null;
  const paths = (v) => (Array.isArray(v) ? v.filter((d) => typeof d === 'string' && d.length < 200000).slice(0, 4000) : []);
  const num2 = (v, d) => (Number.isFinite(Number(v)) ? Math.min(2000, Math.max(5, Number(v))) : d);
  return { name: String(c.name ?? EMPTY.name).slice(0, 120), w: num2(c.w, EMPTY.w), h: num2(c.h, EMPTY.h), cut: paths(c.cut), fold: paths(c.fold), outline: paths(c.outline) };
}

export function layout(rawDims, design) {
  const d = normalizeDims(FIELDS, rawDims);
  const c = design?.custom ?? EMPTY;
  const s = Math.min(d.safe, c.w / 3, c.h / 3);
  const all = { l: true, t: true, r: true, b: true };
  const empty = { cut: [], seal: [], zip: [], holes: [], notches: [], fold: [] };
  const round = (v) => Math.round(v * 10) / 10;
  return {
    format: 'customDieline',
    dims: d,
    labels: false,
    size: { w: c.w, h: c.h },
    bleed: d.bleed,
    colors: { cut: '#00aff0', fold: '#eb3540' },
    panels: [{ id: 'sheet', label: 'Sheet', role: 'customSheet', x: 0, y: 0, w: c.w, h: c.h, bleedSides: all, lines: empty, info: { safe: { x: s, y: s, w: c.w - 2 * s, h: c.h - 2 * s } } }],
    sheetLines: { cut: c.cut, fold: c.fold },
    trims: c.outline,
    measures: [dim(0, 0, c.w, 0, -10, `${round(c.w)}`), dim(0, 0, 0, c.h, -8, `${round(c.h)}`)],
    title: `${c.name} ${round(c.w)} × ${round(c.h)} mm`,
  };
}

export const customDieline = { id: 'customDieline', label: 'Imported dieline', example: 'box', fields: FIELDS, layout, templates: ['customSheet'], custom: true };

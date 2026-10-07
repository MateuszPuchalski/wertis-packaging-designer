// The design document: everything a project saves. It is plain JSON with a schema version,
// so old files load (migrate) or are rejected with a reason, never silently dropped.
import { FORMATS, TEMPLATES } from './registry.js';
import { WERTIS_PALETTE, exampleContent } from './brand/wertis.js';
import { makeSwatch, refSwatchId, findSwatch, canDeleteSwatch } from './brand/palette.js';
import { PATTERN_DEFAULTS } from './render/pattern.js';
import { normalizeDims } from './formats/common.js';

export const SCHEMA = 'wertis-packaging';
export const SCHEMA_VERSION = 1;

const clone = (v) => JSON.parse(JSON.stringify(v));
// An error with an i18n descriptor, so the editor can say it in its own language.
const fail = (message, key, params) => Object.assign(new Error(message), { i18n: { key, params } });

export function defaultsOf(fields) {
  return normalizeDims(fields, {});
}

export function createDesign({ format = 'flatPouch', template, date = '' } = {}) {
  const f = FORMATS[format] ?? FORMATS.flatPouch;
  const t = TEMPLATES[template] ?? TEMPLATES[f.templates[0]];
  const example = exampleContent(f.example);
  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    name: example.name,
    format: f.id,
    template: t.id,
    dims: defaultsOf(f.fields),
    options: defaultsOf(t.options),
    palette: clone(WERTIS_PALETTE),
    colors: {}, // `${elementId}.${slot}` → colour reference (see brand/palette.js)
    layout: {}, // elementId → { x, y, w, h } as fractions of its panel
    hidden: {}, // elementId → true
    pattern: { ...PATTERN_DEFAULTS },
    content: example.content,
    proof: { version: 'V1', date, author: '', notes: 'Please check all texts, colours, sizes, the window and both codes before approving.' },
    // product3d: the part the 3D view puts in a pouch (three/products.js).
    mockup: { photo: null, background: '#e8e4dc', angle: 0, product3d: f.example === 'box' ? 'none' : 'clutchDrum', film3d: 'heavy' },
    export: exportDefaults(f.id),
  };
}

// Loads any saved project: fills in what newer versions added and rejects what isn't ours.
export function migrate(input) {
  const json = typeof input === 'string' ? JSON.parse(input) : input;
  if (!json || typeof json !== 'object' || json.schema !== SCHEMA) throw fail('This file is not a WERTIS packaging project.', 'err.notProject');
  if (!Number.isInteger(json.version) || json.version < 1) throw fail('This project has no valid version number.', 'err.noVersion');
  if (json.version > SCHEMA_VERSION) throw fail(`This project was saved by a newer version of the app (v${json.version}); update the app to open it.`, 'err.newer', { version: json.version });
  const base = createDesign({ format: json.format, template: json.template, date: json.proof?.date ?? '' });
  const f = FORMATS[base.format];
  const t = TEMPLATES[base.template];
  const d = {
    ...base,
    ...json,
    version: SCHEMA_VERSION,
    format: base.format,
    template: base.template,
    dims: normalizeDims(f.fields, json.dims),
    options: normalizeDims(t.options, json.options),
    palette: Array.isArray(json.palette) && json.palette.length ? json.palette.map((s) => makeSwatch(s)) : base.palette,
    colors: { ...(json.colors ?? {}) },
    layout: { ...(json.layout ?? {}) },
    hidden: { ...(json.hidden ?? {}) },
    pattern: { ...base.pattern, ...(json.pattern ?? {}) },
    content: { ...base.content, ...(json.content ?? {}), productName: { ...base.content.productName, ...(json.content?.productName ?? {}) } },
    proof: { ...base.proof, ...(json.proof ?? {}) },
    // Projects from before the 3D part existed stay empty.
    mockup: { ...base.mockup, product3d: 'none', ...(json.mockup ?? {}) },
    export: { ...base.export, ...(json.export ?? {}) },
  };
  if (!d.palette.some((s) => s.role === 'transparent')) d.palette.push(clone(WERTIS_PALETTE.find((s) => s.role === 'transparent')));
  return d;
}

// Print settings, after the usual prepress norms: the printing condition the PDF/X file
// declares, the names of the spot inks the dieline uses, printer's marks, a white underprint
// plate (clear film only) and the barcode's bar width reduction.
export function exportDefaults(format) {
  return {
    outputIntent: 'FOGRA39',
    cutInk: 'Dieline',
    creaseInk: 'Crease',
    marks: true,
    whitePlate: format !== 'tuckBox',
    whiteInk: 'White',
    bwr: 0,
  };
}

export function serialize(design) {
  return JSON.stringify(design, null, 1);
}

// Moves a design to another format or template, keeping texts, colours and palette.
export function switchFormat(design, format, template) {
  const f = FORMATS[format];
  const t = TEMPLATES[template && f.templates.includes(template) ? template : f.templates[0]];
  return { ...design, format: f.id, template: t.id, dims: defaultsOf(f.fields), options: { ...defaultsOf(t.options) }, layout: {}, hidden: {} };
}

// Immutable update along a path: setIn(d, ['content', 'sku'], 'X') returns a new design
// that shares every untouched branch with the old one (cheap undo history).
export function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = obj ?? (typeof k === 'number' ? [] : {});
  const next = Array.isArray(base) ? base.slice() : { ...base };
  if (rest.length === 0 && value === undefined) delete next[k];
  else next[k] = setIn(base[k], rest, value);
  return next;
}

export function getIn(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Every colour slot of every element: { key, elementId, slot, label, ref, panel }.
export function colorSlots(design, panelsWithElements) {
  const out = [];
  for (const { panel, elements } of panelsWithElements) {
    for (const e of elements) {
      for (const [slot, def] of Object.entries(e.colors ?? {})) {
        const key = `${e.id}.${slot}`;
        out.push({ key, elementId: e.id, slot, label: e.label, panel: panel.id, ref: design.colors[key] ?? def, isDefault: !(key in design.colors) });
      }
    }
  }
  return out;
}

// Which slots use a swatch (directly or through a template default).
export function slotsUsingSwatch(design, panelsWithElements, swatchId) {
  return colorSlots(design, panelsWithElements).filter((s) => refSwatchId(s.ref) === swatchId);
}

// Deletes a swatch. Every slot that used it switches to `replacementId`, so nothing is left
// without a colour. Throws if the swatch is the window marker or the replacement is missing.
export function removeSwatch(design, panelsWithElements, swatchId, replacementId) {
  const sw = findSwatch(design.palette, swatchId);
  if (!sw) return design;
  if (!canDeleteSwatch(sw)) throw fail('The window colour marks the transparent area; it can be edited but not deleted.', 'err.windowSwatch');
  const users = slotsUsingSwatch(design, panelsWithElements, swatchId);
  if (users.length && (!replacementId || replacementId === swatchId || !findSwatch(design.palette, replacementId))) {
    throw fail('Pick another colour for the elements that use this one.', 'err.pickReplacement');
  }
  const colors = { ...design.colors };
  for (const s of users) colors[s.key] = { swatch: replacementId };
  // Overrides that point at it but are hidden from the current template (other format).
  for (const [k, ref] of Object.entries(colors)) if (refSwatchId(ref) === swatchId) colors[k] = { swatch: replacementId };
  return { ...design, colors, palette: design.palette.filter((s) => s.id !== swatchId) };
}

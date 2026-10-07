// The colour model. A palette is a list of named swatches; design elements point at a
// swatch by id (so editing the swatch recolours everything that uses it), or carry a one-off
// custom colour, or no colour at all.
//
// A colour reference is one of:
//   'orange'                  a swatch id (what templates use for their defaults)
//   { swatch: 'orange' }      the same, as stored in a design's overrides
//   { custom: '#12ab34' }     a colour that belongs to no swatch
//   { none: true }            no ink: what is underneath shows through

export const TRANSPARENT = 'transparent'; // the role of the swatch that marks the window

export function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

export function normalizeHex(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return isHex(s) ? s : null;
}

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

// t = 0 gives a, t = 1 gives b.
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

// A naive device conversion, only to prefill CMYK for a new swatch. The printer's numbers
// (or the spot colour) are what count, and the user can type them in.
export function cmykFromHex(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function makeSwatch({ id, name, hex, cmyk, spot = '', role = '' }) {
  const h = normalizeHex(hex) ?? '#000000';
  return { id, name: name || id, hex: h, cmyk: Array.isArray(cmyk) && cmyk.length === 4 ? cmyk.map(Number) : cmykFromHex(h), spot, role };
}

export function findSwatch(palette, id) {
  return palette.find((s) => s.id === id) ?? null;
}

export function refSwatchId(ref) {
  if (typeof ref === 'string') return ref;
  return ref && typeof ref === 'object' && typeof ref.swatch === 'string' ? ref.swatch : null;
}

// The hex colour of a reference, or 'none'. A swatch id that is missing from the palette
// resolves to `fallback` so a design never renders without a colour.
export function resolveColor(ref, palette, fallback = '#ff00ff') {
  if (ref && typeof ref === 'object') {
    if (ref.none) return 'none';
    if (ref.custom) return normalizeHex(ref.custom) ?? fallback;
  }
  const id = refSwatchId(ref);
  return (id && findSwatch(palette, id)?.hex) || fallback;
}

export function uniqueSwatchId(palette, base = 'colour') {
  const slug = String(base).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colour';
  let id = slug;
  for (let i = 2; findSwatch(palette, id); i++) id = `${slug}-${i}`;
  return id;
}

export function addSwatch(palette, fields) {
  const id = uniqueSwatchId(palette, fields.name || 'colour');
  return [...palette, makeSwatch({ ...fields, id })];
}

export function updateSwatch(palette, id, fields) {
  return palette.map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...fields, id: s.id, role: s.role };
    if (fields.hex !== undefined) next.hex = normalizeHex(fields.hex) ?? s.hex;
    if (fields.cmyk !== undefined) next.cmyk = fields.cmyk.map((v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0))));
    return next;
  });
}

export function moveSwatch(palette, id, delta) {
  const i = palette.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= palette.length) return palette;
  const out = palette.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// The window marker can't be deleted: the proof always needs it.
export function canDeleteSwatch(swatch) {
  return swatch && swatch.role !== TRANSPARENT;
}

// Applies a preset: swatches with the same id take the preset's values, new ones are added,
// and swatches the design has beyond the preset stay (elements may still use them).
export function mergePalette(palette, preset) {
  const out = palette.map((s) => {
    const p = preset.find((q) => q.id === s.id);
    return p ? makeSwatch({ ...p, role: s.role || p.role }) : s;
  });
  for (const p of preset) if (!out.some((s) => s.id === p.id)) out.push(makeSwatch(p));
  return out;
}

// The scattered parts pattern: the brand's icons on a staggered grid with seeded jitter,
// rotation and size changes, like the WERTIS boxes and the foil mailer.
//
// Each icon is defined once per colour in <defs> and placed with <use>, which keeps the
// preview light and becomes one reusable object in the PDF.
import { PATTERN_ICONS } from '../brand/patternIcons.js';
import { mulberry32, hashString } from '../util/rng.js';
import { el, n } from './svg.js';

export const ICON_IDS = PATTERN_ICONS.map((i) => i.id);

export const PATTERN_DEFAULTS = { icons: null, style: 'solid', outline: 3, size: 18, spacing: 30, rotation: 180, jitter: 0.35, sizeJitter: 0.2, seed: 1, scaling: 'auto', uniform: true };

// How the icons follow the size of the pack. Fixed keeps them in mm (a bigger pack just shows more
// of them); full scales size and spacing with the height; auto is in between, the square root of
// the ratio, so a small pouch keeps its look without tiny icons. The settings are for the reference
// pack (a 350 mm tall pouch), and the icons never shrink below a floor that still prints cleanly.
export const PATTERN_SCALING = [['auto', 'Scale with the pack (partly)'], ['fixed', 'Fixed size'], ['full', 'Scale with the pack (fully)']];
export const PATTERN_REF_HEIGHT = 350;
const EXPONENT = { auto: 0.5, fixed: 0, full: 1 };
const FLOOR = { size: 7, spacing: 12 };

export function patternScale(settings, packHeight) {
  const e = EXPONENT[settings?.scaling ?? PATTERN_DEFAULTS.scaling] ?? 0;
  const h = Number(packHeight);
  return e && h > 0 ? (h / PATTERN_REF_HEIGHT) ** e : 1;
}

// The settings with size and spacing scaled for a pack `packHeight` mm tall (null: not scaled, as for boxes).
export function scaledPattern(settings, packHeight) {
  const k = packHeight == null ? 1 : patternScale(settings, packHeight);
  if (k === 1) return settings;
  const s = { ...PATTERN_DEFAULTS, ...settings };
  return { ...settings, size: Math.max(Math.min(s.size, FLOOR.size), s.size * k), spacing: Math.max(Math.min(s.spacing, FLOOR.spacing), s.spacing * k) };
}

export const PATTERN_STYLES = [['solid', 'Solid silhouettes'], ['outline', 'Outlines']];

export function iconDefId(icon, color, style = 'solid', width = 3) {
  return `pi-${icon}-${color.replace('#', '')}${style === 'outline' ? `-o${String(width).replace('.', '_')}` : ''}`;
}

// Solid: the silhouettes filled. Outline: the same shapes stroked, like line icons. Widths
// are in icon units (an icon is 100 units across).
export function iconDef(icon, color, style = 'solid', width = 3) {
  const ic = PATTERN_ICONS.find((i) => i.id === icon);
  const paint = style === 'outline'
    ? { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }
    : { fill: color };
  return el('g', { id: iconDefId(icon, color, style, width), ...paint }, ic.paths.map((p) => el('path', { 'fill-rule': p.rule, d: p.d })).join(''));
}

// Icon placements for a box: [{ icon, x, y, rotate, scale }]. `key` makes each area differ.
export function placements(box, settings, key = '') {
  const s = { ...PATTERN_DEFAULTS, ...settings };
  const ids = (s.icons && s.icons.length ? s.icons : ICON_IDS).filter((id) => ICON_IDS.includes(id));
  if (!ids.length || s.spacing <= 0 || s.size <= 0) return [];
  const rng = mulberry32((Number(s.seed) || 0) * 7919 + hashString(key));
  const dy = s.spacing * 0.866; // a hexagonal grid: rows closer than columns
  const out = [];
  let bag = [];
  let last = null;
  const pick = () => {
    if (!bag.length) {
      bag = ids.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    let id = bag.pop();
    if (id === last && bag.length) [id, bag[0]] = [bag[0], id];
    last = id;
    return id;
  };
  const rows = Math.ceil((box.h + 2 * s.spacing) / dy);
  const cols = Math.ceil((box.w + 2 * s.spacing) / s.spacing) + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x - s.spacing + c * s.spacing + (r % 2 ? s.spacing / 2 : 0) + (rng() - 0.5) * s.jitter * s.spacing;
      const y = box.y - s.spacing / 2 + r * dy + (rng() - 0.5) * s.jitter * dy;
      const rotate = (rng() * 2 - 1) * s.rotation;
      const scale = (s.size / 100) * (1 + (rng() * 2 - 1) * s.sizeJitter);
      out.push({ icon: pick(), x, y, rotate, scale });
    }
  }
  return out;
}

// With `uniform` on, the icons are laid out once over the whole sheet (`sheet`: its bounds and, for a
// pouch, the width that wraps round), with one shared seed. The bands and the front and back panels
// show slices of the same pattern, so it runs on through the glued seams. A pouch closes into a tube,
// so its columns repeat every `wrap` mm and the far edges meet as well. Each band keeps the icons that
// reach into it (the caller clips the rest). Off: every band lays out its own.
export function sheetPlacements(area, settings, wrap = null) {
  const s = { ...PATTERN_DEFAULTS, ...settings };
  const ids = (s.icons && s.icons.length ? s.icons : ICON_IDS).filter((id) => ICON_IDS.includes(id));
  if (!ids.length || s.spacing <= 0 || s.size <= 0) return [];
  const cols = wrap ? Math.max(1, Math.round(wrap / s.spacing)) : 0;
  const sx = wrap ? wrap / cols : s.spacing;
  const dy = s.spacing * 0.866;
  const seed = (Number(s.seed) || 0) * 7919;
  const cell = (r, c) => mulberry32(seed + r * 1009 + (cols ? ((c % cols) + cols) % cols : c) * 31 + 17);
  const raw = (r, c) => Math.floor(cell(r, c)() * 1e6) % ids.length;
  const out = [];
  for (let r = Math.floor((area.y - s.spacing) / dy); r * dy < area.y + area.h + s.spacing; r++) {
    for (let c = Math.floor((area.x - s.spacing) / sx) - 1; c * sx < area.x + area.w + s.spacing; c++) {
      const rng = cell(r, c);
      rng(); // the first draw is the icon's
      let i = raw(r, c);
      for (let k = 0; k < ids.length && ids.length > 2 && (i === raw(r, c - 1) || i === raw(r - 1, c)); k++) i = (i + 1) % ids.length;
      const x = c * sx + (r % 2 ? sx / 2 : 0) + (rng() - 0.5) * s.jitter * sx;
      const y = r * dy + (rng() - 0.5) * s.jitter * dy;
      out.push({ icon: ids[i], x, y, rotate: (rng() * 2 - 1) * s.rotation, scale: (s.size / 100) * (1 + (rng() * 2 - 1) * s.sizeJitter) });
    }
  }
  return out;
}

// The icons for one band: `box` is in the panel's own mm and `sheet` places the panel on the sheet.
function uniformPlacements(box, settings, key, sheet) {
  if (!sheet || !(settings?.uniform ?? PATTERN_DEFAULTS.uniform)) return placements(box, settings, key);
  const s = { ...PATTERN_DEFAULTS, ...settings };
  const reach = s.size * 0.9; // an icon is 100 units across, so this covers its size and the size jitter
  const { ox, oy } = sheet;
  const x0 = box.x + ox - reach, x1 = box.x + ox + box.w + reach, y0 = box.y + oy - reach, y1 = box.y + oy + box.h + reach;
  const all = sheet.cache?.get(settings) ?? sheetPlacements(sheet.area, settings, sheet.wrap);
  if (sheet.cache && !sheet.cache.has(settings)) sheet.cache.set(settings, all);
  return all.filter((p) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1).map((p) => ({ ...p, x: p.x - ox, y: p.y - oy }));
}

// The pattern for a box in one colour. `defs` (a Map) collects the icon definitions. With
// `inline`, every icon is written out in full instead of placed with <use> (PDF/X files:
// svg2pdf would hide the strokes of reused symbols with a transparent graphics state).
export function patternSvg(box, settings, color, defs, key = '', { inline = false, sheet = null } = {}) {
  if (color === 'none') return '';
  const style = settings?.style === 'outline' ? 'outline' : 'solid';
  const width = Number(settings?.outline) || PATTERN_DEFAULTS.outline;
  let out = '';
  for (const p of uniformPlacements(box, settings, key, sheet)) {
    const id = iconDefId(p.icon, color, style, width);
    const transform = `translate(${n(p.x)} ${n(p.y)}) rotate(${n(p.rotate)}) scale(${n(p.scale)})`;
    if (inline) {
      out += iconDef(p.icon, color, style, width).replace(/^<g id="[^"]*"/, `<g transform="${transform}"`);
      continue;
    }
    if (!defs.has(id)) defs.set(id, iconDef(p.icon, color, style, width));
    out += el('use', { href: `#${id}`, transform });
  }
  return out;
}

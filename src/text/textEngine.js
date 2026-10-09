// Text as outlines. Every piece of text is turned into path data with opentype.js, in the
// preview and in every export, so what the printer gets is exactly what the screen shows
// and no font has to be embedded or installed.
//
// Sizes are em sizes in millimetres. The engine takes parsed fonts, so it runs in Node (the
// tests read the TTFs from disk) and in the browser (fonts.js fetches them).
import { el, n } from '../render/svg.js';

export const FONT_FILES = {
  regular: 'Barlow-Regular.ttf',
  semibold: 'Barlow-SemiBold.ttf',
  bold: 'Barlow-Bold.ttf',
  extrabold: 'Barlow-ExtraBold.ttf',
  extraboldItalic: 'Barlow-ExtraBoldItalic.ttf',
  blackItalic: 'Barlow-BlackItalic.ttf',
  condSemibold: 'BarlowSemiCondensed-SemiBold.ttf',
  condBold: 'BarlowSemiCondensed-Bold.ttf',
  // The printer's W09-0414 file sets its type in Century Gothic, Myriad Pro and Open Sans. Century Gothic
  // and Myriad Pro are commercial, so free look-alikes stand in (Jost, PT Sans) until the real
  // files are loaded in the page; Open Sans is the real thing.
  cg: 'Jost-Regular.ttf', // Century Gothic Regular
  myriad: 'PTSans-Regular.ttf', // Myriad Pro Regular
  myriadBold: 'PTSans-Bold.ttf', // Myriad Pro Bold
  myriadSemiCond: 'BarlowSemiCondensed-SemiBold.ttf', // Myriad Pro Semibold Condensed
  digits: 'OpenSans-Regular.ttf', // Open Sans, the barcode's digits
};

// Which font a role takes. Templates ask for the generic keys (regular, semibold, bold, condSemibold...)
// plus "web" (the website line and the ® mark) and "digits" (the barcode's numbers); a font set says what
// each is. "wertis" follows the printer's file, "barlow" is the app's own look.
export const FONT_SETS = {
  wertis: { regular: 'cg', semibold: 'cg', bold: 'myriadBold', condSemibold: 'myriadSemiCond', condBold: 'myriadBold', web: 'myriad', digits: 'digits' },
  barlow: { web: 'regular', digits: 'regular' },
};
export const DEFAULT_FONT_SET = 'wertis';
// The keys a person can supply their own file for, with what the file should be.
export const OWN_FONT_ROLES = [['cg', 'Century Gothic Regular'], ['myriad', 'Myriad Pro Regular'], ['myriadBold', 'Myriad Pro Bold'], ['myriadSemiCond', 'Myriad Pro Semibold Condensed']];

export class TextEngine {
  constructor(fonts) {
    this.fonts = fonts; // key → opentype Font
    this.defaults = { ...fonts }; // the bundled ones, to go back to
    this.cache = new Map();
    this.fontSet = null;
  }

  // The same engine seen through a font set: the design's keys resolve to its fonts. Cheap, and it
  // shares the fonts and the cache.
  view(setName) {
    const v = Object.create(this);
    v.fontSet = FONT_SETS[setName] ?? FONT_SETS[DEFAULT_FONT_SET];
    return v;
  }

  // A font the person supplied (or the original again with null) takes over a role; text laid out
  // before is forgotten.
  setFont(key, font, file) {
    if (font) this.fonts[key] = font; else this.fonts[key] = this.defaults?.[key] ?? this.fonts[key];
    this.cache.clear();
    this.own = { ...(this.own ?? {}), [key]: font ? (file ?? true) : undefined };
  }

  resolve(key) {
    return this.fontSet?.[key] ?? key;
  }

  font(key) {
    key = this.resolve(key);
    const f = this.fonts[key] ?? this.fonts.regular ?? Object.values(this.fonts)[0];
    if (!f) throw new Error('no fonts loaded');
    return f;
  }

  capHeight(key) {
    const f = this.font(key);
    return (f.tables.os2?.sCapHeight || f.ascender * 0.7) / f.unitsPerEm;
  }

  // One line at the origin (baseline y = 0): its path data and width, cached.
  line(text, key, size, spacing = 0) {
    key = this.resolve(key);
    const k = `${key}|${n(size)}|${spacing}|${text}`;
    let hit = this.cache.get(k);
    if (!hit) {
      const f = this.font(key);
      const opts = { kerning: true, letterSpacing: spacing };
      const glyphs = text.length;
      const width = text ? f.getAdvanceWidth(text, size, opts) - (glyphs ? spacing * size : 0) : 0;
      const d = text.trim() ? pathData(f.getPath(text, 0, 0, size, opts).commands) : '';
      hit = { d, width };
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(k, hit);
    }
    return hit;
  }

  measure(text, key, size, spacing = 0) {
    return this.line(text, key, size, spacing).width;
  }

  // Greedy word wrap of one paragraph to width w.
  wrap(text, key, size, spacing, w) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && this.measure(next, key, size, spacing) > w) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur || !lines.length) lines.push(cur);
    return lines;
  }

  // Lays text out in a box and returns its SVG (one <path> per line) and metrics.
  //   x, y, w, h   the box (w and h optional; without w nothing wraps or shrinks)
  //   size         em size in mm; shrinks down to minSize to fit w (and h)
  //   align        left | center | right       valign  top | middle | bottom (caps-based)
  //   wrap         wrap words to w instead of shrinking first
  //   upper        uppercase the text          spacing letter spacing in em
  //   lineHeight   multiple of size            maxLines with wrap, cut after this many
  layout(spec) {
    const { x = 0, y = 0, w, h, font = 'regular', align = 'left', valign = 'top', wrap = false, spacing = 0, lineHeight = 1.2, maxLines = Infinity } = spec;
    let text = String(spec.text ?? '');
    if (spec.upper) text = text.toLocaleUpperCase('pl');
    let size = spec.size ?? 4;
    const minSize = Math.min(spec.minSize ?? size * 0.5, size);
    const cap = this.capHeight(font);
    const paragraphs = text.split('\n');

    const linesAt = (s) => {
      const out = [];
      for (const p of paragraphs) out.push(...(wrap && w ? this.wrap(p, font, s, spacing, w) : [p]));
      return out.slice(0, maxLines);
    };
    const fits = (s, lines) => {
      const widest = Math.max(0, ...lines.map((l) => this.measure(l, font, s, spacing)));
      const tall = cap * s + (lines.length - 1) * lineHeight * s;
      return (!w || widest <= w + 1e-6) && (!h || tall <= h + 1e-6);
    };
    let lines = linesAt(size);
    // Shrink in small steps until it fits (or the minimum is reached).
    while (!fits(size, lines) && size > minSize) {
      size = Math.max(minSize, size * 0.96);
      lines = linesAt(size);
    }

    const total = cap * size + (lines.length - 1) * lineHeight * size;
    let base = y + cap * size;
    if (valign === 'middle' && h) base = y + (h - total) / 2 + cap * size;
    else if (valign === 'bottom' && h) base = y + h - total + cap * size;
    else if (valign === 'baseline') base = y;

    let svg = '';
    let widest = 0;
    let left = Infinity;
    lines.forEach((ln, i) => {
      const { d, width } = this.line(ln, font, size, spacing);
      widest = Math.max(widest, width);
      const lx = align === 'center' && w ? x + (w - width) / 2 : align === 'right' && w ? x + w - width : align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
      left = Math.min(left, lx);
      if (d) svg += el('path', { d, transform: `translate(${n(lx)} ${n(base + i * lineHeight * size)})` });
    });
    const top = base - cap * size;
    return { svg, size, lines, width: widest, height: total, box: { x: left === Infinity ? x : left, y: top, w: widest, h: total }, baseline: base, lastBaseline: base + (lines.length - 1) * lineHeight * size };
  }
}

// opentype.js 2.0's own toPathData() sometimes writes NaN into a curve (and the browser then
// stops drawing the path there), so commands are serialised here.
export function pathData(commands) {
  let d = '';
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Q') d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'C') d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

// A fill (and optional outline) around the paths that layout() returned.
export function textGroup(laid, fill, extra = {}) {
  if (!laid.svg) return '';
  return el('g', { fill, ...extra }, laid.svg);
}

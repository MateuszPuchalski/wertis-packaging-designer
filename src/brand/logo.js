// Draws the WERTIS logo (or a part of it) into a box, in the colours given per role.
import { LOGO } from './logoPaths.js';
import { el, n } from '../render/svg.js';

// Which parts each layout shows. "mark" is the gear with its arc.
export const LOGO_LAYOUTS = {
  full: { label: 'Full logo', parts: ['mark', 'word', 'line'] },
  markWord: { label: 'Gear + WERTIS', parts: ['mark', 'word'] },
  wordLine: { label: 'WERTIS + line', parts: ['word', 'line'] },
  word: { label: 'WERTIS only', parts: ['word'] },
  mark: { label: 'Gear only', parts: ['mark'] },
};

// part → [[role, shape]]
const SHAPES = {
  mark: [['gear', LOGO.parts.mark.dark], ['arc', LOGO.parts.mark.arc]],
  word: [['word', LOGO.parts.word.dark]],
  line: [['line', LOGO.parts.line.line]],
};

export function logoBounds(layout = 'full') {
  const parts = (LOGO_LAYOUTS[layout] ?? LOGO_LAYOUTS.full).parts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) {
    const [x, y, w, h] = LOGO.parts[p].box;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function logoAspect(layout) {
  const b = logoBounds(layout);
  return b.w / b.h;
}

// Fits the logo inside `box` (keeping its proportions) and returns the SVG and the box it
// actually covers. `colors` maps each role to a colour string or 'none'.
export function logoSvg({ box, layout = 'full', colors, align = 'center', valign = 'middle' }) {
  const parts = (LOGO_LAYOUTS[layout] ?? LOGO_LAYOUTS.full).parts;
  const b = logoBounds(layout);
  const s = Math.min(box.w / b.w, box.h / b.h);
  const w = b.w * s, h = b.h * s;
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y = valign === 'top' ? box.y : valign === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
  let inner = '';
  for (const part of parts) {
    for (const [role, shape] of SHAPES[part]) {
      const fill = colors?.[role] ?? '#000000';
      if (fill === 'none') continue;
      inner += el('path', { fill, 'fill-rule': shape.rule, 'data-role': role, d: shape.d });
    }
  }
  return {
    svg: el('g', { transform: `translate(${n(x)} ${n(y)}) scale(${Number(s.toPrecision(6))}) translate(${n(-b.x)} ${n(-b.y)})` }, inner),
    box: { x, y, w, h },
  };
}

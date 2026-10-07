// Shared test helpers: one TextEngine (the fonts are parsed once) and a fresh design.
import { nodeTextEngine } from '../src/text/nodeFonts.js';
import { createDesign } from '../src/design.js';

let text = null;
export function env() {
  text ??= nodeTextEngine();
  return { text };
}

export function design(opts = {}) {
  return createDesign({ date: '2026-10-07', ...opts });
}

// Browser: fetches the bundled fonts and builds the TextEngine.
import { parse } from '../../vendor/opentype/opentype.min.mjs';
import { TextEngine, FONT_FILES } from './textEngine.js';

export async function loadTextEngine(base = 'assets/fonts/') {
  const entries = await Promise.all(Object.entries(FONT_FILES).map(async ([key, file]) => {
    const res = await fetch(base + file);
    if (!res.ok) throw new Error(`Font ${file} did not load (${res.status}).`);
    return [key, parse(await res.arrayBuffer())];
  }));
  return new TextEngine(Object.fromEntries(entries));
}

// Puts the font files kept in this browser over the bundled look-alikes. A file that does not parse is skipped.
export async function applyStoredFonts(engine, records) {
  const done = [];
  for (const r of records) {
    try { engine.setFont(r.key, parse(r.data), r.name); done.push(r.key); } catch { /* damaged file: keep the look-alike */ }
  }
  return done;
}

export function parseFont(buffer) {
  return parse(buffer);
}

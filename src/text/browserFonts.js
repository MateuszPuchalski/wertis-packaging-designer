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

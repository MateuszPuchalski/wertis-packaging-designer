// Node only (tests and scripts): the TextEngine with the fonts read from assets/fonts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../../vendor/opentype/opentype.min.mjs';
import { TextEngine, FONT_FILES } from './textEngine.js';

const dir = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));

export function nodeTextEngine() {
  const fonts = {};
  for (const [key, file] of Object.entries(FONT_FILES)) {
    const buf = readFileSync(dir + file);
    fonts[key] = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return new TextEngine(fonts);
}

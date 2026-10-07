// Copies the browser libraries from node_modules into vendor/ (committed), so the app runs
// with no build step, offline and from any static host. Run after changing a version in
// package.json: `npm install && npm run vendor`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const nm = (p) => `${root}node_modules/${p}`;
const version = (pkg) => JSON.parse(readFileSync(nm(`${pkg}/package.json`), 'utf8')).version;

const LIBS = [
  { pkg: 'qrcode-generator', dir: 'qrcode-generator', files: [['dist/qrcode.mjs', 'qrcode.mjs']] },
  { pkg: 'jspdf', dir: 'jspdf', files: [['dist/jspdf.umd.min.js', 'jspdf.umd.min.js'], ['LICENSE', 'LICENSE']] },
  { pkg: 'svg2pdf.js', dir: 'svg2pdf', files: [['dist/svg2pdf.umd.min.js', 'svg2pdf.umd.min.js'], ['LICENSE', 'LICENSE']] },
  { pkg: 'opentype.js', dir: 'opentype', files: [['dist/opentype.min.mjs', 'opentype.min.mjs'], ['LICENSE', 'LICENSE']] },
];

// qrcode-generator ships its MIT licence only in the source header.
const QR_LICENSE = `MIT License

Copyright (c) 2009 Kazuhiko Arase

URL: http://www.d-project.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The word 'QR Code' is a registered trademark of DENSO WAVE INCORPORATED.
`;

const lines = ['# Vendored browser libraries', '', 'Copied from node_modules by `npm run vendor`. Do not edit.', ''];
for (const lib of LIBS) {
  mkdirSync(`${root}vendor/${lib.dir}`, { recursive: true });
  for (const [from, to] of lib.files) copyFileSync(nm(`${lib.pkg}/${from}`), `${root}vendor/${lib.dir}/${to}`);
  lines.push(`- \`${lib.dir}/\`: ${lib.pkg} ${version(lib.pkg)} (MIT)`);
}
writeFileSync(`${root}vendor/qrcode-generator/LICENSE`, QR_LICENSE);
writeFileSync(`${root}vendor/README.md`, `${lines.join('\n')}\n`);
console.log(lines.slice(4).join('\n'));

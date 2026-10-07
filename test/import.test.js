import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapPath, pathBox, cluster, readPaths } from '../scripts/lib/svgPaths.js';
import { importLogo } from '../scripts/import-logo.js';
import { LOGO } from '../src/brand/logoPaths.js';

test('path helpers', () => {
  assert.equal(mapPath('M 1 2 L 3 4 C 1 1 2 2 3 3 Z', 2, 10, 0), 'M 12 4 L 16 8 C 12 2 14 4 16 6 Z');
  assert.deepEqual(pathBox('M 1 2 L 3 -4'), [1, -4, 3, 2]);
  const groups = cluster([{ box: [0, 0, 1, 1] }, { box: [50, 50, 51, 51] }, { box: [1.5, 0, 2, 1] }]);
  assert.equal(groups.length, 2);
  const svg = '<svg><defs><path d="M 0 0 L 9 9 Z"/></defs><g clip-path="url(#c)"><path fill="rgb(0%, 0%, 0%)" d="M 1 1 L 2 2 Z"/></g><path fill-rule="evenodd" fill="rgb(1%, 2%, 3%)" d="M 3 3 L 4 4 Z"/></svg>';
  const ps = readPaths(svg);
  assert.deepEqual(ps.map((p) => [p.clipped, p.rule]), [[true, 'nonzero'], [false, 'evenodd']]);
  assert.equal(readPaths(svg, { includeDefs: true }).length, 3);
});

test('the committed logo matches the original Illustrator file', () => {
  const svg = readFileSync(new URL('../assets/brand/source/Logo_WERTIS-p1.svg', import.meta.url), 'utf8');
  assert.deepEqual(importLogo(svg), LOGO);
  assert.deepEqual(Object.keys(LOGO.parts), ['mark', 'word', 'line']);
});

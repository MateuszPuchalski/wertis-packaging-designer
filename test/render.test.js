import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSheet, panelsWithElements } from '../src/render/sheet.js';
import { renderProof } from '../src/render/proof.js';
import { mockupSvg } from '../src/render/mockup.js';
import { printSvg } from '../src/export/documents.js';
import { updateSwatch } from '../src/brand/palette.js';
import { design, env } from './helpers.js';

test('the print file is real size with bleed and nothing a printer cannot read', () => {
  const svg = printSvg(design(), env());
  assert.match(svg, /^<svg [^>]*width="506mm" height="356mm" viewBox="-3 -3 506 356"/);
  assert.ok(!/<filter|<pattern|<mask|<text|<image/.test(svg), 'no filters, patterns, masks, live text or images');
  assert.ok(svg.includes('<g id="artwork">') && svg.includes('<g id="dieline"'));
  assert.ok(!svg.includes('NaN'));
  assert.ok(!svg.includes('data-el'), 'no editor markup');
});

test('the window has no ink in the print file and is marked in the preview', () => {
  const d = design();
  const tr = d.palette.find((s) => s.role === 'transparent').hex;
  const print = renderSheet(d, env(), { mode: 'print' });
  assert.ok(!print.svg.includes(tr), 'the transparent marker colour is not printed');
  assert.ok(/clip-rule="evenodd"/.test(print.svg), 'background art is clipped around the window');
  assert.ok(renderSheet(d, env(), { mode: 'design' }).svg.includes(tr));
});

test('editing a swatch recolours every element that uses it', () => {
  const d = design();
  const next = { ...d, palette: updateSwatch(d.palette, 'boxOrange', { hex: '#00aa55' }) };
  const before = printSvg(d, env()), after = printSvg(next, env());
  const count = (s, c) => s.split(c).length - 1;
  assert.ok(count(before, '#f8992c') >= 4);
  assert.equal(count(after, '#f8992c'), 0);
  assert.equal(count(after, '#00aa55'), count(before, '#f8992c'));
});

test('an element with its own colour keeps it when the swatch changes', () => {
  const d = design();
  d.colors['front.header.fill'] = { custom: '#112233' };
  const next = { ...d, palette: updateSwatch(d.palette, 'boxOrange', { hex: '#00aa55' }) };
  const svg = printSvg(next, env());
  assert.ok(svg.includes('fill="#112233"'));
  assert.ok(svg.includes('#00aa55'), 'the other bands still follow the swatch');
});

test('hidden elements and "no colour" draw nothing', () => {
  const d = design();
  const base = renderSheet(d, env(), { mode: 'print' }).used;
  d.hidden['back.marks'] = true;
  d.colors['back.gear.fill'] = { none: true };
  const r = renderSheet(d, env(), { mode: 'design' });
  assert.ok(!r.hits.some((h) => h.id === 'back.marks'));
  assert.ok(base.has('black'), 'the recycling marks use band black');
  assert.ok(!r.svg.includes('data-el="back.gear"'), 'a gear with no colour draws nothing');
});

test('a layout override moves the window', () => {
  const d = design();
  d.layout['front.window'] = { x: 0.2, y: 0.4, w: 0.4, h: 0.2 };
  const hit = renderSheet(d, env()).hits.find((h) => h.id === 'front.window');
  assert.deepEqual(hit.box, { x: 50, y: 140, w: 100, h: 70 });
  d.options.backWindow = true;
  const back = renderSheet(d, env()).hits.find((h) => h.id === 'back.window');
  assert.deepEqual(back.box, { x: 250 + 250 - 50 - 100, y: 140, w: 100, h: 70 }, 'the back window mirrors the front one');
});

test('the proof lists exactly the inks in use plus the window', () => {
  const d = design();
  const p = renderProof(d, env(), { page: 'a3' });
  assert.match(p.svg, /width="420mm" height="297mm"/);
  assert.ok(p.used.includes('transparent'));
  assert.ok(!p.used.includes('green'), 'unused swatches are not listed');
  assert.ok(p.scale > 0 && p.scale <= 1);
  d.options.windowShape = 'none';
  assert.ok(!renderProof(d, env()).used.includes('transparent'));
  const full = renderProof(design(), env(), { page: 'full' });
  assert.equal(full.scale, 1);
});

test('every element of the template is reported for the editor', () => {
  const parts = panelsWithElements(design(), env());
  const ids = parts.flatMap((p) => p.elements.map((e) => e.id));
  for (const id of ['front.window', 'front.logo', 'back.label', 'back.gear', 'back.marks', 'back.tagline']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
});

test('the mockup shows the photo through the window', () => {
  const d = design();
  assert.ok(!mockupSvg(d, env()).svg.includes('<image'));
  d.mockup.photo = { src: 'data:image/png;base64,iVBORw0KGgo=', w: 400, h: 300, zoom: 1, dx: 0, dy: 0 };
  d.mockup.view = 'both';
  const m = mockupSvg(d, env());
  assert.ok(m.svg.includes('<image'));
  assert.ok(m.box.w > 500, 'both faces');
});

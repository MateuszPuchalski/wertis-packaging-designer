import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setIn } from '../src/design.js';
import { geometry, renderSheet } from '../src/render/sheet.js';
import { POUCH_SIZES } from '../src/formats/flatPouch.js';
import { design, env } from './helpers.js';

// After sealing, only the face between the seals (and above the gusset fold) shows: every text, label,
// code and mark on the back must sit inside the panel's safe area, at every size and both pouch formats.
for (const format of ['flatPouch', 'standUpPouch']) {
  test(`${format}: the back's information stays clear of the seals at every size`, () => {
    for (const [w, h] of POUCH_SIZES) {
      const d = setIn(setIn(design({ format }), ['dims', 'width'], w), ['dims', 'height'], h);
      const back = geometry(d).panels.find((p) => p.id === 'back');
      const s = back.info.safe;
      const hits = renderSheet(d, env(), {}).hits.filter((x) => x.panel === 'back' && ['text', 'label', 'ean', 'qr', 'marks'].includes(x.type));
      assert.ok(hits.length >= 4, `${w}×${h}: address, label, QR and website are on the back`);
      for (const hit of hits) {
        const b = { x: hit.box.x - back.x, y: hit.box.y - back.y, w: hit.box.w, h: hit.box.h };
        const over = Math.max(s.x - b.x, b.x + b.w - (s.x + s.w), s.y - b.y, b.y + b.h - (s.y + s.h));
        assert.ok(over < 0.01, `${format} ${w}×${h}: ${hit.id} is ${over.toFixed(2)} mm outside the safe area`);
      }
    }
  });
}

test('the disposal marks start at their standard size where the pack is big enough, and preflight warns below it', async () => {
  const { MARK_STANDARD } = await import('../src/brand/marks.js');
  const { preflight } = await import('../src/preflight.js');
  const markH = (d) => renderSheet(d, env(), {}).hits.find((x) => x.type === 'marks' && x.panel === 'back').box.h;
  for (const [w, h] of POUCH_SIZES.filter(([w]) => w >= 140)) {
    const d = setIn(setIn(design({ format: 'flatPouch' }), ['dims', 'width'], w), ['dims', 'height'], h);
    assert.ok(markH(d) >= MARK_STANDARD.recycle - 0.05, `${w}×${h}: marks ${markH(d)} mm`);
    assert.ok(!preflight(d, env()).items.some((i) => /high; the standard/.test(i.message)), `${w}×${h}: no mark warning`);
  }
  const small = setIn(setIn(design({ format: 'flatPouch' }), ['dims', 'width'], 100), ['dims', 'height'], 150);
  assert.ok(preflight(small, env()).items.some((i) => /high; the standard is at least 12 mm/.test(i.message)), '10×15 cm warns');
});

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

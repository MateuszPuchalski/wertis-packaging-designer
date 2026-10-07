// Where the packs start in each 3D scene, in the 3D world's units (1 unit = 100 mm, y up,
// the floor at y = 0, the camera looking from +z). DOM-free, so it is tested in Node; the
// physics then takes over from these positions.
import { mulberry32 } from '../util/rng.js';

export const UNIT = 100; // mm per world unit

export const SCENES = {
  stack: { label: 'Neat stack' },
  pile: { label: 'Drop a pile' },
  peg: { label: 'On a peg hook' },
};

export function scenesFor(kind) {
  return kind === 'box' ? ['stack', 'pile'] : ['peg', 'pile', 'stack'];
}

export const MAX_COUNT = { stack: 36, pile: 40, peg: 12 };

// pack: { kind, size: { x, y, z } in mm, thick?: mm where a part swells it, hole: { x, y }
// in mm from the face's top left }
// Returns [{ p: [x, y, z], r: [rx, ry, rz], hang?: { local: [x, y, z], world: [x, y, z] } }].
export function placements(scene, pack, count, seed = 1) {
  const rng = mulberry32(seed);
  const sx = pack.size.x / UNIT, sy = pack.size.y / UNIT, sz = pack.size.z / UNIT;
  const tz = Math.max(sz, (pack.thick ?? 0) / UNIT); // the full thickness, part included
  const n = Math.max(1, Math.min(count, MAX_COUNT[scene] ?? 40));
  const out = [];
  if (scene === 'peg' && pack.kind !== 'box') {
    // A shop peg hook pointing at you: the packs hang one behind another.
    const holeY = sy / 2 - (pack.hole?.y ?? 6) / UNIT; // the hole, from the pack's centre
    const holeX = (pack.hole?.x ?? pack.size.x / 2) / UNIT - sx / 2;
    const rodY = sy + 0.6;
    const step = Math.max(sz * 1.6, tz * 1.15, 0.05);
    for (let i = 0; i < n; i++) {
      const z = 0.3 - i * step;
      out.push({ p: [-holeX, rodY - holeY, z], r: [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.25], hang: { local: [holeX, holeY, 0], world: [0, rodY, z] } });
    }
    return out;
  }
  if (scene === 'stack') {
    if (pack.kind === 'box') {
      // Up to 3 × 2 per layer, front walls towards you, a millimetre apart.
      const cols = Math.min(n, 3), rows = n > 3 ? 2 : 1, perLayer = cols * rows;
      for (let i = 0; i < n; i++) {
        const layer = Math.floor(i / perLayer), j = i % perLayer;
        const c = j % cols, r = Math.floor(j / cols);
        out.push({ p: [(c - (cols - 1) / 2) * (sx + 0.01), sy / 2 + layer * (sy + 0.002) + 0.001, (r - (rows - 1) / 2) * (sz + 0.01)], r: [0, (rng() - 0.5) * 0.04, 0] });
      }
    } else {
      // Pouches lying face up in piles of up to 10 (5 when a part swells them).
      const per = tz > sz * 2 ? 5 : 10;
      const piles = Math.ceil(n / per);
      for (let i = 0; i < n; i++) {
        const pile = Math.floor(i / per), k = i % per;
        out.push({ p: [(pile - (piles - 1) / 2) * (sx + 0.08) + (rng() - 0.5) * 0.03, tz / 2 + k * tz * 1.05 + 0.002, (rng() - 0.5) * 0.03], r: [-Math.PI / 2, 0, (rng() - 0.5) * 0.25] });
      }
    }
    return out;
  }
  // A pile: dropped one after another over a small area, any way up.
  const spread = Math.max(sx, sy, sz) * (0.4 + Math.sqrt(n) * 0.25);
  const big = Math.max(sx, sy, sz);
  for (let i = 0; i < n; i++) {
    out.push({ p: [(rng() - 0.5) * spread, big + 0.3 + i * big * 0.6, (rng() - 0.5) * spread], r: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2] });
  }
  return out;
}

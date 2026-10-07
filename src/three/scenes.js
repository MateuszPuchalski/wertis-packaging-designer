// Where the packs start in each 3D scene, in the 3D world's units (1 unit = 100 mm, y up,
// the floor at y = 0, the camera looking from +z). DOM-free, so it is tested in Node; the
// physics then takes over from these positions.
import { mulberry32 } from '../util/rng.js';

export const UNIT = 100; // mm per world unit

export const SCENES = {
  shop: { label: 'In the shop' },
  stack: { label: 'Neat stack' },
  pile: { label: 'Drop a pile' },
  peg: { label: 'On a peg hook' },
};

export function scenesFor(kind) {
  return kind === 'box' ? ['shop', 'stack', 'pile'] : ['shop', 'peg', 'pile', 'stack'];
}

export const MAX_COUNT = { stack: 36, pile: 40, peg: 12, shop: 32 };

// The shop: a store gondola like the walls of a parts shop. A perforated steel back panel
// (the wall, at z = 0) between two uprights, a base deck and a lit header sign; pouches hang on
// a grid of scan hooks sticking out of the panel, one product per hook, a few deep; boxes stand
// front out on its shelves, in rows up to three deep. World units (100 mm); DOM-free, so the view and
// the tests share it.
export const SHOP = {
  hookLength: 2.5, // the wire sticks out 250 mm
  hookTopY: 14.6, // the top row of hooks, 1.46 m up
  deckY: 1.4, // the base deck's top
  deckDepth: 4.5,
  shelfDepth: 4,
  shelfYs: [11.2, 6.8, 1.4], // shelf tops for boxes: eye level first, then down to the deck
  height: 18.5, // the back panel's top; the header sign sits above it
  header: 2.2,
};

// Hooks (and so columns) for n pouches: up to three across and two rows.
export function shopLayout(pack, count) {
  const sx = pack.size.x / UNIT, sy = pack.size.y / UNIT;
  const n = Math.max(1, Math.min(count, maxCount('shop', pack.kind)));
  if (pack.kind === 'box') {
    const sz = pack.size.z / UNIT;
    // One product's stock takes a section of the shelf: up to six across, three deep.
    const across = Math.max(1, Math.min(6, Math.floor(9.6 / (sx + 0.05))));
    const deep = Math.max(1, Math.min(3, Math.floor((SHOP.shelfDepth - 0.4) / (sz + 0.06))));
    const perShelf = across * deep;
    const shelves = SHOP.shelfYs.slice(0, Math.min(SHOP.shelfYs.length, Math.ceil(n / perShelf)));
    const used = Math.min(across, n);
    const width = Math.max(used * (sx + 0.05) + 1.2, 4.4);
    return { kind: 'box', n, width, across, deep, perShelf, shelves: SHOP.shelfYs, filled: shelves, sx, sz };
  }
  const cols = Math.min(3, n), rows = n > 3 ? 2 : 1;
  const colStep = Math.max(sx + 0.7, 3.2), rowStep = sy + 1.3;
  const hooks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) hooks.push({ x: (c - (cols - 1) / 2) * colStep, y: SHOP.hookTopY - r * rowStep, len: SHOP.hookLength });
  }
  const width = Math.max(cols * colStep + 0.8, 6);
  return { kind: 'pouch', n, width, hooks, cols, rows };
}
// Soft pouches cost more to simulate than rigid boxes: ten at most.
export const MAX_POUCHES = 10;
export function maxCount(scene, kind) {
  return kind === 'box' ? MAX_COUNT[scene] ?? 40 : Math.min(MAX_POUCHES, MAX_COUNT[scene] ?? 40);
}

// pack: { kind, size: { x, y, z } in mm, thick?: mm where a part swells it, hole: { x, y }
// in mm from the face's top left }
// Returns [{ p: [x, y, z], r: [rx, ry, rz], hang?: { local: [x, y, z], world: [x, y, z] } }].
export function placements(scene, pack, count, seed = 1) {
  const rng = mulberry32(seed);
  const sx = pack.size.x / UNIT, sy = pack.size.y / UNIT, sz = pack.size.z / UNIT;
  const tz = Math.max(sz, (pack.thick ?? 0) / UNIT); // the full thickness, part included
  const n = Math.max(1, Math.min(count, maxCount(scene, pack.kind)));
  const out = [];
  if (scene === 'shop') {
    const L = shopLayout(pack, count);
    if (pack.kind === 'box') {
      // Front out, side by side, up to three deep; the eye-level shelf fills first.
      for (let i = 0; i < L.n; i++) {
        const shelf = Math.floor(i / L.perShelf), j = i % L.perShelf;
        const c = j % L.across, row = Math.floor(j / L.across);
        const cols = Math.min(L.across, L.n - shelf * L.perShelf);
        const x = (c - (Math.min(cols, L.across) - 1) / 2) * (sx + 0.05);
        const z = SHOP.shelfDepth - 0.25 - sz / 2 - row * (sz + 0.06);
        out.push({ p: [x, L.shelves[shelf] + sy / 2 + 0.002, z], r: [0, (rng() - 0.5) * 0.05, 0] });
      }
      return out;
    }
    // Hung like stock: one hook after another, then a second pack behind each, and so on.
    const holeY = sy / 2 - (pack.hole?.y ?? 6) / UNIT;
    const holeX = (pack.hole?.x ?? pack.size.x / 2) / UNIT - sx / 2;
    const step = Math.max(sz * 1.6, tz * 1.15, 0.05);
    for (let i = 0; i < L.n; i++) {
      const hk = L.hooks[i % L.hooks.length], k = Math.floor(i / L.hooks.length);
      const z = hk.len - 0.3 - k * step;
      out.push({ p: [hk.x - holeX, hk.y - holeY, z], r: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.15], hang: { local: [holeX, holeY, 0], world: [hk.x, hk.y, z] } });
    }
    return out;
  }
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
  // A pile: dropped one after another over a small area. Boxes land any way up; pouches,
  // being flat and light, fall more or less flat, face or back up, turned any way.
  const big = Math.max(sx, sy, sz);
  if (pack.kind !== 'box') {
    const spread = Math.max(sx, sy) * (0.3 + Math.sqrt(n) * 0.18);
    for (let i = 0; i < n; i++) {
      const up = rng() < 0.65 ? -1 : 1;
      out.push({ p: [(rng() - 0.5) * spread, tz + 0.15 + i * (tz + 0.12), (rng() - 0.5) * spread], r: [up * Math.PI / 2 + (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.3, rng() * Math.PI * 2] }); // XYZ: tilt, then a turn about the bag's own face
    }
    return out;
  }
  const spread = big * (0.4 + Math.sqrt(n) * 0.25);
  for (let i = 0; i < n; i++) {
    out.push({ p: [(rng() - 0.5) * spread, big + 0.3 + i * big * 0.6, (rng() - 0.5) * spread], r: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2] });
  }
  return out;
}

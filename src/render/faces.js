// The six faces of a finished pack as standalone SVG pictures, for the 3D view: the box walls
// cut from the flat artwork, the lid turned the way it sits on the closed box, and the pouch
// faces with their film, crimps and see-through window (as in the mockup). Also the pack's
// size and, for pouches, where the hang hole is.
import { el, n } from './svg.js';
import { geometry, panelsWithElements, wrapSvg } from './sheet.js';
import { panelArt } from './artwork.js';
import { rc, pouchFace } from './mockup.js';

const BOARD_INSIDE = '#e9e2d4'; // the unprinted inside of the board

function standalone(inner, defs, w, h) {
  return wrapSvg((defs ? el('defs', {}, defs) : '') + inner, { x: 0, y: 0, w, h });
}

function boxFaces(design, env, geo, parts) {
  const ctx = rc(design, env);
  const body = parts.find((p) => p.panel.role === 'boxBody');
  const lid = parts.find((p) => p.panel.role === 'boxLid');
  const flat = (part) => panelArt(ctx, { ...part.panel, bleedSides: { l: false, t: false, r: false, b: false } }, part.elements).svg;
  const bodyArt = flat(body), lidArt = flat(lid);
  const defs = [...ctx.defs.values()].join('');
  const { length: L, width: W, height: H } = geo.dims;
  const wall = (f) => standalone(el('g', { transform: `translate(${n(-f.x)} 0)` }, bodyArt), defs, f.w, H);
  const [back, left, front, right] = body.panel.info.faces;
  return {
    kind: 'box',
    size: { x: L, y: H, z: W },
    faces: {
      front: wall(front), back: wall(back), left: wall(left), right: wall(right),
      // Seen from above with the front at the bottom, the lid's artwork is turned half round.
      top: standalone(el('g', { transform: `rotate(180 ${n(L / 2)} ${n(W / 2)})` }, lidArt), defs, L, W),
      bottom: standalone(el('rect', { x: 0, y: 0, width: L, height: W, fill: BOARD_INSIDE }), '', L, W),
    },
    edge: BOARD_INSIDE,
  };
}

function pouchFaces(design, env, geo, parts) {
  const ctx = rc(design, env);
  const front = parts.find((p) => p.panel.role === 'front'), back = parts.find((p) => p.panel.role === 'back');
  const W = front.panel.w, H = front.panel.h;
  const make = (part) => {
    const defs = [];
    let k = 0;
    const ids = (p) => `f${p}${++k}`;
    ids.shadow = 'fc-shadow';
    ids.shadowSoft = 'fc-shadow-soft';
    defs.push(el('filter', { id: ids.shadowSoft, x: '-10%', y: '-10%', width: '120%', height: '120%' }, el('feDropShadow', { dx: 0, dy: n(Math.min(W, H) * 0.012), stdDeviation: n(Math.min(W, H) * 0.012), 'flood-opacity': 0.35 })));
    const face = pouchFace(design, env, part, ctx, defs, ids);
    return standalone(face, [...ctx.defs.values(), ...defs].join(''), W, H);
  };
  const zone = front.panel.info?.bottomZone ?? 0;
  const d = geo.dims;
  const hole = d.hole && d.hole !== 'none' ? { x: W / 2, y: d.holeOffset } : { x: W / 2, y: Math.min(6, H * 0.03) };
  return {
    kind: zone ? 'standup' : 'pouch',
    size: { x: W, y: H, z: zone ? Math.min(zone * 0.9, W * 0.4) : Math.max(4, Math.min(W, H) * 0.03) },
    faces: { front: make(front), back: make(back) },
    edge: '#f0ede8',
    hole,
    holeShape: d.hole ?? 'none',
  };
}

export function packFaces(design, env) {
  const geo = geometry(design);
  const parts = panelsWithElements(design, env, geo);
  return geo.format === 'tuckBox' ? boxFaces(design, env, geo, parts) : pouchFaces(design, env, geo, parts);
}



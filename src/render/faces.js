// The six faces of a finished pack as standalone SVG pictures, for the 3D view: the box walls
// cut from the flat artwork, the lid turned the way it sits on the closed box, and the pouch
// faces with their film, crimps and seals (as in the mockup). A pouch's windows are left
// open: the 3D view lays the film's sheen over them (filmFront, filmBack), lines the pouch
// with the white of the underprint (insideFront, insideBack) and puts the part inside. Also
// the pack's size, where the hang hole is and where the part sits.
import { el, n } from './svg.js';
import { geometry, panelsWithElements, wrapSvg } from './sheet.js';
import { panelArt, windowPath } from './artwork.js';
import { rc, pouchFace, productLayer, standUpOutline } from './mockup.js';
import { productOf, thicknessWith, arrange } from '../three/products.js';

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

const INSIDE = '#f4f3f1'; // the white underprint, seen from inside the pouch

function windowsOf(design, part) {
  return part.elements.filter((e) => e.type === 'window' && !design.hidden?.[e.id] && e.box.w > 0 && e.box.h > 0);
}

// The film over the windows: a faint white with a glare streak and a bright edge; clear
// everywhere else.
function filmSvg(windows, W, H) {
  if (!windows.length) return standalone('', '', W, H);
  const id = 'film-glare';
  const defs = el('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0.6 },
    [[0, 0.09], [0.4, 0.09], [0.46, 0.55], [0.52, 0.14], [0.58, 0.34], [0.63, 0.09], [1, 0.09]]
      .map(([o, a]) => el('stop', { offset: o, 'stop-color': '#ffffff', 'stop-opacity': a })).join(''));
  const body = windows.map((w) => {
    const d = windowPath(w);
    return el('path', { d, fill: `url(#${id})` }) + el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': 0.8 });
  }).join('');
  return standalone(body, defs, W, H);
}

// The inside of a panel: white, with its own windows and the hang hole open. `photo` puts
// the mockup's product photo on the inside of the back panel, behind the front window (seen
// from inside, so the back face's picture is mirrored).
function insideSvg(design, part, windows, W, H, photoLayer = '') {
  const zone = part.panel.info?.bottomZone ?? 0;
  const outline = zone ? standUpOutline(W, H, zone, design.dims.corner ?? 0) : part.panel.lines.cut[0];
  const holes = windows.map(windowPath).join('') + part.panel.lines.holes.join('');
  const body = el('path', { d: outline + holes, 'fill-rule': 'evenodd', fill: INSIDE });
  const mirrored = photoLayer ? el('g', { transform: `translate(${n(W)} 0) scale(-1 1)` }, photoLayer) : '';
  return standalone(body + mirrored, '', W, H);
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
    const face = pouchFace(design, env, part, ctx, defs, ids, { open: true });
    return standalone(face, [...ctx.defs.values(), ...defs].join(''), W, H);
  };
  const zone = front.panel.info?.bottomZone ?? 0;
  const d = geo.dims;
  const hole = d.hole && d.hole !== 'none' ? { x: W / 2, y: d.holeOffset } : { x: W / 2, y: Math.min(6, H * 0.03) };
  const fw = windowsOf(design, front), bw = windowsOf(design, back);
  // The parts lie behind the biggest front window (or inside the seals when there is none),
  // placed in mm from the face's top left.
  const model = productOf(design.mockup?.product3d);
  const win = [...fw].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
  const seal = d.sideSeal ?? 0;
  const top = d.zip ? d.zipOffset + (d.zipWidth ?? 0) : d.topSeal ?? 0;
  const inner = { x: seal, y: top, w: W - 2 * seal, h: H - top - (d.bottomSeal ?? 0) - zone };
  const product = model ? { id: design.mockup.product3d, parts: arrange(model, win?.box ?? inner) } : null;
  const photo = !model && win && design.mockup?.photo?.src ? productLayer({ box: win.box }, design.mockup.photo) : '';
  const base = zone ? Math.min(zone * 0.9, W * 0.4) : Math.max(4, Math.min(W, H) * 0.03);
  return {
    kind: zone ? 'standup' : 'pouch',
    size: { x: W, y: H, z: base },
    // Thickness where the part is: the stack and the peg space the packs by it.
    thick: Math.max(base, thicknessWith(model)),
    faces: {
      front: make(front), back: make(back),
      filmFront: filmSvg(fw, W, H), filmBack: filmSvg(bw, W, H),
      insideFront: insideSvg(design, front, fw, W, H), insideBack: insideSvg(design, back, bw, W, H, photo),
    },
    edge: '#f0ede8',
    hole,
    holeShape: d.hole ?? 'none',
    dims: d,
    film: design.mockup?.film3d ?? 'heavy',
    product,
  };
}

export function packFaces(design, env) {
  const geo = geometry(design);
  const parts = panelsWithElements(design, env, geo);
  return geo.format === 'tuckBox' ? boxFaces(design, env, geo, parts) : pouchFaces(design, env, geo, parts);
}



// Parts that can sit in a pouch in the 3D view, modelled from their measurements in mm, so no
// photos are needed and the parts show at their real size against the pack. DOM-free:
// three.js comes in as an argument, so the tests build the models in Node.
//
// A product is a set of parts laid out flat on the pouch's back panel like on the product
// photo. Each part is built with its axis through the window (local z towards the front),
// centred on z = 0; `sides` says what the film is pulled over, as steps { r, h } (radius
// from the part's centre and height above the centre plane, mm) for the front and the back,
// and `bulge` turns them into the pouch's swelling.

const CLEARANCE = 1.2; // film thickness and slack around a part, mm
const DRAPE = (h) => 1.6 * h + 8; // how far the film takes to come back down, mm

// --- building blocks (all in "lathe space": the part's axis is y) ---------------------

const TAU = Math.PI * 2;

function circle(r, steps = 64, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < steps; i++) pts.push([cx + r * Math.cos((i / steps) * TAU), cy + r * Math.sin((i / steps) * TAU)]);
  return pts;
}

// A round hole with `count` notches cut outwards (the splines of a rim sprocket's bore).
function splined(r, count, depth, steps = 8) {
  const pts = [];
  for (let i = 0; i < count * steps; i++) {
    const phase = (i % steps) / steps, a = (i / (count * steps)) * TAU;
    const rr = r + (phase > 0.3 && phase < 0.7 ? depth : 0);
    pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  return pts;
}

function shapeOf(THREE, outline, holes = []) {
  const v = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const s = new THREE.Shape(v(outline));
  for (const h of holes) s.holes.push(new THREE.Path(v(h)));
  return s;
}

// A flat shape extruded along the axis from y0 to y1, with a small bevel.
function plate(THREE, shape, y0, y1, bevel = 0) {
  const b = Math.min(bevel, (y1 - y0) / 4);
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); // extruded along +z → along the axis (+y); the shape's x, y keep their directions once the part is turned to face the window
  g.translate(0, y0 + b, 0);
  return g;
}

// A turned surface from a run of (r, y) points. The runs go round a section anticlockwise,
// so the normals point out; each run is its own lathe, so the edges between them stay sharp.
function lathe(THREE, pts, segments = 72) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Plain, non-indexed geometries with positions and normals, joined into one.
function merge(THREE, list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// { material: [geometry] } in lathe space → { material: geometry } facing the window
// (axis along z), centred on z = 0.
function finish(THREE, groups, [y0, y1]) {
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const g = merge(THREE, list);
    g.rotateX(Math.PI / 2); // axis y → z, the top of the part towards the window
    g.translate(0, 0, -(y0 + y1) / 2);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out[key] = g;
  }
  return out;
}

function collect() {
  const groups = {};
  const add = (key, ...gs) => (groups[key] ??= []).push(...gs);
  return { groups, add };
}

// --- the Stihl 017 / 018 clutch kit (MS170, MS180; the listing also names MS210, MS230,
// MS250, MS181, MS190, MS211, MS231), after the shop's photos. Measurements: the drum is
// Ø69 mm (shop listings give 68 to 69 mm); the rest is sized against it on the photos.

// A 3/8" P rim sprocket with 7 teeth (stamped "P-7"): two flanges with the 7 pockets for
// the drive links, a core between them, and a splined bore.
export const RIM = { outer: 18, core: 14.2, bore: 9, spline: 0.8, splines: 8, pockets: 7, pocketAt: 13.4, pocketR: 3.1, flange: 2.2, width: 9.6, bevel: 0.3 };

export function rimShape(THREE, R = RIM) {
  const pockets = [];
  for (let i = 0; i < R.pockets; i++) {
    const a = (i / R.pockets) * TAU + Math.PI / 2;
    pockets.push(circle(R.pocketR, 18, R.pocketAt * Math.cos(a), R.pocketAt * Math.sin(a)));
  }
  return shapeOf(THREE, circle(R.outer, 64), [splined(R.bore, R.splines, R.spline), ...pockets]);
}

function rimSprocket(THREE, add, y0, key = 'sintered') {
  const R = RIM;
  const face = rimShape(THREE);
  add(key, plate(THREE, face, y0, y0 + R.flange, R.bevel), plate(THREE, face, y0 + R.width - R.flange, y0 + R.width, R.bevel));
  add(key, plate(THREE, shapeOf(THREE, circle(R.core, 48), [splined(R.bore, R.splines, R.spline)]), y0 + R.flange, y0 + R.width - R.flange));
}

// The drum: a pressed steel cup Ø69 × 23.5 mm with a well-rounded edge, turned bright inside
// where the shoes run, and on its hub the rim sprocket and the splined collar that drives
// it; a Ø13 mm bore for the needle bearing.
const DRUM_SPAN = [0, 36.2];
function buildDrum(THREE) {
  const { groups, add } = collect();
  const fillet = [];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); fillet.push([30.5 + 4 * Math.cos(a), 19.5 + 4 * Math.sin(a)]); }
  for (const [key, pts] of [
    ['inner', [[32.7, 1], [33.2, 0], [34, 0], [34.5, 0.5]]],
    ['steel', [[34.5, 0.5], [34.5, 19.5]]],
    ['steel', fillet],
    ['steel', [[30.5, 23.5], [14.5, 23.5]]],
    ['steel', [[14.5, 23.5], [14, 24.2], [12, 24.4]]],
    ['steel', [[12, 24.4], [9, 24.4]]],
    ['steel', [[9, 24.4], [9, 35.6]]],
    ['steel', [[9, 35.6], [8.4, 36.2], [6.5, 36.2]]],
    ['bore', [[6.5, 36.2], [6.5, 21.5]]],
    ['inner', [[6.5, 21.5], [30, 21.5]]],
    ['inner', [[30, 21.5], [31.6, 21], [32.4, 20.2], [32.7, 19]]],
    ['inner', [[32.7, 19], [32.7, 1]]],
  ]) add(key, lathe(THREE, pts, 64));
  rimSprocket(THREE, add, 24.4);
  // The splined collar above the rim.
  const collar = [];
  for (let i = 0; i < RIM.splines * 8; i++) {
    const phase = (i % 8) / 8, a = (i / (RIM.splines * 8)) * TAU;
    const r = phase > 0.32 && phase < 0.68 ? RIM.bore + RIM.spline - 0.05 : RIM.bore;
    collar.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  add('steel', plate(THREE, shapeOf(THREE, collar, [circle(6.5, 48)]), 34, 35.6, 0.2));
  return finish(THREE, groups, DRUM_SPAN);
}

// The clutch: three shoes round a dark three-armed carrier with a hex hub, held together by
// three springs across the slits between the shoes. Ø63 mm, 10 mm thick.
const CLUTCH = { outer: 31.5, inner: 11.2, arm: 5.5, armTo: 23.5, thick: 10, hex: 10.2, hexThick: 11.5, spring: { at: 24, r: 2, wire: 0.55, length: 13, turns: 8 } };
const CLUTCH_SPAN = [0, CLUTCH.thick - 0.6 + CLUTCH.spring.r + CLUTCH.spring.wire];

function shoeOutline(am) {
  const C = CLUTCH;
  const gap = 2 / C.outer;
  const a0 = am - Math.PI / 3 + gap / 2, a1 = am + Math.PI / 3 - gap / 2;
  const u = [Math.cos(am), Math.sin(am)], v = [-Math.sin(am), Math.cos(am)];
  const at = (s, t) => [u[0] * s + v[0] * t, u[1] * s + v[1] * t];
  const d = Math.asin(C.arm / C.inner), foot = Math.sqrt(C.inner ** 2 - C.arm ** 2);
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = a0 + ((a1 - a0) * i) / 14; pts.push([C.outer * Math.cos(a), C.outer * Math.sin(a)]); }
  for (let i = 0; i <= 8; i++) { const a = a1 + ((am + d - a1) * i) / 8; pts.push([C.inner * Math.cos(a), C.inner * Math.sin(a)]); }
  pts.push(at(foot, C.arm), at(C.armTo, C.arm), at(C.armTo, -C.arm), at(foot, -C.arm));
  for (let i = 0; i <= 8; i++) { const a = am - d + ((a0 - am + d) * i) / 8; pts.push([C.inner * Math.cos(a), C.inner * Math.sin(a)]); }
  return pts;
}

function buildClutch(THREE) {
  const C = CLUTCH;
  const { groups, add } = collect();
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = TAU * C.spring.turns * t;
      return target.set(C.spring.length * (t - 0.5), C.spring.r * Math.cos(a), C.spring.r * Math.sin(a));
    }
  }
  for (let k = 0; k < 3; k++) {
    const am = Math.PI / 2 + (k * TAU) / 3;
    add('shoe', plate(THREE, shapeOf(THREE, shoeOutline(am)), 0, C.thick, 0.4));
    const u = [Math.cos(am), Math.sin(am)], v = [-Math.sin(am), Math.cos(am)];
    const arm = [[9, 5.3], [C.armTo - 0.2, 5.3], [C.armTo - 0.2, -5.3], [9, -5.3]].map(([s, t]) => [u[0] * s + v[0] * t, u[1] * s + v[1] * t]);
    add('carrier', plate(THREE, shapeOf(THREE, arm), 0.3, C.thick - 0.3, 0.3));
    // A spring across the slit after this shoe, lying in the face.
    const s = am + Math.PI / 3;
    const g = new THREE.TubeGeometry(new Helix(), 96, C.spring.wire, 6, false);
    g.rotateY(s + Math.PI / 2); // the helix's axis along the tangent at the slit
    g.translate(C.spring.at * Math.cos(s), C.thick - 0.6, -C.spring.at * Math.sin(s));
    add('spring', g);
  }
  const hex = [];
  for (let i = 0; i < 6; i++) hex.push([C.hex * Math.cos((i / 6) * TAU), C.hex * Math.sin((i / 6) * TAU)]);
  add('bright', plate(THREE, shapeOf(THREE, hex, [circle(5.2, 40)]), 0, C.hexThick, 0.4));
  add('bore', lathe(THREE, [[5.15, C.hexThick - 0.4], [5.15, 0.4]], 40));
  return finish(THREE, groups, CLUTCH_SPAN);
}

// The spare rim sprocket, flat on the film.
function buildRim(THREE) {
  const { groups, add } = collect();
  rimSprocket(THREE, add, 0);
  return finish(THREE, groups, [0, RIM.width]);
}

// The needle bearing (10 × 13 × 10 mm): a cage of two rings and bars round 12 needles. It
// lies on its side, its axis across the face.
const BEARING = { length: 10, needles: 12, needleR: 0.75, at: 6, ring: [5, 6.4] };
function buildBearing(THREE) {
  const B = BEARING;
  const { groups, add } = collect();
  const h = B.length / 2, [ri, ro] = B.ring;
  for (const [y0, y1] of [[-h, -h + 1.1], [h - 1.1, h]]) add('cage', lathe(THREE, [[ri, y0], [ro, y0], [ro, y1], [ri, y1], [ri, y0]], 48));
  for (let i = 0; i < B.needles; i++) {
    const a = (i / B.needles) * TAU;
    const n = new THREE.CylinderGeometry(B.needleR, B.needleR, B.length - 2.4, 10);
    n.translate(B.at * Math.cos(a), 0, B.at * Math.sin(a));
    add('bright', n);
    const b = a + Math.PI / B.needles; // the bars sit between the needles
    const bar = new THREE.BoxGeometry(1, B.length - 2.2, 0.9);
    bar.rotateY(-(b + Math.PI / 2));
    bar.translate(B.at * Math.cos(b), 0, B.at * Math.sin(b));
    add('cage', bar);
  }
  for (const list of Object.values(groups)) for (const g of list) g.rotateZ(Math.PI / 2); // on its side
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const g = merge(THREE, list);
    g.rotateX(Math.PI / 2);
    g.computeBoundingBox();
    out[key] = g;
  }
  return out;
}

// The cup washer, Ø22 mm, zinc-plated, dished towards the window.
const WASHER_SPAN = [0, 3];
function buildWasher(THREE) {
  const { groups, add } = collect();
  add('bright', lathe(THREE, [[5, 2.2], [6, 2.2], [9, 0.2], [11, 0], [11, 0.8], [9.3, 0.95], [6.3, 3], [5, 3], [5, 2.2]], 64));
  return finish(THREE, groups, WASHER_SPAN);
}

// The E-clip that holds it all on the crankshaft, black, Ø15 mm.
const ECLIP_SPAN = [0, 0.9];
function buildEclip(THREE) {
  const { groups, add } = collect();
  const pts = [];
  const open = 0.55; // half the opening, rad
  for (let i = 0; i <= 40; i++) { const a = open + ((TAU - 2 * open) * i) / 40; pts.push([7.4 * Math.cos(a), 7.4 * Math.sin(a)]); }
  for (let i = 40; i >= 0; i--) {
    const a = open + ((TAU - 2 * open) * i) / 40;
    // Three lugs that grip the groove, at the back and to both sides.
    const lug = [Math.PI / 2, Math.PI, (3 * Math.PI) / 2].some((c) => Math.abs(a - c) < 0.22);
    const r = lug ? 3.7 : 4.8;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  add('black', plate(THREE, shapeOf(THREE, pts), 0, 0.9));
  return finish(THREE, groups, ECLIP_SPAN);
}

// Steps for a part built over `span`: front tops and back bottoms in lathe y.
function sides(span, front, back) {
  const c = (span[0] + span[1]) / 2;
  return { front: front.map(([r, y]) => ({ r, h: y - c })), back: back.map(([r, y]) => ({ r, h: c - y })) };
}

const R_OUT = RIM.outer + RIM.bevel;
// `hull`: the part as a few cylinders for the soft pouch's film to rest on (mm, centred like
// the model; axis z unless `axis: 'x'`).
const centred = (span, ...cyl) => cyl.map(([r, y0, y1, axis]) => ({ r, z0: y0 - (span[0] + span[1]) / 2, z1: y1 - (span[0] + span[1]) / 2, axis: axis ?? 'z' }));
export const PARTS = {
  drum: {
    label: 'Clutch drum with rim sprocket', radius: 34.5, depth: DRUM_SPAN[1] - DRUM_SPAN[0], mass: 0.13, build: buildDrum,
    sides: sides(DRUM_SPAN, [[34.5, 23.5], [R_OUT, 24.4 + RIM.width], [RIM.bore + RIM.spline + 0.2, 35.6], [9, 36.2]], [[34.5, 0]]),
    hull: centred(DRUM_SPAN, [34.5, 0, 23.5], [R_OUT, 23.5, 24.4 + RIM.width], [RIM.bore + RIM.spline + 0.2, 24.4 + RIM.width, 36.2]),
  },
  clutch: {
    label: 'Clutch', radius: CLUTCH.outer + 0.4, depth: CLUTCH_SPAN[1], mass: 0.12, build: buildClutch,
    sides: sides(CLUTCH_SPAN, [[CLUTCH.outer + 0.4, CLUTCH.hexThick], [28, CLUTCH_SPAN[1]]], [[CLUTCH.outer + 0.4, 0]]),
    hull: centred(CLUTCH_SPAN, [CLUTCH.outer + 0.4, CLUTCH_SPAN[0], CLUTCH_SPAN[1]]),
  },
  rim: { label: 'Spare rim sprocket 3/8" P, 7 teeth', radius: R_OUT, depth: RIM.width, mass: 0.02, build: buildRim, sides: sides([0, RIM.width], [[R_OUT, RIM.width]], [[R_OUT, 0]]), hull: centred([0, RIM.width], [R_OUT, 0, RIM.width]) },
  bearing: {
    label: 'Needle bearing', radius: Math.hypot(BEARING.length / 2, BEARING.at + BEARING.needleR), depth: 2 * (BEARING.at + BEARING.needleR), mass: 0.005, build: buildBearing,
    sides: { front: [{ r: Math.hypot(BEARING.length / 2, BEARING.at + BEARING.needleR), h: BEARING.at + BEARING.needleR }], back: [{ r: Math.hypot(BEARING.length / 2, BEARING.at + BEARING.needleR), h: BEARING.at + BEARING.needleR }] },
    hull: [{ r: BEARING.at + BEARING.needleR, z0: -BEARING.length / 2, z1: BEARING.length / 2, axis: 'x' }],
  },
  washer: { label: 'Cup washer', radius: 11, depth: 3, mass: 0.003, build: buildWasher, sides: sides(WASHER_SPAN, [[11, 3]], [[11, 0]]), hull: centred(WASHER_SPAN, [11, 0, 3]) },
  eclip: { label: 'E-clip', radius: 7.4, depth: 0.9, mass: 0.0005, build: buildEclip, sides: sides(ECLIP_SPAN, [[7.4, 0.9]], [[7.4, 0]]), hull: centred(ECLIP_SPAN, [7.4, 0, 0.9]) },
};

// Colours picked from the shop's photos; `env` is how much of the room the metal reflects.
export const MATERIALS = {
  steel: { color: '#5f5c56', metalness: 0.6, roughness: 0.5, env: 0.45 }, // the pressed drum, natural steel
  inner: { color: '#85837e', metalness: 0.7, roughness: 0.38, env: 0.5 }, // turned bright where the shoes run
  sintered: { color: '#6a6862', metalness: 0.5, roughness: 0.65, env: 0.4 }, // rim sprockets
  bore: { color: '#3a3b3e', metalness: 0.6, roughness: 0.5, env: 0.4 },
  shoe: { color: '#7d7a73', metalness: 0.55, roughness: 0.55, env: 0.45 },
  carrier: { color: '#262729', metalness: 0.3, roughness: 0.6, env: 0.3 },
  spring: { color: '#4b4d50', metalness: 0.7, roughness: 0.4, env: 0.45 },
  bright: { color: '#a9acb0', metalness: 0.9, roughness: 0.25, env: 0.6 }, // zinc and polished steel
  cage: { color: '#8f9397', metalness: 0.85, roughness: 0.32, env: 0.55 },
  black: { color: '#18181a', metalness: 0.3, roughness: 0.5, env: 0.3 },
};

export const PRODUCTS = {
  none: { label: 'Nothing (empty pack)' },
  clutchDrum: {
    label: 'Clutch drum kit, Stihl MS170 / MS180',
    // Where each part lies, as on the shop's photo (mm from the set's middle, y down; turn
    // in degrees).
    layout: [
      { part: 'clutch', x: -48, y: -46, turn: 8 },
      { part: 'rim', x: 14, y: -58, turn: 0 },
      { part: 'bearing', x: 60, y: -56, turn: -12 },
      { part: 'eclip', x: -26, y: 8, turn: 30 },
      { part: 'washer', x: 22, y: 2, turn: 0 },
      { part: 'drum', x: 8, y: 50, turn: 0 },
    ],
  },
};

export function productOf(id) {
  return PRODUCTS[id]?.layout ? PRODUCTS[id] : null;
}

// The product's parts placed inside `box` (mm, the face's coordinates): the set is centred
// on the box, and squeezed together when the box is smaller than the set (the parts keep
// their size). Returns [{ part, x, y, turn }].
export function arrange(product, box, margin = 4) {
  const items = product.layout;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    const r = PARTS[it.part].radius;
    x0 = Math.min(x0, it.x - r); x1 = Math.max(x1, it.x + r);
    y0 = Math.min(y0, it.y - r); y1 = Math.max(y1, it.y + r);
  }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  // Squeeze the centres only: the spread between centres has to fit in what is left.
  const big = Math.max(...items.map((it) => PARTS[it.part].radius));
  const s = Math.max(0.3, Math.min(1, (box.w - 2 * margin - 2 * big) / Math.max(1, x1 - x0 - 2 * big), (box.h - 2 * margin - 2 * big) / Math.max(1, y1 - y0 - 2 * big)));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return items.map((it) => ({ part: it.part, x: cx + (it.x - mx) * s, y: cy + (it.y - my) * s, turn: it.turn ?? 0 }));
}

function tent(steps, r) {
  let z = 0;
  for (const s of steps) {
    const R = s.r + CLEARANCE, h = s.h + CLEARANCE, L = DRAPE(h);
    const v = r <= R ? h : r >= R + L ? 0 : h * (1 - (r - R) / L) ** 2;
    if (v > z) z = v;
  }
  return z;
}

// How far the film stands off the centre plane over one part, at `r` mm from its centre.
export function partBulge(part, side, r) {
  return tent(part.sides[side], r);
}

// How far the film stands off the centre plane at (x, y) on the face (mm), on one side, for
// placed parts (from `arrange`).
export function bulge(placed, side, x, y) {
  let z = 0;
  for (const p of placed) {
    const v = tent(PARTS[p.part].sides[side], Math.hypot(x - p.x, y - p.y));
    if (v > z) z = v;
  }
  return z;
}

// The pack's thickness over its thickest part (mm).
export function thicknessWith(product) {
  if (!product) return 0;
  return Math.max(...product.layout.map((it) => partBulge(PARTS[it.part], 'front', 0) + partBulge(PARTS[it.part], 'back', 0)));
}

// Soft pouches for the 3D view. A pouch is two sheets of film welded together round the
// edge, with a little air sealed in by the zip and the parts loose inside, so it puffs up,
// bends, drapes over whatever it lies on and sags where the parts collect. It is simulated
// with position-based dynamics (Müller et al. 2007):
// - the film: particles on a grid, distance constraints (stretch, shear and a soft bend);
// - the air: one volume constraint for the whole bag;
// - hanging: "long range attachments" to the pins, so the film cannot stretch under the parts;
// - the parts: rigid cylinders (products.js hulls) that the film rests on, pushing each
//   other apart;
// - other bags: each particle keeps clear of the surface near the closest particle of
//   another bag.
// DOM-free, in millimetres and seconds; the 3D view divides by UNIT to draw it.
import { PARTS } from './products.js';
import { bulge as tents } from './products.js';

// The film. Zip pouches are a laminate of a printed PET film and a sealing PE film:
//   PET: E 4.2–4.9 GPa, 1.39 g/cm³ (12 µm film datasheets); PE (LDPE): E 0.2–0.3 GPa,
//   0.91–0.94 g/cm³; Poisson's ratio about 0.4. Film on film slides with μ ≈ 0.1–0.35
//   (slip-treated PE), film on a shelf about 0.4. A kit of steel parts weighs about 200 g.
// How stiff a laminate feels is its bending length (Peirce): c = (D / (m·g))^⅓, with the
// bending stiffness D = Σ E·(t³/12 + t·d²) / (1 − ν²) about the neutral axis and m the
// weight per m². `plate` is the simulation's stiffness that gives that c in the cantilever
// test (test/soft.test.js measures it).
export const MATERIAL = { PET: { E: 4.5e9, rho: 1390 }, PE: { E: 0.25e9, rho: 925 }, nu: 0.4 };

export function laminate(layers) {
  let et = 0, etz = 0, z = 0, mass = 0, t = 0;
  const placed = layers.map(([m, um]) => {
    const th = um * 1e-6, mid = z + th / 2;
    z += th;
    et += MATERIAL[m].E * th;
    etz += MATERIAL[m].E * th * mid;
    mass += MATERIAL[m].rho * th;
    t += um;
    return { E: MATERIAL[m].E, th, mid };
  });
  const na = etz / et;
  const D = placed.reduce((a, l) => a + l.E * (l.th ** 3 / 12 + l.th * (l.mid - na) ** 2), 0) / (1 - MATERIAL.nu ** 2);
  const c = Math.cbrt(D / (mass * 9.81)) * 1000; // mm
  return { D, mass, c, thickness: t };
}

// The simulation's patch stiffness → the bending length it gives (measured, mm).
const CALIBRATION = [[0, 17], [0.2, 38], [0.35, 45], [0.5, 50], [0.7, 55], [0.9, 59], [1, 61]];
export function plateFor(c) {
  if (c <= CALIBRATION[0][1]) return 0;
  for (let i = 1; i < CALIBRATION.length; i++) {
    const [k0, c0] = CALIBRATION[i - 1], [k1, c1] = CALIBRATION[i];
    if (c <= c1) return k0 + ((k1 - k0) * (c - c0)) / (c1 - c0);
  }
  return 1;
}

export const FILMS = Object.fromEntries([
  ['light', 'PET 12 / PE 80 µm', [['PET', 12], ['PE', 80]]],
  ['standard', 'PET 12 / PE 120 µm', [['PET', 12], ['PE', 120]]],
  ['heavy', 'PET 12 / PE 150 µm', [['PET', 12], ['PE', 150]]],
  ['extra', 'PET 12 / PE 200 µm', [['PET', 12], ['PE', 200]]],
].map(([id, label, layers]) => {
  const l = laminate(layers);
  return [id, { label, layers, ...l, plate: plateFor(l.c) }];
}));
export const DEFAULT_FILM = 'heavy';

export const SOFT = {
  spacing: 14, // mm between film particles (at most 22 × 30 particles a sheet)
  substeps: 2,
  iterations: 6,
  shear: 1, // film hardly shears in its plane
  bend: 1,
  plate: null, // patch stiffness (shape matching of patch × patch nodes), null: the bag's film (shape matching of patch × patch nodes): see FILMS
  patch: 5,
  sealBend: 1,
  air: 2.5, // mm: the average gap the air sealed in by the zip keeps between the films
  airStiffness: 0.1,
  margin: 1.5, // mm the film keeps off a part
  film: 1.2, // mm between two bags lying on each other
  damping: 0.012,
  friction: 0.4, // film on the shelf or the floor
  filmFriction: 0.25, // film on film
  // Static friction (Coulomb): a contact holds while its sideways slip in a substep is under
  // μs × how hard it presses. The pouch's outside is PET: PET on PET μs ≈ 0.4–0.5, film on a
  // shelf or board about 0.5. With sliding friction alone a stack crept on for ever, a
  // little more each substep, down the bumps the parts make in the bags under it.
  staticFilm: 0.45,
  staticFloor: 0.5,
  partShare: 0.08, // how much of a part-film contact the part gives way: steel parts are
  //   far heavier than film (the kit is ~200 g, a bag's film ~25 g), so the film moves
  gap: 0.6, // mm the two films of a bag keep apart
  maxStep: 7, // mm a part or a node may move in one substep (no tunnelling through a seal)
  slide: 0.04, // the drag of the film on a part sliding inside the bag, per substep
  partRest: 0.3, // mm a substep (36 mm/s): a part slower than this is resting…
  restDamp: 0.5, // …and loses this share of its speed each substep
  follow: 2, // mm a frame: smaller moves of a part are eased on screen (followPart)
  gravity: [0, -9820, 0], // mm/s²
  settle: 6, // s after the last shove or pull, everything rests
};

// --- vectors and quaternions on plain arrays -----------------------------------------

function qrot(q, x, y, z, out, o = 0) {
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out[o] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[o + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[o + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function qaxis(x, y, z, a) {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
}
// The rotation taking +z to the unit vector n.
function qfromZ(nx, ny, nz) {
  if (nz < -0.999999) return [1, 0, 0, 0];
  return qnorm([-ny, nx, 0, 1 + nz]);
}
export function quatFromEuler(x, y, z) { // XYZ order, as cannon-es and three.js
  return qmul(qmul(qaxis(1, 0, 0, x), qaxis(0, 1, 0, y)), qaxis(0, 0, 1, z));
}
const tmp = new Float64Array(3);

// --- building a bag ------------------------------------------------------------------

// opts: { W, H (mm), dims (the format's seals and zip), hole: { x, y } (face mm) | null,
// pose: { p: [x, y, z] mm, q: [x, y, z, w] }, parts: placed parts (face mm, products.arrange),
// pinned: true to hang it by the hole, air: mm }
export function createBag(opts) {
  const { W, H, pose, dims = {} } = opts;
  const spacing = Math.max(SOFT.spacing, W / 21, H / 29);
  const nx = Math.max(6, Math.round(W / spacing)) + 1, ny = Math.max(6, Math.round(H / spacing)) + 1;
  const dx = W / (nx - 1), dy = H / (ny - 1);
  const F = new Int32Array(nx * ny), B = new Int32Array(nx * ny);
  const edge = (i, j) => i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[j * nx + i] = n++;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) B[j * nx + i] = edge(i, j) ? F[j * nx + i] : n++;
  const p = new Float64Array(3 * n), q = new Float64Array(3 * n), w = new Float64Array(n).fill(1), rest = new Float64Array(2 * n);
  // Which film a node is on: 1 front, -1 back, 0 the seal round the edge (both).
  const side = new Int8Array(n);
  for (let k = 0; k < nx * ny; k++) { side[F[k]] = 1; side[B[k]] = B[k] === F[k] ? 0 : -1; }
  const placed = opts.parts ?? [];
  // Start flat with a little puff, and with the film already over the parts.
  const seal = dims.sideSeal ?? 5;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const fx = i * dx, fy = j * dy; // face mm
      const u = Math.min(fx, W - fx, fy, H - fy);
      const puff = Math.max(0, Math.min(1, (u - seal) / 30)) * 1.5;
      for (const [idx, side] of [[F[j * nx + i], 'front'], [B[j * nx + i], 'back']]) {
        const z = edge(i, j) ? 0 : Math.max(puff, tents(placed, side, fx, fy) + SOFT.margin);
        rest[2 * idx] = fx - W / 2;
        rest[2 * idx + 1] = H / 2 - fy;
        qrot(pose.q, fx - W / 2, H / 2 - fy, side === 'front' ? z : -z, p, 3 * idx);
        p[3 * idx] += pose.p[0]; p[3 * idx + 1] += pose.p[1]; p[3 * idx + 2] += pose.p[2];
      }
    }
  }
  q.set(p);

  // Constraints.
  const ca = [], cb = [], cl = [], ck = [];
  const seen = new Set();
  const zipJ = dims.zip ? Math.round((dims.zipOffset ?? 0) / dy) : -1;
  const link = (a, b, k) => {
    const key = a < b ? a * n + b : b * n + a;
    if (seen.has(key)) return;
    seen.add(key);
    ca.push(a); cb.push(b); ck.push(k);
    cl.push(Math.hypot(rest[2 * a] - rest[2 * b], rest[2 * a + 1] - rest[2 * b + 1]));
  };
  for (const M of [F, B]) {
    const at = (i, j) => M[j * nx + i];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i + 1 < nx) link(at(i, j), at(i + 1, j), 1);
        if (j + 1 < ny) link(at(i, j), at(i, j + 1), 1);
        if (i + 1 < nx && j + 1 < ny) { link(at(i, j), at(i + 1, j + 1), SOFT.shear); link(at(i + 1, j), at(i, j + 1), SOFT.shear); }
        const stiffRow = j === 0 || j === ny - 1 || j === zipJ;
        if (i + 2 < nx) link(at(i, j), at(i + 2, j), stiffRow ? SOFT.sealBend : SOFT.bend);
        if (j + 2 < ny) link(at(i, j), at(i, j + 2), i === 0 || i === nx - 1 ? SOFT.sealBend : SOFT.bend);
      }
    }
  }
  const tris = [];
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = (j + 1) * nx + i, c = j * nx + i + 1, d = (j + 1) * nx + i + 1;
      tris.push(F[a], F[b], F[c], F[c], F[b], F[d]);
      tris.push(B[a], B[c], B[b], B[c], B[d], B[b]);
    }
  }

  // Parts.
  const parts = placed.map((pl) => {
    const spec = PARTS[pl.part];
    const c = new Float64Array(3);
    qrot(pose.q, pl.x - W / 2, H / 2 - pl.y, 0, c);
    c[0] += pose.p[0]; c[1] += pose.p[1]; c[2] += pose.p[2];
    const spin = (-(pl.turn ?? 0) * Math.PI) / 180;
    const reach = Math.max(...spec.hull.map((h) => Math.hypot(h.r, Math.max(Math.abs(h.z0), Math.abs(h.z1)))));
    const up = [...spec.hull].sort((a, b) => a.z0 - b.z0), down = [...spec.hull].sort((a, b) => b.z1 - a.z1);
    const widest = spec.hull.reduce((a, b) => (b.r > a.r ? b : a));
    return { id: pl.part, spec, c, cp: Float64Array.from(c), quat: qmul(pose.q, qaxis(0, 0, 1, spin)), spin, reach, half: spec.depth / 2, cell: -1, up, down, widest };
  });

  // Hanging: pin the top edge above the hole to where it is now.
  let pins = null, tether = null;
  // The zip track and the top seal are stiff: everything above the zip moves as one rail.
  const railJ = Math.max(1, Math.round((dims.zip ? (dims.zipOffset ?? 0) + (dims.zipWidth ?? 0) / 2 : (dims.topSeal ?? 0)) / dy));
  const railNodes = [];
  for (let j = 0; j <= railJ; j++) for (let i = 0; i < nx; i++) for (const idx of new Set([F[j * nx + i], B[j * nx + i]])) railNodes.push(idx);
  if (opts.pinned && opts.hole) {
    // The rail rests on the hook's rod at the top of the hole: one pivot.
    pins = [F[Math.min(nx - 1, Math.max(0, Math.round(opts.hole.x / dx)))]];
    w[pins[0]] = 0;
    // Each node is tied to its nearest pin, no further than along the flat film.
    tether = { d: new Float64Array(n), to: new Int32Array(n) };
    for (let k = 0; k < n; k++) {
      let best = Infinity, at = pins[0];
      for (const pi of pins) {
        const d = Math.hypot(rest[2 * k] - rest[2 * pi], rest[2 * k + 1] - rest[2 * pi + 1]);
        if (d < best) { best = d; at = pi; }
      }
      tether.d[k] = best * 1.01;
      tether.to[k] = at;
    }
  }

  const partVolume = parts.reduce((a, pt) => a + pt.spec.hull.reduce((b, h) => b + Math.PI * h.r * h.r * (h.z1 - h.z0), 0), 0);
  const top = dims.zip ? (dims.zipOffset ?? 0) + (dims.zipWidth ?? 0) / 2 : (dims.topSeal ?? 0);
  const inner = (W - 2 * seal) * (H - top - (dims.bottomSeal ?? 0));
  const room = { x0: seal, x1: W - seal, y0: top, y1: H - (dims.bottomSeal ?? 0) };
  const bag = {
    W, H, nx, ny, dx, dy, n, F, B, p, q, w, rest, side,
    cons: { a: Int32Array.from(ca), b: Int32Array.from(cb), len: Float64Array.from(cl), k: Float32Array.from(ck) },
    tris: Int32Array.from(tris),
    grad: new Float64Array(3 * n),
    normals: new Float64Array(3 * n),
    volume: inner * (opts.air ?? SOFT.air) + partVolume,
    parts, pins, tether, room,
    rail: makeRail(railNodes, p, pins, pose),
    patches: makePatches(F, B, nx, ny, p),
    plate: (FILMS[opts.film] ?? FILMS[DEFAULT_FILM]).plate,
    box: new Float64Array(6),
    awake: true, still: 0,
  };
  bounds(bag);
  return bag;
}

// Finds each part's place in its bag before the first step.
function settleCells(bag) {
  normalsOf(bag);
  for (const part of bag.parts) {
    part.cell = -1;
    const keep = part.quat;
    orientParts({ ...bag, parts: [part] });
    part.quat = keep;
  }
}

// --- one step ------------------------------------------------------------------------

// sim: { bags, floor: y (mm), board: z (mm) | null }
export function createSoftWorld(bags, { floor = 0, board = null } = {}) {
  for (const b of bags) b.floorY = floor;
  return { bags, floor, board, time: 0, drag: null, calm: 0 };
}

export function volumeOf(bag) {
  const { p, tris } = bag;
  let v = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

function solveDistances(bag) {
  const { p, w, cons } = bag;
  const { a, b, len, k } = cons;
  for (let c = 0; c < a.length; c++) {
    const i = 3 * a[c], j = 3 * b[c];
    const wi = w[a[c]], wj = w[b[c]], ws = wi + wj;
    if (ws === 0) continue;
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    const s = (k[c] * (d - len[c])) / (d * ws);
    p[i] += wi * s * dx; p[i + 1] += wi * s * dy; p[i + 2] += wi * s * dz;
    p[j] -= wj * s * dx; p[j + 1] -= wj * s * dy; p[j + 2] -= wj * s * dz;
  }
}

function solveTethers(bag) {
  if (!bag.tether) return;
  const { p, w } = bag;
  const { d: limit, to } = bag.tether;
  for (let k = 0; k < bag.n; k++) {
    if (w[k] === 0) continue;
    const o = 3 * k, t = 3 * to[k];
    const dx = p[o] - p[t], dy = p[o + 1] - p[t + 1], dz = p[o + 2] - p[t + 2];
    const dd = dx * dx + dy * dy + dz * dz, l = limit[k];
    if (dd <= l * l) continue;
    const s = 1 - l / Math.sqrt(dd);
    p[o] -= dx * s; p[o + 1] -= dy * s; p[o + 2] -= dz * s;
  }
}

function solveVolume(bag) {
  const { p, w, tris, grad } = bag;
  grad.fill(0);
  let v = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
    // ∂V/∂pa = (pb × pc) / 6 and so on round the triangle.
    const bxc0 = p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1], bxc1 = p[b + 2] * p[c] - p[b] * p[c + 2], bxc2 = p[b] * p[c + 1] - p[b + 1] * p[c];
    v += p[a] * bxc0 + p[a + 1] * bxc1 + p[a + 2] * bxc2;
    grad[a] += bxc0; grad[a + 1] += bxc1; grad[a + 2] += bxc2;
    grad[b] += p[c + 1] * p[a + 2] - p[c + 2] * p[a + 1]; grad[b + 1] += p[c + 2] * p[a] - p[c] * p[a + 2]; grad[b + 2] += p[c] * p[a + 1] - p[c + 1] * p[a];
    grad[c] += p[a + 1] * p[b + 2] - p[a + 2] * p[b + 1]; grad[c + 1] += p[a + 2] * p[b] - p[a] * p[b + 2]; grad[c + 2] += p[a] * p[b + 1] - p[a + 1] * p[b];
  }
  v /= 6;
  // Air pushes the films apart when the bag is squeezed below its volume; it never sucks
  // them in (an open-ish bag just has less pressure). Nodes resting on something solid
  // (the floor) cannot give way, so they are left out.
  const C = v - bag.volume;
  if (C >= 0) return;
  const floor = (bag.floorY ?? -Infinity) + SOFT.film;
  let den = 0;
  for (let k = 0; k < bag.n; k++) {
    if (w[k] === 0 || p[3 * k + 1] <= floor) continue;
    den += w[k] * (grad[3 * k] ** 2 + grad[3 * k + 1] ** 2 + grad[3 * k + 2] ** 2) / 36;
  }
  if (den < 1e-12) return;
  const s = (-SOFT.airStiffness * C) / den / 6;
  for (let k = 0; k < bag.n; k++) {
    if (w[k] === 0 || p[3 * k + 1] <= floor) continue;
    p[3 * k] += s * w[k] * grad[3 * k]; p[3 * k + 1] += s * w[k] * grad[3 * k + 1]; p[3 * k + 2] += s * w[k] * grad[3 * k + 2];
  }
}

// The part's rotation as a matrix (rows), refreshed before each round of contacts.
function partFrame(part) {
  const [x, y, z, w] = part.quat;
  const m = part.m ?? (part.m = new Float64Array(9));
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w); m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w); m[7] = 2 * (y * z + x * w); m[8] = 1 - 2 * (x * x + y * y);
}

// Pushes particle k of `bag` out of `part` (its hull of cylinders). `side` 1 or -1: a node
// of the part's own bag that belongs to the front or back film, which can only ever be in
// front of or behind the part, so it is lifted off that face; 0: the shortest way out.
function pushOut(bag, k, part, side = 0, final = false) {
  const p = bag.p, o = 3 * k;
  const c = part.c, m = part.m;
  const rx = p[o] - c[0], ry = p[o + 1] - c[1], rz = p[o + 2] - c[2];
  const reach = part.reach + SOFT.margin;
  if (rx * rx + ry * ry + rz * rz > reach * reach) return;
  // Into the part's frame (the transpose of its rotation).
  const lx = m[0] * rx + m[3] * ry + m[6] * rz, ly = m[1] * rx + m[4] * ry + m[7] * rz;
  let lz = m[2] * rx + m[5] * ry + m[8] * rz;
  const mg = SOFT.margin;
  if (side !== 0) {
    // Seen from its own film, a part is its face plus a 45° drape off the rim: the film can
    // rest on the face or slide off the edge, never get round to the other side.
    let x = lx, y = ly, z = lz;
    for (const h of side > 0 ? part.up : part.down) {
      const R = h.r + mg;
      if (h.axis === 'x') {
        // Lying on its side: the face is the round surface, across the depth (z).
        if (x <= h.z0 - mg || x >= h.z1 + mg || Math.abs(y) >= R) continue;
        const face = Math.sqrt(R * R - y * y), sa = side * z;
        if (sa <= -face || sa >= face) continue;
        z += side * (face - sa);
        continue;
      }
      const across = Math.sqrt(x * x + y * y);
      if (across >= R) continue;
      const face = side > 0 ? h.z1 + mg : -(h.z0 - mg), far = side > 0 ? h.z0 - mg : -(h.z1 + mg);
      const sa = side * z;
      if (sa <= far) continue; // already past the other face: left to the containment
      const chamfer = h === part.widest ? Math.min((h.z1 - h.z0) / 2, R * 0.25, 6) : 1, knee = R - chamfer;
      const limit = across <= knee ? face : face - (across - knee);
      if (sa >= limit) continue;
      if (across <= knee) z += side * (limit - sa);
      else {
        const d = (limit - sa) / 2;
        z += side * d;
        x += (x / across) * d;
        y += (y / across) * d;
      }
    }
    let ox = x - lx, oy = y - ly, oz = z - lz;
    if (ox === 0 && oy === 0 && oz === 0) return;
    // At most a few mm a go: a node caught deep inside comes out over several rounds.
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz), cap = final ? Infinity : 4;
    if (len > cap) { ox *= cap / len; oy *= cap / len; oz *= cap / len; }
    const wx = m[0] * ox + m[1] * oy + m[2] * oz, wy = m[3] * ox + m[4] * oy + m[5] * oz, wz = m[6] * ox + m[7] * oy + m[8] * oz;
    const share = bag.w[k] === 0 ? 1 : final ? 0 : SOFT.partShare;
    p[o] += wx * (1 - share); p[o + 1] += wy * (1 - share); p[o + 2] += wz * (1 - share);
    c[0] -= wx * share; c[1] -= wy * share; c[2] -= wz * share;
    return;
  }
  let best = Infinity, px = 0, py = 0, pz = 0;
  for (const h of part.spec.hull) {
    const sideways = h.axis === 'x';
    const u = sideways ? ly : lx, v = sideways ? lz : ly, a = sideways ? lx : lz;
    const rho = Math.sqrt(u * u + v * v), R = h.r + mg;
    if (rho >= R || a <= h.z0 - mg || a >= h.z1 + mg) continue;
    const dr = R - rho, dt = h.z1 + mg - a, db = a - (h.z0 - mg);
    if (dr < best && dr <= dt && dr <= db) {
      best = dr;
      const ru = rho > 1e-6 ? u / rho : 1, rv = rho > 1e-6 ? v / rho : 0;
      if (sideways) { px = 0; py = ru * dr; pz = rv * dr; } else { px = ru * dr; py = rv * dr; pz = 0; }
    } else if (dt < best && dt <= db) {
      best = dt;
      if (sideways) { px = dt; py = 0; pz = 0; } else { px = 0; py = 0; pz = dt; }
    } else if (db < best) {
      best = db;
      if (sideways) { px = -db; py = 0; pz = 0; } else { px = 0; py = 0; pz = -db; }
    }
  }
  if (best === Infinity) return;
  if (!bag.awake) { bag.awake = true; bag.still = 0; }
  // Back to the world.
  const wx = m[0] * px + m[1] * py + m[2] * pz, wy = m[3] * px + m[4] * py + m[5] * pz, wz = m[6] * px + m[7] * py + m[8] * pz;
  const share = bag.w[k] === 0 ? 1 : final ? 0 : SOFT.partShare;
  p[o] += wx * (1 - share); p[o + 1] += wy * (1 - share); p[o + 2] += wz * (1 - share);
  c[0] -= wx * share; c[1] -= wy * share; c[2] -= wz * share;
}

// A part stays inside its own bag: between the two films where it lies, and inside the seals.
function contain(bag, part) {
  const { p, F, B, nx, normals } = bag;
  const cell = part.cell;
  if (cell < 0) return;
  const f = 3 * F[cell], b = 3 * B[cell];
  let nX = normals[f] - normals[b], nY = normals[f + 1] - normals[b + 1], nZ = normals[f + 2] - normals[b + 2];
  const l = Math.sqrt(nX * nX + nY * nY + nZ * nZ);
  if (l < 1e-6) return;
  nX /= l; nY /= l; nZ /= l;
  const c = part.c, need = part.half + SOFT.margin, share = SOFT.partShare;
  const front = (p[f] - c[0]) * nX + (p[f + 1] - c[1]) * nY + (p[f + 2] - c[2]) * nZ;
  if (front < need) {
    const corr = need - front;
    p[f] += nX * corr * (1 - share); p[f + 1] += nY * corr * (1 - share); p[f + 2] += nZ * corr * (1 - share);
    c[0] -= nX * corr * share; c[1] -= nY * corr * share; c[2] -= nZ * corr * share;
  }
  const back = (c[0] - p[b]) * nX + (c[1] - p[b + 1]) * nY + (c[2] - p[b + 2]) * nZ;
  if (back < need) {
    const corr = need - back;
    p[b] -= nX * corr * (1 - share); p[b + 1] -= nY * corr * (1 - share); p[b + 2] -= nZ * corr * (1 - share);
    c[0] += nX * corr * share; c[1] += nY * corr * share; c[2] += nZ * corr * share;
  }
  // In the plane: inside the seals, measured along the film from the part's cell. The film's
  // directions there: across (+x on the face) and down (+y on the face).
  const i = cell % nx, j = Math.floor(cell / nx);
  const mid = (k) => [(p[3 * F[k]] + p[3 * B[k]]) / 2, (p[3 * F[k] + 1] + p[3 * B[k] + 1]) / 2, (p[3 * F[k] + 2] + p[3 * B[k] + 2]) / 2];
  const m0 = mid(cell), mr = mid(j * nx + Math.min(bag.nx - 1, i + 1)), ml = mid(j * nx + Math.max(0, i - 1));
  const md = mid(Math.min(bag.ny - 1, j + 1) * nx + i), mu = mid(Math.max(0, j - 1) * nx + i);
  let ax = mr[0] - ml[0], ay = mr[1] - ml[1], az = mr[2] - ml[2];
  let bx = md[0] - mu[0], by = md[1] - mu[1], bz = md[2] - mu[2];
  const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz);
  if (la < 1e-6 || lb < 1e-6) return;
  ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
  const rx = c[0] - m0[0], ry = c[1] - m0[1], rz = c[2] - m0[2];
  const fu = i * bag.dx + rx * ax + ry * ay + rz * az, fv = j * bag.dy + rx * bx + ry * by + rz * bz;
  // A thick part cannot get right into a corner: the two films only open so far near a seal.
  const r = part.spec.radius + part.half * 1.2, room = bag.room;
  const cu = Math.min(Math.max(fu, room.x0 + r), room.x1 - r), cv = Math.min(Math.max(fv, room.y0 + r), room.y1 - r);
  if (cu !== fu || cv !== fv) {
    const du = cu - fu, dv = cv - fv;
    c[0] += du * ax + dv * bx; c[1] += du * ay + dv * by; c[2] += du * az + dv * bz;
  }
  void nx;
}

// The two films of a bag never pass through each other.
function filmsApart(bag) {
  const { p, w, F, B, nx, ny, normals } = bag;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const fi = F[j * nx + i], bi = B[j * nx + i];
      const f = 3 * fi, b = 3 * bi;
      let nX = normals[f] - normals[b], nY = normals[f + 1] - normals[b + 1], nZ = normals[f + 2] - normals[b + 2];
      const l = Math.sqrt(nX * nX + nY * nY + nZ * nZ);
      if (l < 1e-6) continue;
      nX /= l; nY /= l; nZ /= l;
      const gap = (p[f] - p[b]) * nX + (p[f + 1] - p[b + 1]) * nY + (p[f + 2] - p[b + 2]) * nZ;
      if (gap >= SOFT.gap) continue;
      const ws = w[fi] + w[bi];
      if (ws === 0) continue;
      const corr = (SOFT.gap - gap) / ws;
      p[f] += nX * corr * w[fi]; p[f + 1] += nY * corr * w[fi]; p[f + 2] += nZ * corr * w[fi];
      p[b] -= nX * corr * w[bi]; p[b + 1] -= nY * corr * w[bi]; p[b + 2] -= nZ * corr * w[bi];
    }
  }
}

// Particles of `bag` near `part`: its own bag by grid window, others in full.
function touch(bag, part, own, final = false) {
  if (!own) { for (let k = 0; k < bag.n; k++) pushOut(bag, k, part, 0, final); return; }
  const { F, B, nx, ny, side } = bag;
  const ci = part.cell % nx, cj = Math.floor(part.cell / nx);
  const ri = Math.ceil((part.reach + SOFT.margin) / bag.dx) + 1, rj = Math.ceil((part.reach + SOFT.margin) / bag.dy) + 1;
  for (let j = Math.max(0, cj - rj); j <= Math.min(ny - 1, cj + rj); j++) {
    for (let i = Math.max(0, ci - ri); i <= Math.min(nx - 1, ci + ri); i++) {
      const f = F[j * nx + i], b = B[j * nx + i];
      pushOut(bag, f, part, side[f], final);
      if (b !== f) pushOut(bag, b, part, side[b], final);
    }
  }
}

// --- plate stiffness: each sheet is covered by overlapping 3 × 3 patches of nodes, each
// pulled back towards its rest shape (flat), turned to fit (lattice shape matching). ----

function makePatches(F, B, nx, ny, p) {
  const list = [];
  const n = SOFT.patch, step = Math.max(1, Math.floor(n / 2));
  for (const M of [F, B]) {
    for (let j = 0; j + n - 1 < ny + step - 1; j += step) {
      for (let i = 0; i + n - 1 < nx + step - 1; i += step) {
        const j0 = Math.min(j, ny - n), i0 = Math.min(i, nx - n);
        const idx = [];
        for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) idx.push(M[(j0 + b) * nx + i0 + a]);
        const c = [0, 0, 0];
        for (const k of idx) for (let d = 0; d < 3; d++) c[d] += p[3 * k + d] / idx.length;
        const r = new Float64Array(3 * idx.length);
        idx.forEach((k, a) => { for (let d = 0; d < 3; d++) r[3 * a + d] = p[3 * k + d] - c[d]; });
        list.push({ idx: Int32Array.from(idx), r, q: [0, 0, 0, 1] });
      }
    }
  }
  return list;
}

// A flat patch has no depth, so its fit is pinned down by its two in-plane axes alone.
function solvePatches(bag) {
  const k = SOFT.plate ?? bag.plate;
  if (k <= 0) return;
  const { p, w } = bag;
  const A = new Float64Array(9), g = new Float64Array(3), c = new Float64Array(3);
  for (const pt of bag.patches) {
    const { idx, r } = pt, m = idx.length;
    c[0] = c[1] = c[2] = 0;
    for (let a = 0; a < m; a++) { const o = 3 * idx[a]; c[0] += p[o]; c[1] += p[o + 1]; c[2] += p[o + 2]; }
    c[0] /= m; c[1] /= m; c[2] /= m;
    A.fill(0);
    for (let a = 0; a < m; a++) {
      const o = 3 * idx[a];
      const x0 = p[o] - c[0], x1 = p[o + 1] - c[1], x2 = p[o + 2] - c[2];
      const r0 = r[3 * a], r1 = r[3 * a + 1], r2 = r[3 * a + 2];
      A[0] += x0 * r0; A[1] += x0 * r1; A[2] += x0 * r2;
      A[3] += x1 * r0; A[4] += x1 * r1; A[5] += x1 * r2;
      A[6] += x2 * r0; A[7] += x2 * r1; A[8] += x2 * r2;
    }
    pt.q = nearestRotation(A, pt.q, 3);
    const [x, y, z, qw] = pt.q;
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * qw), m02 = 2 * (x * z + y * qw);
    const m10 = 2 * (x * y + z * qw), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * qw);
    const m20 = 2 * (x * z - y * qw), m21 = 2 * (y * z + x * qw), m22 = 1 - 2 * (x * x + y * y);
    for (let a = 0; a < m; a++) {
      const n = idx[a];
      if (w[n] === 0) continue;
      const r0 = r[3 * a], r1 = r[3 * a + 1], r2 = r[3 * a + 2];
      g[0] = m00 * r0 + m01 * r1 + m02 * r2; g[1] = m10 * r0 + m11 * r1 + m12 * r2; g[2] = m20 * r0 + m21 * r1 + m22 * r2;
      const o = 3 * n;
      p[o] += (c[0] + g[0] - p[o]) * k; p[o + 1] += (c[1] + g[1] - p[o + 1]) * k; p[o + 2] += (c[2] + g[2] - p[o + 2]) * k;
    }
  }
}

// --- the rail: shape matching (Müller et al. 2005) of the nodes above the zip ----------

function makeRail(nodes, p, pins, pose) {
  const idx = Int32Array.from(nodes);
  const wt = new Float64Array(idx.length).fill(1);
  if (pins) for (let a = 0; a < idx.length; a++) if (pins.includes(idx[a])) wt[a] = 1e6; // the pivot holds
  let m = 0;
  const c0 = [0, 0, 0];
  for (let a = 0; a < idx.length; a++) { for (let d = 0; d < 3; d++) c0[d] += wt[a] * p[3 * idx[a] + d]; m += wt[a]; }
  for (let d = 0; d < 3; d++) c0[d] /= m;
  const r = new Float64Array(3 * idx.length);
  for (let a = 0; a < idx.length; a++) for (let d = 0; d < 3; d++) r[3 * a + d] = p[3 * idx[a] + d] - c0[d];
  // The rail is thin; give its two films a little depth so the fit has all three axes.
  const n = qrot(pose.q, 0, 0, 1, new Float64Array(3));
  for (let a = 0; a < idx.length; a++) {
    const s = (a % 2 ? 1 : -1) * 0.8;
    r[3 * a] += n[0] * s; r[3 * a + 1] += n[1] * s; r[3 * a + 2] += n[2] * s;
  }
  // The rod's direction (the bag's normal when it was hung), for a pinned rail.
  const axis = new Float64Array(3);
  qrot(pose.q, 0, 0, 1, axis);
  return { idx, wt, r, q: [0, 0, 0, 1], axis, n0: [axis[0], axis[1], axis[2]], pinned: !!pins };
}

// The nearest rotation to A (3 × 3, rows), as a quaternion, by Müller et al. (2016):
// "A robust method to extract the rotational part of deformations".
function nearestRotation(A, q, iterations = 4) {
  for (let it = 0; it < iterations; it++) {
    const [x, y, z, w] = q;
    const R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
    let ox = 0, oy = 0, oz = 0, dot = 0;
    for (let c = 0; c < 3; c++) {
      const r0 = R[c], r1 = R[3 + c], r2 = R[6 + c], a0 = A[c], a1 = A[3 + c], a2 = A[6 + c];
      ox += r1 * a2 - r2 * a1; oy += r2 * a0 - r0 * a2; oz += r0 * a1 - r1 * a0;
      dot += r0 * a0 + r1 * a1 + r2 * a2;
    }
    const s = 1 / (Math.abs(dot) + 1e-9);
    ox *= s; oy *= s; oz *= s;
    const ang = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (ang < 1e-9) break;
    q = qnorm(qmul(qaxis(ox / ang, oy / ang, oz / ang, ang), q));
  }
  return q;
}

function solveRail(bag) {
  const rail = bag.rail, { p } = bag, { idx, wt, r } = rail;
  let m = 0;
  const c = [0, 0, 0];
  for (let a = 0; a < idx.length; a++) { const o = 3 * idx[a]; c[0] += wt[a] * p[o]; c[1] += wt[a] * p[o + 1]; c[2] += wt[a] * p[o + 2]; m += wt[a]; }
  c[0] /= m; c[1] /= m; c[2] /= m;
  const A = new Float64Array(9);
  for (let a = 0; a < idx.length; a++) {
    const o = 3 * idx[a], k = wt[a] > 1 ? 1 : wt[a];
    const x0 = p[o] - c[0], x1 = p[o + 1] - c[1], x2 = p[o + 2] - c[2];
    const r0 = r[3 * a], r1 = r[3 * a + 1], r2 = r[3 * a + 2];
    A[0] += k * x0 * r0; A[1] += k * x0 * r1; A[2] += k * x0 * r2;
    A[3] += k * x1 * r0; A[4] += k * x1 * r1; A[5] += k * x1 * r2;
    A[6] += k * x2 * r0; A[7] += k * x2 * r1; A[8] += k * x2 * r2;
  }
  let q = nearestRotation(A, rail.q);
  if (rail.pinned) {
    // On the rod the rail can swing in its own plane, not turn about the vertical.
    const n = qrot(q, 0, 0, 1, new Float64Array(3));
    const t = rail.axis, sg = n[0] * t[0] + n[1] * t[1] + n[2] * t[2] < 0 ? -1 : 1;
    q = qmul(qfromTo(n, [sg * t[0], sg * t[1], sg * t[2]]), q);
  }
  rail.q = q;
  const g = new Float64Array(3);
  for (let a = 0; a < idx.length; a++) {
    const k = idx[a];
    if (bag.w[k] === 0) continue;
    qrot(q, r[3 * a], r[3 * a + 1], r[3 * a + 2], g);
    p[3 * k] = c[0] + g[0]; p[3 * k + 1] = c[1] + g[1]; p[3 * k + 2] = c[2] + g[2];
  }
}

function qfromTo(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) return [1, 0, 0, 0];
  return qnorm([cx, cy, cz, 1 + d]);
}

// For each part, the film nodes of other (awake) bags within reach this substep.
function gatherOthers(sim) {
  const bags = sim.bags;
  for (const bag of bags) {
    for (const part of bag.parts) {
      part.nOthers = 0;
      const r = part.reach + SOFT.margin + 2 * SOFT.maxStep, r2 = r * r;
      for (let bi = 0; bi < bags.length; bi++) {
        const other = bags[bi];
        if (other === bag || !near(other.box, part.c, r)) continue;
        for (let k = 0; k < other.n; k++) {
          const dx = other.p[3 * k] - part.c[0], dy = other.p[3 * k + 1] - part.c[1], dz = other.p[3 * k + 2] - part.c[2];
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          if (!part.others || part.others.length < 2 * (part.nOthers + 1)) {
            const grown = new Int32Array(Math.max(64, 4 * (part.nOthers + 1)));
            if (part.others) grown.set(part.others);
            part.others = grown;
          }
          part.others[2 * part.nOthers] = bi; part.others[2 * part.nOthers + 1] = k;
          part.nOthers++;
        }
      }
    }
  }
}

function bounds(bag) {
  const { p, box } = bag;
  box[0] = box[1] = box[2] = Infinity;
  box[3] = box[4] = box[5] = -Infinity;
  for (let k = 0; k < bag.n; k++) {
    for (let a = 0; a < 3; a++) {
      const v = p[3 * k + a];
      if (v < box[a]) box[a] = v;
      if (v > box[3 + a]) box[3 + a] = v;
    }
  }
}

function near(box, c, r) {
  return c[0] + r > box[0] && c[0] - r < box[3] && c[1] + r > box[1] && c[1] - r < box[4] && c[2] + r > box[2] && c[2] - r < box[5];
}

// The lowest point of a part, as y, and the floor contact.
function partLow(part) {
  let low = Infinity;
  const ax = new Float64Array(3), mid = new Float64Array(3);
  for (const h of part.spec.hull) {
    if (h.axis === 'x') qrot(part.quat, 1, 0, 0, ax); else qrot(part.quat, 0, 0, 1, ax);
    const m = (h.z0 + h.z1) / 2, half = (h.z1 - h.z0) / 2;
    if (h.axis === 'x') qrot(part.quat, m, 0, 0, mid); else qrot(part.quat, 0, 0, m, mid);
    const e = h.r * Math.sqrt(Math.max(0, 1 - ax[1] * ax[1])) + half * Math.abs(ax[1]);
    low = Math.min(low, part.c[1] + mid[1] - e);
  }
  return low;
}

function normalsOf(bag) {
  const { p, F, B, nx, ny, normals } = bag;
  normals.fill(0);
  for (const [M, sign] of [[F, 1], [B, -1]]) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const l = 3 * M[j * nx + Math.max(0, i - 1)], r = 3 * M[j * nx + Math.min(nx - 1, i + 1)];
        const u = 3 * M[Math.max(0, j - 1) * nx + i], d = 3 * M[Math.min(ny - 1, j + 1) * nx + i];
        const tx0 = p[r] - p[l], tx1 = p[r + 1] - p[l + 1], tx2 = p[r + 2] - p[l + 2];
        const ty0 = p[u] - p[d], ty1 = p[u + 1] - p[d + 1], ty2 = p[u + 2] - p[d + 2];
        const k = 3 * M[j * nx + i];
        normals[k] += sign * (tx1 * ty2 - tx2 * ty1);
        normals[k + 1] += sign * (tx2 * ty0 - tx0 * ty2);
        normals[k + 2] += sign * (tx0 * ty1 - tx1 * ty0);
      }
    }
  }
  for (let k = 0; k < bag.n; k++) {
    const l = Math.hypot(normals[3 * k], normals[3 * k + 1], normals[3 * k + 2]) || 1;
    normals[3 * k] /= l; normals[3 * k + 1] /= l; normals[3 * k + 2] /= l;
  }
}

// Each part lies flat in the bag: its axis follows the film where it is.
function orientParts(bag) {
  const { p, F, B, nx, ny, normals } = bag;
  for (const part of bag.parts) {
    let best = part.cell, bd = Infinity;
    const scan = (i0, i1, j0, j1) => {
      for (let j = Math.max(1, j0); j <= Math.min(ny - 2, j1); j++) {
        for (let i = Math.max(1, i0); i <= Math.min(nx - 2, i1); i++) {
          const k = 3 * F[j * nx + i], kb = 3 * B[j * nx + i];
          const mx = (p[k] + p[kb]) / 2 - part.c[0], my = (p[k + 1] + p[kb + 1]) / 2 - part.c[1], mz = (p[k + 2] + p[kb + 2]) / 2 - part.c[2];
          const d = mx * mx + my * my + mz * mz;
          if (d < bd) { bd = d; best = j * nx + i; }
        }
      }
    };
    if (part.cell < 0) scan(1, nx - 2, 1, ny - 2);
    else { const i = part.cell % nx, j = Math.floor(part.cell / nx); scan(i - 3, i + 3, j - 3, j + 3); }
    part.cell = best;
    const f = 3 * F[best], b = 3 * B[best];
    let nxv = normals[f] - normals[b], nyv = normals[f + 1] - normals[b + 1], nzv = normals[f + 2] - normals[b + 2];
    let l = Math.hypot(nxv, nyv, nzv);
    if (l < 1e-6) continue;
    // Near the seals the film is steep and noisy: lean on the rail's facing too.
    const railN = qrot(bag.rail.q, ...bag.rail.n0, new Float64Array(3));
    nxv = (0.4 * nxv) / l + 0.6 * railN[0]; nyv = (0.4 * nyv) / l + 0.6 * railN[1]; nzv = (0.4 * nzv) / l + 0.6 * railN[2];
    l = Math.hypot(nxv, nyv, nzv);
    nxv /= l; nyv /= l; nzv /= l;
    // Keep the part's own turn about its axis: take the current x axis into the new plane.
    const target = qmul(qfromZ(nxv, nyv, nzv), qaxis(0, 0, 1, part.spin));
    const cur = part.quat;
    const dot = cur[0] * target[0] + cur[1] * target[1] + cur[2] * target[2] + cur[3] * target[3];
    const sgn = dot < 0 ? -1 : 1, t = 0.25;
    part.quat = qnorm(cur.map((v, i) => v * (1 - t) + sgn * target[i] * t));
  }
}

// Parts push each other apart: side by side in the film's plane, or one on top of the
// other (in the same bag, or through the films of two bags), whichever takes less.
function partsApart(sim) {
  const ps = sim.allParts ?? (sim.allParts = sim.bags.flatMap((b) => b.parts.map((pt) => ({ pt, bag: b }))));
  const ax = new Float64Array(3);
  for (let i = 0; i < ps.length; i++) {
    const { pt: a, bag: ba } = ps[i];
    qrot(a.quat, 0, 0, 1, ax);
    for (let j = i + 1; j < ps.length; j++) {
      const { pt: b, bag: bb } = ps[j];
      if (!ba.awake && !bb.awake) continue;
      const gap = ba === bb ? 0 : 2 * SOFT.film + 2 * SOFT.margin;
      const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], dz = b.c[2] - a.c[2];
      const reach = a.spec.radius + b.spec.radius + gap;
      if (dx * dx + dy * dy + dz * dz > reach * reach + (a.half + b.half + gap) ** 2) continue;
      const dn = dx * ax[0] + dy * ax[1] + dz * ax[2];
      const tx = dx - dn * ax[0], ty = dy - dn * ax[1], tz = dz - dn * ax[2];
      const t = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const penT = a.spec.radius + b.spec.radius + gap - t, penN = a.half + b.half + gap - Math.abs(dn);
      if (penT <= 0 || penN <= 0) continue;
      if (penT < penN && t > 1e-6) {
        const s = penT / t / 2;
        a.c[0] -= tx * s; a.c[1] -= ty * s; a.c[2] -= tz * s;
        b.c[0] += tx * s; b.c[1] += ty * s; b.c[2] += tz * s;
      } else {
        const s = (dn >= 0 ? 1 : -1) * penN / 2;
        a.c[0] -= ax[0] * s; a.c[1] -= ax[1] * s; a.c[2] -= ax[2] * s;
        b.c[0] += ax[0] * s; b.c[1] += ax[1] * s; b.c[2] += ax[2] * s;
      }
    }
  }
}

function keepOut(sim, bag) {
  const { p, w } = bag;
  const f = sim.floor + SOFT.film / 2;
  for (let k = 0; k < bag.n; k++) {
    if (w[k] === 0) continue;
    if (p[3 * k + 1] < f) p[3 * k + 1] = f;
    if (sim.board !== null && p[3 * k + 2] < sim.board + SOFT.film) p[3 * k + 2] = sim.board + SOFT.film;
  }
  // A part always has its own film between it and the floor (or the board), and keeps the
  // film's margin off that film, as contain() wants. Holding it any lower made the two rules
  // fight every substep: the light parts (the E-clip) buzzed and hopped.
  const rest = SOFT.film / 2 + SOFT.margin;
  for (const part of bag.parts) {
    const low = partLow(part);
    if (low < sim.floor + rest) part.c[1] += sim.floor + rest - low;
    if (sim.board !== null && part.c[2] - part.spec.radius < sim.board + rest) part.c[2] = sim.board + rest + part.spec.radius;
  }
}

// Bags on bags: a particle keeps `film` clear of the surface at the nearest particle of
// another bag, on the side it came from. One spatial hash of every bag's particles a substep.
const HASH = 1 << 15;
function bagsApart(sim) {
  const bags = sim.bags;
  if (bags.length < 2) return;
  // Contacts only count within 0.75 of a cell sideways: cells twice that, searched 2 × 2 × 2.
  const reach = 0.8 * SOFT.spacing, cellSize = 2 * reach, film = SOFT.film, mu = SOFT.filmFriction;
  // Only bags whose boxes come near another bag's take part.
  const near = bags.map((a, A) => bags.some((b, Bi) => Bi !== A && (a.awake || b.awake)
    && a.box[0] <= b.box[3] + reach && b.box[0] <= a.box[3] + reach && a.box[1] <= b.box[4] + reach && b.box[1] <= a.box[4] + reach && a.box[2] <= b.box[5] + reach && b.box[2] <= a.box[5] + reach));
  if (!near.some(Boolean)) return;
  let total = 0;
  bags.forEach((b, i) => { if (near[i]) total += b.n; });
  const h = sim.hash ?? (sim.hash = { start: new Int32Array(HASH + 1), cell: new Int32Array(0), bag: new Int32Array(0), node: new Int32Array(0), key: new Int32Array(0) });
  if (h.cell.length < total) { h.cell = new Int32Array(total); h.bag = new Int32Array(total); h.node = new Int32Array(total); h.key = new Int32Array(total); }
  const keyOf = (x, y, z) => (((Math.floor(x / cellSize) * 73856093) ^ (Math.floor(y / cellSize) * 19349663) ^ (Math.floor(z / cellSize) * 83492791)) >>> 0) & (HASH - 1);
  h.start.fill(0);
  let m = 0;
  bags.forEach((b, bi) => {
    if (!near[bi]) return;
    for (let k = 0; k < b.n; k++) {
      const key = keyOf(b.p[3 * k], b.p[3 * k + 1], b.p[3 * k + 2]);
      h.key[m] = key; h.bag[m] = bi; h.node[m] = k; h.start[key + 1]++; m++;
    }
  });
  for (let i = 0; i < HASH; i++) h.start[i + 1] += h.start[i];
  const fill = h.start.slice(0, HASH);
  for (let e = 0; e < m; e++) h.cell[fill[h.key[e]]++] = e;
  bags.forEach((a, A) => {
    if (!near[A]) return;
    const boxes = bags.filter((b, Bi) => Bi !== A && near[Bi]).map((b) => b.box);
    for (let k = 0; k < a.n; k++) {
      const x = a.p[3 * k], y = a.p[3 * k + 1], z = a.p[3 * k + 2];
      let inside = false;
      for (const bx of boxes) if (x > bx[0] - reach && x < bx[3] + reach && y > bx[1] - reach && y < bx[4] + reach && z > bx[2] - reach && z < bx[5] + reach) { inside = true; break; }
      if (!inside) continue;
      // The 2 × 2 × 2 cells that the sphere of radius `reach` round the node touches.
      const cx = Math.floor((x - reach) / cellSize), cy = Math.floor((y - reach) / cellSize), cz = Math.floor((z - reach) / cellSize);
      let best = -1, bd = reach * reach;
      for (let ix = 0; ix <= 1; ix++) for (let iy = 0; iy <= 1; iy++) for (let iz = 0; iz <= 1; iz++) {
        const key = ((((cx + ix) * 73856093) ^ ((cy + iy) * 19349663) ^ ((cz + iz) * 83492791)) >>> 0) & (HASH - 1);
        for (let e = h.start[key]; e < h.start[key + 1]; e++) {
          const en = h.cell[e];
          if (h.bag[en] === A) continue;
          const b = bags[h.bag[en]], o = 3 * h.node[en];
          const d = (x - b.p[o]) ** 2 + (y - b.p[o + 1]) ** 2 + (z - b.p[o + 2]) ** 2;
          if (d < bd) { bd = d; best = en; }
        }
      }
      if (best < 0) continue;
      const b = bags[h.bag[best]], node = h.node[best], o = 3 * node;
      const nX = b.normals[o], nY = b.normals[o + 1], nZ = b.normals[o + 2];
      const rx = x - b.p[o], ry = y - b.p[o + 1], rz = z - b.p[o + 2];
      const sd = rx * nX + ry * nY + rz * nZ;
      if (Math.abs(sd) >= film) continue;
      if (rx * rx + ry * ry + rz * rz - sd * sd > (0.75 * Math.max(a.dx, a.dy)) ** 2) continue;
      const was = (a.q[3 * k] - b.q[o]) * nX + (a.q[3 * k + 1] - b.q[o + 1]) * nY + (a.q[3 * k + 2] - b.q[o + 2]) * nZ;
      const side = (was !== 0 ? was : sd) >= 0 ? 1 : -1;
      const corr = side * film - sd;
      const wa = a.w[k], wb = b.w[node], ws = wa + wb;
      if (ws === 0) continue;
      a.p[3 * k] += (nX * corr * wa) / ws; a.p[3 * k + 1] += (nY * corr * wa) / ws; a.p[3 * k + 2] += (nZ * corr * wa) / ws;
      b.p[o] -= (nX * corr * wb) / ws; b.p[o + 1] -= (nY * corr * wb) / ws; b.p[o + 2] -= (nZ * corr * wb) / ws;
      // Friction: the films' sideways motion this substep evens out by μ.
      const vx = (a.p[3 * k] - a.q[3 * k]) - (b.p[o] - b.q[o]), vy = (a.p[3 * k + 1] - a.q[3 * k + 1]) - (b.p[o + 1] - b.q[o + 1]), vz = (a.p[3 * k + 2] - a.q[3 * k + 2]) - (b.p[o + 2] - b.q[o + 2]);
      const vn = vx * nX + vy * nY + vz * nZ;
      let tx = vx - vn * nX, ty = vy - vn * nY, tz = vz - vn * nZ;
      const hold = SOFT.staticFilm * Math.abs(corr);
      const k2 = tx * tx + ty * ty + tz * tz < hold * hold ? 1 : mu;
      tx *= k2; ty *= k2; tz *= k2;
      a.p[3 * k] -= (tx * wa) / ws; a.p[3 * k + 1] -= (ty * wa) / ws; a.p[3 * k + 2] -= (tz * wa) / ws;
      b.p[o] += (tx * wb) / ws; b.p[o + 1] += (ty * wb) / ws; b.p[o + 2] += (tz * wb) / ws;
      if (!b.awake) { b.awake = true; b.still = 0; }
    }
  });
}

// gh2: how far gravity moves a thing in one substep, which is how hard it presses on the floor.
function friction(sim, bag, gh2) {
  const { p, q } = bag;
  const f = sim.floor + SOFT.film / 2 + 0.05, st2 = (SOFT.staticFloor * gh2) ** 2;
  // Sliding is slowed by μ; slipping less than μs × the press it holds still.
  const slip = (dx, dz) => (dx * dx + dz * dz < st2 ? 0 : 1 - SOFT.friction);
  for (let k = 0; k < bag.n; k++) {
    if (p[3 * k + 1] > f) continue;
    const dx = p[3 * k] - q[3 * k], dz = p[3 * k + 2] - q[3 * k + 2], kf = slip(dx, dz);
    p[3 * k] = q[3 * k] + dx * kf;
    p[3 * k + 2] = q[3 * k + 2] + dz * kf;
  }
  for (const part of bag.parts) {
    if (partLow(part) > sim.floor + SOFT.film / 2 + SOFT.margin + 0.05) continue;
    const dx = part.c[0] - part.cp[0], dz = part.c[2] - part.cp[2], kf = slip(dx, dz);
    part.c[0] = part.cp[0] + dx * kf;
    part.c[2] = part.cp[2] + dz * kf;
  }
}

// Advances the world by dt seconds. Returns the bags that moved (to redraw).
export function stepSoft(sim, dt) {
  const h = Math.min(dt, 1 / 30) / SOFT.substeps;
  const [gx, gy, gz] = SOFT.gravity;
  const g = [gx * h * h, gy * h * h, gz * h * h];
  const live = sim.bags.filter((b) => b.awake);
  if (!live.length) return [];
  for (const bag of live) if (bag.parts.some((pt) => pt.cell < 0)) settleCells(bag);
  for (let s = 0; s < SOFT.substeps; s++) {
    for (const bag of live) {
      const { p, q, w } = bag;
      const damp = 1 - SOFT.damping;
      const cap = SOFT.maxStep;
      for (let k = 0; k < bag.n; k++) {
        if (w[k] === 0) continue;
        const o = 3 * k;
        let vx = (p[o] - q[o]) * damp, vy = (p[o + 1] - q[o + 1]) * damp, vz = (p[o + 2] - q[o + 2]) * damp;
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > cap) { vx *= cap / sp; vy *= cap / sp; vz *= cap / sp; }
        q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
        p[o] += vx + g[0]; p[o + 1] += vy + g[1]; p[o + 2] += vz + g[2];
      }
      for (const part of bag.parts) {
        // The film drags on a part sliding inside the bag.
        const d = damp * (1 - SOFT.slide);
        let vx = (part.c[0] - part.cp[0]) * d, vy = (part.c[1] - part.cp[1]) * d, vz = (part.c[2] - part.cp[2]) * d;
        let sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        // A part that is all but still (resting on film, pressed by its neighbours) keeps
        // little of its speed: what the contacts push it by must not carry on into the next
        // substep and back, or it rattles.
        if (sp < SOFT.partRest) { const r = 1 - SOFT.restDamp; vx *= r; vy *= r; vz *= r; sp *= r; }
        if (sp > cap) { vx *= cap / sp; vy *= cap / sp; vz *= cap / sp; }
        part.cp.set(part.c);
        part.c[0] += vx + g[0]; part.c[1] += vy + g[1]; part.c[2] += vz + g[2];
      }
      if (sim.drag?.bag === bag) {
        const o = 3 * sim.drag.k;
        for (let a = 0; a < 3; a++) p[o + a] += (sim.drag.to[a] - p[o + a]) * 0.5;
      }
      bounds(bag);
    }
    gatherOthers(sim);
    for (let it = 0; it < SOFT.iterations; it++) {
      for (const bag of live) {
        solveDistances(bag);
        solveTethers(bag);
        if (it === 0) solveVolume(bag);
        if (it % 2 === 1) solvePatches(bag);
        solveRail(bag);
      }
      // Every part against the films near it: its own bag's, and bags lying on it.
      for (const bag of sim.bags) {
        for (const part of bag.parts) {
          partFrame(part);
          if (bag.awake) contain(bag, part);
          if (bag.awake) touch(bag, part, true);
          const o = part.others;
          for (let e = 0; e < part.nOthers; e++) pushOut(sim.bags[o[2 * e]], o[2 * e + 1], part, 0);
        }
      }
      partsApart(sim);
      for (const bag of live) { filmsApart(bag); keepOut(sim, bag); }
    }
    for (const bag of live) normalsOf(bag);
    bagsApart(sim);
    for (const bag of live) {
      keepOut(sim, bag);
      friction(sim, bag, Math.hypot(...g));
      orientParts(bag);
    }
    // Last, the film is lifted clear of every part outright (the parts stay put), so it is
    // never drawn through one, however hard a stack presses on it.
    for (const bag of sim.bags) {
      for (const part of bag.parts) {
        partFrame(part);
        if (bag.awake) touch(bag, part, true, true);
        const o = part.others;
        for (let e = 0; e < (part.nOthers ?? 0); e++) pushOut(sim.bags[o[2 * e]], o[2 * e + 1], part, 0, true);
      }
    }
  }
  sim.time += dt;
  // Everything comes to rest a few seconds after the last shove or pull.
  sim.calm = sim.drag ? 0 : sim.calm + dt;
  if (sim.calm > SOFT.settle) for (const bag of sim.bags) bag.awake = false;
  // Sleep: a bag that has stopped moving for half a second rests until something touches it.
  for (const bag of live) {
    let m = 0;
    for (let k = 0; k < 3 * bag.n; k++) m = Math.max(m, Math.abs(bag.p[k] - bag.q[k]));
    for (const part of bag.parts) for (let a = 0; a < 3; a++) m = Math.max(m, Math.abs(part.c[a] - part.cp[a]));
    bag.still = m < 0.02 ? bag.still + dt : 0;
    if (bag.still > 0.5 && sim.drag?.bag !== bag) bag.awake = false;
  }
  return live;
}

// Where to draw a part: it follows the simulation, but moves of under SOFT.follow mm a frame
// are eased (a third of the way each frame), so what is left of the contacts' sub-millimetre
// shiver does not show; anything bigger (a drop, a swing, a drag) is drawn as it happens.
// `shown` is { c, quat } kept per part by the view; returns it.
export function followPart(shown, part) {
  if (!shown) return { c: Float64Array.from(part.c), quat: Float64Array.from(part.quat) };
  const d = Math.hypot(part.c[0] - shown.c[0], part.c[1] - shown.c[1], part.c[2] - shown.c[2]);
  const t = d > SOFT.follow ? 1 : 0.35;
  for (let a = 0; a < 3; a++) shown.c[a] += (part.c[a] - shown.c[a]) * t;
  const q = part.quat, sq = shown.quat;
  const sgn = q[0] * sq[0] + q[1] * sq[1] + q[2] * sq[2] + q[3] * sq[3] < 0 ? -1 : 1;
  for (let a = 0; a < 4; a++) sq[a] += (sgn * q[a] - sq[a]) * t;
  const l = Math.hypot(sq[0], sq[1], sq[2], sq[3]);
  for (let a = 0; a < 4; a++) sq[a] /= l;
  return shown;
}

// A shove: every particle and part of every bag gets the velocity v(position) (mm/s).
export function shove(sim, v, dt = 1 / 60) {
  sim.calm = 0;
  for (const bag of sim.bags) {
    bag.awake = true;
    bag.still = 0;
    for (let k = 0; k < bag.n; k++) {
      if (bag.w[k] === 0) continue;
      const [vx, vy, vz] = v(bag.p[3 * k], bag.p[3 * k + 1], bag.p[3 * k + 2], bag);
      bag.q[3 * k] -= vx * dt; bag.q[3 * k + 1] -= vy * dt; bag.q[3 * k + 2] -= vz * dt;
    }
    for (const part of bag.parts) {
      const [vx, vy, vz] = v(part.c[0], part.c[1], part.c[2], bag);
      part.cp[0] -= vx * dt; part.cp[1] -= vy * dt; part.cp[2] -= vz * dt;
    }
  }
}

// --- drawing: the film as a smooth surface ------------------------------------------

// The render mesh: each sheet's grid doubled with Catmull-Rom midpoints. Returns the
// index (front first, then back), the texture coordinates and the group sizes.
export function renderLayout(bag) {
  const rx = 2 * bag.nx - 1, ry = 2 * bag.ny - 1;
  const per = rx * ry;
  const uv = new Float32Array(4 * per);
  const index = new Uint32Array(12 * (rx - 1) * (ry - 1));
  let t = 0;
  for (let s = 0; s < 2; s++) {
    for (let J = 0; J < ry; J++) {
      for (let I = 0; I < rx; I++) {
        const v = s * per + J * rx + I;
        uv[2 * v] = s === 0 ? I / (rx - 1) : 1 - I / (rx - 1);
        uv[2 * v + 1] = 1 - J / (ry - 1);
      }
    }
    for (let J = 0; J + 1 < ry; J++) {
      for (let I = 0; I + 1 < rx; I++) {
        const a = s * per + J * rx + I, b = a + rx, c = a + 1, d = b + 1;
        if (s === 0) index.set([a, b, c, c, b, d], t);
        else index.set([a, c, b, c, d, b], t);
        t += 6;
      }
    }
  }
  return { rx, ry, per, uv, index, groups: [[0, 6 * (rx - 1) * (ry - 1)], [6 * (rx - 1) * (ry - 1), 6 * (rx - 1) * (ry - 1)]] };
}

const cr = (a, b, c, d) => (-a + 9 * b + 9 * c - d) / 16;

// Writes the bag's surface into `pos` and `nor` (Float32Array, 3 × 2 × rx × ry), scaled.
export function writeRender(bag, layout, pos, nor, scale = 1) {
  const { nx, ny, p } = bag;
  const { rx, ry, per } = layout;
  [bag.F, bag.B].forEach((M, s) => {
    const base = 3 * s * per;
    const P = (i, j, a) => {
      // Mirror outside the grid, so the edges stay straight.
      if (i < 0) return 2 * P(0, j, a) - P(1, j, a);
      if (i >= nx) return 2 * P(nx - 1, j, a) - P(nx - 2, j, a);
      if (j < 0) return 2 * P(i, 0, a) - P(i, 1, a);
      if (j >= ny) return 2 * P(i, ny - 1, a) - P(i, ny - 2, a);
      return p[3 * M[j * nx + i] + a];
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        for (let a = 0; a < 3; a++) {
          pos[base + 3 * (2 * j * rx + 2 * i) + a] = P(i, j, a) * scale;
          if (i + 1 < nx) pos[base + 3 * (2 * j * rx + 2 * i + 1) + a] = cr(P(i - 1, j, a), P(i, j, a), P(i + 1, j, a), P(i + 2, j, a)) * scale;
        }
      }
    }
    // The odd rows from the even ones, column by column.
    const R = (I, J, a) => {
      if (J < 0) return 2 * R(I, 0, a) - R(I, 2, a);
      if (J >= ry) return 2 * R(I, ry - 1, a) - R(I, ry - 3, a);
      return pos[base + 3 * (J * rx + I) + a];
    };
    for (let J = 1; J < ry; J += 2) {
      for (let I = 0; I < rx; I++) {
        for (let a = 0; a < 3; a++) pos[base + 3 * (J * rx + I) + a] = cr(R(I, J - 3, a), R(I, J - 1, a), R(I, J + 1, a), R(I, J + 3, a));
      }
    }
    // Normals by central differences, pointing out of the bag.
    const sign = s === 0 ? 1 : -1;
    for (let J = 0; J < ry; J++) {
      for (let I = 0; I < rx; I++) {
        const l = base + 3 * (J * rx + Math.max(0, I - 1)), r = base + 3 * (J * rx + Math.min(rx - 1, I + 1));
        const u = base + 3 * (Math.max(0, J - 1) * rx + I), d = base + 3 * (Math.min(ry - 1, J + 1) * rx + I);
        const tx0 = pos[r] - pos[l], tx1 = pos[r + 1] - pos[l + 1], tx2 = pos[r + 2] - pos[l + 2];
        const ty0 = pos[u] - pos[d], ty1 = pos[u + 1] - pos[d + 1], ty2 = pos[u + 2] - pos[d + 2];
        let n0 = sign * (tx1 * ty2 - tx2 * ty1), n1 = sign * (tx2 * ty0 - tx0 * ty2), n2 = sign * (tx0 * ty1 - tx1 * ty0);
        const ln = Math.hypot(n0, n1, n2) || 1;
        n0 /= ln; n1 /= ln; n2 /= ln;
        const o = base + 3 * (J * rx + I);
        nor[o] = n0; nor[o + 1] = n1; nor[o + 2] = n2;
      }
    }
  });
}

// For tests and the view: the most a constraint of the film is stretched, as a fraction.
export function maxStretch(bag) {
  const { p, cons } = bag;
  let m = 0;
  for (let c = 0; c < cons.a.length; c++) {
    if (cons.k[c] < 1) continue;
    const i = 3 * cons.a[c], j = 3 * cons.b[c];
    const d = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1], p[j + 2] - p[i + 2]);
    m = Math.max(m, d / cons.len[c] - 1);
  }
  return m;
}

// For tests: how deep the film is inside any part (mm, 0 when it is clear).
export function filmInside(sim, { own = true, others = true } = {}) {
  let worst = 0;
  for (const bag of sim.bags) {
    for (const owner of sim.bags) {
      if ((owner === bag && !own) || (owner !== bag && !others)) continue;
      for (const part of owner.parts) {
        const iq = [-part.quat[0], -part.quat[1], -part.quat[2], part.quat[3]];
        for (let k = 0; k < bag.n; k++) {
          qrot(iq, bag.p[3 * k] - part.c[0], bag.p[3 * k + 1] - part.c[1], bag.p[3 * k + 2] - part.c[2], tmp);
          for (const h of part.spec.hull) {
            const [u, v, a] = h.axis === 'x' ? [tmp[1], tmp[2], tmp[0]] : [tmp[0], tmp[1], tmp[2]];
            const rho = Math.hypot(u, v);
            if (rho < h.r && a > h.z0 && a < h.z1) worst = Math.max(worst, Math.min(h.r - rho, h.z1 - a, a - h.z0));
          }
        }
      }
    }
  }
  return worst;
}

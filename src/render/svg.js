// A tiny string SVG builder. Everything is in millimetres (1 user unit = 1 mm), and the
// same strings serve the live preview, the exports and the Node tests.

// Numbers to at most 3 decimals (a micrometre), without trailing zeros.
export function n(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function attrs(a) {
  let out = '';
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    out += ` ${k}="${typeof v === 'number' ? n(v) : esc(v)}"`;
  }
  return out;
}

export function el(tag, a = {}, children = '') {
  return children === '' || children === null ? `<${tag}${attrs(a)}/>` : `<${tag}${attrs(a)}>${children}</${tag}>`;
}

export function rectPath(x, y, w, h, r = 0) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  if (!tl && !tr && !br && !bl) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return `M${n(x + tl)} ${n(y)}H${n(x + w - tr)}` + (tr ? `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}` : '')
    + `V${n(y + h - br)}` + (br ? `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}` : '')
    + `H${n(x + bl)}` + (bl ? `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}` : '')
    + `V${n(y + tl)}` + (tl ? `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}` : '') + 'Z';
}

export function ellipsePath(cx, cy, rx, ry) {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

// A stadium: a rounded slot, w wide and h tall, centred on (cx, cy).
export function slotPath(cx, cy, w, h) {
  return rectPath(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2);
}

// The "sombrero" euro hang hole: a round hole in the middle of a slot with rounded ends.
export function sombreroPath(cx, cy, w, h) {
  const r = h * 0.95; // the round middle, a bit taller than the slot
  const s = h * 0.32; // half height of the side arms
  const ax = Math.sqrt(Math.max(r * r - s * s, 0));
  return `M${n(cx - w / 2 + s)} ${n(cy - s)}H${n(cx - ax)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + ax)} ${n(cy - s)}H${n(cx + w / 2 - s)}`
    + `A${n(s)} ${n(s)} 0 0 1 ${n(cx + w / 2 - s)} ${n(cy + s)}H${n(cx + ax)}A${n(r)} ${n(r)} 0 0 1 ${n(cx - ax)} ${n(cy + s)}`
    + `H${n(cx - w / 2 + s)}A${n(s)} ${n(s)} 0 0 1 ${n(cx - w / 2 + s)} ${n(cy - s)}Z`;
}

export function polyPath(points, closed = true) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (closed ? 'Z' : '');
}

export function translate(x, y) {
  return `translate(${n(x)} ${n(y)})`;
}

// A full gear: `teeth` trapezoid teeth between radius r1 (root) and r2 (tip), with an
// optional round hole of radius hole (draw it with fill-rule evenodd).
export function gearPath(cx, cy, r1, r2, teeth, hole = 0) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const tip = step * 0.22, base = step * 0.3;
    pts.push([cx + r1 * Math.cos(a - base), cy + r1 * Math.sin(a - base)]);
    pts.push([cx + r2 * Math.cos(a - tip), cy + r2 * Math.sin(a - tip)]);
    pts.push([cx + r2 * Math.cos(a + tip), cy + r2 * Math.sin(a + tip)]);
    pts.push([cx + r1 * Math.cos(a + base), cy + r1 * Math.sin(a + base)]);
  }
  return polyPath(pts) + (hole > 0 ? ellipsePath(cx, cy, hole, hole) : '');
}

// Box helpers: boxes are { x, y, w, h }.
export function inset(b, l, t = l, r = l, bt = t) {
  return { x: b.x + l, y: b.y + t, w: Math.max(0, b.w - l - r), h: Math.max(0, b.h - t - bt) };
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// What the Design tab draws over the artwork, inside the sheet's SVG so it zooms with it:
// the hovered element's outline, the selection with its resize handles, and the snap guides.
// All of it ignores the pointer except the handles.
const SVGNS = 'http://www.w3.org/2000/svg';

function node(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function layer(svg, id) {
  svg.querySelector(`#${id}`)?.remove();
  const g = node('g', { id, 'pointer-events': 'none' });
  svg.append(g);
  return g;
}

// px: one screen pixel in mm.
export function drawHover(svg, hit, px) {
  const g = layer(svg, 'hover');
  if (!hit) return;
  const { x, y, w, h } = hit.box;
  g.append(node('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#0a84ff', 'stroke-opacity': 0.7, 'stroke-width': px }));
}

export function drawSelection(svg, hit, px) {
  const g = layer(svg, 'selection');
  if (!hit) return;
  const { x, y, w, h } = hit.box;
  g.append(node('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#ffffff', 'stroke-width': 3 * px, 'stroke-opacity': 0.8 }));
  g.append(node('rect', { x, y, width: w, height: h, fill: 'none', stroke: '#0a84ff', 'stroke-width': 1.5 * px, 'stroke-dasharray': `${4 * px} ${3 * px}` }));
  if (!hit.resizable) return;
  const s = 9 * px;
  for (const [corner, cx, cy] of [['nw', x, y], ['ne', x + w, y], ['sw', x, y + h], ['se', x + w, y + h]]) {
    const hd = node('rect', { x: cx - s / 2, y: cy - s / 2, width: s, height: s, rx: 1.5 * px, fill: '#ffffff', stroke: '#0a84ff', 'stroke-width': 1.5 * px, class: `handle ${corner}`, 'pointer-events': 'all' });
    hd.dataset.handle = corner;
    g.append(hd);
  }
}

// guides: [{ axis: 'x' | 'y', v, from, to }] in mm.
export function drawGuides(svg, guides, px) {
  const g = layer(svg, 'guides');
  for (const gd of guides ?? []) {
    const a = gd.axis === 'x' ? { x1: gd.v, x2: gd.v, y1: gd.from, y2: gd.to } : { y1: gd.v, y2: gd.v, x1: gd.from, x2: gd.to };
    // Solid red, so it never reads as the (dashed, magenta) dieline.
    g.append(node('line', { ...a, stroke: '#ff2d55', 'stroke-width': px }));
  }
}

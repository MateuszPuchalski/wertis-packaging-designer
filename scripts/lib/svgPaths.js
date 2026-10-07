// Small helpers for the import scripts: read the plain <path> elements of an SVG that
// pdftocairo wrote from an Illustrator PDF, measure them and move them. pdftocairo only
// writes absolute M/L/C/Z commands, which is all these helpers support.

const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;

// Paths with their fill, fill rule and whether a clip group holds them. pdftocairo puts
// artwork that masks use into <defs>; `includeDefs` reads those paths too.
export function readPaths(svg, { includeDefs = false } = {}) {
  const body = !includeDefs && svg.includes('</defs>') ? svg.split('</defs>')[1] : svg;
  const out = [];
  const stack = [];
  for (const tok of body.matchAll(/<g clip-path="url\(#([^)]+)\)">|<g[^>]*>|<\/g>|<path ([^>]*?)d="([^"]+)"/g)) {
    if (tok[1]) stack.push(tok[1]);
    else if (tok[0].startsWith('<g')) stack.push(null);
    else if (tok[0] === '</g>') stack.pop();
    else {
      const attrs = tok[2];
      const fill = attrs.match(/fill="(rgb\([^)]*\))"/)?.[1] ?? null;
      const d = tok[3];
      if (/[^MLCZ\s\d.,eE-]/.test(d)) throw new Error(`unsupported path command in ${d.slice(0, 40)}`);
      out.push({ fill, rule: attrs.includes('evenodd') ? 'evenodd' : 'nonzero', d, clipped: stack.some(Boolean), box: pathBox(d) });
    }
  }
  return out;
}

export function pathBox(d) {
  const n = d.match(NUM).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
  }
  return [x0, y0, x1, y1];
}

export function unionBox(boxes) {
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

// Every coordinate pair becomes (x * s + dx, y * s + dy), rounded to `digits`.
export function mapPath(d, s, dx, dy, digits = 2) {
  const f = 10 ** digits;
  const r = (v) => Math.round(v * f) / f;
  let i = 0;
  return d.replace(/([MLCZ])|(-?\d+(?:\.\d+)?(?:e-?\d+)?)/gi, (m, cmd) => {
    if (cmd) return cmd;
    const v = Number(m);
    return String(i++ % 2 === 0 ? r(v * s + dx) : r(v * s + dy));
  }).replace(/\s+/g, ' ').trim();
}

// Group paths whose boxes touch into one shape (an icon is several paths).
export function cluster(paths, margin = 1) {
  const touch = (a, b) => !(a[2] + margin < b[0] || b[2] + margin < a[0] || a[3] + margin < b[1] || b[3] + margin < a[1]);
  const groups = [];
  for (const p of paths) {
    const hit = groups.filter((g) => touch(g.box, p.box));
    const merged = { box: p.box, paths: [p] };
    for (const g of hit) {
      groups.splice(groups.indexOf(g), 1);
      merged.paths.push(...g.paths);
      merged.box = unionBox([merged.box, g.box]);
    }
    groups.push(merged);
  }
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (touch(groups[i].box, groups[j].box)) {
          const [b] = groups.splice(j, 1);
          groups[i].paths.push(...b.paths);
          groups[i].box = unionBox([groups[i].box, b.box]);
          changed = true;
          break outer;
        }
      }
    }
  }
  return groups.sort((a, b) => Math.round(a.box[1] / 40) - Math.round(b.box[1] / 40) || a.box[0] - b.box[0]);
}

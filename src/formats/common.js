// Shared pieces of the format definitions: number fields and dimension lines.

// A field the UI shows as a number input (in mm unless it says otherwise).
export function num(key, label, def, min, max, step = 1, extra = {}) {
  return { key, label, type: 'number', default: def, min, max, step, unit: 'mm', ...extra };
}

export function choice(key, label, def, options, extra = {}) {
  return { key, label, type: 'select', default: def, options, ...extra };
}

export function toggle(key, label, def, extra = {}) {
  return { key, label, type: 'checkbox', default: def, ...extra };
}

// Fills in defaults and clamps numbers, so a hand-edited or old project can't break the
// geometry.
export function normalizeDims(fields, dims = {}) {
  const out = {};
  for (const f of fields) {
    const v = dims[f.key];
    if (f.type === 'number') {
      const x = Number(v);
      out[f.key] = Number.isFinite(x) ? Math.min(f.max, Math.max(f.min, x)) : f.default;
    } else if (f.type === 'select') {
      out[f.key] = f.options.some(([k]) => k === v) ? v : f.default;
    } else out[f.key] = typeof v === 'boolean' ? v : f.default;
  }
  return out;
}

// A dimension line from (x1, y1) to (x2, y2), drawn `offset` mm away on the outside.
export function dim(x1, y1, x2, y2, offset, label) {
  return { x1, y1, x2, y2, offset, label: label ?? `${Math.round(Math.hypot(x2 - x1, y2 - y1) * 10) / 10}` };
}

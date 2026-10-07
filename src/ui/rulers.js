// The two rulers along the preview's top and left edge, in mm from the sheet's top left
// corner (the trim edge). They follow scrolling and zoom, shade the selected element's
// extent and mark the pointer. Drawn on canvases at the screen's pixel density.
import { h } from './dom.js';
import { rulerTicks } from '../edit/rulers.js';
import { fmtNum } from '../i18n/index.js';

export const RULER = 20; // px

export class Rulers {
  constructor() {
    this.top = h('canvas', { class: 'ruler ruler-x', 'aria-hidden': 'true' });
    this.left = h('canvas', { class: 'ruler ruler-y', 'aria-hidden': 'true' });
    this.corner = h('div', { class: 'ruler-corner', 'aria-hidden': 'true' }, 'mm');
  }

  // map: { left, top } screen px of the sheet's 0 mm, and ppm. sel: { x, y, w, h } mm.
  draw(map, sel, cursor) {
    this.map = map;
    this.sel = sel;
    this.cursor = cursor;
    if (!map) return;
    this.paint(this.top, 'x');
    this.paint(this.left, 'y');
  }

  pointer(cursor) {
    this.cursor = cursor;
    if (this.map) { this.paint(this.top, 'x'); this.paint(this.left, 'y'); }
  }

  paint(cv, axis) {
    const r = cv.getBoundingClientRect();
    const len = axis === 'x' ? r.width : r.height;
    if (!len) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    const { ppm } = this.map;
    const zero = axis === 'x' ? this.map.left - r.left : this.map.top - r.top; // px of 0 mm in the ruler
    const at = (mm) => zero + mm * ppm;
    // The selection's extent.
    if (this.sel) {
      const a = at(axis === 'x' ? this.sel.x : this.sel.y), b = at(axis === 'x' ? this.sel.x + this.sel.w : this.sel.y + this.sel.h);
      ctx.fillStyle = 'rgba(10, 132, 255, 0.16)';
      if (axis === 'x') ctx.fillRect(a, 0, b - a, RULER); else ctx.fillRect(0, a, RULER, b - a);
    }
    const { ticks } = rulerTicks(-zero / ppm, (len - zero) / ppm, ppm);
    ctx.strokeStyle = '#9a948b';
    ctx.fillStyle = '#5d5852';
    ctx.lineWidth = 1;
    ctx.font = '10px Barlow, system-ui, sans-serif';
    ctx.beginPath();
    for (const tk of ticks) {
      const p = Math.round(at(tk.v)) + 0.5;
      const len2 = tk.major ? RULER - 4 : tk.v % 5 === 0 ? 7 : 4;
      if (axis === 'x') { ctx.moveTo(p, RULER); ctx.lineTo(p, RULER - len2); } else { ctx.moveTo(RULER, p); ctx.lineTo(RULER - len2, p); }
    }
    ctx.stroke();
    for (const tk of ticks) {
      if (!tk.major) continue;
      const p = Math.round(at(tk.v));
      const s = fmtNum(tk.v);
      if (axis === 'x') ctx.fillText(s, p + 3, 10);
      else {
        ctx.save();
        ctx.translate(10, p - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(s, 0, 0);
        ctx.restore();
      }
    }
    if (this.cursor) {
      const p = Math.round(at(axis === 'x' ? this.cursor.x : this.cursor.y)) + 0.5;
      ctx.strokeStyle = '#0a84ff';
      ctx.beginPath();
      if (axis === 'x') { ctx.moveTo(p, 0); ctx.lineTo(p, RULER); } else { ctx.moveTo(0, p); ctx.lineTo(RULER, p); }
      ctx.stroke();
    }
  }
}

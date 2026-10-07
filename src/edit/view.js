// The preview's zoom: the size that fits the window, the limits, the wheel, and zooming
// around the cursor (the point under it stays put). Zoom is screen pixels per mm. DOM-free.

export const MIN_PPM = 0.2;
export const MAX_PPM = 40;
export const PX_PER_MM = 96 / 25.4; // 100 % = real size on a 96 dpi screen

export const clampPpm = (ppm) => Math.min(MAX_PPM, Math.max(MIN_PPM, ppm));

// The zoom that shows the whole box with `pad` pixels to spare.
export function fitPpm(viewW, viewH, box, pad = 48) {
  return Math.max(MIN_PPM, Math.min((viewW - pad) / box.w, (viewH - pad) / box.h));
}

// How much one wheel event zooms: a notch (100 px) is about 18 %; lines and pages count as
// pixels, and one event never zooms more than 2×.
export function wheelFactor(deltaY, deltaMode = 0) {
  const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
  return Math.exp(-Math.max(-350, Math.min(350, px)) * 0.002);
}

// The scroll position that keeps the point under the cursor in place along one axis.
//   cursor  pointer position in the scroll box's visible area (px)
//   scroll  scroll offset before                origin, origin2  where the drawing starts in the scrolled content (px)
export function anchorScroll(cursor, scroll, origin, ppm, origin2, ppm2) {
  const mm = (scroll + cursor - origin) / ppm;
  return origin2 + mm * ppm2 - cursor;
}

export const percent = (ppm) => Math.round((ppm / PX_PER_MM) * 100);
export const ppmForPercent = (p) => (p / 100) * PX_PER_MM;

// The next zoom step for the + and − keys and buttons.
export function stepZoom(ppm, dir) {
  return clampPpm(ppm * (dir > 0 ? 1.25 : 1 / 1.25));
}

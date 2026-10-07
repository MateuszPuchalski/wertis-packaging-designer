// Turning SVG strings into downloadable files: SVG as it is, PNG through a canvas, PDF
// through jsPDF + svg2pdf (vendored, loaded as classic scripts in index.html). All text is
// already outlined and every image is embedded, so nothing external is needed.

export function slug(s) {
  return String(s || 'wertis').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'wertis';
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function svgBlob(svg) {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' });
}

function svgSizeMm(svg) {
  const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

// PNG at `dpi` (pixels per inch of the real size).
export async function pngBlob(svg, { dpi = 150, maxPx = 12000, background = null } = {}) {
  const size = svgSizeMm(svg);
  const scale = Math.min(dpi / 25.4, maxPx / Math.max(size.w, size.h));
  const W = Math.round(size.w * scale), H = Math.round(size.h * scale);
  const sized = svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${W}" height="${H}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A vector PDF whose page is the SVG's size in mm.
export async function pdfBlob(svg, { title = 'WERTIS packaging' } = {}) {
  const { jsPDF } = window.jspdf ?? {};
  if (!jsPDF || !window.svg2pdf) throw new Error('The PDF library did not load.');
  const size = svgSizeMm(svg);
  const doc = new jsPDF({ orientation: size.w >= size.h ? 'landscape' : 'portrait', unit: 'mm', format: [size.w, size.h], compress: true });
  doc.setProperties({ title, creator: 'WERTIS Packaging Designer' });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = svg;
  document.body.append(holder);
  try {
    await doc.svg(holder.firstElementChild, { x: 0, y: 0, width: size.w, height: size.h });
  } finally {
    holder.remove();
  }
  return doc.output('blob');
}

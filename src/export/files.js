import { pdfName, pdfString, addInfoKeys, toBinary, fromBinary } from './pdfx.js';

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

// A vector PDF, one page per SVG, each page the SVG's size in mm.
//   colors   hex → [c, m, y, k] in %, or { spot, tint, overprint }: every fill and stroke is
//            written in that colour instead of RGB (missing colours get the simple CMYK
//            conversion); spot colours become Separation inks
//   spots    [{ name, cmyk }]: the spot inks, with the CMYK a screen shows them in
//   boxes    { trim, bleed } in mm from the page's top left: the TrimBox and BleedBox
//   pdfx     { version, intent, info }: the PDF/X keys and the output intent (a printing
//            condition from the ICC registry, so no profile needs embedding)
export async function pdfBlob(svgs, { title = 'WERTIS packaging', cmyk = null, colors = cmyk, spots = [], boxes = null, pdfx = null, compress = true } = {}) {
  const { jsPDF, GState } = window.jspdf ?? {};
  if (!jsPDF || !window.svg2pdf) throw new Error('The PDF library did not load.');
  const pages = Array.isArray(svgs) ? svgs : [svgs];
  const first = svgSizeMm(pages[0]);
  const doc = new jsPDF({ orientation: first.w >= first.h ? 'landscape' : 'portrait', unit: 'mm', format: [first.w, first.h], compress });
  doc.setProperties({ title, creator: 'WERTIS Packaging Designer' });
  const write = (str) => doc.internal.write(str);
  const ev = doc.internal.events;
  let gsOp = 0, intent = 0;
  if (spots.length || pdfx) {
    // Our own objects: the overprint graphics state and the output intent.
    doc.addGState('WPgsDefault', new GState({ opacity: 1 })); // so jsPDF writes an ExtGState dict at all
    ev.subscribe('putResources', () => {
      gsOp = doc.internal.newObject();
      write('<< /Type /ExtGState /OP true /op true /OPM 1 >>');
      write('endobj');
      if (pdfx) {
        intent = doc.internal.newObject();
        write(`<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${pdfString(pdfx.intent)}) /OutputCondition (${pdfString(pdfx.info)}) /RegistryName (http://www.color.org) /Info (${pdfString(pdfx.info)}) >>`);
        write('endobj');
      }
    });
    ev.subscribe('putGStateDict', () => write(`/WPgsOP ${gsOp} 0 R`));
    // jsPDF's resource dictionary has no colour-space hook: close its XObject dictionary,
    // add ours, and open a dummy one for jsPDF's closing ">>".
    if (spots.length) {
      ev.subscribe('putXobjectDict', () => {
        write('>>');
        write('/ColorSpace <<');
        spots.forEach((sp, i) => write(`/WPcs${i} [/Separation /${pdfName(sp.name)} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${sp.cmyk.map((v) => Math.round(v * 10) / 1000).join(' ')}] /N 1 >>]`));
        write('>>');
        write('/WPunused <<');
      });
    }
    if (pdfx) ev.subscribe('putCatalog', () => write(`/OutputIntents [${intent} 0 R]`));
  }
  if (colors) {
    const spotIndex = (name) => spots.findIndex((sp) => sp.name === name);
    const f = (v) => String(Math.round(v * 1000) / 1000);
    for (const [name, op] of [['setFillColor', 'cs scn'], ['setDrawColor', 'CS SCN']]) {
      const orig = doc[name].bind(doc);
      doc[name] = (a, b, c, d) => {
        if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && d === undefined) {
          const hex = `#${[a, b, c].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
          const v = colors.get(hex);
          if (v && v.spot && spotIndex(v.spot) >= 0) {
            const [cs, scn] = op.split(' ');
            write(`${v.overprint ? '/WPgsOP gs ' : ''}/WPcs${spotIndex(v.spot)} ${cs} ${f(v.tint ?? 1)} ${scn}`);
            return doc;
          }
          const [C, M, Y, K] = Array.isArray(v) ? v : naiveCmyk(a, b, c);
          return orig(C / 100, M / 100, Y / 100, K / 100);
        }
        return orig(a, b, c, d);
      };
    }
  }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.append(holder);
  try {
    for (let i = 0; i < pages.length; i++) {
      const size = svgSizeMm(pages[i]);
      if (i > 0) doc.addPage([size.w, size.h], size.w >= size.h ? 'landscape' : 'portrait');
      holder.innerHTML = pages[i];
      await doc.svg(holder.firstElementChild, { x: 0, y: 0, width: size.w, height: size.h });
      if (boxes) {
        const k = 72 / 25.4;
        const box = (b) => ({ bottomLeftX: b.x * k, bottomLeftY: (size.h - b.y - b.h) * k, topRightX: (b.x + b.w) * k, topRightY: (size.h - b.y) * k });
        const ctx = doc.internal.getPageInfo(i + 1).pageContext;
        ctx.trimBox = box(boxes.trim);
        ctx.bleedBox = box(boxes.bleed);
      }
    }
  } finally {
    holder.remove();
  }
  if (!pdfx) return doc.output('blob');
  const bytes = fromBinary(addInfoKeys(toBinary(new Uint8Array(doc.output('arraybuffer'))),
    `/Trapped /False\n/GTS_PDFXVersion (${pdfx.version})\n/GTS_PDFXConformance (${pdfx.version})\n/ModDate ($CREATED)`));
  return new Blob([bytes], { type: 'application/pdf' });
}

function naiveCmyk(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - R - k) / (1 - k), (1 - G - k) / (1 - k), (1 - B - k) / (1 - k), k].map((v) => Math.round(v * 100));
}

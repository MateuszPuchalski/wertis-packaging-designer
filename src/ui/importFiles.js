// Reading files for the project, in the page: an .ai (Illustrator saves a PDF inside) or a PDF through
// the vendored pdf.js (loaded only when a file is chosen), and plain images. Nothing leaves the machine.
import { extractLines, buildDieline } from '../import/dieline.js';

const MAX_PX = 3000;

function fail(message, key) {
  return Object.assign(new Error(message), { i18n: { key, params: {} } });
}

let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

export const isPdfLike = (file) => /\.(ai|pdf)$/i.test(file.name) || file.type === 'application/pdf' || file.type === 'application/illustrator';
export const stem = (file) => file.name.replace(/\.[^.]+$/, '');

async function openPage(file) {
  const { getDocument } = await lib();
  try {
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: false, verbosity: 0 }).promise;
    return { pdf, page: await pdf.getPage(1) };
  } catch {
    throw fail('This file could not be read as an .ai, PDF or image.', 'err.notReadable');
  }
}

// The cut and fold lines of the file's first page, as a dieline in mm.
export async function readDieline(file) {
  const { OPS } = await lib();
  const { pdf, page } = await openPage(file);
  try {
    const height = page.getViewport({ scale: 1 }).height;
    const dieline = buildDieline(extractLines(await page.getOperatorList(), OPS, height));
    if (!dieline) throw fail('No cut lines (cyan) were found in this file, so it cannot be used as a dieline.', 'err.noDieline');
    return { dieline, name: stem(file) };
  } finally {
    pdf.destroy();
  }
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// The file as a picture: a data URL (JPEG for pages and photos, PNG when it may have transparency),
// at most MAX_PX on the long side, and its width over height.
export async function readPicture(file) {
  if (isPdfLike(file)) {
    const { pdf, page } = await openPage(file);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, MAX_PX / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = canvasOf(vp.width, vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, background: 'white' }).promise;
      return { src: canvas.toDataURL('image/jpeg', 0.9), ratio: canvas.width / canvas.height, name: stem(file) };
    } finally {
      pdf.destroy();
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(fail('This file could not be read as an .ai, PDF or image.', 'err.notReadable')); i.src = url; });
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
    const g = canvas.getContext('2d');
    const png = file.type === 'image/png' || file.type === 'image/webp';
    if (!png) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), ratio: canvas.width / canvas.height, name: stem(file) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

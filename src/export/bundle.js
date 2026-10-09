// What "download everything" packs: one folder per size the pack comes in (a pouch has its four sizes,
// a box just the one it is), each with the same files. DOM-free; the page makes the files.
import { FORMATS } from '../registry.js';

export const BUNDLE_FILES = ['print.pdf', 'dieline.dxf', 'print.svg', 'proof.pdf', 'proof.png', 'mockup.png'];

const cm = (mm) => String(Math.round(mm) / 10).replace('.', ',');

// [{ folder, size, design }]: the design resized to each of the format's sizes (width × height in mm).
export function bundlePlan(design) {
  const sizes = FORMATS[design.format]?.sizes;
  if (!sizes?.length) {
    return [{ folder: '', size: null, design }];
  }
  return sizes.map(([w, h]) => ({
    folder: `${cm(w)}x${cm(h)}-cm`,
    size: [w, h],
    design: { ...design, dims: { ...design.dims, width: w, height: h } },
  }));
}

// The file's name inside the zip: folder/pack-size-kind.
export function bundleName(entry, packName, file) {
  const stem = entry.size ? `${packName}-${entry.folder}` : packName;
  return `${entry.folder ? `${entry.folder}/` : ''}${stem}-${file}`;
}

// Small PDF helpers for the print PDF (DOM-free, tested in Node): PDF names for spot inks,
// and adding the PDF/X keys to the Info dictionary of a finished file. jsPDF has no hook
// for those keys, so they go in afterwards and every byte offset after them moves on.

// A PDF name token: anything outside the printable ASCII range, and the delimiters, as #xx.
export function pdfName(name) {
  let out = '';
  for (const b of new TextEncoder().encode(String(name))) {
    out += b < 33 || b > 126 || '#/()<>[]{}%'.includes(String.fromCharCode(b)) ? `#${b.toString(16).padStart(2, '0').toUpperCase()}` : String.fromCharCode(b);
  }
  return out || 'Spot';
}

export function pdfString(s) {
  return String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');
}

// Bytes ↔ a binary string where one character is one byte (offsets stay byte offsets).
export function toBinary(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

export function fromBinary(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// Inserts `keys` (PDF dictionary entries) into the Info dictionary jsPDF wrote, and shifts
// the cross-reference table so every object after it is still found.
export function addInfoKeys(pdf, keys) {
  const p = pdf.indexOf('/Producer (');
  if (p < 0) throw new Error('no Info dictionary');
  const at = pdf.indexOf('\n>>', p) + 1;
  const created = pdf.slice(p, at).match(/\/CreationDate \(([^)]*)\)/)?.[1];
  const text = `${keys.replace('$CREATED', created ?? '')}\n`;
  const delta = text.length;
  let out = pdf.slice(0, at) + text + pdf.slice(at);
  const sx = out.lastIndexOf('startxref');
  const xrefAt = Number(out.slice(sx + 9).trim().split(/\s/)[0]);
  const newXrefAt = xrefAt > at ? xrefAt + delta : xrefAt;
  const tableEnd = out.indexOf('trailer', newXrefAt);
  const table = out.slice(newXrefAt, tableEnd).replace(/^(\d{10}) (\d{5}) n/gm, (m, off, gen) => {
    const o = Number(off);
    return `${String(o > at ? o + delta : o).padStart(10, '0')} ${gen} n`;
  });
  out = out.slice(0, newXrefAt) + table + out.slice(tableEnd, sx) + `startxref\n${newXrefAt}\n%%EOF\n`;
  return out;
}

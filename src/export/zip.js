// A minimal ZIP writer (stored, no compression), so "download everything" needs no library.
// PDFs and PNGs are compressed already; the rest is small. DOM-free: bytes in, bytes out.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// DOS date and time words for a Date (the ZIP format's own, local time, 2 s steps, from 1980).
function dosStamp(date) {
  const y = Math.max(1980, date.getFullYear());
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}

// files: [{ name, data: Uint8Array }]. Names are written as UTF-8 (flag bit 11).
export function zip(files, date = new Date()) {
  const enc = new TextEncoder();
  const { time, date: day } = dosStamp(date);
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => { chunks.push(u8); offset += u8.length; };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true);
    head.setUint16(8, 0, true);
    head.setUint16(10, time, true);
    head.setUint16(12, day, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    central.push({ name, crc, size: f.data.length, at: offset });
    push(new Uint8Array(head.buffer));
    push(name);
    push(f.data);
  }
  const start = offset;
  for (const c of central) {
    const d = new DataView(new ArrayBuffer(46));
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x0800, true);
    d.setUint16(12, time, true);
    d.setUint16(14, day, true);
    d.setUint32(16, c.crc, true);
    d.setUint32(20, c.size, true);
    d.setUint32(24, c.size, true);
    d.setUint16(28, c.name.length, true);
    d.setUint32(42, c.at, true);
    push(new Uint8Array(d.buffer));
    push(c.name);
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, offset - start, true);
  end.setUint32(16, start, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

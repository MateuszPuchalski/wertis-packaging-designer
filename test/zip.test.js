import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { zip, crc32 } from '../src/export/zip.js';

const bytes = (s) => new TextEncoder().encode(s);

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('the zip has every file, in order, with sizes and checksums a reader can verify', () => {
  const files = [{ name: 'a-print.pdf', data: bytes('%PDF-1.4 fake') }, { name: 'ęś.txt', data: bytes('zażółć gęślą jaźń') }, { name: 'empty.bin', data: new Uint8Array(0) }];
  const out = zip(files, new Date(2026, 9, 9, 12, 30, 10));
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const end = out.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'end of central directory');
  assert.equal(v.getUint16(end + 10, true), 3, 'three entries');
  let p = v.getUint32(end + 16, true);
  for (const f of files) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const nameLen = v.getUint16(p + 28, true);
    assert.equal(new TextDecoder().decode(out.subarray(p + 46, p + 46 + nameLen)), f.name);
    assert.equal(v.getUint32(p + 16, true), crc32(f.data));
    assert.equal(v.getUint32(p + 24, true), f.data.length);
    const at = v.getUint32(p + 42, true);
    assert.equal(v.getUint32(at, true), 0x04034b50);
    assert.deepEqual(out.subarray(at + 30 + nameLen, at + 30 + nameLen + f.data.length), f.data, 'the stored bytes');
    p += 46 + nameLen;
  }
});

test('a real unzip tool reads it back (skipped when none is installed)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const path = join(dir, 'x.zip');
  writeFileSync(path, zip([{ name: 'one.txt', data: bytes('hello') }, { name: 'two.json', data: bytes('{"a":1}') }]));
  const r = spawnSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(z.namelist()))', path], { encoding: 'utf8' });
  if (r.error) return t.skip('no python3');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'one.txt,two.json');
});

test('the bundle has a folder per pouch size and one set of files for a box', async () => {
  const { bundlePlan, bundleName } = await import('../src/export/bundle.js');
  const { createDesign } = await import('../src/design.js');
  const pouch = bundlePlan(createDesign({ format: 'flatPouch' }));
  assert.deepEqual(pouch.map((e) => e.folder), ['10x15-cm', '14x20-cm', '20x28-cm', '25x35-cm']);
  assert.deepEqual(pouch.map((e) => [e.design.dims.width, e.design.dims.height]), [[100, 150], [140, 200], [200, 280], [250, 350]]);
  assert.equal(bundleName(pouch[0], 'wertis-pouch', 'print.pdf'), '10x15-cm/wertis-pouch-10x15-cm-print.pdf');
  const stand = bundlePlan(createDesign({ format: 'standUpPouch' }));
  assert.equal(stand.length, 4);
  assert.equal(stand[0].design.dims.gusset, createDesign({ format: 'standUpPouch' }).dims.gusset, 'only width and height change');
  const box = bundlePlan(createDesign({ format: 'tuckBox' }));
  assert.equal(box.length, 1);
  assert.equal(bundleName(box[0], 'wertis-box', 'print.pdf'), 'wertis-box-print.pdf');
});

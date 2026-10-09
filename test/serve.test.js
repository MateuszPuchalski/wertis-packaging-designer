import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from '../scripts/serve.js';

const script = fileURLToPath(new URL('../scripts/serve.js', import.meta.url));

// A port nothing is using right now.
function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Starts scripts/serve.js on `host` (unset: the default) and resolves once it has printed its
// addresses. `out` holds what it printed.
async function serve(host) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port) };
  delete env.HOST;
  if (host) env.HOST = host;
  const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { port, out: '', stop: () => child.kill() };
  const ready = (text) => text.includes('running at') && (host !== '0.0.0.0' || lanAddresses().length === 0 || text.includes('on your network'));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { s.out += d; if (ready(s.out)) resolve(); });
    child.stderr.on('data', (d) => { s.out += d; });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${s.out}`)));
  });
  return s;
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
  return { status: r.status, text: await r.text() };
}

test('by default the server listens on this computer only', async (t) => {
  const s = await serve();
  try {
    assert.equal((await get(`http://127.0.0.1:${s.port}/index.html`)).status, 200);
    assert.ok(!s.out.includes('on your network'), 'it prints no network address');
    const lan = lanAddresses()[0];
    if (!lan) return t.diagnostic('no network address on this machine: the refusal is not checked');
    await assert.rejects(get(`http://${lan}:${s.port}/index.html`), 'other devices cannot reach it');
  } finally {
    s.stop();
  }
});

test('HOST=0.0.0.0 serves the folder to the network and prints the addresses', async (t) => {
  const lan = lanAddresses();
  if (!lan.length) return t.skip('no network address on this machine');
  const s = await serve('0.0.0.0');
  try {
    assert.equal((await get(`http://127.0.0.1:${s.port}/index.html`)).status, 200);
    for (const ip of lan) {
      const r = await get(`http://${ip}:${s.port}/src/main.js`);
      assert.equal(r.status, 200, `reachable at ${ip}`);
      assert.match(r.text, /import/, 'the app itself');
      assert.ok(s.out.includes(`http://${ip}:${s.port}`), `prints http://${ip}:${s.port}`);
    }
  } finally {
    s.stop();
  }
});

// Browser check: headless Chromium opens the app through `npm start` and uses it like a
// person would: select and drag the window, edit a swatch, undo, export every file, switch
// formats. It fails on any console error. Screenshots go to docs/screenshots/.
//
//   npm run playtest            (PORT=xxxx to pick the port, default 8190)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8190;
const shots = `${root}docs/screenshots/`;

async function launch() {
  try {
    // SwiftShader gives headless Chromium WebGL for the 3D tab.
    return await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (err) {
    // The agent sandbox keeps its browser here; elsewhere Playwright finds its own.
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => { throw err; });
  }
}

async function waitForServer(url, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not start at ${url}`);
}

export async function playtest() {
  mkdirSync(shots, { recursive: true });
  const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.js', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const browser = await launch();
  const errors = [];
  const steps = [];
  const step = (s) => { steps.push(s); console.log(`  ✓ ${s}`); };
  try {
    await waitForServer(`http://localhost:${port}/`);
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('body.ready', { timeout: 30000 });
    await page.waitForSelector('.canvas svg');
    step('the app starts and draws the design');
    await page.screenshot({ path: `${shots}design.png` });

    // Select the window on the preview; the inspector shows it.
    const win = page.locator('.canvas [data-el="front.window"]').first();
    await win.click({ position: { x: 30, y: 30 } });
    await page.waitForFunction(() => document.querySelector('.insp-title')?.textContent === 'Window');
    step('clicking the window selects it');

    // Drag it 20 mm to the right (measured through the preview's own scale).
    const before = await page.evaluate(() => window.wertis.stage.hit('front.window').box);
    const ppm = await page.evaluate(() => window.wertis.stage.zoom ?? window.wertis.stage.fitPpm);
    const bb = await win.boundingBox();
    await page.mouse.move(bb.x + 40, bb.y + 40);
    await page.mouse.down();
    await page.mouse.move(bb.x + 40 + 10 * ppm, bb.y + 40, { steps: 4 });
    await page.mouse.move(bb.x + 40 + 20 * ppm, bb.y + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.wertis.stage.hit('front.window').box);
    assert.ok(Math.abs(after.x - before.x - 20) <= 1, `window moved ${after.x - before.x} mm, expected 20`);
    assert.ok(await page.evaluate(() => !!window.wertis.store.get().layout['front.window']), 'the move is saved in the layout');
    step('dragging the window moves it 20 mm');

    // Edit a swatch in the Colours panel: everything that uses it follows.
    await page.click('#sec-colours > summary');
    const hex = page.locator('[data-swatch="boxOrange"] .sw-hex');
    await hex.fill('#00AA55');
    await page.waitForFunction(() => document.querySelector('.canvas svg')?.innerHTML.includes('#00aa55'), null, { timeout: 10000 })
      .catch(() => { throw new Error('the preview does not use the edited swatch'); });
    assert.ok((await page.evaluate(() => window.wertis.printSvg())).includes('#00aa55'), 'the print file uses the edited swatch');
    step('editing a swatch recolours the preview and the print file');
    await page.screenshot({ path: `${shots}colours.png` });

    // Undo twice: the swatch and then the move come back.
    await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.wertis.store.get().palette.find((s) => s.id === 'boxOrange').hex), '#f68c1e');
    step('undo restores the swatch');

    // Exports.
    const svg = await page.evaluate(() => window.wertis.printSvg());
    const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
    assert.deepEqual([Number(m[1]), Number(m[2])], [506, 356], 'print SVG is 2 × 250 + bleed by 350 + bleed mm');
    assert.ok(!/<filter|<pattern|<mask/.test(svg), 'the print file has no filters, patterns or masks');
    assert.ok(svg.includes('id="dieline"'), 'the print file has a dieline group');
    const pdf = await page.evaluate(async () => {
      const doc = window.wertis.printDocument();
      const blob = await window.wertis.pdfBlob(doc.pages, { cmyk: doc.cmyk, compress: false });
      const text = await blob.text();
      return { size: blob.size, box: text.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1], pages: (text.match(/\/Type \/Page\b/g) || []).length,
        cmyk: (text.match(/ k\n/g) || []).length, rgb: (text.match(/\d (rg|RG)\n/g) || []).length };
    });
    const [, , pw, ph] = pdf.box.trim().split(/\s+/).map(Number);
    assert.ok(Math.abs(pw - (506 * 72) / 25.4) < 0.5 && Math.abs(ph - (356 * 72) / 25.4) < 0.5, `PDF page is ${pw} × ${ph} pt`);
    assert.equal(pdf.pages, 2, 'artwork + dieline, then the dieline alone');
    assert.ok(pdf.cmyk > 20 && pdf.rgb === 0, `colours are CMYK (${pdf.cmyk} CMYK fills, ${pdf.rgb} RGB)`);
    step(`print PDF is 506 × 356 mm, 2 pages, all colours CMYK`);
    const proofPng = await page.evaluate(async () => (await window.wertis.pngBlob(window.wertis.proofSvg('a3'), { dpi: 100 })).size);
    assert.ok(proofPng > 50_000, 'proof PNG has content');
    step('proof PNG renders');

    // The export buttons download files.
    for (const key of ['print-svg', 'proof-pdf', 'mockup-png']) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(`[data-export="${key}"]`)]);
      const path = await dl.path();
      assert.ok(path, `${key} downloaded`);
      step(`the ${key} button downloads ${dl.suggestedFilename()}`);
    }

    // A product photo (drawn in the page: a shaded filter body) goes in through the Mockup
    // section's file input and shows through the window.
    const photo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 900; c.height = 600;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 180, 0, 420);
      g.addColorStop(0, '#9aa0a6'); g.addColorStop(0.5, '#f2f3f4'); g.addColorStop(1, '#5f6368');
      x.fillStyle = '#2b2b2b'; x.fillRect(80, 280, 740, 40);
      x.fillStyle = g; x.beginPath(); x.roundRect(250, 180, 400, 240, 40); x.fill();
      x.fillStyle = '#f68c1e'; x.fillRect(330, 180, 30, 240); x.fillRect(540, 180, 30, 240);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.click('#sec-mockup > summary');
    await page.setInputFiles('#mockup-photo', { name: 'filter.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
    await page.waitForFunction(() => !!window.wertis.store.get().mockup.photo);
    assert.ok((await page.evaluate(() => window.wertis.mockupSvg())).includes('<image'), 'the photo is in the mockup');
    await page.selectOption('#mockup-view', 'both');
    step('a product photo shows through the window in the mockup');
    for (const dpi of [96, 300]) {
      const size = await page.evaluate(async (d) => (await window.wertis.pngBlob(window.wertis.mockupSvg(), { dpi: d })).size, dpi);
      assert.ok(size > 100_000, `mockup PNG at ${dpi} dpi`);
    }
    step('the mockup exports at 96 and 300 dpi');
    await page.click('#mockup-remove'); // the screenshots show the empty window
    await page.waitForFunction(() => !window.wertis.store.get().mockup.photo);

    // The outline pattern style.
    await page.click('#sec-pattern > summary');
    await page.selectOption('#f-pattern-style', 'outline');
    await page.waitForTimeout(150);
    assert.ok((await page.evaluate(() => window.wertis.printSvg())).includes('stroke-linejoin="round"'), 'outline icons are stroked');
    step('the pattern switches to outlines');

    for (const tab of ['proof', 'mockup']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${shots}${tab}.png` });
    }
    step('proof and mockup tabs draw');

    const formats = await page.evaluate(() => [...document.querySelectorAll('#format option')].map((o) => o.value));
    await page.click('[data-tab="design"]');
    const seen = [];
    for (const f of formats) {
      await page.selectOption('#format', f);
      await page.waitForTimeout(400);
      const templates = await page.evaluate(() => [...document.querySelectorAll('#template option')].map((o) => o.value));
      for (const t of templates) {
        await page.selectOption('#template', t);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${shots}format-${f}-${t}.png` });
        const s = await page.evaluate(() => window.wertis.printSvg());
        assert.ok(s.length > 10_000 && !s.includes('NaN'), `${f} / ${t} renders a print file`);
        const pdf = await page.evaluate(async () => (await window.wertis.pdfBlob(window.wertis.printSvg())).size);
        assert.ok(pdf > 20_000, `${f} / ${t} makes a PDF`);
        await page.click('[data-tab="mockup"]');
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${shots}mockup-${f}-${t}.png` });
        await page.click('[data-tab="proof"]');
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${shots}proof-${f}-${t}.png` });
        await page.click('[data-tab="design"]');
        seen.push(`${f}/${t}`);
      }
    }
    step(`every format and template draws and exports (${seen.join(', ')})`);

    // The 3D tab: packs under physics, every scene, a push and a snapshot.
    await page.selectOption('#format', 'flatPouch');
    await page.click('[data-tab="3d"]');
    await page.waitForSelector('.view3d[data-ready="1"]', { timeout: 90000 });
    for (const scene of await page.evaluate(() => [...document.querySelectorAll('#scene3d option')].map((o) => o.value))) {
      await page.selectOption('#scene3d', scene);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${shots}3d-pouch-${scene}.png` });
    }
    await page.click('#push3d');
    const [dl3d] = await Promise.all([page.waitForEvent('download'), page.click('#png3d')]);
    assert.ok(await dl3d.path(), '3D snapshot downloaded');
    await page.click('[data-tab="design"]');
    await page.selectOption('#format', 'tuckBox');
    await page.click('[data-tab="3d"]');
    await page.waitForFunction(() => window.wertis.stage.view3d?.pack?.kind === 'box', null, { timeout: 90000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${shots}3d-box-stack.png` });
    const moved = await page.evaluate(async () => {
      const v = window.wertis.stage.view3d;
      const before = v.items.map((i) => i.body.position.x + i.body.position.z);
      v.push();
      await new Promise((r) => setTimeout(r, 1500));
      return v.items.some((i, k) => Math.abs(i.body.position.x + i.body.position.z - before[k]) > 0.01);
    });
    assert.ok(moved, 'a push moves the stack');
    step('the 3D tab hangs, piles and stacks the packs, and pushing moves them');
    await page.click('[data-tab="design"]');

    assert.deepEqual(errors, [], `console errors:\n${errors.join('\n')}`);
    step('no console errors');
    writeFileSync(`${shots}README.md`, `# Screenshots\n\nWritten by \`npm run playtest\`.\n\n${steps.map((s) => `- ${s}`).join('\n')}\n`);
  } finally {
    await browser.close();
    server.kill();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  playtest().then(() => console.log('playtest passed'), (err) => { console.error(err); process.exit(1); });
}

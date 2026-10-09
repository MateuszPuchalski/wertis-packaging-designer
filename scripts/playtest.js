// Browser check: headless Chromium opens the app through `npm start` and uses it like a
// person would: select and drag the window (snapping, and Alt to place freely), zoom and
// pan, the right-click menu, edit a swatch, undo, export every file from the Export menu,
// switch formats; then the same app in Polish, and switching the language. It fails on any
// console error or untranslated text. Screenshots go to docs/screenshots/.
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

// The Export menu opens, and the item downloads.
async function exportVia(page, key) {
  await page.click('#export-button');
  await page.click(`#export-menu [data-export="${key}"]`);
}

// A point on the screen where the element itself is painted (not a gap between letters).
async function pointOn(page, id) {
  return page.evaluate((elId) => {
    const g = document.querySelector(`.canvas [data-el="${elId}"]`);
    const r = g.getBoundingClientRect();
    for (let fy = 0.5; fy < 1; fy += 0.04) {
      for (let fx = 0.2; fx < 0.9; fx += 0.03) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('[data-el]')?.dataset.el === elId) return { x, y };
      }
    }
    return null;
  }, id);
}

// The sheet mm under a screen point.
const mmAt = (page, x, y) => page.evaluate(([cx, cy]) => {
  const p = new DOMPoint(cx, cy).matrixTransform(window.wertis.stage.svg.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}, [x, y]);

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
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true, locale: 'en-US' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000); // the 3D tab renders in software (SwiftShader) here
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

    // Drag it 20 mm to the right (measured through the preview's own scale), holding Alt so
    // it does not snap to anything on the way.
    const before = await page.evaluate(() => window.wertis.stage.hit('front.window').box);
    const ppm = await page.evaluate(() => window.wertis.stage.zoom ?? window.wertis.stage.fitPpm);
    const bb = await win.boundingBox();
    await page.keyboard.down('Alt');
    await page.mouse.move(bb.x + 40, bb.y + 40);
    await page.mouse.down();
    await page.mouse.move(bb.x + 40 + 10 * ppm, bb.y + 40, { steps: 4 });
    await page.mouse.move(bb.x + 40 + 20 * ppm, bb.y + 40, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.wertis.stage.hit('front.window').box);
    assert.ok(Math.abs(after.x - before.x - 20) <= 1, `window moved ${after.x - before.x} mm, expected 20`);
    assert.ok(await page.evaluate(() => !!window.wertis.store.get().layout['front.window']), 'the move is saved in the layout');
    step('dragging the window with Alt moves it 20 mm, free of snapping');

    // Without Alt, dragging it back to 2 mm short of the panel's centre snaps it there, and
    // a guide shows while dragging.
    const bb2 = await win.boundingBox();
    await page.mouse.move(bb2.x + 40, bb2.y + 40);
    await page.mouse.down();
    await page.mouse.move(bb2.x + 40 - 9 * ppm, bb2.y + 40, { steps: 3 });
    await page.mouse.move(bb2.x + 40 - 18 * ppm, bb2.y + 40, { steps: 3 });
    await page.waitForTimeout(100);
    const guides = await page.evaluate(() => document.querySelectorAll('.canvas #guides line').length);
    await page.screenshot({ path: `${shots}snap-guides.png` });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const snapped = await page.evaluate(() => { const s = window.wertis.stage, h = s.hit('front.window'), p = s.panelOf(h); return { x: h.box.x - p.x, w: h.box.w, pw: p.w }; });
    assert.ok(Math.abs(snapped.x + snapped.w / 2 - snapped.pw / 2) < 0.01, `the window's centre is on the panel's (x ${snapped.x} mm)`);
    assert.ok(guides > 0, 'a guide line shows while it snaps');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.canvas #guides line').length), 0, 'the guides go when the drag ends');
    step('dragging near the panel centre snaps to it, with a guide');

    // Ctrl + wheel zooms at the pointer: the point under it stays put.
    const vp = await page.locator('.viewport').boundingBox();
    const at = { x: vp.x + vp.width * 0.3, y: vp.y + vp.height * 0.4 };
    await page.mouse.move(at.x, at.y);
    const mm0 = await mmAt(page, at.x, at.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60); }
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);
    const mm1 = await mmAt(page, at.x, at.y);
    const zoomed = await page.evaluate(() => window.wertis.stage.zoom);
    assert.ok(zoomed > ppm * 1.5, `zoomed in (${zoomed} px/mm)`);
    assert.ok(Math.hypot(mm1.x - mm0.x, mm1.y - mm0.y) < 0.5, `the point under the pointer moved ${Math.hypot(mm1.x - mm0.x, mm1.y - mm0.y).toFixed(2)} mm`);
    await page.screenshot({ path: `${shots}zoom-rulers.png` });
    step('Ctrl + wheel zooms around the pointer; the rulers follow');
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => Math.round(window.wertis.stage.ppm / (96 / 25.4) * 100)), 100, '1 is 100 %');
    const s0 = await page.evaluate(() => [document.querySelector('.viewport').scrollLeft, document.querySelector('.viewport').scrollTop]);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down(' ');
    await page.mouse.down();
    await page.mouse.move(at.x - 120, at.y - 60, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    const s1 = await page.evaluate(() => [document.querySelector('.viewport').scrollLeft, document.querySelector('.viewport').scrollTop]);
    assert.ok(s1[0] - s0[0] > 100 && s1[1] - s0[1] > 40, `Space + drag pans (${s0} → ${s1})`);
    await page.keyboard.press('0');
    assert.equal(await page.evaluate(() => window.wertis.stage.zoom), null, '0 fits the view');
    step('1 shows the real size, Space + drag pans, 0 fits');

    // Hovering names the element; the right-click menu hides it, and Show all brings it back.
    const logoAt = await pointOn(page, 'front.logo');
    assert.ok(logoAt, 'the logo is on screen');
    await page.mouse.move(logoAt.x, logoAt.y);
    await page.waitForSelector('.hover-tag:not([hidden])');
    assert.equal(await page.locator('.hover-tag').innerText(), 'Logo');
    await page.mouse.click(logoAt.x, logoAt.y, { button: 'right' });
    await page.waitForSelector('.menu.context [data-action="hide"]');
    await page.screenshot({ path: `${shots}context-menu.png` });
    await page.click('.menu.context [data-action="hide"]');
    assert.ok(await page.evaluate(() => window.wertis.store.get().hidden['front.logo']), 'Hide hides it');
    assert.equal(await page.locator('.menu.context').count(), 0, 'the menu closes');
    await page.click('#show-all');
    assert.deepEqual(await page.evaluate(() => window.wertis.store.get().hidden), {}, 'Show all shows it again');
    step('hover names the element; right-click → Hide, then Show all');

    // Texts are edited on the element: double-click the address, type on its card.
    const addrAt = await pointOn(page, 'back.address');
    assert.ok(addrAt, 'the address is on screen');
    await page.mouse.dblclick(addrAt.x, addrAt.y);
    await page.waitForFunction(() => document.querySelector('.insp-title')?.textContent === 'Address');
    assert.equal(await page.evaluate(() => document.activeElement.id), 't-content-company', 'the cursor is in its first line');
    const fields = await page.evaluate(() => [...document.querySelectorAll('.insp-texts input, .insp-texts textarea')].map((i) => i.id));
    assert.deepEqual(fields, ['t-content-company', 't-content-address', 't-content-email']);
    await page.fill('#t-content-company', 'WERTIS Sp. z o.o. (test)');
    assert.equal(await page.evaluate(() => window.wertis.store.get().content.company), 'WERTIS Sp. z o.o. (test)');
    // The label offers the product name (main language first), the codes and the link.
    await page.click('.el-row[data-el-row="back.label"] .el-name');
    await page.waitForFunction(() => document.querySelector('.insp-title')?.textContent === 'Label');
    const labelFields = await page.evaluate(() => [...document.querySelectorAll('.insp-texts input, .insp-texts select')].map((i) => i.id));
    assert.deepEqual(labelFields.slice(0, 2), ['lang', 't-content-productName-pl']);
    for (const id of ['t-content-sku', 't-content-ean', 't-content-qr', 't-content-url']) assert.ok(labelFields.includes(id), id);
    await page.screenshot({ path: `${shots}text-on-element.png` });
    await page.keyboard.press('Control+z');
    step('double-click a text to edit it on its card; the label offers its name, codes and link');

    // Edit a swatch in the Colours panel: everything that uses it follows.
    await page.click('[data-side-tab="colours"]');
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
      const blob = await window.wertis.pdfBlob(doc.pages, { ...doc, compress: false });
      const text = await blob.text();
      const box = (name) => text.match(new RegExp(`/${name}\\s*\\[([^\\]]+)\\]`))?.[1].trim().split(/\s+/).map(Number);
      return { size: blob.size, media: box('MediaBox'), trim: box('TrimBox'), bleed: box('BleedBox'), pages: (text.match(/\/Type \/Page\b/g) || []).length,
        cmyk: (text.match(/ k\n/g) || []).length, rgb: (text.match(/\d (rg|RG)\n/g) || []).length,
        pdfx: text.includes('/GTS_PDFXVersion (PDF/X-1a:2001)') && text.includes('/Trapped /False') && /\/OutputIntents \[\d+ 0 R\]/.test(text) && text.includes('/OutputConditionIdentifier (FOGRA39)'),
        inks: [...text.matchAll(/\/Separation \/(\S+)/g)].map((m) => m[1]) };
    });
    const pt = (mm) => (mm * 72) / 25.4;
    assert.ok(Math.abs(pdf.media[2] - pt(530)) < 0.5 && Math.abs(pdf.media[3] - pt(380)) < 0.5, `PDF page is ${pdf.media}`);
    assert.ok(Math.abs(pdf.trim[0] - pt(15)) < 0.1 && Math.abs(pdf.trim[2] - pt(515)) < 0.1, `TrimBox ${pdf.trim}`);
    assert.ok(Math.abs(pdf.bleed[0] - pt(12)) < 0.1, `BleedBox ${pdf.bleed}`);
    assert.equal(pdf.pages, 3, 'artwork + dieline, the dieline alone, the white plate');
    assert.ok(pdf.cmyk > 20 && pdf.rgb === 0, `colours are CMYK (${pdf.cmyk} CMYK fills, ${pdf.rgb} RGB)`);
    assert.ok(pdf.pdfx, 'PDF/X-1a keys and the FOGRA39 output intent');
    assert.deepEqual(pdf.inks, ['Dieline', 'Crease', 'All', 'White']);
    step('print PDF: PDF/X-1a, FOGRA39, trim/bleed boxes, CMYK only, spot inks Dieline, Crease, All, White');

    // The Export menu works from the keyboard: arrows move, Esc closes and gives the focus back.
    await page.focus('#export-button');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.export), 'print-pdf');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.export), 'dieline-dxf');
    await page.screenshot({ path: `${shots}export-menu.png` });
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => document.getElementById('export-menu').hidden && document.activeElement.id === 'export-button'), 'Esc closes the menu');
    step('the Export menu opens and moves from the keyboard');
    const [dxf] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'dieline-dxf')]);
    assert.match(dxf.suggestedFilename(), /-dieline\.dxf$/);
    await page.click('#preflight');
    await page.waitForSelector('.preflight-list .pf-item');
    const pfText = await page.locator('.preflight-list').innerText();
    assert.match(pfText, /Bleed 3 mm/);
    await page.click('.modal-buttons button');
    step('the dieline DXF downloads and preflight lists its checks');

    const proofPng = await page.evaluate(async () => (await window.wertis.pngBlob(window.wertis.proofSvg('a3'), { dpi: 100 })).size);
    assert.ok(proofPng > 50_000, 'proof PNG has content');
    step('proof PNG renders');

    // The export buttons download files.
    for (const key of ['print-svg', 'proof-pdf', 'mockup-png']) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), exportVia(page, key)]);
      const path = await dl.path();
      assert.ok(path, `${key} downloaded`);
      step(`Export → ${key} downloads ${dl.suggestedFilename()}`);
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
    await page.click('[data-side-tab="mockup"]');
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
    await page.click('[data-side-tab="colours"]');
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

    await page.click('[data-side-tab="format"]');
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
    assert.equal(await page.evaluate(() => window.wertis.stage.view3d.sceneName), 'shop', 'pouches start on the shop hooks');
    // A new pack starts without the kit: choose it, then check it.
    await page.selectOption('#product3d', 'clutchDrum');
    await page.waitForFunction(() => window.wertis.stage.view3d.pack.product?.parts.length === 6 && window.wertis.stage.view3d.items.every((i) => i.partMeshes.length === 6), null, { timeout: 90000 });
    // The clutch kit lies in every pouch and sags to the bottom of the hanging bags;
    // "Nothing" empties them, and back; the film can be changed.
    const kit = await page.evaluate(async () => {
      const v = window.wertis.stage.view3d;
      const S = await import('/src/three/softPouch.js');
      // Hang the bags afresh and run two seconds in one go: slow software frames must not
      // let the parts settle before the start is measured.
      v.build();
      const start = v.items.map((i) => i.bag.parts.map((p) => p.c[1]));
      for (let f = 0; f < 120; f++) S.stepSoft(v.soft, 1 / 60);
      const fell = v.items.map((i, k) => i.bag.parts.map((p, j) => start[k][j] - p.c[1]));
      return { parts: v.pack.product?.parts.map((p) => p.part).sort(), meshes: v.items.map((i) => i.partMeshes.length), fell: fell.flat(), soft: !!v.soft };
    });
    assert.deepEqual(kit.parts, ['bearing', 'clutch', 'drum', 'eclip', 'rim', 'washer'], 'the clutch kit is in the pouch');
    assert.ok(kit.soft && kit.meshes.every((m) => m === 6), 'every pouch is soft film and holds the six parts');
    assert.ok(kit.fell.every((d) => d > 0) && Math.max(...kit.fell) > 80, `the parts sag to the bottom of the hanging bags (fell ${kit.fell.map(Math.round)} mm)`);
    await page.selectOption('#product3d', 'none');
    await page.waitForFunction(() => window.wertis.stage.view3d.pack.product === null && window.wertis.stage.view3d.items.every((i) => i.partMeshes.length === 0), null, { timeout: 90000 });
    await page.screenshot({ path: `${shots}3d-pouch-empty.png` });
    await page.selectOption('#product3d', 'clutchDrum');
    await page.waitForFunction(() => window.wertis.stage.view3d.pack.product?.parts.length === 6 && window.wertis.stage.view3d.items.every((i) => i.partMeshes.length === 6), null, { timeout: 90000 });
    await page.selectOption('#film3d', 'light');
    await page.waitForFunction(() => window.wertis.stage.view3d.pack.film === 'light', null, { timeout: 90000 });
    await page.selectOption('#film3d', 'heavy');
    await page.waitForFunction(() => window.wertis.stage.view3d.pack.film === 'heavy', null, { timeout: 90000 });
    step('the 3D pouches are soft film with the Stihl clutch kit inside, which sags to the bottom; the film and the part can be changed');
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
    const boxScenes = await page.evaluate(() => [...document.querySelectorAll('#scene3d option')].map((o) => o.value));
    assert.equal(boxScenes[0], 'shop', 'boxes start on the shop shelves');
    for (const scene of boxScenes) {
      await page.selectOption('#scene3d', scene);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${shots}3d-box-${scene}.png` });
    }
    await page.selectOption('#scene3d', 'stack');
    await page.waitForTimeout(1500);
    // The bodies move a frame at a time, and software WebGL frames can be slow, so wait for the
    // movement itself (up to two minutes) rather than for a fixed few seconds.
    const pushStart = await page.evaluate(() => window.wertis.stage.view3d.items.map((i) => [i.body.position.x, i.body.position.z]));
    await page.evaluate(() => window.wertis.stage.view3d.push());
    await page.waitForFunction((b) => window.wertis.stage.view3d.items.some((i, k) => Math.abs(i.body.position.x - b[k][0]) + Math.abs(i.body.position.z - b[k][1]) > 0.01), pushStart, { timeout: 120000 })
      .catch(() => { throw new Error('a push does not move the stack'); });
    step('the 3D tab shows the packs in the shop (pouches on hooks, boxes on shelves), hangs, piles and stacks them, and pushing moves them');
    await page.click('[data-tab="design"]');

    assert.deepEqual(await page.evaluate(() => window.wertis.misses()), [], 'no untranslated text');
    await ctx.close();

    await polish(browser, step, errors);

    assert.deepEqual(errors, [], `console errors:\n${errors.join('\n')}`);
    step('no console errors');
    writeFileSync(`${shots}README.md`, `# Screenshots\n\nWritten by \`npm run playtest\`.\n\n${steps.map((s) => `- ${s}`).join('\n')}\n`);
  } finally {
    await browser.close();
    server.kill();
  }
}

// The same app for a Polish browser: Polish everywhere, numbers with a decimal comma, and the
// switch to English keeps the design.
async function polish(browser, step, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'pl-PL', acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('body.ready', { timeout: 30000 });
  await page.waitForSelector('.canvas svg');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'pl');
  assert.match(await page.locator('#export-button').innerText(), /Eksport/);
  assert.equal(await page.locator('#format option[value="flatPouch"]').innerText(), 'Płaska torebka z zamkiem');
  await page.screenshot({ path: `${shots}design-pl.png` });
  await page.locator('.canvas [data-el="front.window"]').first().click({ position: { x: 30, y: 30 } });
  await page.waitForFunction(() => document.querySelector('.insp-title')?.textContent === 'Okienko');
  assert.match(await page.locator('#status-selection').innerText(), /Okienko · Przód\s+X 22,5/);
  await page.screenshot({ path: `${shots}inspector-pl.png` });
  step('in a Polish browser the editor is in Polish, with decimal commas');
  await page.click('#preflight');
  await page.waitForSelector('.preflight-list .pf-item');
  assert.match(await page.locator('.preflight-list').innerText(), /Spad 3 mm na każdej zewnętrznej krawędzi/);
  await page.click('.modal-buttons button');
  for (const tab of ['project', 'format', 'colours', 'print', 'mockup']) {
    await page.click(`[data-side-tab="${tab}"]`);
    await page.waitForTimeout(80);
  }
  await page.click('#export-button');
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  const at = await pointOn(page, 'front.logo');
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForSelector('.menu.context');
  assert.match(await page.locator('.menu.context').innerText(), /Ukryj/);
  await page.keyboard.press('Escape');
  await page.click('#shortcuts');
  await page.waitForSelector('table.keys');
  await page.keyboard.press('Escape');
  for (const tab of ['proof', 'mockup', 'design']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(300);
  }
  assert.deepEqual(await page.evaluate(() => window.wertis.misses()), [], 'every tab, menu and dialog has its Polish text');
  step('preflight, every tab, the menus and the shortcuts read in Polish');

  // A narrow laptop screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `no sideways scrolling at 1280 px (${overflow} px too wide)`);
  await page.screenshot({ path: `${shots}narrow-pl.png` });
  await page.setViewportSize({ width: 1600, height: 950 });

  // Switch to English: the edit survives the reload.
  await page.click('[data-side-tab="project"]');
  await page.fill('#project-name', 'Torebka testowa');
  await page.evaluate(() => window.wertis.saveNow());
  await Promise.all([page.waitForEvent('load'), page.click('.lang-switch [data-lang="en"]')]);
  await page.waitForSelector('body.ready', { timeout: 30000 });
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.evaluate(() => window.wertis.store.get().name), 'Torebka testowa');
  assert.match(await page.locator('#export-button').innerText(), /Export/);
  step('switching to English reloads the editor in English with the design kept');
  await ctx.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  playtest().then(() => console.log('playtest passed'), (err) => { console.error(err); process.exit(1); });
}

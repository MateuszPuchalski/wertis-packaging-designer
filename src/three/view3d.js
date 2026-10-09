// The 3D tab: the packs as real objects, textured with the design's own faces.
// - Boxes are rigid board (cannon-es): stacked neatly (push them over) or dropped in a pile.
// - Pouches are soft film (softPouch.js): two printed films sealed round the edge with a
//   little air inside and the product's parts loose in it. They hang on a peg hook by
//   their hang holes, lie in stacks or fall in a pile, and the parts sag to the bottom.
// - In the shop (the first scene): a store gondola like a parts shop's walls, under its
//   ceiling LEDs: pouches on a grid of scan hooks, boxes on the shelves.
// Drag a pack to pull it about; drag the background to orbit. three.js and cannon-es load
// only when the tab opens.
import { placements, scenesFor, shopLayout, SHOP, UNIT } from './scenes.js';
import { logoSvg } from '../brand/logo.js';
import { productOf, PARTS, MATERIALS } from './products.js';
import { createBag, createSoftWorld, stepSoft, shove, renderLayout, writeRender, quatFromEuler, followPart } from './softPouch.js';
import { mulberry32 } from '../util/rng.js';

let libs = null;
async function loadLibs() {
  libs ??= Promise.all([
    import('three'), import('../../vendor/three/OrbitControls.js'), import('../../vendor/three/RoomEnvironment.js'),
    import('../../vendor/three/RoundedBoxGeometry.js'), import('../../vendor/cannon-es/cannon-es.js'),
  ]).then(([THREE, controls, room, rounded, CANNON]) => ({ THREE, OrbitControls: controls.OrbitControls, RoomEnvironment: room.RoomEnvironment, RoundedBoxGeometry: rounded.RoundedBoxGeometry, CANNON }));
  return libs;
}

// Texture sizes (px on the long side): the printed faces sharp, the film and lining softer.
const TEXTURE_PX = { front: 1536, back: 1536, filmFront: 768, filmBack: 768, insideFront: 768, insideBack: 768 };
const MM = 1 / UNIT; // world units per mm

// An SVG face → a canvas texture, at most `max` px on its long side.
async function svgTexture(THREE, svg, max, anisotropy) {
  const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  const w = Number(m[1]), h = Number(m[2]);
  const s = max / Math.max(w, h);
  const W = Math.max(2, Math.round(w * s)), H = Math.max(2, Math.round(h * s));
  const url = URL.createObjectURL(new Blob([svg.replace(m[0], `width="${W}" height="${H}"`)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A shop pegboard: light board with holes on a 25 mm grid.
function pegboardTexture(THREE, w, h, { base = '#efebe4', hole = '#5b5750' } = {}) {
  const px = 8; // px per mm... of the 25 mm cell
  const cell = 25;
  const c = document.createElement('canvas');
  c.width = Math.round((w / cell) * px * 4);
  c.height = Math.round((h / cell) * px * 4);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  const step = px * 4;
  for (let y = step / 2; y < c.height; y += step) {
    for (let x = step / 2; x < c.width; x += step) {
      g.fillStyle = hole;
      g.beginPath();
      g.arc(x, y, step * 0.11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(x + step * 0.02, y + step * 0.03, step * 0.11, 0, Math.PI);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A shop floor: pale grey 600 mm tiles with thin joints, repeated.
function tileTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d6d1';
  g.fillRect(0, 0, 256, 256);
  // A faint speckle, as terrazzo-like tiles have.
  const rnd = mulberry32(7);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,55,50,0.10)';
    g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
  }
  g.fillStyle = '#b9b6b0';
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The gondola's header: a lit orange sign with the WERTIS logo, drawn once it has loaded.
function signTexture(THREE, w, h) {
  const px = 1024, ph = Math.round((px * h) / w);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = ph;
  const g = c.getContext('2d');
  g.fillStyle = '#f8992c';
  g.fillRect(0, 0, px, ph);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const logo = logoSvg({ box: { x: px * 0.3, y: ph * 0.14, w: px * 0.4, h: ph * 0.72 }, layout: 'full', colors: { gear: '#303030', arc: '#ffffff', word: '#303030', line: '#ffffff' } });
  const img = new Image();
  img.onload = () => { g.drawImage(img, 0, 0); t.needsUpdate = true; };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${ph}" viewBox="0 0 ${px} ${ph}">${logo.svg}</svg>`)}`;
  return t;
}

// The label on a scan hook's tip: white, a barcode and a code line, as shops print them.
function hookLabelTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f8992c';
  g.fillRect(0, 0, 256, 20);
  g.fillStyle = '#222222';
  const rnd = mulberry32(3);
  for (let x = 24; x < 150;) { const w = 1 + Math.floor(rnd() * 3); g.fillRect(x, 36, w, 56); x += w + 1 + Math.floor(rnd() * 3); }
  g.fillRect(170, 40, 66, 10);
  g.fillRect(170, 60, 50, 8);
  g.fillRect(170, 78, 60, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// What the glossy film reflects in the shop: a pale room with rows of ceiling LED strips.
function shopEnvironment(THREE) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 40), new THREE.MeshBasicMaterial({ color: 0x8f8c87, side: THREE.BackSide }));
  room.position.y = 4.5;
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x6f6c68 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  scene.add(floor);
  const led = new THREE.MeshBasicMaterial();
  led.color.setScalar(9);
  for (let i = -3; i <= 3; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(34, 0.08, 0.5), led);
    strip.position.set(0, 8.9, i * 5);
    scene.add(strip);
  }
  // The bright shop front far behind the shopper.
  const glow = new THREE.MeshBasicMaterial();
  glow.color.setScalar(2.2);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), glow);
  front.position.set(0, 4, 19.9);
  front.rotation.y = Math.PI;
  scene.add(front);
  return scene;
}

export class View3D {
  constructor(root) {
    this.root = root;
    this.scene = null;
    this.sceneName = null;
    this.count = 8;
    this.seed = 1;
    this.items = [];
    this.bags = [];
    this.soft = null;
    this.running = false;
    this.ready = this.init();
  }

  async init() {
    const { THREE, OrbitControls, RoomEnvironment, RoundedBoxGeometry, CANNON } = await loadLibs();
    this.THREE = THREE;
    this.CANNON = CANNON;
    this.RoundedBoxGeometry = RoundedBoxGeometry;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap; // soft shadows
    // Neutral tone mapping keeps the brand colours as printed (ACES shifts the orange).
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    this.renderer = r;
    this.root.append(r.domElement);
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = new THREE.Scene();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a857c, 0.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.2);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 7;
    sun.shadow.blurSamples = 16;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.6); // a cool fill from the left
    fill.position.set(-6, 4, 3);
    this.scene.add(fill);
    // A rim from behind and above: it draws the edges of the packs off the backdrop.
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(-3, 7, -8);
    this.scene.add(rim, sun.target);
    this.sun = sun;
    this.fill = fill;
    this.rim = rim;
    const shopPmrem = new THREE.PMREMGenerator(r);
    this.shopEnv = shopPmrem.fromScene(shopEnvironment(THREE), 0.03).texture;
    shopPmrem.dispose();

    // A photo studio sweep: the floor curves up into the wall behind, so there is no horizon.
    const sweep = new THREE.PlaneGeometry(60, 40, 1, 48);
    const pos = sweep.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = pos.getY(i) + 20; // 0 … 40 along the sheet
      const R = 6, flat = 18;
      let y = 0, z = flat - v;
      if (v > flat) { const a = Math.min((v - flat) / R, Math.PI / 2); y = R - R * Math.cos(a); z = -R * Math.sin(a); if (v - flat > (R * Math.PI) / 2) { y = R + (v - flat - (R * Math.PI) / 2); z = -R; } }
      pos.setXYZ(i, pos.getX(i), y, z - 4);
    }
    sweep.computeVertexNormals();
    this.floor = new THREE.Mesh(sweep, new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.92 }));
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    const tiles = tileTexture(THREE);
    tiles.repeat.set(20, 20);
    tiles.anisotropy = r.capabilities.getMaxAnisotropy();
    this.shopFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.38, metalness: 0 }));
    this.shopFloor.rotation.x = -Math.PI / 2;
    this.shopFloor.receiveShadow = true;
    this.shopFloor.visible = false;
    this.scene.add(this.shopFloor);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -98.2, 0) }); // 1 unit = 1 dm
    world.allowSleep = true;
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction = 0.55;
    world.defaultContactMaterial.restitution = 0.12;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    this.world = world;

    this.raycaster = new THREE.Raycaster();
    r.domElement.addEventListener('pointerdown', (e) => this.grab(e));
    r.domElement.addEventListener('pointermove', (e) => this.dragTo(e));
    window.addEventListener('pointerup', () => this.release());

    new ResizeObserver(() => this.resize()).observe(this.root);
    this.resize();
    this.last = performance.now();
  }

  resize() {
    if (!this.renderer) return;
    const w = this.root.clientWidth || 800, h = this.root.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // New artwork (or a new format): rebuild the textures, then the scene.
  async setPack(pack, background) {
    await this.ready;
    const { THREE } = this;
    const token = (this.token = {});
    const an = this.renderer.capabilities.getMaxAnisotropy();
    const max = (k) => (pack.kind === 'box' ? 1024 : TEXTURE_PX[k] ?? 1536);
    const entries = await Promise.all(Object.entries(pack.faces).map(async ([k, svg]) => [k, await svgTexture(THREE, svg, max(k), an)]));
    if (token !== this.token) { for (const [, t] of entries) t.dispose(); return; }
    for (const t of Object.values(this.textures ?? {})) t.dispose();
    this.textures = Object.fromEntries(entries);
    this.pack = pack;
    for (const list of Object.values(this.productParts ?? {})) for (const m of list) { m.geometry.dispose(); m.material.dispose(); }
    this.product = pack.kind === 'box' ? null : productOf(pack.product?.id);
    this.productParts = this.product ? this.productMeshes(this.product) : null;
    this.studioBg = new THREE.Color(background ?? '#e8e4dc');
    if (!this.sceneName || !scenesFor(pack.kind).includes(this.sceneName)) this.sceneName = scenesFor(pack.kind)[0];
    this.build();
  }

  // Printed film: a glossy laminate. Board: a satin varnish.
  materials() {
    const { THREE } = this;
    const t = this.textures;
    if (this.pack.kind === 'box') {
      const face = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.45 });
      return { outer: [face(t.right), face(t.left), face(t.top), face(t.bottom), face(t.front), face(t.back)] };
    }
    const face = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.12, alphaTest: 0.5 });
    const lining = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.55, side: THREE.BackSide, alphaTest: 0.5 });
    const film = (map) => new THREE.MeshPhysicalMaterial({ map, transparent: true, depthWrite: false, alphaTest: 0.004, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    return { outer: [face(t.front), face(t.back)], lining: [lining(t.insideFront), lining(t.insideBack)], film: [film(t.filmFront), film(t.filmBack)] };
  }

  // Each part's meshes in world units, built once per pack: { part: [{ geometry, material }] }.
  productMeshes(product) {
    const { THREE } = this;
    const materials = {};
    const material = (key) => {
      const m = MATERIALS[key];
      return (materials[key] ??= new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness, roughness: m.roughness, envMapIntensity: m.env * 2.2 }));
    };
    const out = {};
    for (const id of new Set(product.layout.map((it) => it.part))) {
      out[id] = Object.entries(PARTS[id].build(THREE)).map(([key, geometry]) => {
        geometry.scale(MM, MM, MM);
        return { geometry, material: material(key) };
      });
    }
    return out;
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      if (it.body) this.world.removeBody(it.body);
      if (it.geometry) it.geometry.dispose();
      for (const m of it.partMeshes ?? []) this.scene.remove(m);
    }
    this.items = [];
    this.soft = null;
    for (const m of this.props ?? []) {
      this.scene.remove(m);
      m.traverse?.((o) => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); } });
    }
    this.props = [];
    for (const b of this.fixed ?? []) this.world.removeBody(b);
    this.fixed = [];
  }

  // The shop gondola: a perforated steel back panel between two uprights, a base deck with a
  // kick plate, a lit header sign; then either the scan hooks (pouches) or the shelves with
  // their price strips (boxes, which also get the shelves as solid bodies).
  shopFittings(L) {
    // The aisle goes on either side: two more sections with their hooks or shelves empty.
    const side = L.kind === 'box' ? { ...L, width: 6 } : { ...L, width: 7.2, hooks: L.hooks.filter((hk) => hk.x <= 0.01).map((hk) => ({ ...hk, x: 0 })) };
    if (side.hooks) side.hooks = [-1.6, 1.6].flatMap((x) => [...new Set(L.hooks.map((hk) => hk.y))].map((y) => ({ x, y, len: SHOP.hookLength })));
    const gap = 0.5; // one upright between two sections
    for (const sgn of [-1, 1]) this.shopSection(side, sgn * (L.width / 2 + gap + side.width / 2), false);
    return this.shopSection(L, 0, true);
  }

  shopSection(L, ox, main) {
    const { THREE, CANNON } = this;
    const add = (...ms) => { for (const m of ms) { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.own = true; } }); this.props.push(m); this.scene.add(m); } };
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4d52, metalness: 0.6, roughness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, metalness: 0.1, roughness: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.15 });
    const W = L.width, H = SHOP.height;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W, H - SHOP.deckY, 0.06),
      new THREE.MeshStandardMaterial({ map: pegboardTexture(THREE, W * UNIT, (H - SHOP.deckY) * UNIT, { base: '#d6d9db', hole: '#2c2e31' }), metalness: 0.35, roughness: 0.55 }));
    panel.position.set(0, SHOP.deckY + (H - SHOP.deckY) / 2, -0.03);
    const postW = 0.5;
    const post = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(postW, H + SHOP.header, 0.5), steel); m.position.set(x, (H + SHOP.header) / 2, -0.25); return m; };
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, SHOP.deckDepth), white);
    deck.position.set(0, SHOP.deckY - 0.06, SHOP.deckDepth / 2);
    const kick = new THREE.Mesh(new THREE.BoxGeometry(W, SHOP.deckY - 0.12, 0.06), steel);
    kick.position.set(0, (SHOP.deckY - 0.12) / 2, SHOP.deckDepth - 0.4);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(W + postW * 2, SHOP.header, 0.2),
      [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: signTexture(THREE, W + postW * 2, SHOP.header), emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.5 }), steel]);
    sign.material[4].emissiveMap = sign.material[4].map;
    sign.position.set(0, H + SHOP.header / 2, 0.15);
    const group = new THREE.Group();
    group.position.x = ox;
    group.add(panel, post(-W / 2 - postW / 2), post(W / 2 + postW / 2), deck, kick, sign);
    add(group);
    const at = (m) => { m.position.x += ox; return m; };
    if (main) {
      // The back wall of the shop behind the gondola.
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshStandardMaterial({ color: 0xeeece8, roughness: 0.9 }));
      wall.position.set(0, 20, -0.6);
      wall.receiveShadow = true;
      wall.userData.own = true;
      this.props.push(wall);
      this.scene.add(wall);
    }
    // The panel and the deck stop what is pulled about, as the walls of the shelf do (only
    // the section with the packs: the neighbours are scenery).
    const solid = (hx, hy, hz, x, y, z) => { if (!main) return; const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) }); b.position.set(x, y, z); this.world.addBody(b); this.fixed.push(b); };
    solid(W / 2, H / 2, 0.05, 0, H / 2, -0.05);
    solid(W / 2, 0.06, SHOP.deckDepth / 2, 0, SHOP.deckY - 0.06, SHOP.deckDepth / 2);
    if (L.kind === 'box') {
      const strip = new THREE.MeshStandardMaterial({ map: hookLabelTexture(THREE), roughness: 0.6 });
      for (const y of L.shelves) {
        if (y > SHOP.deckY + 0.01) {
          const board = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, SHOP.shelfDepth), white);
          board.position.set(0, y - 0.1, SHOP.shelfDepth / 2);
          add(at(board));
          solid(W / 2, 0.1, SHOP.shelfDepth / 2, 0, y - 0.1, SHOP.shelfDepth / 2);
        }
        // The price strip along the shelf's front edge, with a label every so often.
        const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.38, 0.04), white);
        edge.position.set(0, y - 0.19, (y > SHOP.deckY + 0.01 ? SHOP.shelfDepth : SHOP.deckDepth) + 0.02);
        add(at(edge));
        for (let x = -W / 2 + 1; x < W / 2 - 0.5; x += 2.4) {
          const label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), strip);
          label.position.set(x + ox, y - 0.19, edge.position.z + 0.022);
          add(label);
        }
      }
      return { boardZ: 0 };
    }
    // Scan hooks: a wire from the panel with a label holder on the tip.
    const label = new THREE.MeshStandardMaterial({ map: hookLabelTexture(THREE), roughness: 0.55 });
    for (const hk of L.hooks) {
      const g = new THREE.Group();
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, hk.len, 16), chrome);
      wire.rotation.x = Math.PI / 2;
      wire.position.set(0, 0, hk.len / 2);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, hk.len * 0.92, 12), chrome);
      top.rotation.x = Math.PI / 2;
      top.position.set(0, 0.32, hk.len * 0.46);
      const bend = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.34, 12), chrome);
      bend.position.set(0, 0.16, hk.len);
      const holder = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.03), new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.2, roughness: 0.3, transparent: true, opacity: 0.6 }));
      holder.position.set(0, 0.42, hk.len * 0.92);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), label);
      card.position.set(0, 0.42, hk.len * 0.92 + 0.017);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.05), steel);
      foot.position.set(0, 0.16, 0.025);
      g.add(wire, top, bend, holder, card, foot);
      g.position.set(hk.x + ox, hk.y, 0);
      add(g);
    }
    return { boardZ: 0.03 };
  }

  // The shop fittings for the peg scene: a pegboard and a wire hook with an upturned tip.
  pegFittings(spots) {
    const { THREE } = this;
    const rodY = spots[0].hang.world[1];
    const zs = spots.map((s) => s.hang.world[2]);
    const z0 = Math.max(...zs) + 0.35, z1 = Math.min(...zs) - 0.3;
    const metal = new THREE.MeshStandardMaterial({ color: 0xd4d7db, metalness: 1, roughness: 0.18 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, z0 - z1, 20), metal);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, rodY, (z0 + z1) / 2);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 16), metal);
    tip.position.set(0, rodY + 0.08 - 0.01, z0);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), metal);
    knuckle.position.set(0, rodY, z0);
    // Where the wire goes into the board: a short bend up into the next hole.
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.25, 16), metal);
    plate.position.set(0, rodY + 0.125, z1 + 0.03);
    const w = Math.max(5, this.pack.size.x * MM * 3), h = rodY + 1.6;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), new THREE.MeshStandardMaterial({ map: pegboardTexture(THREE, w * UNIT, h * UNIT), roughness: 0.85 }));
    board.position.set(0, h / 2, z1 - 0.025);
    for (const m of [rod, tip, knuckle, plate]) m.castShadow = true;
    board.receiveShadow = true;
    this.props.push(rod, tip, knuckle, plate, board);
    this.scene.add(rod, tip, knuckle, plate, board);
    return { boardZ: z1 };
  }

  // Studio light for the stack, the pile and the peg; the shop's own for the shop.
  lighting() {
    const { THREE } = this;
    const shop = this.sceneName === 'shop';
    this.floor.visible = !shop;
    this.shopFloor.visible = shop;
    if (shop) {
      this.scene.background = new THREE.Color('#e6e3de');
      this.scene.fog = new THREE.Fog(this.scene.background, 45, 110);
      this.scene.environment = this.shopEnv;
      this.scene.environmentIntensity = 0.85;
      this.hemi.color.set(0xffffff);
      this.hemi.groundColor.set(0x9b968e);
      this.hemi.intensity = 0.55;
      // The ceiling LEDs over the aisle: from above and in front, so the pegboard shows each
      // pack's soft shadow under it.
      this.sun.color.set(0xfffaf2);
      this.sun.intensity = 2.4;
      this.sun.position.set(4, 34, 26);
      this.sun.target.position.set(0, 8, 0);
      Object.assign(this.sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 10, far: 70 });
      this.sun.shadow.radius = 9;
      // The light from the aisle and the shop front falls on the packs' faces.
      this.fill.intensity = 0.95;
      this.fill.position.set(-8, 10, 30);
      this.rim.intensity = 0;
    } else {
      const bg = this.studioBg ?? new THREE.Color('#e8e4dc');
      this.scene.background = bg.clone().lerp(new THREE.Color('#ffffff'), 0.2);
      this.floor.material.color = bg;
      this.scene.fog = new THREE.Fog(this.scene.background, 18, 40);
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.5;
      this.hemi.color.set(0xffffff);
      this.hemi.groundColor.set(0x8a857c);
      this.hemi.intensity = 0.65;
      this.sun.color.set(0xfff6ea);
      this.sun.intensity = 2.2;
      this.sun.position.set(4, 9, 6);
      this.sun.target.position.set(0, 0, 0);
      Object.assign(this.sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
      this.sun.shadow.radius = 7;
      this.fill.intensity = 0.6;
      this.fill.position.set(-6, 4, 3);
      this.rim.intensity = 0.9;
    }
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
  }

  build() {
    if (!this.pack) return;
    this.clear();
    this.lighting();
    const spots = placements(this.sceneName, this.pack, this.count, this.seed);
    if (this.pack.kind === 'box') this.buildBoxes(spots);
    else this.buildPouches(spots);
    this.frame();
    this.sync();
  }

  buildBoxes(spots) {
    const { THREE, CANNON } = this;
    const { x, y, z } = this.pack.size;
    const geo = new this.RoundedBoxGeometry(x * MM, y * MM, z * MM, 3, 0.8 * MM);
    const mats = this.materials();
    const half = new CANNON.Vec3((x * MM) / 2, (y * MM) / 2, (z * MM) / 2);
    if (this.sceneName === 'shop') this.shopFittings(shopLayout(this.pack, this.count));
    for (const s of spots) {
      const mesh = new THREE.Mesh(geo, mats.outer);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const body = new CANNON.Body({ mass: 0.3, shape: new CANNON.Box(half), sleepSpeedLimit: 0.05, angularDamping: 0.05, linearDamping: 0.02 });
      body.position.set(...s.p);
      body.quaternion.setFromEuler(...s.r);
      this.world.addBody(body);
      this.scene.add(mesh);
      this.items.push({ mesh, body });
    }
  }

  buildPouches(spots) {
    const { THREE } = this;
    const pack = this.pack;
    const W = pack.size.x, H = pack.size.y;
    const mats = this.materials();
    let board = null;
    const hung = this.sceneName === 'peg' || this.sceneName === 'shop';
    if (this.sceneName === 'peg') board = this.pegFittings(spots).boardZ * UNIT;
    if (this.sceneName === 'shop') board = this.shopFittings(shopLayout(pack, this.count)).boardZ * UNIT;
    const bags = spots.map((s) => createBag({
      W, H, dims: pack.dims, hole: pack.hole, pinned: hung, film: pack.film,
      pose: { p: s.p.map((v) => v * UNIT), q: quatFromEuler(...s.r) },
      parts: this.product ? pack.product.parts : [],
    }));
    this.soft = createSoftWorld(bags, { floor: 0, board });
    const layout = renderLayout(bags[0]);
    const uv = new THREE.BufferAttribute(layout.uv, 2);
    const index = new THREE.BufferAttribute(layout.index, 1);
    for (const bag of bags) {
      const geometry = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(6 * layout.per), 3);
      const nor = new THREE.BufferAttribute(new Float32Array(6 * layout.per), 3);
      pos.setUsage(THREE.DynamicDrawUsage);
      nor.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', pos);
      geometry.setAttribute('normal', nor);
      geometry.setAttribute('uv', uv);
      geometry.setIndex(index);
      for (const [k, [start, count]] of layout.groups.entries()) geometry.addGroup(start, count, k);
      const mesh = new THREE.Mesh(geometry, mats.outer);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const lining = new THREE.Mesh(geometry, mats.lining);
      lining.receiveShadow = true;
      lining.frustumCulled = false;
      const film = new THREE.Mesh(geometry, mats.film);
      film.frustumCulled = false;
      mesh.add(lining, film);
      mesh.userData.bag = bag;
      this.scene.add(mesh);
      const partMeshes = bag.parts.map((part) => {
        const g = new THREE.Group();
        for (const { geometry: pg, material } of this.productParts[part.id]) {
          const m = new THREE.Mesh(pg, material);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
        }
        this.scene.add(g);
        return g;
      });
      this.items.push({ mesh, bag, geometry, layout, partMeshes });
      this.drawBag(this.items.at(-1));
    }
  }

  drawBag(it) {
    const g = it.geometry;
    writeRender(it.bag, it.layout, g.attributes.position.array, g.attributes.normal.array, MM);
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    it.easing = 12; // frames to finish easing the parts in once the bag stops
    this.drawParts(it);
  }

  drawParts(it) {
    it.shown ??= [];
    it.bag.parts.forEach((part, i) => {
      const m = it.partMeshes[i];
      const s = (it.shown[i] = followPart(it.shown[i], part));
      m.position.set(s.c[0] * MM, s.c[1] * MM, s.c[2] * MM);
      m.quaternion.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    });
  }

  // Points the camera at the whole scene; in the shop, from the aisle at eye height.
  frame() {
    const { THREE } = this;
    if (this.sceneName === 'shop') {
      const L = shopLayout(this.pack, this.count);
      // Pouches: the whole gondola, sign to the lowest pack. Boxes: close on the shelves in use.
      const ys = L.kind === 'box' ? L.filled : L.hooks.map((hk) => hk.y);
      const top = L.kind === 'box' ? Math.max(...ys) + this.pack.size.y * MM + 1.4 : SHOP.height + SHOP.header + 0.3;
      const low = Math.min(...ys) - (L.kind === 'box' ? 0.8 : this.pack.size.y * MM + 0.8);
      const c = new THREE.Vector3(0, (top + low) / 2, L.kind === 'box' ? 2 : 1.2);
      const half = Math.max((top - low) / 2, (L.width / 2 + 0.8) / this.camera.aspect);
      const dist = half / Math.tan((this.camera.fov * Math.PI) / 360) * 1.1 + 2;
      this.camera.position.set(c.x + dist * 0.25, c.y + dist * (L.kind === 'box' ? 0.18 : 0.06), c.z + dist);
      this.controls.target.copy(c);
      this.controls.update();
      return;
    }
    const b = new THREE.Box3();
    for (const it of this.items) {
      if (it.body) b.expandByPoint(new THREE.Vector3(it.body.position.x, it.body.position.y, it.body.position.z));
      else { const bx = it.bag.box; b.expandByPoint(new THREE.Vector3(bx[0] * MM, bx[1] * MM, bx[2] * MM)); b.expandByPoint(new THREE.Vector3(bx[3] * MM, bx[4] * MM, bx[5] * MM)); }
    }
    if (this.soft) for (const it of this.items) { const p = it.bag.p; b.expandByPoint(new THREE.Vector3(p[0] * MM, p[1] * MM, p[2] * MM)); }
    const size = Math.max(this.pack.size.x, this.pack.size.y, this.pack.size.z) * MM;
    b.expandByScalar(size * (this.soft ? 0.35 : 1));
    if (this.sceneName === 'pile') b.max.y = Math.min(b.max.y, size * 2.5);
    const c = b.getCenter(new THREE.Vector3());
    c.y = Math.max(c.y * (this.soft ? 0.85 : 0.6), size * 0.4);
    const r = b.getSize(new THREE.Vector3()).length() * 0.72;
    this.camera.position.set(c.x + r * 0.6, c.y + r * 0.32, c.z + r * 1.05);
    this.controls.target.copy(c);
    this.controls.update();
  }

  sync() {
    for (const it of this.items) {
      if (!it.body) continue;
      it.mesh.position.copy(it.body.position);
      it.mesh.quaternion.copy(it.body.quaternion);
    }
  }

  setScene(name) { this.sceneName = name; this.build(); }
  setCount(n) { this.count = n; this.build(); }
  again() { this.seed += 1; this.build(); }

  // A shove: the stack gets pushed from the front, hanging packs swing, a pile jumps.
  push() {
    const rng = mulberry32(this.seed * 7919 + (this.pushes = (this.pushes ?? 0) + 1));
    if (this.soft) {
      const peg = this.sceneName === 'peg' || this.sceneName === 'shop', stack = this.sceneName === 'stack';
      const kick = new Map(this.soft.bags.map((b) => [b, [(rng() - 0.5) * 400, peg ? 0 : stack ? 150 : 700, peg ? -500 : (rng() - 0.5) * 300]]));
      shove(this.soft, (x, y, z, bag) => {
        const [vx, vy, vz] = kick.get(bag);
        return stack ? [vx + 600, vy, vz - y * 1.5] : [vx, vy, vz * (peg ? Math.min(1, Math.max(0, (bag.box[4] - y) / 300)) : 1)];
      });
      return;
    }
    const { CANNON } = this;
    for (const it of this.items) {
      it.body.wakeUp();
      const p = it.body.position;
      const imp = this.sceneName === 'stack' || this.sceneName === 'shop' ? new CANNON.Vec3(0.3 + rng() * 0.2, 0.05, -0.35 - p.y * 0.4) : new CANNON.Vec3((rng() - 0.5) * 0.6, 0.8, (rng() - 0.5) * 0.6);
      it.body.applyImpulse(imp, new CANNON.Vec3(p.x, p.y + 0.05, p.z));
    }
  }

  // --- pulling a pack about with the mouse ----------------------------------------------

  pointer(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new this.THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  grab(e) {
    if (!this.items.length || e.button !== 0) return;
    const { THREE, CANNON } = this;
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.items.map((it) => it.mesh), false)[0];
    if (!hit) return;
    const it = this.items.find((x) => x.mesh === hit.object);
    const n = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point);
    if (it.bag) {
      // The film node nearest to where the pointer touched.
      const p = it.bag.p;
      let best = 0, bd = Infinity;
      for (let k = 0; k < it.bag.n; k++) {
        const d = (p[3 * k] * MM - hit.point.x) ** 2 + (p[3 * k + 1] * MM - hit.point.y) ** 2 + (p[3 * k + 2] * MM - hit.point.z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      this.soft.drag = { bag: it.bag, k: best, to: [hit.point.x * UNIT, hit.point.y * UNIT, hit.point.z * UNIT] };
      it.bag.awake = true;
    } else {
      const body = it.body;
      this.mouseBody ??= new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      this.mouseBody.position.set(hit.point.x, hit.point.y, hit.point.z);
      if (!this.world.bodies.includes(this.mouseBody)) this.world.addBody(this.mouseBody);
      const local = body.pointToLocalFrame(new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z));
      this.mouseJoint = new CANNON.PointToPointConstraint(body, local, this.mouseBody, new CANNON.Vec3(0, 0, 0), 20);
      this.world.addConstraint(this.mouseJoint);
      body.wakeUp();
    }
    this.controls.enabled = false;
    this.dragging = true;
  }

  dragTo(e) {
    if (!this.dragging) return;
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const at = this.raycaster.ray.intersectPlane(this.dragPlane, new this.THREE.Vector3());
    if (!at) return;
    at.y = Math.max(at.y, 0.02);
    if (this.soft?.drag) this.soft.drag.to = [at.x * UNIT, at.y * UNIT, at.z * UNIT];
    else if (this.mouseBody) this.mouseBody.position.set(at.x, at.y, at.z);
  }

  release() {
    if (!this.dragging) return;
    this.dragging = false;
    this.controls.enabled = true;
    if (this.soft) this.soft.drag = null;
    if (this.mouseJoint) { this.world.removeConstraint(this.mouseJoint); this.mouseJoint = null; }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.ready;
    if (!this.running) return;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      if (this.soft) {
        const moved = new Set(stepSoft(this.soft, dt));
        for (const it of this.items) {
          if (moved.has(it.bag)) this.drawBag(it);
          else if (it.easing > 0) { it.easing--; this.drawParts(it); }
        }
      } else {
        this.world.step(1 / 120, dt, 8);
        this.sync();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  async snapshot() {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }
}

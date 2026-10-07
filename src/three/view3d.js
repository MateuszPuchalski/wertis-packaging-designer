// The 3D tab: the packs as real objects, textured with the design's own faces, under
// cannon-es physics: stacked neatly (push them over), dropped into a pile, or hanging on a
// peg hook through their hang holes. A pouch can hold a part (products.js): the film swells
// over it, the window shows it through the film's sheen, and the pouch is lined with the
// white of the underprint. three.js and cannon-es load only when the tab opens.
import { placements, scenesFor, UNIT } from './scenes.js';
import { productOf, bulge, PARTS, MATERIALS } from './products.js';

let libs = null;
async function loadLibs() {
  libs ??= Promise.all([import('three'), import('../../vendor/three/OrbitControls.js'), import('../../vendor/three/RoomEnvironment.js'), import('../../vendor/cannon-es/cannon-es.js')])
    .then(([THREE, controls, room, CANNON]) => ({ THREE, OrbitControls: controls.OrbitControls, RoomEnvironment: room.RoomEnvironment, CANNON }));
  return libs;
}

const INSIDE = '#f4f3f1'; // the pouch's lining: the white underprint seen from inside
// Texture sizes (px on the long side): the printed faces sharp, the film and lining softer.
const TEXTURE_PX = { front: 1536, back: 1536, filmFront: 768, filmBack: 768, insideFront: 768, insideBack: 768 };

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

export class View3D {
  constructor(root) {
    this.root = root;
    this.scene = null;
    this.sceneName = null;
    this.count = 8;
    this.seed = 1;
    this.items = [];
    this.running = false;
    this.ready = this.init();
  }

  async init() {
    const { THREE, OrbitControls, RoomEnvironment, CANNON } = await loadLibs();
    this.THREE = THREE;
    this.CANNON = CANNON;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.renderer = r;
    this.root.append(r.domElement);
    // Reflections for the metal parts and the film (the printed faces keep the plain lights).
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a857c, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.95 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -98.2, 0) }); // 1 unit = 1 dm
    world.allowSleep = true;
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction = 0.55;
    world.defaultContactMaterial.restitution = 0.12;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    this.world = world;

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
    const bg = new THREE.Color(background ?? '#e8e4dc');
    this.scene.background = bg.clone().lerp(new THREE.Color('#ffffff'), 0.25);
    this.floor.material.color = bg;
    if (!this.sceneName || !scenesFor(pack.kind).includes(this.sceneName)) this.sceneName = scenesFor(pack.kind)[0];
    this.build();
  }

  // BoxGeometry's material order: +x, -x, +y, -y, +z (front), -z (back). A pouch has three
  // shells: the printed outside (windows open), the lining inside it (seen only through the
  // windows, so it draws its back faces) and the film's sheen over the windows.
  materials() {
    const { THREE } = this;
    const t = this.textures;
    const box = this.pack.kind === 'box';
    const face = (map) => new THREE.MeshStandardMaterial({ map, roughness: box ? 0.72 : 0.32, metalness: 0, alphaTest: box ? 0 : 0.5 });
    if (box) return { outer: [face(t.right), face(t.left), face(t.top), face(t.bottom), face(t.front), face(t.back)] };
    const edge = new THREE.MeshStandardMaterial({ color: this.pack.edge, roughness: 0.4 });
    const lining = (map) => new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : INSIDE, roughness: 0.6, side: THREE.BackSide, alphaTest: map ? 0.5 : 0 });
    const liningEdge = lining(null);
    const film = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, alphaTest: 0.004, roughness: 0.05, metalness: 0, envMap: this.envMap, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const none = new THREE.MeshBasicMaterial({ visible: false });
    return {
      outer: [edge, edge, edge, edge, face(t.front), face(t.back)],
      lining: [liningEdge, liningEdge, liningEdge, liningEdge, lining(t.insideFront), lining(t.insideBack)],
      film: [none, none, none, none, film(t.filmFront), film(t.filmBack)],
    };
  }

  // A pouch is not a brick: thin at the seals, full in the middle (a doypack swells towards
  // its bottom), and where it holds a part the film is pulled over it on both sides.
  geometry() {
    const { THREE } = this;
    const { x, y, z } = this.pack.size;
    if (this.pack.kind === 'box') return new THREE.BoxGeometry(x / UNIT, y / UNIT, z / UNIT);
    const placed = this.product ? this.pack.product.parts : null;
    const g = new THREE.BoxGeometry(x / UNIT, y / UNIT, z / UNIT, placed ? Math.round(x / 6) : 12, placed ? Math.round(y / 6) : 16, 1);
    const pos = g.attributes.position;
    const hx = x / UNIT / 2, hy = y / UNIT / 2;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const t = (py + hy) / (2 * hy); // 0 bottom … 1 top
      const u = (px + hx) / (2 * hx); // 0 left … 1 right
      let f = this.pack.kind === 'standup' ? 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - t)) : 0.25 + 0.75 * Math.sin(Math.PI * clamp(t * 1.02));
      f *= 0.55 + 0.45 * Math.sin(Math.PI * clamp(u));
      let zz = Math.abs(pz) * f;
      // Face millimetres from the top left, as the parts are placed.
      if (placed) zz = Math.max(zz, bulge(placed, pz > 0 ? 'front' : 'back', (px + hx) * UNIT, (hy - py) * UNIT) / UNIT);
      pos.setZ(i, Math.sign(pz) * zz);
    }
    g.computeVertexNormals();
    return g;
  }

  // Each part's meshes in world units, built once per pack: { part: [{ geometry, material }] }.
  productMeshes(product) {
    const { THREE } = this;
    const materials = {};
    const material = (key) => {
      const m = MATERIALS[key];
      return (materials[key] ??= new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness, roughness: m.roughness, envMap: this.envMap, envMapIntensity: m.env }));
    };
    const out = {};
    for (const id of new Set(product.layout.map((it) => it.part))) {
      out[id] = Object.entries(PARTS[id].build(THREE)).map(([key, geometry]) => {
        geometry.scale(1 / UNIT, 1 / UNIT, 1 / UNIT);
        return { geometry, material: material(key) };
      });
    }
    return out;
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      this.world.removeBody(it.body);
      if (it.constraint) this.world.removeConstraint(it.constraint);
    }
    this.items = [];
    for (const m of this.props ?? []) this.scene.remove(m);
    this.props = [];
    for (const b of this.anchors ?? []) this.world.removeBody(b);
    this.anchors = [];
  }

  build() {
    if (!this.pack) return;
    const { THREE, CANNON } = this;
    this.clear();
    const pack = this.pack;
    const geo = this.geometry();
    const mats = this.materials();
    // The lining sits just inside the printed shell; the sheen lies on it.
    const liningGeo = mats.lining ? geo.clone().scale(0.996, 0.996, 0.985) : null;
    const half = new CANNON.Vec3(pack.size.x / UNIT / 2, pack.size.y / UNIT / 2, (pack.kind === 'box' ? pack.size.z : pack.size.z * 0.7) / UNIT / 2);
    // The parts, each where it lies in the pouch (world units, relative to the pouch's
    // middle), with a box round it for the physics.
    const placed = (this.product ? pack.product.parts : []).map((p) => {
      const spec = PARTS[p.part];
      return { ...p, spec, at: new CANNON.Vec3((p.x - pack.size.x / 2) / UNIT, (pack.size.y / 2 - p.y) / UNIT, 0), half: new CANNON.Vec3((spec.radius * 0.85) / UNIT, (spec.radius * 0.85) / UNIT, Math.max(spec.depth / 2, 1) / UNIT) };
    });
    const mass = (pack.kind === 'box' ? 0.3 : 0.06) + placed.reduce((a, p) => a + p.spec.mass, 0);
    const spots = placements(this.sceneName, pack, this.count, this.seed);
    let anchor = null;
    if (this.sceneName === 'peg') {
      anchor = new CANNON.Body({ mass: 0 });
      this.world.addBody(anchor);
      this.anchors.push(anchor);
      const rodY = spots[0].hang.world[1];
      const zs = spots.map((s) => s.hang.world[2]);
      const z0 = Math.max(...zs) + 0.2, z1 = Math.min(...zs) - 0.25;
      const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25 });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, z0 - z1, 20), metal);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(0, rodY, (z0 + z1) / 2);
      rod.castShadow = true;
      const board = new THREE.Mesh(new THREE.BoxGeometry(Math.max(4, pack.size.x / UNIT * 2.5), rodY + 1.4, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.9 }));
      board.position.set(0, (rodY + 1.4) / 2, z1 - 0.03);
      board.receiveShadow = true;
      this.props.push(rod, board);
      this.scene.add(rod, board);
    }
    for (const s of spots) {
      const mesh = new THREE.Mesh(geo, mats.outer);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mats.lining) {
        const lining = new THREE.Mesh(liningGeo, mats.lining);
        lining.receiveShadow = true;
        const film = new THREE.Mesh(geo, mats.film);
        mesh.add(lining, film);
      }
      for (const p of placed) {
        for (const { geometry, material } of this.productParts[p.part]) {
          const m = new THREE.Mesh(geometry, material);
          m.position.set(p.at.x, p.at.y, 0);
          m.rotation.z = (-p.turn * Math.PI) / 180;
          m.castShadow = true;
          m.receiveShadow = true;
          mesh.add(m);
        }
      }
      const body = new CANNON.Body({ mass, shape: new CANNON.Box(half), sleepSpeedLimit: 0.05, angularDamping: this.sceneName === 'peg' ? 0.25 : 0.05, linearDamping: 0.02 });
      for (const p of placed) body.addShape(new CANNON.Box(p.half), p.at);
      body.position.set(...s.p);
      body.quaternion.setFromEuler(...s.r);
      this.world.addBody(body);
      let constraint = null;
      if (s.hang && anchor) {
        constraint = new CANNON.PointToPointConstraint(body, new CANNON.Vec3(...s.hang.local), anchor, new CANNON.Vec3(...s.hang.world));
        this.world.addConstraint(constraint);
      }
      this.scene.add(mesh);
      this.items.push({ mesh, body, constraint });
    }
    this.frame();
    this.sync();
  }

  // Points the camera at the whole scene.
  frame() {
    const { THREE } = this;
    const b = new THREE.Box3();
    for (const it of this.items) b.expandByPoint(new THREE.Vector3(it.body.position.x, it.body.position.y, it.body.position.z));
    const size = Math.max(this.pack.size.x, this.pack.size.y, this.pack.size.z) / UNIT;
    b.expandByScalar(size);
    if (this.sceneName === 'pile') b.max.y = Math.min(b.max.y, size * 3);
    const c = b.getCenter(new THREE.Vector3());
    c.y = Math.max(c.y * 0.6, size * 0.4);
    const r = b.getSize(new THREE.Vector3()).length() * 0.62;
    this.camera.position.set(c.x + r * 0.55, c.y + r * 0.45, c.z + r * 1.05);
    this.controls.target.copy(c);
    this.controls.update();
  }

  sync() {
    for (const it of this.items) {
      it.mesh.position.copy(it.body.position);
      it.mesh.quaternion.copy(it.body.quaternion);
    }
  }

  setScene(name) { this.sceneName = name; this.build(); }
  setCount(n) { this.count = n; this.build(); }
  again() { this.seed += 1; this.build(); }

  // A shove: the stack gets pushed from the front, hanging packs swing, a pile jumps.
  push() {
    const { CANNON } = this;
    for (const it of this.items) {
      it.body.wakeUp();
      const p = it.body.position;
      const imp = this.sceneName === 'peg'
        ? new CANNON.Vec3((Math.random() - 0.5) * 0.25, 0, -0.18)
        : this.sceneName === 'stack' ? new CANNON.Vec3(0.3 + Math.random() * 0.2, 0.05, -0.35 - p.y * 0.4) : new CANNON.Vec3((Math.random() - 0.5) * 0.6, 0.8, (Math.random() - 0.5) * 0.6);
      it.body.applyImpulse(imp, new CANNON.Vec3(p.x, p.y + 0.05, p.z));
    }
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
      this.world.step(1 / 120, dt, 8);
      this.sync();
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

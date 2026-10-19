// De eindeloze cross-country baan: segmenten met bochten, hindernissen, munten en landschap.

import * as THREE from './lib/three.module.min.js';
import { LANE_WIDTH, TRACK_HALF, CORNER, JUMP_TIME } from './config.js';
import { GeoBuilder, G, makeRng, shade } from './geo.js';
import * as TX from './textures.js';

export const DIRS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
];
export const yawOf = (d) => -d * Math.PI / 2;
export const turnDir = (d, t) => (t === 'R' ? (d + 1) % 4 : (d + 3) % 4);

const W = TRACK_HALF * 2 + 0.4; // breedte van hindernissen over het hele pad
const FENCE = TRACK_HALF + 0.55;
const AHEAD = 280; // zoveel meter baan staat altijd klaar

// Gedeelde basisvormen voor het landschap.
const B = {
  box: G.box,
  trunk: G.cyl(0.6, 1, 1, 6),
  crown: G.ico(1, 0),
  crown1: G.ico(1, 1),
  cone: G.cone(1, 1, 7),
  log: new THREE.CylinderGeometry(1, 1, 1, 10),
  log6: new THREE.CylinderGeometry(1, 1, 1, 6),
  rock: G.dodeca(1),
  post: G.cyl(0.8, 1, 1, 5),
  sphere: G.sphere(1, 8, 6),
};

const COL = {
  bark: 0x6b4a2b,
  barkDark: 0x523820,
  woodCut: 0xd9b88a,
  woodPale: 0xcfae80,
  leaf: [0x4f8a3a, 0x5d9a40, 0x467d34, 0x6aa648, 0x3f7230],
  pine: [0x2f5e34, 0x376b3b, 0x2a5530],
  rock: [0x8b8a83, 0x9a978f, 0x7c7a73],
  straw: 0xe3c26b,
  hedge: 0x4f7a34,
  hedgeTop: 0x6b8f45,
  earth: 0x5a4130,
  white: 0xf4f4f0,
  red: 0xd6362e,
};

// ---------- materialen & textures ----------
function makeMaterials() {
  const water = TX.waterTexture();
  const fall = TX.waterfallTexture();
  return {
    world: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    track: new THREE.MeshLambertMaterial({ map: TX.trackTexture() }),
    grass: new THREE.MeshLambertMaterial({ map: TX.grassTexture() }),
    water: new THREE.MeshLambertMaterial({ map: water, transparent: true, opacity: 0.9, emissive: 0x0b3550, emissiveIntensity: 0.35 }),
    fall: new THREE.MeshBasicMaterial({ map: fall, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    signs: {
      L: new THREE.MeshLambertMaterial({ map: TX.signTexture('L') }),
      R: new THREE.MeshLambertMaterial({ map: TX.signTexture('R') }),
      T: new THREE.MeshLambertMaterial({ map: TX.signTexture('T') }),
      start: new THREE.MeshLambertMaterial({ map: TX.signTexture('START', '#2f6b3c', '#ffffff'), side: THREE.DoubleSide }),
    },
    waterTex: water,
    fallTex: fall,
  };
}

function waterGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 7, uv.getY(i) * h / 7);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---------- hindernis-geometrie (gecachet) ----------
const geoCache = new Map();
function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

function addFlags(b, x, h = 1.8) {
  // Cross-country: rode vlag rechts, witte vlag links.
  for (const s of [1, -1]) {
    b.add(B.post, COL.white, [s * x, h / 2, 0], [0, 0, 0], [0.045, h, 0.045]);
    b.add(B.box, s > 0 ? COL.red : COL.white, [s * (x + 0.27), h - 0.22, 0], [0, 0, 0], [0.5, 0.34, 0.025]);
    b.add(B.sphere, 0xf2c94c, [s * x, h + 0.03, 0], [0, 0, 0], [0.06, 0.06, 0.06]);
  }
}

function addLogX(b, y, r, len, x = 0, z = 0, color = COL.bark) {
  b.add(B.log, color, [x, y, z], [0, 0, Math.PI / 2], [r, len, r]);
  b.add(B.log, COL.woodCut, [x + len / 2, y, z], [0, 0, Math.PI / 2], [r * 0.92, 0.03, r * 0.92]);
  b.add(B.log, COL.woodCut, [x - len / 2, y, z], [0, 0, Math.PI / 2], [r * 0.92, 0.03, r * 0.92]);
}

const OBST = {
  log: () => {
    const b = new GeoBuilder();
    addLogX(b, 0.46, 0.46, W);
    b.add(B.log, COL.barkDark, [W * 0.18, 0.46, 0], [0, 0, Math.PI / 2], [0.47, 0.12, 0.47]);
    b.add(B.log, COL.barkDark, [-W * 0.27, 0.46, 0], [0, 0, Math.PI / 2], [0.47, 0.1, 0.47]);
    b.add(B.box, COL.barkDark, [W / 2 - 0.2, 0.15, 0], [0, 0, 0], [0.2, 0.3, 1.0]);
    b.add(B.box, COL.barkDark, [-W / 2 + 0.2, 0.15, 0], [0, 0, 0], [0.2, 0.3, 1.0]);
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  hedge: () => {
    const b = new GeoBuilder();
    b.add(B.box, 0x6e4f2e, [0, 0.2, 0], [0, 0, 0], [W, 0.4, 1.1]);
    b.add(B.box, COL.hedge, [0, 0.78, 0], [0, 0, 0], [W - 0.1, 0.8, 0.85]);
    const r = makeRng(9);
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.45) {
      b.add(B.crown, r() < 0.5 ? COL.hedgeTop : COL.hedge, [x, 1.18, (r() - 0.5) * 0.3], [r(), r(), 0], [0.3, 0.22, 0.32]);
    }
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  rails: () => {
    const b = new GeoBuilder();
    for (const x of [-W / 2, -W / 6, W / 6, W / 2]) b.add(B.box, 0xa88458, [x, 0.72, 0], [0, 0, 0], [0.16, 1.44, 0.16]);
    for (const y of [0.55, 1.15]) b.add(B.log6, COL.woodPale, [0, y, 0], [0, 0, Math.PI / 2], [0.09, W + 0.15, 0.09]);
    b.add(B.log6, COL.woodPale, [0, 0.85, -0.05], [0, 0, Math.PI / 2], [0.08, W + 0.15, 0.08]);
    addFlags(b, W / 2 + 0.35);
    return b.build();
  },
  table: () => {
    const b = new GeoBuilder();
    b.add(B.box, 0x8a6a45, [0, 0.55, 0], [0, 0, 0], [W, 1.1, 1.7]);
    for (let z = -0.7; z <= 0.71; z += 0.35) b.add(B.box, 0xb08a5c, [0, 1.11, z], [0, 0, 0], [W + 0.04, 0.04, 0.3]);
    b.add(B.box, 0x6e5234, [0, 0.55, 0.86], [0, 0, 0], [W + 0.02, 1.0, 0.04]);
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  branch: () => {
    const b = new GeoBuilder();
    const x = W / 2 + 0.25;
    for (const s of [1, -1]) {
      b.add(B.trunk, COL.bark, [s * x, 1.5, 0], [0, 0, 0], [0.32, 3.0, 0.32]);
      b.add(B.crown, COL.leaf[1], [s * x, 3.3, 0], [0.3, 0.2, 0], [1.1, 0.9, 1.1]);
    }
    addLogX(b, 2.55, 0.28, W + 0.9, 0, 0, COL.barkDark);
    const r = makeRng(4);
    for (let i = 0; i < 9; i++) {
      const px = -W / 2 + (i + 0.5) * (W / 9);
      b.add(B.crown, COL.leaf[i % COL.leaf.length], [px, 2.95 + r() * 0.2, (r() - 0.5) * 0.4], [r(), r(), r()], [0.55, 0.42, 0.5]);
    }
    for (let i = 0; i < 6; i++) {
      const px = -W / 2 + 0.5 + r() * (W - 1);
      b.add(B.cone, COL.leaf[2], [px, 2.12, 0.05], [Math.PI, 0, 0], [0.12, 0.4, 0.12]);
    }
    return b.build();
  },
  ditchBanks: () => {
    const b = new GeoBuilder();
    b.add(B.box, COL.earth, [0, 0.05, 1.3], [0, 0, 0], [W + 1, 0.12, 0.3]);
    b.add(B.box, COL.earth, [0, 0.05, -1.3], [0, 0, 0], [W + 1, 0.12, 0.3]);
    addLogX(b, 0.18, 0.18, W + 0.6, 0, 1.35);
    const r = makeRng(12);
    for (let i = 0; i < 10; i++) {
      const s = i < 5 ? 1 : -1;
      b.add(B.cone, 0x5f8f3a, [s * (W / 2 + 0.2 + r() * 0.5), 0.35, (r() - 0.5) * 2], [0, 0, (r() - 0.5) * 0.3], [0.06, 0.7 + r() * 0.4, 0.06]);
    }
    addFlags(b, W / 2 + 0.6);
    return b.build();
  },
  trakehner: () => {
    const b = new GeoBuilder();
    b.add(B.box, COL.earth, [0, 0.05, 1.3], [0, 0, 0], [W + 1, 0.12, 0.3]);
    b.add(B.box, COL.earth, [0, 0.05, -1.3], [0, 0, 0], [W + 1, 0.12, 0.3]);
    for (const s of [1, -1]) b.add(B.box, 0x7a5a38, [s * (W / 2 + 0.1), 0.7, 0], [0, 0, 0], [0.22, 1.4, 0.22]);
    addLogX(b, 0.95, 0.3, W + 0.4);
    addFlags(b, W / 2 + 0.5);
    return b.build();
  },
  haybale: () => {
    const b = new GeoBuilder();
    const len = LANE_WIDTH - 0.35;
    b.add(B.log, COL.straw, [0, 0.62, 0], [0, 0, Math.PI / 2], [0.62, len, 0.62]);
    b.add(B.log, 0xc9a24a, [len / 2 + 0.01, 0.62, 0], [0, 0, Math.PI / 2], [0.5, 0.02, 0.5]);
    b.add(B.log, 0xc9a24a, [-len / 2 - 0.01, 0.62, 0], [0, 0, Math.PI / 2], [0.5, 0.02, 0.5]);
    b.add(B.log, 0xb38a3a, [0, 0.62, 0], [0, 0, Math.PI / 2], [0.63, 0.06, 0.63]);
    return b.build();
  },
  laneLog: () => {
    const b = new GeoBuilder();
    addLogX(b, 0.42, 0.42, LANE_WIDTH - 0.3);
    return b.build();
  },
  tree: () => {
    const b = new GeoBuilder();
    b.add(B.trunk, COL.bark, [0, 1.6, 0], [0, 0, 0], [0.42, 3.2, 0.42]);
    b.add(B.crown, COL.leaf[0], [0, 4.0, 0], [0.2, 0.4, 0], [1.7, 1.5, 1.7]);
    b.add(B.crown, COL.leaf[3], [0.5, 4.8, 0.2], [0.5, 0.1, 0.3], [1.1, 1.0, 1.1]);
    b.add(B.rock, COL.barkDark, [0.3, 0.12, 0.3], [0, 0, 0], [0.35, 0.18, 0.3]);
    b.add(B.rock, COL.barkDark, [-0.35, 0.12, -0.1], [0, 0, 0], [0.3, 0.16, 0.35]);
    return b.build();
  },
  rock: () => {
    const b = new GeoBuilder();
    b.add(B.rock, COL.rock[0], [0, 0.7, 0], [0.3, 0.5, 0.1], [0.95, 0.85, 0.85]);
    b.add(B.rock, COL.rock[1], [0.45, 0.35, 0.3], [0.1, 0.2, 0.5], [0.45, 0.4, 0.45]);
    b.add(B.cone, 0x5f8f3a, [-0.6, 0.2, 0.3], [0, 0, 0], [0.08, 0.4, 0.08]);
    return b.build();
  },
  waterRim: (len) => {
    const b = new GeoBuilder();
    const r = makeRng(Math.floor(len * 10));
    for (const z of [len / 2, -len / 2]) {
      for (let x = -W / 2 - 1.2; x <= W / 2 + 1.2; x += 0.7) {
        b.add(B.rock, COL.rock[Math.floor(r() * 3)], [x, 0.06, z + (r() - 0.5) * 0.3], [r(), r(), r()], [0.36, 0.14, 0.3]);
      }
    }
    for (let z = -len / 2; z <= len / 2; z += 1.2) {
      for (const s of [1, -1]) {
        b.add(B.rock, COL.rock[Math.floor(r() * 3)], [s * (W / 2 + 1.5), 0.08, z], [r(), r(), r()], [0.4, 0.16, 0.45]);
        if (r() < 0.5) b.add(B.cone, 0x5f8f3a, [s * (W / 2 + 1.9 + r()), 0.4, z], [0, 0, 0], [0.06, 0.8, 0.06]);
      }
    }
    return b.build();
  },
};

// ---------- power-ups ----------
function powerupGeo(type) {
  return cached('pu-' + type, () => {
    const b = new GeoBuilder();
    if (type === 'magnet') {
      const tor = new THREE.TorusGeometry(0.34, 0.11, 6, 14, Math.PI);
      b.add(tor, 0xe0423a, [0, 0.05, 0], [0, 0, Math.PI]);
      b.add(B.box, 0xe8e8e8, [0.34, 0.12, 0], [0, 0, 0], [0.24, 0.16, 0.24]);
      b.add(B.box, 0xe8e8e8, [-0.34, 0.12, 0], [0, 0, 0], [0.24, 0.16, 0.24]);
    } else if (type === 'double') {
      b.add(B.log, 0xf5c431, [0, -0.12, 0], [Math.PI / 2, 0, 0], [0.38, 0.1, 0.38]);
      b.add(B.log, 0xffd84d, [0.1, 0.12, 0.05], [Math.PI / 2, 0, 0], [0.38, 0.1, 0.38]);
      b.add(B.box, 0xa86e0c, [0.1, 0.12, 0.11], [0, 0, 0], [0.2, 0.06, 0.02]);
      b.add(B.box, 0xa86e0c, [0.1, 0.2, 0.11], [0, 0, 0.5], [0.06, 0.2, 0.02]);
    } else if (type === 'shield') {
      b.add(B.box, 0x3a8fe0, [0, 0, 0], [0, 0, 0], [0.6, 0.7, 0.18]);
      b.add(B.box, 0xdcecff, [0, 0, 0.1], [0, 0, 0], [0.4, 0.5, 0.02]);
      b.add(B.box, 0x3a8fe0, [0, 0.04, 0.115], [0, 0, 0], [0.08, 0.32, 0.02]);
      b.add(B.box, 0x3a8fe0, [0, 0.08, 0.115], [0, 0, 0], [0.26, 0.08, 0.02]);
    } else {
      const pts = [[0.05, 0.45], [-0.18, 0.02], [0.02, 0.02], [-0.08, -0.45], [0.2, 0.06], [0.0, 0.06]];
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        b.limb([x0, y0, 0], [x1, y1, 0], 0.07, 0xa66bff);
      }
      b.add(B.sphere, 0xd9c2ff, [0, 0, 0], [0, 0, 0], [0.12, 0.12, 0.12]);
    }
    return b.build();
  });
}

const puMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, emissive: 0x222222 });

// ---------- segment ----------
class Segment {
  constructor(world, { start, dir, length, turn, parent, first = false, index = 0 }) {
    this.world = world;
    this.start = start.clone();
    this.dir = dir;
    this.length = length;
    this.turn = turn; // 'L', 'R' of 'T'
    this.parent = parent;
    this.first = first;
    this.index = index;
    this.fwd = DIRS[dir].clone();
    this.right = DIRS[(dir + 1) % 4].clone();
    this.end = this.start.clone().addScaledVector(this.fwd, length);
    this.next = null; // Segment of { L, R } bij een T-splitsing
    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
    this.waters = [];
    this.reserved = [];
    this.group = new THREE.Group();
    this.group.position.copy(this.start);
    this.group.rotation.y = yawOf(dir);
    this.disposed = false;
  }

  allows(t) {
    return this.turn === 'T' ? (t === 'L' || t === 'R') : t === this.turn;
  }

  toWorld(s, lat, y = 0, out = new THREE.Vector3()) {
    return out.copy(this.start).addScaledVector(this.fwd, s).addScaledVector(this.right, lat).setY(y);
  }

  nextDirs() {
    return this.turn === 'T' ? [turnDir(this.dir, 'L'), turnDir(this.dir, 'R')] : [turnDir(this.dir, this.turn)];
  }

  isFree(s0, s1) {
    return !this.reserved.some(([a, b]) => s1 > a && s0 < b);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh && o.userData.ownGeo) o.geometry.dispose();
    });
    for (const c of this.coins) c.dead = true;
    for (const p of this.powerups) {
      p.dead = true;
      this.world.scene.remove(p.mesh);
    }
  }
}

// ---------- wereld ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.mat = makeMaterials();
    this.coins = [];
    this.powerups = [];
    this.difficulty = null;
    this.speedRef = 15;
    this.progress = 0; // afgelegde afstand, voor moeilijkheidsopbouw

    // gras dat met de speler meeschuift
    const grassGeo = new THREE.PlaneGeometry(700, 700);
    const uv = grassGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 700 / 7, uv.getY(i) * 700 / 7);
    grassGeo.rotateX(-Math.PI / 2);
    this.grass = new THREE.Mesh(grassGeo, this.mat.grass);
    this.grass.position.y = -0.01;
    scene.add(this.grass);

    this.buildSky();

    // munten (instanced)
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 20);
    coinGeo.rotateX(Math.PI / 2);
    const face = TX.coinFaceTexture();
    const side = new THREE.MeshPhongMaterial({ color: 0xe0a51e, emissive: 0x5a3a00, shininess: 80, specular: 0xffeeaa });
    const faceMat = new THREE.MeshPhongMaterial({ map: face, emissive: 0x3a2600, shininess: 80, specular: 0xffeeaa });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, [side, faceMat, faceMat], 900);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);

    this.haloTex = TX.dotTexture();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(420, 24, 14);
    const cols = [];
    const top = new THREE.Color(0x3d86d4);
    const mid = new THREE.Color(0x8cc3ec);
    const hor = new THREE.Color(0xd9ecf2);
    const p = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 420;
      if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
      else c.copy(hor).lerp(mid, Math.max(0, y / 0.25));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Group();
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10;
    this.sky.add(dome);
    // zon
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.dotTexture(), color: 0xfff4d0, fog: false, depthWrite: false, transparent: true }));
    sun.position.set(160, 200, -260);
    sun.scale.setScalar(90);
    this.sky.add(sun);
    // wolken
    const cb = new GeoBuilder();
    const r = makeRng(21);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 250 + r() * 100;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 70 + r() * 70;
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const s = 14 + r() * 14;
        cb.add(B.crown1, 0xffffff, [x + (k - n / 2) * 14 + r() * 6, y + r() * 5, z + r() * 8], [0, r(), 0], [s, s * 0.55, s * 0.8]);
      }
    }
    const clouds = new THREE.Mesh(cb.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92, depthWrite: false }));
    clouds.renderOrder = -9;
    this.sky.add(clouds);
    this.clouds = clouds;
    this.scene.add(this.sky);
  }

  reset(difficulty, seed = Math.floor(Math.random() * 1e9)) {
    for (const s of this.allSegments()) s.dispose();
    this.rng = makeRng(seed);
    this.difficulty = difficulty;
    this.progress = 0;
    this.coins = [];
    for (const p of this.powerups) this.scene.remove(p.mesh);
    this.powerups = [];
    this.segCount = 0;
    this.first = this.createSegment({
      start: new THREE.Vector3(0, 0, 0), dir: 0, length: 150, turn: this.rng() < 0.5 ? 'L' : 'R', parent: null, first: true,
    });
    this.ensureAhead(this.first, 0);
    return this.first;
  }

  allSegments() {
    const out = [];
    const walk = (s) => {
      if (!s || out.includes(s)) return;
      out.push(s);
      if (s.next && s.next.L) {
        walk(s.next.L);
        walk(s.next.R);
      } else walk(s.next);
    };
    walk(this.first);
    return out;
  }

  createSegment(opts) {
    const seg = new Segment(this, { ...opts, index: this.segCount++ });
    this.populate(seg);
    this.scene.add(seg.group);
    return seg;
  }

  // last = bocht waarmee je dit segment in kwam, before = de bocht daarvoor.
  chooseTurn(last, before, allowT = true) {
    const r = this.rng;
    if (allowT && r() < 0.22) return 'T';
    let t = r() < 0.5 ? 'L' : 'R';
    // nooit drie keer dezelfde kant op (anders loopt de baan in een rondje terug)
    if (last === t && before === t) t = t === 'L' ? 'R' : 'L';
    return t;
  }

  makeChild(parent, t) {
    const dir = turnDir(parent.dir, t);
    const len = parent.turn === 'T' ? 110 + this.rng() * 50 : 95 + this.rng() * 75;
    const seg = this.createSegment({
      start: parent.end, dir, length: len, turn: this.chooseTurn(t, parent.enteredBy, parent.turn !== 'T'), parent,
    });
    seg.enteredBy = t;
    return seg;
  }

  // Zorg dat er genoeg baan vóór de speler ligt.
  ensureAhead(seg, dist) {
    let ahead = seg.length - dist;
    let cur = seg;
    while (ahead < AHEAD) {
      if (cur.turn === 'T') {
        if (!cur.next) cur.next = { L: this.makeChild(cur, 'L'), R: this.makeChild(cur, 'R') };
        return;
      }
      if (!cur.next) cur.next = this.makeChild(cur, cur.turn);
      cur = cur.next;
      ahead += cur.length;
    }
  }

  // Speler neemt de bocht: geef het volgende segment terug.
  takeTurn(seg, t) {
    if (!seg.next) this.ensureAhead(seg, seg.length);
    let nxt = seg.next;
    if (seg.turn === 'T') {
      const other = t === 'L' ? nxt.R : nxt.L;
      const walk = (s) => {
        if (!s) return;
        s.dispose();
        if (s.next && s.next.L) {
          walk(s.next.L);
          walk(s.next.R);
        } else walk(s.next);
      };
      walk(other);
      nxt = t === 'L' ? nxt.L : nxt.R;
      seg.next = nxt;
    }
    return nxt;
  }

  // Ruim segmenten achter de speler op.
  releaseBefore(seg) {
    while (this.first && this.first !== seg) {
      const old = this.first;
      this.first = old.next && !old.next.L ? old.next : seg;
      old.dispose();
    }
    seg.parent = null;
    this.coins = this.coins.filter((c) => !c.dead);
    this.powerups = this.powerups.filter((p) => !p.dead);
  }

  // ---------- inhoud van een segment ----------
  populate(seg) {
    const r = this.rng;
    const L = seg.length;
    const parentIsT = seg.parent && seg.parent.turn === 'T';
    const g0 = parentIsT ? CORNER / 2 : -CORNER / 2;
    const g1 = seg.turn === 'T' ? L + CORNER / 2 : L - CORNER / 2;

    // pad
    const trackGeo = new THREE.PlaneGeometry(TRACK_HALF * 2, g1 - g0);
    const uv = trackGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (g1 - g0) / 9);
    trackGeo.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(trackGeo, this.mat.track);
    track.position.set(0, 0.012, -(g0 + g1) / 2);
    track.userData.ownGeo = true;
    seg.group.add(track);

    const sb = new GeoBuilder(); // alles wat stilstaat in één mesh
    const excl = []; // gebieden zonder bomen (lokaal: {s, lat, r})

    // bocht-afsluiting en richtingbord
    const endS = L + CORNER / 2;
    sb.add(B.box, COL.hedge, [0, 0.8, -(endS + 0.6)], [0, 0, 0], [CORNER + 3.2, 1.6, 1.0]);
    this.hedgeBumps(sb, -(CORNER / 2 + 1.6), CORNER / 2 + 1.6, -(endS + 0.6), true);
    if (seg.turn !== 'T') {
      const closed = seg.turn === 'L' ? 1 : -1;
      const x = closed * (CORNER / 2 + 0.6);
      sb.add(B.box, COL.hedge, [x, 0.8, -L], [0, 0, 0], [1.0, 1.6, CORNER + 1.2]);
      this.hedgeBumps(sb, -L - CORNER / 2, -L + CORNER / 2, x, false);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), this.mat.signs[seg.turn]);
    sign.position.set(0, 2.15, -(endS + 0.05));
    sign.userData.ownGeo = true;
    seg.group.add(sign);
    sb.add(B.post, 0x6e4f2e, [-0.7, 1.1, -(endS + 0.12)], [0, 0, 0], [0.07, 2.2, 0.07]);
    sb.add(B.post, 0x6e4f2e, [0.7, 1.1, -(endS + 0.12)], [0, 0, 0], [0.07, 2.2, 0.07]);

    // startpoort
    if (seg.first) {
      for (const s of [1, -1]) {
        sb.add(B.post, 0xffffff, [s * (TRACK_HALF + 0.4), 3.4, -12], [0, 0, 0], [0.14, 6.8, 0.14]);
        sb.add(B.sphere, 0xd6362e, [s * (TRACK_HALF + 0.4), 6.85, -12], [0, 0, 0], [0.22, 0.22, 0.22]);
      }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), this.mat.signs.start);
      banner.position.set(0, 6.0, -12);
      banner.userData.ownGeo = true;
      seg.group.add(banner);
    }

    // speciale plekken: rivier met brug of waterval
    const features = [];
    if (!seg.first && L >= 105 && r() < 0.33) {
      const s0 = 40 + r() * (L - 85);
      features.push({ type: 'bridge', s: s0, side: r() < 0.5 ? 1 : -1 });
      seg.reserved.push([s0 - 9, s0 + 9]);
    } else if (r() < 0.45) {
      features.push({ type: 'fall', s: 25 + r() * (L - 50), side: r() < 0.5 ? 1 : -1 });
    }
    for (const f of features) {
      if (f.type === 'bridge') this.buildBridge(seg, sb, f, excl);
      else this.buildFall(seg, sb, f, excl);
    }

    // touwafzetting langs het pad
    const fenceFrom = parentIsT ? CORNER / 2 + 1 : CORNER / 2;
    const fenceTo = L - CORNER / 2;
    for (const side of [1, -1]) {
      let runStart = null;
      for (let s = fenceFrom; s <= fenceTo; s += 5) {
        const blocked = features.some((f) => f.type === 'bridge' && Math.abs(s - f.s) < 5);
        if (!blocked) {
          sb.add(B.post, COL.white, [side * FENCE, 0.45, -s], [0, 0, 0], [0.05, 0.9, 0.05]);
          if (runStart === null) runStart = s;
        }
        const nextBlocked = s + 5 > fenceTo || features.some((f) => f.type === 'bridge' && Math.abs(s + 5 - f.s) < 5);
        if (runStart !== null && (nextBlocked || blocked)) {
          const end = blocked ? s - 5 : s;
          if (end > runStart) sb.add(B.box, 0xf0f0e8, [side * FENCE, 0.78, -(runStart + end) / 2], [0, 0, 0], [0.025, 0.025, end - runStart]);
          runStart = null;
        }
      }
    }

    // hindernissen en munten
    this.placeObstacles(seg);

    // bomen en struiken
    this.placeScenery(seg, sb, excl);

    if (!sb.empty) {
      const stat = new THREE.Mesh(sb.build(), this.mat.world);
      stat.userData.ownGeo = true;
      seg.group.add(stat);
    }
  }

  hedgeBumps(b, from, to, fixed, alongX) {
    const r = this.rng;
    for (let v = from; v <= to; v += 0.6) {
      const pos = alongX ? [v, 1.6, fixed + (r() - 0.5) * 0.4] : [fixed + (r() - 0.5) * 0.4, 1.6, v];
      b.add(B.crown, r() < 0.5 ? COL.hedgeTop : COL.hedge, pos, [r(), r(), 0], [0.42, 0.3, 0.42]);
    }
  }

  buildBridge(seg, sb, f, excl) {
    const s0 = f.s;
    const river = new THREE.Mesh(waterGeo(150, 6.5), this.mat.water);
    river.position.set(0, 0.03, -s0);
    river.userData.ownGeo = true;
    seg.group.add(river);
    // oevers
    for (const dz of [3.4, -3.4]) sb.add(B.box, 0xb59a6a, [0, 0.015, -s0 + dz], [0, 0, 0], [150, 0.03, 0.6]);
    // brugdek
    sb.add(B.box, 0x8a6240, [0, 0.1, -s0], [0, 0, 0], [TRACK_HALF * 2 + 0.6, 0.2, 8.4]);
    for (let z = -4; z <= 4; z += 0.5) sb.add(B.box, 0xa87a50, [0, 0.205, -s0 + z], [0, 0, 0], [TRACK_HALF * 2 + 0.5, 0.02, 0.4]);
    for (const side of [1, -1]) {
      const x = side * (TRACK_HALF + 0.25);
      for (let z = -4; z <= 4.01; z += 2) sb.add(B.box, 0x6e4f2e, [x, 0.65, -s0 + z], [0, 0, 0], [0.16, 1.1, 0.16]);
      sb.add(B.box, 0x7d5a38, [x, 1.15, -s0], [0, 0, 0], [0.14, 0.12, 8.3]);
      sb.add(B.box, 0x7d5a38, [x, 0.7, -s0], [0, 0, 0], [0.1, 0.08, 8.3]);
    }
    // waterval stroomopwaarts
    const side = f.side;
    this.buildCliff(seg, sb, side * 31, s0, side, 9.5);
    excl.push({ s: s0, lat: 0, r: 0, band: 7.5 });
    excl.push({ s: s0, lat: side * 32, r: 13 });
  }

  buildFall(seg, sb, f, excl) {
    const lat = f.side * 21;
    this.buildCliff(seg, sb, lat, f.s, f.side, 8);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.2, 18).rotateX(-Math.PI / 2), this.mat.water);
    pond.position.set(lat - f.side * 4.5, 0.03, -f.s);
    pond.userData.ownGeo = true;
    seg.group.add(pond);
    const r = this.rng;
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      sb.add(B.rock, COL.rock[Math.floor(r() * 3)], [lat - f.side * 4.5 + Math.cos(a) * 5.3, 0.1, -f.s + Math.sin(a) * 5.3], [r(), r(), r()], [0.5, 0.25, 0.5]);
    }
    excl.push({ s: f.s, lat: lat - f.side * 2, r: 10 });
  }

  buildCliff(seg, sb, lat, s, side, h) {
    const r = this.rng;
    // rotswand
    for (let i = 0; i < 16; i++) {
      const dz = (r() - 0.5) * 16;
      const dy = r() * h;
      const sc = 2.2 + r() * 2.2;
      sb.add(B.rock, COL.rock[Math.floor(r() * 3)], [lat + side * (2 + r() * 3), dy, -s + dz], [r(), r(), r()], [sc, sc * 0.9, sc]);
    }
    for (let i = 0; i < 6; i++) {
      sb.add(B.crown, COL.leaf[i % 5], [lat + side * (3 + r() * 3), h + 0.5 + r(), -s + (r() - 0.5) * 14], [r(), r(), 0], [2, 1.4, 2]);
    }
    // vallend water
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, h + 0.6), this.mat.fall);
    fall.position.set(lat + side * 0.6, (h + 0.6) / 2, -s);
    fall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    fall.userData.ownGeo = true;
    seg.group.add(fall);
    // schuim
    for (let i = 0; i < 9; i++) {
      sb.add(B.crown, 0xf4fbff, [lat - side * (0.2 + r() * 1.4), 0.2, -s + (r() - 0.5) * 4.4], [r(), r(), 0], [0.6, 0.35, 0.6]);
    }
  }

  placeScenery(seg, sb, excl) {
    const r = this.rng;
    const L = seg.length;
    // lijnen waar het pad loopt (wereldcoördinaten)
    const lines = [];
    lines.push([seg.toWorld(seg.first ? -45 : -CORNER / 2, 0), seg.toWorld(L + CORNER / 2, 0)]);
    if (seg.parent) lines.push([seg.parent.start.clone(), seg.parent.end.clone()]);
    for (const d of seg.nextDirs()) lines.push([seg.end.clone(), seg.end.clone().addScaledVector(DIRS[d], 230)]);
    const clear = TRACK_HALF + 2.4;
    const wp = new THREE.Vector3();
    const blocked = (s, lat, rad) => {
      seg.toWorld(s, lat, 0, wp);
      for (const [a, b] of lines) if (distToSeg(wp, a, b) < clear + rad) return true;
      for (const e of excl) {
        if (e.band && Math.abs(s - e.s) < e.band) return true;
        if (e.r && Math.hypot(s - e.s, lat - e.lat) < e.r) return true;
      }
      return false;
    };
    const s0 = seg.parent ? -CORNER / 2 : -30;
    const s1 = L + CORNER / 2 + 30;
    for (let s = s0; s < s1; s += 2.4) {
      for (const side of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          if (r() > 0.6) continue;
          const lat = side * (TRACK_HALF + 3 + Math.pow(r(), 1.5) * 46);
          const ss = s + (r() - 0.5) * 2.4;
          const kind = r();
          if (kind < 0.5) {
            const sc = 0.8 + r() * 0.8;
            if (blocked(ss, lat, 1.6 * sc)) continue;
            this.oak(sb, lat, ss, sc);
          } else if (kind < 0.78) {
            const sc = 0.8 + r() * 0.9;
            if (blocked(ss, lat, 1.2 * sc)) continue;
            this.pine(sb, lat, ss, sc);
          } else if (kind < 0.93) {
            if (blocked(ss, lat, 0.8)) continue;
            sb.add(B.crown, COL.leaf[Math.floor(r() * 5)], [lat, 0.45, -ss], [r(), r(), 0], [0.9 + r() * 0.6, 0.6 + r() * 0.3, 0.9 + r() * 0.5]);
          } else {
            if (blocked(ss, lat, 0.8)) continue;
            sb.add(B.rock, COL.rock[Math.floor(r() * 3)], [lat, 0.25, -ss], [r(), r(), r()], [0.6 + r() * 0.8, 0.5 + r() * 0.4, 0.6 + r() * 0.6]);
          }
        }
      }
    }
    // lage struikjes en bloemen dicht langs het touw
    const fl = [0xfff3b0, 0xffd23f, 0xf28cc0, 0xffffff, 0xb08cff];
    for (let s = CORNER / 2; s < L - CORNER / 2; s += 1.6) {
      if (r() < 0.55) continue;
      const side = r() < 0.5 ? 1 : -1;
      const lat = side * (FENCE + 0.5 + r() * 1.8);
      if (blocked(s, lat, -1.8)) continue;
      if (r() < 0.5) sb.add(B.crown, COL.leaf[Math.floor(r() * 5)], [lat, 0.2, -s], [r(), r(), 0], [0.45, 0.32, 0.45]);
      else for (let i = 0; i < 4; i++) sb.add(B.sphere, fl[Math.floor(r() * fl.length)], [lat + (r() - 0.5) * 0.8, 0.1, -s + (r() - 0.5) * 0.8], [0, 0, 0], [0.09, 0.09, 0.09]);
    }
  }

  oak(b, lat, s, sc) {
    const r = this.rng;
    b.add(B.trunk, COL.bark, [lat, 1.3 * sc, -s], [0, 0, 0], [0.32 * sc, 2.6 * sc, 0.32 * sc]);
    b.add(B.crown, COL.leaf[Math.floor(r() * 5)], [lat, 3.2 * sc, -s], [r(), r(), 0], [1.7 * sc, 1.5 * sc, 1.7 * sc]);
    if (r() < 0.6) b.add(B.crown, COL.leaf[Math.floor(r() * 5)], [lat + 0.6 * sc, 3.9 * sc, -s + 0.3], [r(), r(), 0], [1.1 * sc, 1.0 * sc, 1.1 * sc]);
  }

  pine(b, lat, s, sc) {
    const r = this.rng;
    const c = COL.pine[Math.floor(r() * 3)];
    b.add(B.trunk, COL.barkDark, [lat, 0.6 * sc, -s], [0, 0, 0], [0.22 * sc, 1.2 * sc, 0.22 * sc]);
    b.add(B.cone, c, [lat, 2.0 * sc, -s], [0, r(), 0], [1.4 * sc, 2.4 * sc, 1.4 * sc]);
    b.add(B.cone, shade(c, 1.1), [lat, 3.3 * sc, -s], [0, r(), 0], [1.0 * sc, 2.0 * sc, 1.0 * sc]);
    b.add(B.cone, c, [lat, 4.4 * sc, -s], [0, r(), 0], [0.6 * sc, 1.5 * sc, 0.6 * sc]);
  }

  // ---------- hindernissen ----------
  addObstacle(seg, type, s, opts = {}) {
    const lane = opts.lane;
    const key = type === 'waterRim' ? 'waterRim' + opts.len : type;
    const geo = cached(key, () => (type === 'waterRim' ? OBST.waterRim(opts.len) : OBST[type]()));
    const mesh = new THREE.Mesh(geo, this.mat.world);
    const lat = lane === undefined ? 0 : lane * LANE_WIDTH;
    mesh.position.set(lat, 0, -s);
    if (type === 'tree' || type === 'rock') mesh.rotation.y = this.rng() * Math.PI * 2;
    seg.group.add(mesh);
    const o = {
      type, s, kind: opts.kind, depth: opts.depth ?? 1, height: opts.height ?? 1,
      lat0: lane === undefined ? -TRACK_HALF - 1 : lat - LANE_WIDTH / 2 + 0.2,
      lat1: lane === undefined ? TRACK_HALF + 1 : lat + LANE_WIDTH / 2 - 0.2,
      mesh, alive: true,
    };
    if (o.kind) seg.obstacles.push(o);
    return o;
  }

  addWaterPlane(seg, s, len, width = W + 2.6) {
    const m = new THREE.Mesh(waterGeo(width, len), this.mat.water);
    m.position.set(0, 0.035, -s);
    m.userData.ownGeo = true;
    seg.group.add(m);
    return m;
  }

  addCoin(seg, s, lat, y = 1.0) {
    if (s > seg.length - CORNER / 2 - 1) return;
    const p = seg.toWorld(s, lat, y);
    const c = { x: p.x, y: p.y, z: p.z, seg, dead: false, mag: false };
    seg.coins.push(c);
    this.coins.push(c);
  }

  coinRow(seg, s, n, lane, step = 2.3) {
    for (let i = 0; i < n; i++) this.addCoin(seg, s + i * step, lane * LANE_WIDTH);
  }

  coinArc(seg, sCenter, lane, peak = 1.9) {
    const len = JUMP_TIME * this.speedRef * 0.95;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this.addCoin(seg, sCenter - len / 2 + u * len, lane * LANE_WIDTH, 1.0 + peak * 4 * u * (1 - u));
    }
  }

  addPowerup(seg, s, lane, type) {
    if (s > seg.length - CORNER / 2 - 4) return;
    const r = this.rng;
    if (!type) {
      const pick = r();
      type = pick < 0.3 ? 'magnet' : pick < 0.6 ? 'double' : pick < 0.82 ? 'shield' : 'spurt';
    }
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(powerupGeo(type), puMaterial);
    mesh.add(body);
    const colors = { magnet: 0xff6a5a, double: 0xffd84d, shield: 0x6ab8ff, spurt: 0xc49bff };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, color: colors[type], transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.9);
    mesh.add(halo);
    const p = seg.toWorld(s, lane * LANE_WIDTH, 1.3);
    mesh.position.copy(p);
    mesh.rotation.y = yawOf(seg.dir);
    this.scene.add(mesh);
    const pu = { type, x: p.x, y: p.y, z: p.z, mesh, body, seg, dead: false };
    seg.powerups.push(pu);
    this.powerups.push(pu);
  }

  placeObstacles(seg) {
    const r = this.rng;
    const d = this.difficulty;
    const L = seg.length;
    const diffIdx = d.index ?? 0;
    let s = seg.first ? 55 : 24;
    const end = L - 30;
    const pf = Math.min(1, this.progress / 3500);
    if (seg.first) {
      this.coinRow(seg, 18, 10, 0);
    }
    let sinceCoins = 0;
    while (s < end) {
      const gapTime = d.gap[0] + (d.gap[1] - d.gap[0]) * pf;
      const gap = Math.max(14, this.speedRef * gapTime);
      if (!seg.isFree(s - 4, s + 16)) {
        s += 6;
        continue;
      }
      // af en toe even rust met alleen munten
      if (r() > d.density * (0.75 + 0.25 * pf) || sinceCoins > 5) {
        sinceCoins = 0;
        const lane = Math.floor(r() * 3) - 1;
        const n = 6 + Math.floor(r() * 5);
        if (r() < 0.35) {
          // slingerende rij
          let ln = lane;
          for (let i = 0; i < n; i++) {
            if (i % 3 === 2) ln = Math.max(-1, Math.min(1, ln + (r() < 0.5 ? -1 : 1)));
            this.addCoin(seg, s + i * 2.3, ln * LANE_WIDTH);
          }
        } else this.coinRow(seg, s, n, lane);
        if (r() < 0.32) this.addPowerup(seg, s + n * 2.3 + 3, Math.floor(r() * 3) - 1);
        s += n * 2.3 + gap * 0.6;
        continue;
      }
      sinceCoins++;
      const used = this.pattern(seg, s, diffIdx, pf);
      s += used + gap;
    }
    seg.obstacles.sort((a, b) => a.s - b.s);
    this.progress += L;
  }

  pattern(seg, s, diffIdx, pf) {
    const r = this.rng;
    const pats = [
      ['log', 10], ['hedge', 7], ['rails', 6], ['branch', 8], ['ditch', 6], ['block1', 9], ['block2', 7],
      ['water', 4], ['hay', 6], ['mixed', diffIdx >= 1 ? 7 : 2], ['table', diffIdx >= 1 ? 4 : 0],
      ['trakehner', diffIdx >= 2 ? 4 : 1], ['double', diffIdx >= 2 ? 4 + pf * 4 : 0], ['jumpduck', diffIdx >= 3 ? 4 : 0],
    ];
    const total = pats.reduce((a, p) => a + p[1], 0);
    let pick = r() * total;
    let id = pats[0][0];
    for (const [p, w] of pats) {
      pick -= w;
      if (pick <= 0) {
        id = p;
        break;
      }
    }
    const lane = () => Math.floor(r() * 3) - 1;
    const fullJump = (type, sAt, height, depth) => {
      this.addObstacle(seg, type, sAt, { kind: 'jump', height, depth });
      if (r() < 0.7) this.coinArc(seg, sAt, lane());
    };
    switch (id) {
      case 'log': fullJump('log', s, 0.95, 0.95); return 3;
      case 'hedge': fullJump('hedge', s, 1.22, 1.0); return 3;
      case 'rails': fullJump('rails', s, 1.22, 0.4); return 3;
      case 'table': fullJump('table', s, 1.15, 1.7); return 4;
      case 'trakehner': fullJump('trakehner', s, 1.2, 2.6); return 4;
      case 'branch': {
        this.addObstacle(seg, 'branch', s, { kind: 'duck', depth: 0.7 });
        const l = lane();
        for (let i = -2; i <= 2; i++) this.addCoin(seg, s + i * 1.6, l * LANE_WIDTH, 0.8);
        return 3;
      }
      case 'ditch': {
        this.addObstacle(seg, 'ditchBanks', s, { kind: 'ditch', depth: 2.4 });
        this.addWaterPlane(seg, s, 2.4);
        if (r() < 0.7) this.coinArc(seg, s, lane(), 1.6);
        return 4;
      }
      case 'water': {
        const len = 13;
        this.addWaterPlane(seg, s + len / 2, len);
        this.addObstacle(seg, 'waterRim', s + len / 2, { len });
        seg.waters.push([s, s + len]);
        if (diffIdx >= 1 && r() < 0.6) {
          this.addObstacle(seg, 'log', s - 1.5, { kind: 'jump', height: 0.95, depth: 0.95 });
          this.coinArc(seg, s - 1.5, lane());
        }
        const l = lane();
        for (let i = 1; i < 6; i++) this.addCoin(seg, s + i * 2.2, l * LANE_WIDTH);
        return len + 2;
      }
      case 'block1':
      case 'block2': {
        const lanes = [-1, 0, 1].sort(() => r() - 0.5);
        const n = id === 'block1' ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const t = r() < 0.6 ? 'tree' : 'rock';
          this.addObstacle(seg, t, s, { kind: 'block', lane: lanes[i], depth: 1.1 });
        }
        const free = lanes[n];
        this.coinRow(seg, s - 6, 6, free);
        if (r() < 0.12) this.addPowerup(seg, s + 9, free);
        return 3;
      }
      case 'hay': {
        const lanes = [-1, 0, 1].sort(() => r() - 0.5);
        const n = 1 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) this.addObstacle(seg, 'haybale', s, { kind: 'jump', lane: lanes[i], height: 1.2, depth: 1.25 });
        this.coinArc(seg, s, lanes[0]);
        return 3;
      }
      case 'mixed': {
        const lanes = [-1, 0, 1].sort(() => r() - 0.5);
        this.addObstacle(seg, r() < 0.5 ? 'tree' : 'rock', s, { kind: 'block', lane: lanes[0], depth: 1.1 });
        this.addObstacle(seg, 'laneLog', s, { kind: 'jump', lane: lanes[1], height: 0.88, depth: 0.85 });
        this.addObstacle(seg, 'haybale', s, { kind: 'jump', lane: lanes[2], height: 1.2, depth: 1.25 });
        this.coinArc(seg, s, lanes[1]);
        return 3;
      }
      case 'double': {
        const gap2 = Math.max(13, this.speedRef * 1.25);
        if (s + gap2 > seg.length - 26) { fullJump('log', s, 0.95, 0.95); return 3; }
        fullJump('log', s, 0.95, 0.95);
        fullJump(r() < 0.5 ? 'hedge' : 'rails', s + gap2, 1.22, 1.0);
        return gap2 + 3;
      }
      case 'jumpduck': {
        const gap2 = Math.max(13, this.speedRef * 1.1);
        if (s + gap2 > seg.length - 26) { fullJump('log', s, 0.95, 0.95); return 3; }
        fullJump('log', s, 0.95, 0.95);
        this.addObstacle(seg, 'branch', s + gap2, { kind: 'duck', depth: 0.7 });
        return gap2 + 3;
      }
      default: return 3;
    }
  }

  // ---------- per frame ----------
  update(dt, t, focus, camera) {
    // gras en lucht schuiven mee
    this.grass.position.x = Math.round(focus.x / 7) * 7;
    this.grass.position.z = Math.round(focus.z / 7) * 7;
    this.sky.position.copy(camera.position);
    this.clouds.rotation.y += dt * 0.004;
    this.mat.waterTex.offset.x += dt * 0.02;
    this.mat.waterTex.offset.y += dt * 0.045;
    this.mat.fallTex.offset.y += dt * 1.1;

    // munten
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 3.2);
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    let n = 0;
    const max = this.coinMesh.instanceMatrix.count;
    for (const c of this.coins) {
      if (c.dead || c.taken) continue;
      const dx = c.x - focus.x;
      const dz = c.z - focus.z;
      if (dx * dx + dz * dz > 170 * 170) continue;
      pos.set(c.x, c.y, c.z);
      m.compose(pos, q, c.scale ? one.clone().setScalar(c.scale) : one);
      this.coinMesh.setMatrixAt(n++, m);
      if (n >= max) break;
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;

    for (const p of this.powerups) {
      if (p.dead) continue;
      p.body.rotation.y = t * 2.4;
      p.mesh.position.y = p.y + Math.sin(t * 3 + p.x) * 0.15;
    }
  }
}

function distToSeg(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const apx = p.x - a.x, apz = p.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2));
  const dx = apx - abx * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dz * dz);
}

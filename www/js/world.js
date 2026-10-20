// De eindeloze cross-country baan: segmenten met bochten, hindernissen, munten, publiek en landschap.

import * as THREE from './lib/three.module.min.js';
import { LANE_WIDTH, TRACK_HALF, CORNER, JUMP_TIME } from './config.js';
import { GeoBuilder, makeRng, addWind, windUniforms } from './geo.js';
import * as TX from './textures.js';
import { OBST, W, cached, powerupGeo, numberMaterial } from './obstacles.js';
import {
  B, COL, oak, pine, birch, bush, tuft, flowers, rock, stump, fallenLog, person, tent,
  crowdMaterial, grassMaterial, mistPoints, crowdUniforms,
} from './scenery.js';
import { Sky } from './sky.js';

export const DIRS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
];
export const yawOf = (d) => -d * Math.PI / 2;
export const turnDir = (d, t) => (t === 'R' ? (d + 1) % 4 : (d + 3) % 4);

const FENCE = TRACK_HALF + 0.55;
const AHEAD = 280; // zoveel meter baan staat altijd klaar
const STATIC_ATTRS = ['wind'];
const CROWD_ATTRS = ['phase', 'bounce', 'wave'];
const BANNERS = [['GALOP!', '#d6362e', '#ffffff'], ['CROSS COUNTRY', '#1d4fa0', '#ffffff'], ['HUP HUP!', '#f2b705', '#2b1a0e'], ['GO GO GO!', '#3f8f3a', '#ffffff']];

// ---------- materialen ----------
function makeMaterials() {
  const track = TX.trackTexture();
  const waterN = TX.waterNormalTexture();
  const fall = TX.waterfallTexture();
  const mud = TX.mudTexture();
  return {
    world: addWind(new THREE.MeshLambertMaterial({ vertexColors: true })),
    obstacle: new THREE.MeshLambertMaterial({ vertexColors: true }),
    crowd: crowdMaterial(),
    track: new THREE.MeshLambertMaterial({ map: track.map, bumpMap: track.bump, bumpScale: 1.4 }),
    grass: grassMaterial(TX.grassTexture()),
    water: new THREE.MeshStandardMaterial({
      color: 0x2f86b0, roughness: 0.06, metalness: 0.1, normalMap: waterN, normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true, opacity: 0.88, envMapIntensity: 1.3,
    }),
    mud: new THREE.MeshStandardMaterial({ map: mud, roughness: 0.32, metalness: 0.05, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    fall: new THREE.MeshBasicMaterial({ map: fall, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    signs: {
      L: new THREE.MeshLambertMaterial({ map: TX.signTexture('L') }),
      R: new THREE.MeshLambertMaterial({ map: TX.signTexture('R') }),
      T: new THREE.MeshLambertMaterial({ map: TX.signTexture('T') }),
      start: new THREE.MeshLambertMaterial({ map: TX.bannerTexture('START', '#2f6b3c', '#ffffff'), side: THREE.DoubleSide }),
    },
    banners: BANNERS.map(([t, bg, fg]) => new THREE.MeshLambertMaterial({ map: TX.bannerTexture(t, bg, fg), side: THREE.DoubleSide })),
    waterN,
    fallTex: fall,
  };
}

function waterGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 6, uv.getY(i) * h / 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

const puMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3, emissive: 0x222222 });

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
    this.crowds = [];
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
      if ((o.isMesh || o.isPoints) && o.userData.ownGeo) o.geometry.dispose();
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
    this.progress = 0;
    this.fenceNo = 0;
    this.detail = 1; // 1 = hoog, 0 = eenvoudiger landschap

    // gras dat met de speler meeschuift
    const grassGeo = new THREE.PlaneGeometry(700, 700);
    const uv = grassGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 700 / 9, uv.getY(i) * 700 / 9);
    grassGeo.rotateX(-Math.PI / 2);
    this.grass = new THREE.Mesh(grassGeo, this.mat.grass);
    this.grass.position.y = -0.01;
    this.grass.receiveShadow = true;
    scene.add(this.grass);

    this.sky = new Sky(scene);

    // munten (instanced, glanzend goud)
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24);
    coinGeo.rotateX(Math.PI / 2);
    const face = TX.coinFaceTexture();
    const side = new THREE.MeshStandardMaterial({ color: 0xf0b323, metalness: 0.9, roughness: 0.28, emissive: 0x4a3000 });
    const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.75, roughness: 0.3, emissive: 0x3a2600 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, [side, faceMat, faceMat], 900);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    this.coinMesh.castShadow = true;
    scene.add(this.coinMesh);

    this.haloTex = TX.dotTexture();
    this.cheer = 0;
  }

  reset(difficulty, seed = Math.floor(Math.random() * 1e9)) {
    for (const s of this.allSegments()) s.dispose();
    this.rng = makeRng(seed);
    this.difficulty = difficulty;
    this.progress = 0;
    this.fenceNo = 0;
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
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (g1 - g0) / 16);
    trackGeo.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(trackGeo, this.mat.track);
    track.position.set(0, 0.012, -(g0 + g1) / 2);
    track.userData.ownGeo = true;
    track.receiveShadow = true;
    seg.group.add(track);

    const sb = new GeoBuilder(); // alles wat stilstaat in één mesh
    const cb = new GeoBuilder(); // publiek
    const excl = []; // gebieden zonder bomen (lokaal: {s, lat, r} of {band})

    // bocht-afsluiting en richtingbord
    const endS = L + CORNER / 2;
    sb.add(B.box, COL.hedge, [0, 0.75, -(endS + 0.6)], [0, 0, 0], [CORNER + 3.2, 1.5, 1.0], { grad: [0.6, 1.0] });
    this.hedgeBumps(sb, -(CORNER / 2 + 1.6), CORNER / 2 + 1.6, -(endS + 0.6), true);
    if (seg.turn !== 'T') {
      const closed = seg.turn === 'L' ? 1 : -1;
      const x = closed * (CORNER / 2 + 0.6);
      sb.add(B.box, COL.hedge, [x, 0.75, -L], [0, 0, 0], [1.0, 1.5, CORNER + 1.2], { grad: [0.6, 1.0] });
      this.hedgeBumps(sb, -L - CORNER / 2, -L + CORNER / 2, x, false);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), this.mat.signs[seg.turn]);
    sign.position.set(0, 2.15, -(endS + 0.05));
    sign.userData.ownGeo = true;
    seg.group.add(sign);
    for (const x of [-0.7, 0.7]) sb.add(B.post, 0x6e4f2e, [x, 1.1, -(endS + 0.12)], [0, 0, 0], [0.07, 2.2, 0.07]);

    // startpoort met publiek
    if (seg.first) {
      for (const s of [1, -1]) {
        sb.add(B.log8, 0xffffff, [s * (TRACK_HALF + 0.4), 3.4, -12], [0, 0, 0], [0.12, 6.8, 0.12]);
        sb.add(B.sphere, 0xd6362e, [s * (TRACK_HALF + 0.4), 6.85, -12], [0, 0, 0], [0.22, 0.22, 0.22]);
      }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), this.mat.signs.start);
      banner.position.set(0, 6.0, -12);
      banner.userData.ownGeo = true;
      seg.group.add(banner);
      this.crowd(seg, sb, cb, excl, 14, 1, 16, true);
      this.crowd(seg, sb, cb, excl, 20, -1, 14, true);
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
          sb.add(B.post, COL.white, [side * FENCE, 0.45, -s], [0, 0, 0], [0.05, 0.9, 0.05], { grad: [0.8, 1.0] });
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

    // hindernissen, munten en publiek bij de sprongen
    this.placeObstacles(seg);
    for (const o of seg.obstacles) {
      if (o.kind !== 'jump' && o.kind !== 'ditch' && !o.crowdSpot) continue;
      if (o.lat1 - o.lat0 < W - 0.5 && !o.crowdSpot) continue;
      if (seg.crowds.some((c) => Math.abs(c.s - o.s) < 18)) continue;
      if (r() < (o.crowdSpot ? 0.8 : 0.42)) {
        const side = r() < 0.5 ? 1 : -1;
        this.crowd(seg, sb, cb, excl, o.s, side, 8 + Math.floor(r() * 7));
        o.crowd = true;
        if (r() < 0.35) this.crowd(seg, sb, cb, excl, o.s + 1, -side, 6 + Math.floor(r() * 5));
      }
    }

    // bomen, struiken en gras
    this.placeScenery(seg, sb, excl);

    if (!sb.empty) {
      const stat = new THREE.Mesh(sb.build(STATIC_ATTRS), this.mat.world);
      stat.userData.ownGeo = true;
      stat.castShadow = true;
      stat.receiveShadow = true;
      seg.group.add(stat);
    }
    if (!cb.empty) {
      const crowd = new THREE.Mesh(cb.build(CROWD_ATTRS), this.mat.crowd);
      crowd.userData.ownGeo = true;
      crowd.castShadow = true;
      crowd.receiveShadow = true;
      seg.group.add(crowd);
    }
  }

  // Publiek op een rij achter een houten hekje, soms met spandoek en tent.
  crowd(seg, sb, cb, excl, s, side, n, start = false) {
    const r = this.rng;
    const span = Math.max(8, n * 0.8);
    const fx = side * (FENCE + 1.0);
    const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    // hekje
    for (let z = -span / 2; z <= span / 2 + 0.01; z += 2) sb.add(B.log8, 0x8a6a45, [fx, 0.5, -s + z], [0, 0, 0], [0.06, 1.0, 0.06], { grad: [0.7, 1.0] });
    for (const y of [0.45, 0.9]) sb.add(B.box, 0xa8845a, [fx, y, -s], [0, 0, 0], [0.06, 0.08, span], { grad: [0.8, 1.0] });
    if (r() < 0.65 || start) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(span - 1, 4.2), 1.05), this.mat.banners[Math.floor(r() * this.mat.banners.length)]);
      m.position.set(fx - side * 0.05, 0.68, -s);
      m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.userData.ownGeo = true;
      seg.group.add(m);
    }
    // mensen in twee rijen
    for (let i = 0; i < n; i++) {
      const row = i % 2;
      const x = side * (FENCE + 1.7 + row * 0.9 + r() * 0.3);
      const z = -s + (r() - 0.5) * span;
      person(cb, x, z, yaw + (r() - 0.5) * 0.5, r);
    }
    if (r() < 0.45 || start) tent(sb, side * (FENCE + 7.5), -s + (r() - 0.5) * 4, 0, r);
    excl.push({ s, lat: side * (FENCE + 4.5), r: span / 2 + 4 });
    seg.crowds.push({ s, side });
  }

  hedgeBumps(b, from, to, fixed, alongX) {
    const r = this.rng;
    for (let v = from; v <= to; v += 0.5) {
      const pos = alongX ? [v, 1.5, fixed + (r() - 0.5) * 0.4] : [fixed + (r() - 0.5) * 0.4, 1.5, v];
      b.add(B.ico0, r() < 0.5 ? COL.hedgeTop : COL.hedge, pos, [r(), r(), 0], [0.42, 0.32, 0.42], { faceted: true, grad: [0.6, 1.12], attrs: { wind: 0.2 } });
    }
  }

  buildBridge(seg, sb, f, excl) {
    const s0 = f.s;
    const river = new THREE.Mesh(waterGeo(150, 6.5), this.mat.water);
    river.position.set(0, 0.03, -s0);
    river.userData.ownGeo = true;
    river.receiveShadow = true;
    seg.group.add(river);
    const r = this.rng;
    // oevers met stenen en riet
    for (const dz of [3.4, -3.4]) {
      sb.add(B.box, 0xb59a6a, [0, 0.015, -s0 + dz], [0, 0, 0], [150, 0.03, 0.7]);
      for (let x = -70; x < 70; x += 2.5 + r() * 2) {
        if (Math.abs(x) < TRACK_HALF + 1) continue;
        if (r() < 0.5) sb.add(B.rock, COL.rock[Math.floor(r() * 3)], [x, 0.08, -s0 + dz], [r(), r(), r()], [0.4, 0.18, 0.35], { faceted: true, grad: [0.7, 1.1] });
        else tuft(sb, x, -s0 + dz * 0.95, r, 1.8);
      }
    }
    // brugdek
    sb.add(B.box, 0x8a6240, [0, 0.1, -s0], [0, 0, 0], [TRACK_HALF * 2 + 0.6, 0.2, 8.4]);
    for (let z = -4; z <= 4; z += 0.5) sb.add(B.box, 0xa87a50, [0, 0.205, -s0 + z], [0, 0, 0], [TRACK_HALF * 2 + 0.5, 0.02, 0.42], { grad: [0.85, 1.0] });
    for (const side of [1, -1]) {
      const x = side * (TRACK_HALF + 0.25);
      for (let z = -4; z <= 4.01; z += 2) sb.add(B.log8, 0x6e4f2e, [x, 0.65, -s0 + z], [0, 0, 0], [0.09, 1.1, 0.09], { grad: [0.7, 1.0] });
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
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5.2, 24).rotateX(-Math.PI / 2), this.mat.water);
    pond.position.set(lat - f.side * 4.5, 0.03, -f.s);
    pond.userData.ownGeo = true;
    seg.group.add(pond);
    const r = this.rng;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const px = lat - f.side * 4.5 + Math.cos(a) * 5.3;
      const pz = -f.s + Math.sin(a) * 5.3;
      if (r() < 0.65) sb.add(B.rock, COL.rock[Math.floor(r() * 3)], [px, 0.1, pz], [r(), r(), r()], [0.5, 0.25, 0.5], { faceted: true, grad: [0.65, 1.1] });
      else tuft(sb, px, pz, r, 1.6);
    }
    excl.push({ s: f.s, lat: lat - f.side * 2, r: 10 });
  }

  buildCliff(seg, sb, lat, s, side, h) {
    const r = this.rng;
    const rockO = { faceted: true, grad: [0.55, 1.12] };
    for (let i = 0; i < 14; i++) {
      const dz = (r() - 0.5) * 16;
      const dy = r() * h;
      const sc = 2.2 + r() * 2.2;
      sb.add(B.rock1, COL.rock[Math.floor(r() * 3)], [lat + side * (2 + r() * 3), dy, -s + dz], [r(), r(), r()], [sc, sc * 0.9, sc], rockO);
    }
    for (let i = 0; i < 7; i++) {
      sb.add(B.ico1, COL.leaf[i % 5], [lat + side * (3 + r() * 3), h + 0.5 + r(), -s + (r() - 0.5) * 14], [r(), r(), 0], [2, 1.4, 2], { faceted: true, grad: [0.6, 1.1], attrs: { wind: 0.3 } });
    }
    // vallend water
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, h + 0.6), this.mat.fall);
    fall.position.set(lat + side * 0.6, (h + 0.6) / 2, -s);
    fall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    fall.userData.ownGeo = true;
    seg.group.add(fall);
    // schuim en nevel
    for (let i = 0; i < 10; i++) {
      sb.add(B.ico0, 0xf4fbff, [lat - side * (0.2 + r() * 1.4), 0.2, -s + (r() - 0.5) * 4.4], [r(), r(), 0], [0.6, 0.35, 0.6], { faceted: true });
    }
    const mist = mistPoints(this.haloTex, 40, 4.4, 2.2);
    mist.position.set(lat - side * 0.8, 0.1, -s);
    mist.userData.ownGeo = true;
    seg.group.add(mist);
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
    const hiDetail = this.detail > 0;
    const s0 = seg.parent ? -CORNER / 2 : -30;
    const s1 = L + CORNER / 2 + 30;
    for (let s = s0; s < s1; s += 2.6) {
      for (const side of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          if (r() > 0.58) continue;
          const lat = side * (TRACK_HALF + 3 + Math.pow(r(), 1.5) * 46);
          const ss = s + (r() - 0.5) * 2.6;
          const near = Math.abs(lat) < 22 && hiDetail;
          const kind = r();
          if (kind < 0.42) {
            const sc = 0.8 + r() * 0.75;
            if (blocked(ss, lat, 1.7 * sc)) continue;
            oak(sb, lat, -ss, sc, r, near);
          } else if (kind < 0.64) {
            const sc = 0.8 + r() * 0.9;
            if (blocked(ss, lat, 1.4 * sc)) continue;
            pine(sb, lat, -ss, sc, r, near);
          } else if (kind < 0.74) {
            const sc = 0.85 + r() * 0.5;
            if (blocked(ss, lat, 1.0 * sc)) continue;
            birch(sb, lat, -ss, sc, r, near);
          } else if (kind < 0.9) {
            if (blocked(ss, lat, 0.9)) continue;
            bush(sb, lat, -ss, 0.9 + r() * 0.6, r, r() < 0.3 && near, near);
          } else if (kind < 0.96) {
            if (blocked(ss, lat, 0.8)) continue;
            rock(sb, lat, -ss, 0.8 + r() * 1.2, r);
          } else {
            if (blocked(ss, lat, 1.2)) continue;
            if (r() < 0.5) stump(sb, lat, -ss, r);
            else fallenLog(sb, lat, -ss, r);
          }
        }
      }
    }
    // gras, bloemen en struikjes langs het touw
    const step = hiDetail ? 1.4 : 2.6;
    for (let s = CORNER / 2; s < L - CORNER / 2; s += step) {
      for (const side of [1, -1]) {
        if (r() < 0.35) continue;
        const lat = side * (FENCE + 0.35 + r() * 2.4);
        if (blocked(s, lat, -1.8)) continue;
        const k = r();
        if (k < 0.6) tuft(sb, lat, -s + (r() - 0.5), r, 1);
        else if (k < 0.82) flowers(sb, lat, -s, r);
        else bush(sb, lat + side * 0.5, -s, 0.55, r, r() < 0.4);
      }
    }
  }

  // ---------- hindernissen ----------
  addObstacle(seg, type, s, opts = {}) {
    const lane = opts.lane;
    const key = type === 'waterRim' ? 'waterRim' + opts.len : type;
    const geo = cached(key, () => (type === 'waterRim' ? OBST.waterRim(opts.len) : OBST[type]()));
    const mesh = new THREE.Mesh(geo, this.mat.obstacle);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const lat = lane === undefined ? 0 : lane * LANE_WIDTH;
    mesh.position.set(lat, 0, -s);
    if (type === 'tree' || type === 'rock') mesh.rotation.y = this.rng() * Math.PI * 2;
    seg.group.add(mesh);
    const o = {
      type, s, kind: opts.kind, depth: opts.depth ?? 1, height: opts.height ?? 1,
      lat0: lane === undefined ? -TRACK_HALF - 1 : lat - LANE_WIDTH / 2 + 0.2,
      lat1: lane === undefined ? TRACK_HALF + 1 : lat + LANE_WIDTH / 2 - 0.2,
      mesh, alive: true, crowdSpot: opts.crowdSpot,
    };
    if (o.kind) seg.obstacles.push(o);
    // nummerbord bij echte sprongen over het hele pad
    if ((o.kind === 'jump' || o.kind === 'ditch') && lane === undefined) {
      this.fenceNo++;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), numberMaterial(this.fenceNo));
      plate.position.set(W / 2 + 0.95, 1.15, 0.03);
      plate.userData.ownGeo = true;
      mesh.add(plate);
      o.number = this.fenceNo;
    }
    return o;
  }

  addWaterPlane(seg, s, len, width = W + 2.6) {
    const m = new THREE.Mesh(waterGeo(width, len), this.mat.water);
    m.position.set(0, 0.035, -s);
    m.userData.ownGeo = true;
    m.receiveShadow = true;
    seg.group.add(m);
    return m;
  }

  addMud(seg, s, lanes) {
    const len = 3.6;
    const lo = Math.min(...lanes), hi = Math.max(...lanes);
    const width = (hi - lo + 1) * LANE_WIDTH + 0.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len + 0.8).rotateX(-Math.PI / 2), this.mat.mud);
    const cx = ((lo + hi) / 2) * LANE_WIDTH;
    m.position.set(cx, 0.03, -s);
    m.userData.ownGeo = true;
    m.receiveShadow = true;
    seg.group.add(m);
    seg.obstacles.push({
      type: 'mud', s, kind: 'mud', depth: len, height: 0,
      lat0: cx - width / 2 + 0.25, lat1: cx + width / 2 - 0.25, mesh: m, alive: true,
    });
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
    body.castShadow = true;
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
    if (seg.first) this.coinRow(seg, 18, 10, 0);
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
      ['water', 4], ['hay', 6], ['mud', 5], ['mixed', diffIdx >= 1 ? 7 : 2], ['table', diffIdx >= 1 ? 4 : 0],
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
        this.addObstacle(seg, 'waterRim', s + len / 2, { len, kind: undefined });
        seg.waters.push([s, s + len]);
        if (diffIdx >= 1 && r() < 0.6) {
          this.addObstacle(seg, 'log', s - 1.5, { kind: 'jump', height: 0.95, depth: 0.95, crowdSpot: true });
          this.coinArc(seg, s - 1.5, lane());
        } else {
          // waterbak is een publiekstrekker
          seg.obstacles.push({ type: 'waterSpot', s: s + len / 2, kind: null, crowdSpot: true, depth: 0, lat0: 0, lat1: 0, alive: false });
        }
        const l = lane();
        for (let i = 1; i < 6; i++) this.addCoin(seg, s + i * 2.2, l * LANE_WIDTH);
        return len + 2;
      }
      case 'mud': {
        const lanes = [-1, 0, 1].sort(() => r() - 0.5);
        const n = r() < 0.5 ? 1 : 2;
        this.addMud(seg, s, lanes.slice(0, n).sort());
        this.coinRow(seg, s - 5, 5, lanes[n]);
        return 4;
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
    windUniforms.uTime.value = t;
    this.cheer = Math.max(0, this.cheer - dt * 0.6);
    crowdUniforms.uCheer.value = this.cheer;
    // gras en lucht schuiven mee
    this.grass.position.x = Math.round(focus.x / 9) * 9;
    this.grass.position.z = Math.round(focus.z / 9) * 9;
    this.sky.update(dt, camera);
    this.mat.waterN.offset.x += dt * 0.025;
    this.mat.waterN.offset.y += dt * 0.04;
    this.mat.fallTex.offset.y += dt * 1.1;

    // munten
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 3.2);
    const one = new THREE.Vector3(1, 1, 1);
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let n = 0;
    const max = this.coinMesh.instanceMatrix.count;
    for (const c of this.coins) {
      if (c.dead) continue;
      const dx = c.x - focus.x;
      const dz = c.z - focus.z;
      if (dx * dx + dz * dz > 170 * 170) continue;
      pos.set(c.x, c.y, c.z);
      m.compose(pos, q, c.scale ? sc.setScalar(c.scale) : one);
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

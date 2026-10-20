// Het paard met ruiter: vloeiende vormen (lofts) met een volledig geanimeerde galop.

import * as THREE from './lib/three.module.min.js';
import { GeoBuilder, G, makeRng, shade, loft } from './geo.js';

const RAINBOW = [0xff4d6d, 0xff9f1c, 0xffe14d, 0x5ad66f, 0x4cc9f0, 0x9b5de5];

export const horseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 });
export const riderMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });

function mesh(builder, mat = horseMaterial) {
  const m = new THREE.Mesh(builder.build(), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function maneColor(horse, i, n) {
  if (horse.mane === 'rainbow') return RAINBOW[Math.floor((i / n) * RAINBOW.length) % RAINBOW.length];
  return horse.mane;
}

// Punt op de buitenkant van een loft-ring: hoek 0 = rechts (+x), PI/2 = "boven" (ry-richting).
function ringPoint(rings, i, angle, out = 1) {
  const side = new THREE.Vector3(1, 0, 0);
  const p = new THREE.Vector3(...rings[i].p);
  const prev = new THREE.Vector3(...rings[Math.max(0, i - 1)].p);
  const next = new THREE.Vector3(...rings[Math.min(rings.length - 1, i + 1)].p);
  const t = next.sub(prev).normalize();
  const u = new THREE.Vector3().crossVectors(side, t).normalize();
  return p.addScaledVector(side, Math.cos(angle) * rings[i].rx * out).addScaledVector(u, Math.sin(angle) * rings[i].ry * out);
}

const shell = (from, len) => new THREE.CylinderGeometry(1, 1, 1, 22, 1, true, Math.PI - from, len);
const SADDLE_PAD = shell(1.25, 2.5);
const SADDLE = shell(0.75, 1.5);
const GIRTH = shell(Math.PI, Math.PI * 2);

export class HorseRider {
  constructor(horse, rider) {
    this.root = new THREE.Group();
    this.anim = { t: 0, air: 0, duck: 0, idle: 0, stumble: 0 };
    this.handL = new THREE.Object3D();
    this.handR = new THREE.Object3D();
    this.bit = new THREE.Object3D();
    const reinGeo = new THREE.BufferGeometry();
    reinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.reins = new THREE.Line(reinGeo, new THREE.LineBasicMaterial({ color: 0x2a1a10 }));
    this.reins.frustumCulled = false;
    this.build(horse, rider);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }

  build(horse, rider) {
    this.dispose();
    this.root.clear();
    this.horseCfg = horse;
    this.riderCfg = rider;
    const coat = horse.coat;

    const body = new THREE.Group();
    body.position.set(0, 1.38, 0);
    this.root.add(body);
    this.body = body;

    // ---------- romp ----------
    const bodyRings = [
      { p: [0, 0.17, 1.1], rx: 0.08, ry: 0.1 },
      { p: [0, 0.13, 1.02], rx: 0.25, ry: 0.29 },
      { p: [0, 0.07, 0.86], rx: 0.35, ry: 0.4 },
      { p: [0, 0.03, 0.62], rx: 0.38, ry: 0.43, belly: 0.9 },
      { p: [0, -0.01, 0.32], rx: 0.35, ry: 0.42, belly: 1.0 },
      { p: [0, -0.04, 0.0], rx: 0.36, ry: 0.44, belly: 1.05 },
      { p: [0, -0.03, -0.3], rx: 0.36, ry: 0.45, belly: 1.05 },
      { p: [0, 0.02, -0.55], rx: 0.34, ry: 0.45 },
      { p: [0, 0.03, -0.78], rx: 0.3, ry: 0.42 },
      { p: [0, 0.04, -0.96], rx: 0.22, ry: 0.33 },
      { p: [0, 0.05, -1.05], rx: 0.1, ry: 0.16 },
    ].map((r) => ({ ...r, color: coat }));
    const b = new GeoBuilder();
    b.add(loft(bodyRings, { radial: 18 }), coat);
    // schouder- en bilspieren
    for (const s of [1, -1]) {
      b.add(G.sphere(1, 14, 10), coat, [s * 0.14, -0.06, -0.62], [0, 0, 0], [0.24, 0.36, 0.3]);
      b.add(G.sphere(1, 14, 10), coat, [s * 0.16, 0.0, 0.66], [0, 0, 0], [0.24, 0.4, 0.36]);
    }
    if (horse.spots || horse.dapples) {
      const r = makeRng(42);
      const n = horse.spots ? 60 : 80;
      for (let i = 0; i < n; i++) {
        const ri = horse.spots ? 1 + Math.floor(r() * 4) : 1 + Math.floor(r() * 9);
        const ang = horse.spots ? 0.2 + r() * 2.7 : -0.6 + r() * 4.3;
        const p = ringPoint(bodyRings, ri, ang, 0.985);
        p.z += (r() - 0.5) * 0.2;
        const col = horse.spots ? horse.spots : (r() < 0.5 ? shade(coat, 1.07) : shade(coat, 0.84));
        const size = horse.spots ? 0.04 + r() * 0.035 : 0.05 + r() * 0.05;
        b.add(G.sphere(1, 7, 5), col, [p.x, p.y, p.z], [0, 0, 0], [size, size, size]);
      }
    }
    // zadeldek, zadel, singel
    const pad = rider.pad;
    b.add(SADDLE_PAD, pad, [0, -0.02, -0.16], [Math.PI / 2, 0, 0], [0.39, 0.62, 0.475]);
    b.add(SADDLE, 0x3b2314, [0, -0.02, -0.14], [Math.PI / 2, 0, 0], [0.395, 0.44, 0.49]);
    b.add(G.sphere(1, 12, 8), 0x3b2314, [0, 0.47, 0.1], [0, 0, 0], [0.17, 0.07, 0.07]);
    b.add(G.sphere(1, 12, 8), 0x2f1b0f, [0, 0.47, -0.36], [0, 0, 0], [0.12, 0.06, 0.06]);
    b.add(GIRTH, 0x2c1a10, [0, -0.01, -0.44], [Math.PI / 2, 0, 0], [0.37, 0.09, 0.458]);
    body.add(mesh(b));

    // ---------- hals ----------
    const neck = new THREE.Group();
    neck.position.set(0, 0.14, -0.7);
    body.add(neck);
    this.neck = neck;
    const neckRings = [
      { p: [0, -0.08, 0.08], rx: 0.22, ry: 0.32 },
      { p: [0, 0.16, -0.12], rx: 0.2, ry: 0.29 },
      { p: [0, 0.44, -0.29], rx: 0.155, ry: 0.23 },
      { p: [0, 0.7, -0.41], rx: 0.13, ry: 0.185 },
      { p: [0, 0.9, -0.49], rx: 0.115, ry: 0.15 },
      { p: [0, 1.0, -0.52], rx: 0.08, ry: 0.09 },
    ];
    const nb = new GeoBuilder();
    nb.add(loft(neckRings, { radial: 16, color: coat }), coat);
    // manen: ingevlochten knotjes, of lange manen
    const maneN = horse.longMane ? 14 : 9;
    for (let i = 0; i < maneN; i++) {
      const tt = i / (maneN - 1);
      const fi = 1 + tt * 3.2;
      const i0 = Math.floor(fi);
      const f = fi - i0;
      const pa = ringPoint(neckRings, i0, Math.PI / 2, 1.0);
      const pb = ringPoint(neckRings, Math.min(neckRings.length - 1, i0 + 1), Math.PI / 2, 1.0);
      const p = pa.lerp(pb, f);
      const col = maneColor(horse, i, maneN);
      if (horse.longMane) {
        const len = 0.42 - tt * 0.12;
        nb.add(G.box, col, [p.x + 0.07, p.y - len * 0.42, p.z + 0.04], [0.15, 0, -0.32], [0.035, len, 0.11], { grad: [0.75, 1.05] });
        nb.add(G.box, col, [p.x + 0.03, p.y - 0.02, p.z], [0.15, 0, -0.1], [0.05, 0.12, 0.12]);
      } else {
        nb.add(G.sphere(1, 8, 6), col, [p.x, p.y + 0.015, p.z + 0.01], [0, 0, 0], [0.045, 0.045, 0.05]);
      }
    }
    neck.add(mesh(nb));

    // ---------- hoofd ----------
    const head = new THREE.Group();
    head.position.set(0, 0.97, -0.5);
    neck.add(head);
    this.head = head;
    const m = horse.muzzle;
    const headRings = [
      { p: [0, 0.04, 0.08], rx: 0.09, ry: 0.1, color: coat },
      { p: [0, 0.0, -0.04], rx: 0.135, ry: 0.15, color: coat },
      { p: [0, -0.1, -0.2], rx: 0.13, ry: 0.14, color: coat },
      { p: [0, -0.24, -0.35], rx: 0.105, ry: 0.115, color: coat },
      { p: [0, -0.36, -0.46], rx: 0.095, ry: 0.105, color: shade(m, 1.1) },
      { p: [0, -0.43, -0.53], rx: 0.09, ry: 0.095, color: m },
      { p: [0, -0.47, -0.56], rx: 0.06, ry: 0.06, color: m },
    ];
    const hb = new GeoBuilder();
    hb.add(loft(headRings, { radial: 14 }), coat);
    hb.add(G.sphere(1, 12, 10), coat, [0, -0.1, -0.08], [0, 0, 0], [0.125, 0.15, 0.15]);
    // ogen met glans
    for (const s of [1, -1]) {
      hb.add(G.sphere(1, 10, 8), 0x1a120c, [s * 0.118, -0.03, -0.14], [0, 0, 0], [0.032, 0.036, 0.036]);
      hb.add(G.sphere(1, 6, 4), 0xffffff, [s * 0.142, -0.015, -0.155], [0, 0, 0], [0.009, 0.009, 0.009]);
      hb.add(G.cone(1, 1, 7), coat, [s * 0.07, 0.13, 0.02], [-0.25, 0, -s * 0.3], [0.045, 0.19, 0.03]);
      hb.add(G.cone(1, 1, 7), shade(coat, 0.55), [s * 0.071, 0.12, 0.012], [-0.25, 0, -s * 0.3], [0.03, 0.15, 0.015]);
      hb.add(G.sphere(1, 6, 5), 0x120c08, [s * 0.05, -0.46, -0.555], [0, 0, 0], [0.022, 0.026, 0.018]);
    }
    hb.add(G.box, shade(m, 0.6), [0, -0.53, -0.47], [0.75, 0, 0], [0.11, 0.008, 0.06]);
    // bles
    if (horse.blaze) {
      for (let i = 0; i < 5; i++) {
        const p = ringPoint(headRings, 1 + i, Math.PI / 2, 1.0);
        const w = 0.04 + i * 0.006;
        hb.add(G.sphere(1, 8, 5), horse.blaze, [p.x, p.y, p.z], [0, 0, 0], [w, 0.03, 0.06]);
      }
    }
    // kuif
    hb.add(G.box, maneColor(horse, 0, 1), [0, 0.1, -0.06], [1.0, 0, 0], [0.09, 0.03, 0.17], { grad: [0.8, 1.05] });
    // hoofdstel
    const leather = 0x2c1a10;
    hb.add(new THREE.TorusGeometry(1, 0.12, 6, 18), leather, [0, -0.33, -0.43], [-0.64, 0, 0], [0.11, 0.115, 0.12]);
    hb.add(G.box, leather, [0, 0.07, -0.02], [0.2, 0, 0], [0.27, 0.025, 0.03]);
    for (const s of [1, -1]) hb.limb([s * 0.128, 0.05, -0.01], [s * 0.1, -0.33, -0.4], 0.012, leather, 0.012, 5);
    if (horse.horn) {
      hb.add(G.cone(1, 1, 10), 0xf7d774, [0, 0.21, -0.17], [-0.35, 0, 0], [0.045, 0.44, 0.045]);
      for (let k = 0; k < 4; k++) hb.add(new THREE.TorusGeometry(1, 0.15, 5, 12), 0xfff3c4, [0, 0.06 + k * 0.08, -0.12 - k * 0.028], [Math.PI / 2 - 0.35, 0, 0], [0.04 - k * 0.007, 0.04 - k * 0.007, 0.04]);
    }
    head.add(mesh(hb));
    this.bit.position.set(0, -0.4, -0.45);
    head.add(this.bit);

    // ---------- staart ----------
    const tail = new THREE.Group();
    tail.position.set(0, 0.2, 1.06);
    body.add(tail);
    this.tail = tail;
    const tb = new GeoBuilder();
    tb.add(loft([
      { p: [0, 0, 0], rx: 0.07, ry: 0.07 },
      { p: [0, -0.12, 0.03], rx: 0.065, ry: 0.065 },
      { p: [0, -0.24, 0.04], rx: 0.055, ry: 0.06 },
    ], { radial: 8 }), coat);
    const tail2 = new THREE.Group();
    tail2.position.set(0, -0.24, 0.04);
    tail.add(tail2);
    this.tail2 = tail2;
    const t2 = new GeoBuilder();
    const strands = horse.longMane ? 9 : 7;
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * Math.PI * 2;
      const col = maneColor(horse, i, strands);
      const sx = Math.cos(a) * 0.03;
      const sz = Math.sin(a) * 0.03;
      tb.limb([sx, -0.05, sz], [sx * 1.4, -0.26, sz * 1.4 + 0.02], 0.045, col, 0.05, 6);
      const len = (horse.longMane ? 0.78 : 0.62) * (0.85 + (i % 3) * 0.08);
      t2.limb([sx * 1.2, 0, sz * 1.2], [sx * 2.2, -len, sz * 2.2 + 0.03], 0.058, col, 0.02, 6);
    }
    tail.add(mesh(tb));
    tail2.add(mesh(t2));

    // ---------- benen ----------
    this.legs = [];
    const legDefs = [
      { x: 0.19, y: -0.2, z: -0.62, front: true, off: 0.6 },
      { x: -0.19, y: -0.2, z: -0.62, front: true, off: 0.5 },
      { x: 0.2, y: -0.1, z: 0.62, front: false, off: 0.1 },
      { x: -0.2, y: -0.1, z: 0.62, front: false, off: 0.0 },
    ];
    for (const d of legDefs) {
      const upper = new THREE.Group();
      upper.position.set(d.x, d.y, d.z);
      body.add(upper);
      const ub = new GeoBuilder();
      const upperLen = d.front ? 0.56 : 0.62;
      const knee = d.front ? [0, -upperLen, 0] : [0, -upperLen, 0.1];
      if (d.front) {
        ub.add(G.sphere(1, 10, 8), coat, [0, -0.1, 0.01], [0, 0, 0], [0.12, 0.22, 0.14]);
        ub.limb([0, -0.05, 0], knee, 0.11, coat, 0.065, 10);
      } else {
        ub.add(G.sphere(1, 10, 8), coat, [0, -0.08, 0], [0, 0, 0], [0.15, 0.28, 0.19]);
        ub.limb([0, -0.05, 0], knee, 0.13, coat, 0.07, 10);
      }
      upper.add(mesh(ub));
      const lower = new THREE.Group();
      lower.position.set(...knee);
      upper.add(lower);
      const lb = new GeoBuilder();
      const legCol = horse.legs;
      lb.add(G.sphere(1, 10, 8), d.front ? coat : coat, [0, 0, 0], [0, 0, 0], [0.072, 0.08, 0.075]);
      const fet = d.front ? [0, -0.4, 0.01] : [0, -0.42, -0.03];
      lb.limb([0, -0.02, 0], fet, 0.058, legCol, 0.05, 10);
      lb.add(G.sphere(1, 10, 8), legCol, fet, [0, 0, 0], [0.064, 0.066, 0.068]);
      const past = [fet[0], fet[1] - 0.08, fet[2] - 0.035];
      lb.limb(fet, past, 0.048, legCol, 0.05, 8);
      lb.add(G.cyl(0.058, 0.082, 0.1, 12), horse.hoof, [past[0], past[1] - 0.05, past[2] - 0.005], [-0.08, 0, 0]);
      if (horse.feathers) lb.add(G.cone(1, 1, 10), horse.mane, [fet[0], fet[1] - 0.04, fet[2] + 0.01], [0, 0, 0], [0.12, 0.22, 0.12]);
      lower.add(mesh(lb));
      this.legs.push({ upper, lower, ...d });
    }

    this.buildRider(rider, body);
    this.root.add(this.reins);
  }

  buildRider(rider, body) {
    const riderG = new THREE.Group();
    riderG.position.set(0, 0.5, -0.12);
    body.add(riderG);
    this.rider = riderG;
    const rb = new GeoBuilder();
    rb.capsule([-0.12, 0.1, 0.05], [0.12, 0.1, 0.05], 0.11, rider.breeches);
    for (const s of [1, -1]) {
      rb.capsule([0.14 * s, 0.08, 0.02], [0.34 * s, -0.15, -0.26], 0.078, rider.breeches);
      rb.capsule([0.34 * s, -0.15, -0.26], [0.39 * s, -0.49, -0.16], 0.064, 0x161616);
      rb.add(G.cyl(0.075, 0.07, 0.07, 10), 0x161616, [0.355 * s, -0.22, -0.24], [0.25, 0, 0]);
      rb.capsule([0.39 * s, -0.52, -0.14], [0.4 * s, -0.54, -0.3], 0.046, 0x161616);
      rb.add(new THREE.TorusGeometry(1, 0.18, 5, 10), 0xc8ccd0, [0.4 * s, -0.56, -0.2], [0, Math.PI / 2, 0], [0.065, 0.06, 0.065]);
      rb.limb([0.33 * s, 0.0, -0.1], [0.4 * s, -0.52, -0.2], 0.011, 0x2c1a10, 0.011, 4);
    }
    riderG.add(mesh(rb, riderMaterial));

    const torso = new THREE.Group();
    torso.position.set(0, 0.17, 0.05);
    torso.rotation.x = -0.75;
    riderG.add(torso);
    this.torso = torso;
    const ob = new GeoBuilder();
    const torsoRings = [
      { p: [0, -0.02, 0], rx: 0.14, ry: 0.1 },
      { p: [0, 0.18, 0], rx: 0.155, ry: 0.11 },
      { p: [0, 0.4, 0], rx: 0.19, ry: 0.12 },
      { p: [0, 0.54, 0], rx: 0.15, ry: 0.1 },
      { p: [0, 0.6, 0], rx: 0.06, ry: 0.05 },
    ];
    ob.add(loft(torsoRings, { radial: 14, color: rider.jacket }), rider.jacket);
    if (rider.knight) {
      ob.add(loft(torsoRings.slice(0, 4).map((r) => ({ ...r, rx: r.rx + 0.03, ry: r.ry + 0.035 })), { radial: 14, color: rider.vest }), rider.vest);
      ob.add(G.box, rider.cover, [0, 0.27, -0.155], [0, 0, 0], [0.26, 0.34, 0.02]);
      ob.add(G.box, 0xf2d34f, [0, 0.3, -0.166], [0, 0, 0], [0.05, 0.22, 0.01]);
      ob.add(G.box, 0xf2d34f, [0, 0.33, -0.166], [0, 0, 0], [0.17, 0.05, 0.01]);
      for (const s of [1, -1]) ob.add(G.sphere(1, 10, 8), rider.vest, [0.21 * s, 0.48, 0], [0, 0, 0], [0.12, 0.09, 0.12]);
    } else {
      ob.add(loft(torsoRings.slice(0, 4).map((r, i) => ({ ...r, p: [0, Math.max(0.06, r.p[1]), 0], rx: r.rx + 0.03, ry: r.ry + 0.04 - (i === 3 ? 0.02 : 0) })), { radial: 14, color: rider.vest }), rider.vest);
      for (const z of [-0.158, 0.158]) {
        ob.add(G.box, 0xffffff, [0, 0.29, z], [0, 0, 0], [0.22, 0.22, 0.01]);
        ob.add(G.box, 0x1a1a1a, [0, 0.3, z * 1.04], [0, 0, 0], [0.1, 0.08, 0.006]);
      }
    }
    ob.add(G.cyl(0.055, 0.065, 0.12, 10), rider.skin, [0, 0.62, 0]);
    for (const s of [1, -1]) {
      ob.capsule([0.2 * s, 0.47, 0], [0.24 * s, 0.26, -0.26], 0.056, rider.jacket);
      ob.capsule([0.24 * s, 0.26, -0.26], [0.11 * s, 0.36, -0.58], 0.047, rider.jacket);
      ob.add(G.sphere(1, 10, 8), 0x3a2a1e, [0.11 * s, 0.37, -0.62], [0, 0, 0], [0.052, 0.05, 0.06]);
    }
    torso.add(mesh(ob, riderMaterial));
    this.handL.position.set(0.11, 0.37, -0.64);
    this.handR.position.set(-0.11, 0.37, -0.64);
    torso.add(this.handL, this.handR);

    const rhead = new THREE.Group();
    rhead.position.set(0, 0.66, 0);
    rhead.rotation.x = 0.6;
    torso.add(rhead);
    this.riderHead = rhead;
    const rh = new GeoBuilder();
    rh.add(G.sphere(0.12, 18, 14), rider.skin, [0, 0.11, -0.005], [0, 0, 0], [1, 1.05, 1]);
    rh.add(G.sphere(1, 8, 6), shade(rider.skin, 0.92), [0, 0.09, -0.125], [0, 0, 0], [0.022, 0.03, 0.025]);
    for (const s of [1, -1]) {
      rh.add(G.sphere(1, 8, 6), 0xffffff, [0.042 * s, 0.13, -0.106], [0, 0, 0], [0.02, 0.016, 0.01]);
      rh.add(G.sphere(1, 8, 6), 0x1b1b1b, [0.042 * s, 0.13, -0.114], [0, 0, 0], [0.011, 0.011, 0.006]);
      rh.add(G.sphere(1, 8, 6), rider.skin, [0.122 * s, 0.1, 0.0], [0, 0, 0], [0.02, 0.03, 0.025]);
    }
    rh.add(G.box, 0xb05a4a, [0, 0.05, -0.115], [0, 0, 0], [0.04, 0.008, 0.01]);
    if (rider.knight) {
      rh.add(G.sphere(0.165, 18, 14), rider.helmet, [0, 0.13, 0]);
      rh.add(G.box, 0x1a1a1a, [0, 0.14, -0.158], [0, 0, 0], [0.2, 0.024, 0.03]);
      rh.add(G.box, rider.helmet, [0, 0.07, -0.155], [0, 0, 0], [0.035, 0.13, 0.035]);
      rh.add(G.cone(1, 1, 10), rider.cover, [0, 0.36, 0.07], [-0.5, 0, 0], [0.065, 0.36, 0.065]);
    } else {
      rh.capsule([0, 0.08, 0.13], [0, -0.1, 0.17], 0.04, rider.hair);
      rh.add(G.sphere(1, 12, 8), rider.hair, [0, 0.09, 0.07], [0, 0, 0], [0.125, 0.1, 0.09]);
      rh.add(new THREE.SphereGeometry(0.158, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), rider.cover, [0, 0.13, 0.005]);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        rh.add(G.box, shade(rider.cover, 0.8), [Math.sin(a) * 0.1, 0.26, 0.005 + Math.cos(a) * 0.1], [0, a, 0.6], [0.006, 0.08, 0.01]);
      }
      rh.add(G.cyl(0.161, 0.161, 0.035, 20), rider.helmet, [0, 0.135, 0.005]);
      rh.add(G.box, rider.helmet, [0, 0.145, -0.16], [0.22, 0, 0], [0.2, 0.02, 0.1]);
      rh.add(G.sphere(1, 10, 8), shade(rider.cover, 1.25), [0, 0.3, 0.005], [0, 0, 0], [0.05, 0.045, 0.05]);
      for (const s of [1, -1]) rh.limb([0.145 * s, 0.12, 0.0], [0.08 * s, -0.02, -0.05], 0.009, 0x222222, 0.009, 4);
    }
    rhead.add(mesh(rh, riderMaterial));
  }

  // Animatie. state: { phase, speed, vy, air, duck, crash, idle, lean, stumble, dt }
  update(st) {
    const a = this.anim;
    const dt = st.dt;
    a.t += dt;
    const ease = (cur, target, k) => cur + (target - cur) * (1 - Math.exp(-k * dt));
    a.air = ease(a.air, st.air ? 1 : 0, 14);
    a.duck = ease(a.duck, st.duck ? 1 : 0, 16);
    a.idle = ease(a.idle, st.idle ? 1 : 0, 6);
    a.stumble = ease(a.stumble, st.stumble ? 1 : 0, 18);
    const TAU = Math.PI * 2;
    const p = st.phase;
    const run = 1 - a.idle;
    const ground = 1 - a.air;

    // romp
    const bob = Math.sin(TAU * (p + 0.25)) * 0.07 * run * ground;
    const pitchRun = Math.sin(TAU * p) * 0.06 * run * ground;
    const pitchAir = THREE.MathUtils.clamp(st.vy * 0.028, -0.3, 0.35) * a.air;
    const breathe = Math.sin(a.t * 1.6) * 0.012 * a.idle;
    this.body.position.y = 1.38 + bob + breathe - a.duck * 0.06 - a.stumble * 0.18;
    this.body.rotation.x = pitchRun + pitchAir - a.stumble * 0.22;
    this.body.rotation.z = THREE.MathUtils.clamp(-st.lean * 0.12, -0.15, 0.15);

    // hals en hoofd
    const nod = Math.sin(TAU * (p + 0.1)) * 0.1 * run * ground;
    const idleHead = Math.sin(a.t * 0.7) * 0.06 * a.idle;
    this.neck.rotation.x = nod - a.duck * 0.45 + a.air * 0.1 + idleHead + a.idle * 0.12 - a.stumble * 0.5;
    this.head.rotation.x = -nod * 0.5 + a.duck * 0.15 - a.idle * 0.1;
    this.head.rotation.y = Math.sin(a.t * 0.5) * 0.15 * a.idle;

    // staart
    this.tail.rotation.x = -0.45 - 0.5 * run + Math.sin(TAU * p) * 0.12 * run - a.air * 0.25;
    this.tail.rotation.z = Math.sin(a.t * (a.idle > 0.5 ? 1.8 : 6)) * (0.08 + 0.12 * a.idle);
    this.tail2.rotation.x = 0.15 + 0.35 * run + Math.sin(TAU * p - 1.2) * 0.25 * run + a.air * 0.3;
    this.tail2.rotation.z = Math.sin(a.t * (a.idle > 0.5 ? 1.8 : 6) - 0.8) * (0.1 + 0.1 * a.idle);

    // benen
    for (const leg of this.legs) {
      const lp = TAU * (p + leg.off);
      let up, low;
      if (leg.front) {
        up = 0.08 + Math.sin(lp) * 0.62;
        low = -Math.max(0, Math.cos(lp)) * 1.35;
      } else {
        up = -0.12 + Math.sin(lp) * 0.55;
        low = -Math.max(0, Math.cos(lp)) * 0.9 + 0.12;
      }
      up *= run;
      low *= run;
      const airUp = leg.front ? 1.05 : (st.vy > 0 ? -0.7 : 0.35);
      const airLow = leg.front ? -2.0 : (st.vy > 0 ? -0.1 : -1.1);
      up = up * ground + airUp * a.air;
      low = low * ground + airLow * a.air;
      if (a.idle > 0.01) up += Math.sin(a.t * 0.9 + leg.off * 4) * 0.03 * a.idle;
      if (a.stumble > 0.01 && leg.front) {
        up += a.stumble * 0.5;
        low -= a.stumble * 1.2;
      }
      leg.upper.rotation.x = up;
      leg.lower.rotation.x = low;
    }

    // ruiter
    const riderBob = -bob * 0.6;
    this.rider.position.y = 0.5 + riderBob - a.duck * 0.05 + a.air * 0.06;
    this.torso.rotation.x = -0.75 - a.duck * 0.55 - a.air * 0.25 + a.idle * 0.55 + Math.sin(TAU * p) * 0.04 * run + a.stumble * 0.45;
    this.riderHead.rotation.x = 0.6 + a.duck * 0.45 + a.air * 0.2 - a.idle * 0.5 - a.stumble * 0.3;
    this.riderHead.rotation.y = Math.sin(a.t * 0.4) * 0.25 * a.idle;

    // steigeren bij een weigering
    if (st.crash >= 0) {
      const c = Math.min(1, st.crash / 0.35);
      const e = 1 - Math.pow(1 - c, 3);
      this.body.rotation.x = e * 0.95;
      this.body.position.y = 1.38 + e * 0.55;
      for (const leg of this.legs) {
        if (leg.front) {
          leg.upper.rotation.x = 0.9 + Math.sin(st.crash * 14 + leg.off * 6) * 0.45 * e;
          leg.lower.rotation.x = -1.5;
        } else {
          leg.upper.rotation.x = -0.95 * e;
          leg.lower.rotation.x = 0.1;
        }
      }
      this.neck.rotation.x = 0.35;
      this.torso.rotation.x = -0.2 - e * 0.5;
      this.tail.rotation.x = -0.15;
    }

    this.updateReins();
  }

  updateReins() {
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const pos = this.reins.geometry.attributes.position;
    const v = new THREE.Vector3();
    this.handL.getWorldPosition(v).applyMatrix4(inv);
    pos.setXYZ(0, v.x, v.y, v.z);
    this.bit.getWorldPosition(v).applyMatrix4(inv);
    pos.setXYZ(1, v.x, v.y, v.z);
    this.handR.getWorldPosition(v).applyMatrix4(inv);
    pos.setXYZ(2, v.x, v.y, v.z);
    pos.needsUpdate = true;
  }
}

// Gallop-ritme: momenten in de pas waarop hoeven de grond raken.
export const HOOF_BEATS = [0.02, 0.14, 0.52, 0.64];


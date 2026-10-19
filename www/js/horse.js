// Het paard met ruiter: opgebouwd uit eenvoudige vormen en volledig geanimeerd.

import * as THREE from './lib/three.module.min.js';
import { GeoBuilder, G, makeRng, shade } from './geo.js';

const RAINBOW = [0xff4d6d, 0xff9f1c, 0xffe14d, 0x5ad66f, 0x4cc9f0, 0x9b5de5];

const material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 16, specular: 0x1c1c1c, flatShading: false });
const flatMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x111111, flatShading: true });

function mesh(builder, flat = false) {
  const m = new THREE.Mesh(builder.build(), flat ? flatMaterial : material);
  return m;
}

function maneColor(horse, i, n) {
  if (horse.mane === 'rainbow') return RAINBOW[Math.floor((i / n) * RAINBOW.length) % RAINBOW.length];
  return horse.mane;
}

export class HorseRider {
  constructor(horse, rider) {
    this.root = new THREE.Group();
    this.anim = { t: 0, air: 0, duck: 0, crash: -1, idle: 0 };
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

    const body = new THREE.Group();
    body.position.set(0, 1.38, 0);
    this.root.add(body);
    this.body = body;

    // --- romp ---
    const b = new GeoBuilder();
    const coat = horse.coat;
    b.add(new THREE.CapsuleGeometry(0.4, 1.1, 4, 14), coat, [0, 0, 0], [Math.PI / 2, 0, 0], [0.82, 1, 1]);
    b.add(G.sphere(0.42, 14, 10), coat, [0, -0.02, -0.62], [0, 0, 0], [0.86, 1, 1]);
    b.add(G.sphere(0.45, 14, 10), coat, [0, 0.04, 0.6], [0, 0, 0], [0.9, 0.98, 1]);
    b.add(G.sphere(0.2, 10, 8), coat, [0, 0.3, -0.58], [0, 0, 0], [0.9, 0.8, 1.3]);
    if (horse.spots || horse.dapples) {
      const r = makeRng(42);
      const n = horse.spots ? 46 : 60;
      for (let i = 0; i < n; i++) {
        const z = horse.spots ? -0.1 + r() * 1.05 : -0.95 + r() * 1.9;
        const a = (r() - 0.5) * Math.PI * (horse.spots ? 1.25 : 1.7);
        const rad = Math.abs(z) > 0.55 ? Math.sqrt(Math.max(0.02, 0.42 * 0.42 - (Math.abs(z) - 0.55) ** 2)) : 0.42;
        const col = horse.spots ? horse.spots : (r() < 0.5 ? shade(coat, 1.08) : shade(coat, 0.82));
        const size = horse.spots ? 0.045 + r() * 0.035 : 0.05 + r() * 0.04;
        b.add(G.sphere(size, 6, 4), col, [Math.sin(a) * rad * 0.84, Math.cos(a) * rad + 0.02, z], [0, 0, 0], [1, 1, 1]);
      }
    }
    // zadeldek, zadel
    const pad = rider.pad;
    b.add(G.box, pad, [0, 0.27, -0.1], [0, 0, 0], [0.72, 0.32, 0.62]);
    b.add(G.box, shade(pad, 0.8), [0, 0.12, -0.1], [0, 0, 0], [0.73, 0.04, 0.63]);
    b.add(G.box, 0x3b2314, [0, 0.47, -0.1], [0, 0, 0], [0.5, 0.1, 0.54]);
    b.add(G.box, 0x3b2314, [0, 0.55, 0.15], [0, 0, 0], [0.42, 0.12, 0.08]);
    b.add(G.box, 0x3b2314, [0, 0.53, -0.35], [0, 0, 0], [0.3, 0.1, 0.08]);
    // singel
    b.add(G.box, 0x2c1a10, [0, -0.02, -0.42], [0, 0, 0], [0.7, 0.1, 0.1]);
    body.add(mesh(b));

    // --- hals ---
    const neck = new THREE.Group();
    neck.position.set(0, 0.18, -0.8);
    neck.rotation.x = -0.62;
    body.add(neck);
    this.neck = neck;
    const nb = new GeoBuilder();
    nb.add(G.cyl(0.19, 0.31, 1.02, 12), coat, [0, 0.42, 0], [0, 0, 0], [0.78, 1, 1.15]);
    const maneN = horse.mane === 'rainbow' ? 6 : 1;
    for (let i = 0; i < maneN; i++) {
      const h = 0.98 / maneN;
      const y = -0.05 + h * (i + 0.5);
      const col = maneColor(horse, maneN - 1 - i, maneN);
      nb.add(G.box, col, [0, y, 0.25 - y * 0.06], [0, 0, 0], [0.07, h, 0.1]);
      if (horse.longMane) nb.add(G.box, col, [0.12, y - 0.05, 0.17 - y * 0.05], [0, 0, -0.12], [0.05, h * 1.05, 0.2]);
    }
    neck.add(mesh(nb));

    // --- hoofd ---
    const head = new THREE.Group();
    head.position.set(0, 0.95, 0);
    head.rotation.x = -0.28;
    neck.add(head);
    this.head = head;
    const hb = new GeoBuilder();
    hb.add(G.box, coat, [0, 0, -0.12], [0, 0, 0], [0.27, 0.3, 0.38]);
    hb.add(G.box, coat, [0, -0.06, -0.08], [0, 0, 0], [0.31, 0.24, 0.22]);
    hb.add(G.box, coat, [0, -0.03, -0.42], [0, 0, 0], [0.22, 0.24, 0.32]);
    hb.add(G.box, horse.muzzle, [0, -0.045, -0.6], [0, 0, 0], [0.205, 0.2, 0.08]);
    hb.add(G.box, 0x1a1210, [0.06, -0.02, -0.645], [0, 0, 0], [0.04, 0.05, 0.02]);
    hb.add(G.box, 0x1a1210, [-0.06, -0.02, -0.645], [0, 0, 0], [0.04, 0.05, 0.02]);
    hb.add(G.sphere(0.036, 8, 6), 0x0d0a08, [0.135, 0.06, -0.12]);
    hb.add(G.sphere(0.036, 8, 6), 0x0d0a08, [-0.135, 0.06, -0.12]);
    hb.add(G.cone(0.055, 0.2, 6), coat, [0.085, 0.22, 0.03], [0.55, 0, -0.2]);
    hb.add(G.cone(0.055, 0.2, 6), coat, [-0.085, 0.22, 0.03], [0.55, 0, 0.2]);
    hb.add(G.box, maneColor(horse, 0, 1), [0, 0.165, -0.0], [0.2, 0, 0], [0.11, 0.06, 0.16]);
    if (horse.blaze) {
      hb.add(G.box, horse.blaze, [0, 0.152, -0.16], [0, 0, 0], [0.07, 0.01, 0.32]);
      hb.add(G.box, horse.blaze, [0, 0.093, -0.44], [0, 0, 0], [0.08, 0.01, 0.3]);
    }
    // hoofdstel
    hb.add(G.box, 0x2c1a10, [0, -0.03, -0.37], [0, 0, 0], [0.235, 0.26, 0.05]);
    hb.add(G.box, 0x2c1a10, [0, 0.11, 0.02], [0, 0, 0], [0.29, 0.035, 0.04]);
    hb.add(G.box, 0x2c1a10, [0.14, -0.02, -0.03], [0, 0, 0], [0.02, 0.3, 0.035]);
    hb.add(G.box, 0x2c1a10, [-0.14, -0.02, -0.03], [0, 0, 0], [0.02, 0.3, 0.035]);
    if (horse.horn) {
      hb.add(G.cone(0.05, 0.46, 8), 0xf7d774, [0, 0.36, -0.2], [0, 0, 0]);
      hb.add(G.cyl(0.056, 0.056, 0.03, 8), 0xffffff, [0, 0.22, -0.2], [0, 0, 0]);
      hb.add(G.cyl(0.042, 0.042, 0.03, 8), 0xffffff, [0, 0.34, -0.2], [0, 0, 0]);
    }
    head.add(mesh(hb));
    this.bit.position.set(0, -0.08, -0.5);
    head.add(this.bit);

    // --- staart ---
    const tail = new THREE.Group();
    tail.position.set(0, 0.26, 0.98);
    tail.rotation.x = -0.5;
    body.add(tail);
    this.tail = tail;
    const tb = new GeoBuilder();
    const tailN = horse.mane === 'rainbow' ? 6 : 1;
    for (let i = 0; i < tailN; i++) {
      const h = 1.0 / tailN;
      const r0 = 0.045 + 0.085 * (i / tailN);
      const r1 = 0.045 + 0.085 * ((i + 1) / tailN);
      tb.add(G.cyl(r0, r1, h, 8), maneColor(horse, i, tailN), [0, -h * (i + 0.5), 0], [0, 0, 0], [1, 1, 0.8]);
    }
    tail.add(mesh(tb));

    // --- benen ---
    this.legs = [];
    const legDefs = [
      { x: 0.19, y: -0.18, z: -0.64, front: true, off: 0.6 },
      { x: -0.19, y: -0.18, z: -0.64, front: true, off: 0.5 },
      { x: 0.19, y: -0.12, z: 0.6, front: false, off: 0.1 },
      { x: -0.19, y: -0.12, z: 0.6, front: false, off: 0.0 },
    ];
    for (const d of legDefs) {
      const upper = new THREE.Group();
      upper.position.set(d.x, d.y, d.z);
      body.add(upper);
      const ub = new GeoBuilder();
      const upperLen = d.front ? 0.58 : 0.62;
      if (d.front) ub.add(G.cyl(0.085, 0.13, upperLen, 8), coat, [0, -upperLen / 2, 0]);
      else ub.add(G.cyl(0.09, 0.17, upperLen, 8), coat, [0, -upperLen / 2 + 0.02, 0.02], [0, 0, 0], [1, 1, 1.15]);
      upper.add(mesh(ub));
      const lower = new THREE.Group();
      lower.position.set(0, -upperLen, 0);
      upper.add(lower);
      const lb = new GeoBuilder();
      lb.add(G.sphere(0.085, 8, 6), d.front ? coat : coat, [0, 0, 0]);
      lb.add(G.cyl(0.06, 0.066, 0.46, 8), horse.legs, [0, -0.24, 0]);
      lb.add(G.sphere(0.075, 8, 6), horse.legs, [0, -0.45, 0.01]);
      lb.add(G.cyl(0.078, 0.092, 0.11, 8), horse.hoof, [0, -0.53, 0]);
      if (horse.feathers) lb.add(G.cone(0.13, 0.24, 8), horse.mane, [0, -0.43, 0.02]);
      lower.add(mesh(lb));
      this.legs.push({ upper, lower, ...d });
    }

    // --- ruiter ---
    const riderG = new THREE.Group();
    riderG.position.set(0, 0.5, -0.12);
    body.add(riderG);
    this.rider = riderG;
    const rb = new GeoBuilder();
    rb.add(G.box, rider.breeches, [0, 0.13, 0.04], [0, 0, 0], [0.34, 0.18, 0.3]);
    for (const s of [1, -1]) {
      rb.limb([0.15 * s, 0.12, 0.02], [0.34 * s, -0.17, -0.27], 0.08, rider.breeches, 0.07);
      rb.limb([0.34 * s, -0.17, -0.27], [0.39 * s, -0.5, -0.18], 0.066, 0x161616, 0.06);
      rb.add(G.box, 0x161616, [0.39 * s, -0.54, -0.25], [0, 0, 0], [0.1, 0.07, 0.22]);
      rb.add(G.box, 0xc0c4c8, [0.39 * s, -0.585, -0.22], [0, 0, 0], [0.14, 0.025, 0.1]);
      rb.limb([0.32 * s, 0.0, -0.08], [0.39 * s, -0.56, -0.22], 0.012, 0x2c1a10);
    }
    riderG.add(mesh(rb));

    const torso = new THREE.Group();
    torso.position.set(0, 0.2, 0.05);
    torso.rotation.x = -0.75;
    riderG.add(torso);
    this.torso = torso;
    const ob = new GeoBuilder();
    ob.add(G.box, rider.jacket, [0, 0.29, 0], [0, 0, 0], [0.38, 0.58, 0.24]);
    if (rider.knight) {
      ob.add(G.box, rider.vest, [0, 0.27, 0], [0, 0, 0], [0.44, 0.46, 0.31]);
      ob.add(G.box, rider.cover, [0, 0.27, -0.16], [0, 0, 0], [0.28, 0.36, 0.02]);
      ob.add(G.box, 0xf2d34f, [0, 0.3, -0.172], [0, 0, 0], [0.06, 0.22, 0.01]);
      ob.add(G.box, 0xf2d34f, [0, 0.33, -0.172], [0, 0, 0], [0.18, 0.06, 0.01]);
      ob.add(G.sphere(0.13, 8, 6), rider.vest, [0.24, 0.5, 0], [0, 0, 0], [1, 0.7, 1]);
      ob.add(G.sphere(0.13, 8, 6), rider.vest, [-0.24, 0.5, 0], [0, 0, 0], [1, 0.7, 1]);
    } else {
      ob.add(G.box, rider.vest, [0, 0.26, 0], [0, 0, 0], [0.43, 0.42, 0.3]);
      ob.add(G.box, 0xffffff, [0, 0.27, -0.158], [0, 0, 0], [0.3, 0.3, 0.02]);
      ob.add(G.box, 0x1a1a1a, [0, 0.28, -0.17], [0, 0, 0], [0.15, 0.11, 0.01]);
      ob.add(G.box, 0xffffff, [0, 0.27, 0.158], [0, 0, 0], [0.3, 0.3, 0.02]);
      ob.add(G.box, 0x1a1a1a, [0, 0.28, 0.17], [0, 0, 0], [0.15, 0.11, 0.01]);
    }
    ob.add(G.cyl(0.06, 0.07, 0.12, 8), rider.skin, [0, 0.62, 0]);
    // armen naar de teugels
    for (const s of [1, -1]) {
      ob.limb([0.23 * s, 0.5, 0], [0.24 * s, 0.27, -0.27], 0.065, rider.jacket, 0.058);
      ob.limb([0.24 * s, 0.27, -0.27], [0.11 * s, 0.37, -0.6], 0.055, rider.jacket, 0.05);
      ob.add(G.sphere(0.055, 8, 6), 0x3a2a1e, [0.11 * s, 0.37, -0.63]);
    }
    torso.add(mesh(ob));
    this.handL.position.set(0.11, 0.37, -0.64);
    this.handR.position.set(-0.11, 0.37, -0.64);
    torso.add(this.handL, this.handR);

    const rhead = new THREE.Group();
    rhead.position.set(0, 0.66, 0);
    rhead.rotation.x = 0.6;
    torso.add(rhead);
    this.riderHead = rhead;
    const rh = new GeoBuilder();
    rh.add(G.sphere(0.125, 12, 10), rider.skin, [0, 0.12, 0]);
    rh.add(G.sphere(0.022, 6, 4), 0x1b1b1b, [0.045, 0.13, -0.118]);
    rh.add(G.sphere(0.022, 6, 4), 0x1b1b1b, [-0.045, 0.13, -0.118]);
    if (rider.knight) {
      rh.add(G.sphere(0.165, 12, 10), rider.helmet, [0, 0.14, 0]);
      rh.add(G.box, 0x222222, [0, 0.14, -0.155], [0, 0, 0], [0.2, 0.025, 0.04]);
      rh.add(G.box, rider.helmet, [0, 0.08, -0.15], [0, 0, 0], [0.04, 0.14, 0.04]);
      rh.add(G.cone(0.07, 0.34, 8), rider.cover, [0, 0.36, 0.06], [-0.5, 0, 0]);
    } else {
      rh.add(G.box, rider.hair, [0, 0.06, 0.1], [0, 0, 0], [0.22, 0.18, 0.1]);
      rh.add(G.cyl(0.045, 0.03, 0.22, 6), rider.hair, [0, -0.02, 0.17], [0.4, 0, 0]);
      rh.add(new THREE.SphereGeometry(0.158, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), rider.cover, [0, 0.15, 0]);
      rh.add(G.box, rider.helmet, [0, 0.165, -0.15], [0.15, 0, 0], [0.22, 0.025, 0.11]);
      rh.add(G.cyl(0.162, 0.162, 0.03, 14), rider.helmet, [0, 0.16, 0]);
      rh.add(G.sphere(0.05, 8, 6), shade(rider.cover, 1.25), [0, 0.32, 0]);
      rh.add(G.box, 0x222222, [0.11, 0.06, -0.03], [0, 0, 0.3], [0.015, 0.16, 0.02]);
      rh.add(G.box, 0x222222, [-0.11, 0.06, -0.03], [0, 0, -0.3], [0.015, 0.16, 0.02]);
    }
    rhead.add(mesh(rh));

    this.root.add(this.reins);
  }

  // Animatie. state: { phase, speed, y, vy, air, duck, crash, idle, lean, dt }
  update(st) {
    const a = this.anim;
    const dt = st.dt;
    a.t += dt;
    const ease = (cur, target, k) => cur + (target - cur) * (1 - Math.exp(-k * dt));
    a.air = ease(a.air, st.air ? 1 : 0, 14);
    a.duck = ease(a.duck, st.duck ? 1 : 0, 16);
    a.idle = ease(a.idle, st.idle ? 1 : 0, 6);
    const TAU = Math.PI * 2;
    const p = st.phase;
    const run = 1 - a.idle;
    const ground = 1 - a.air;

    // romp
    const bob = Math.sin(TAU * (p + 0.25)) * 0.07 * run * ground;
    const pitchRun = Math.sin(TAU * p) * 0.06 * run * ground;
    const pitchAir = THREE.MathUtils.clamp(st.vy * 0.028, -0.3, 0.35) * a.air;
    const breathe = Math.sin(a.t * 1.6) * 0.012 * a.idle;
    this.body.position.y = 1.38 + bob + breathe - a.duck * 0.06;
    this.body.rotation.x = pitchRun + pitchAir;
    this.body.rotation.z = THREE.MathUtils.clamp(-st.lean * 0.12, -0.15, 0.15);
    this.root.rotation.z = 0;

    // hals en hoofd
    const nod = Math.sin(TAU * (p + 0.1)) * 0.1 * run * ground;
    const idleHead = Math.sin(a.t * 0.7) * 0.06 * a.idle;
    this.neck.rotation.x = -0.62 + nod - a.duck * 0.42 + a.air * 0.12 + idleHead + a.idle * 0.12;
    this.head.rotation.x = -0.28 - nod * 0.5 + a.duck * 0.15;
    this.head.rotation.y = Math.sin(a.t * 0.5) * 0.15 * a.idle;

    // staart
    this.tail.rotation.x = -0.3 - 0.55 * run + Math.sin(TAU * p) * 0.12 * run + a.air * -0.2;
    this.tail.rotation.z = Math.sin(a.t * (a.idle > 0.5 ? 1.8 : 6)) * (0.08 + 0.12 * a.idle);

    // benen
    for (const leg of this.legs) {
      const lp = TAU * (p + leg.off);
      let up, low;
      if (leg.front) {
        up = 0.08 + Math.sin(lp) * 0.62;
        low = -Math.max(0, Math.cos(lp)) * 1.35;
      } else {
        up = -0.12 + Math.sin(lp) * 0.55;
        low = -Math.max(0, Math.cos(lp)) * 0.9 + 0.15;
      }
      up *= run;
      low *= run;
      // sprongpose
      const airUp = leg.front ? 1.05 : (st.vy > 0 ? -0.7 : 0.35);
      const airLow = leg.front ? -2.0 : (st.vy > 0 ? -0.15 : -1.1);
      up = up * ground + airUp * a.air;
      low = low * ground + airLow * a.air;
      // idle: gewicht verplaatsen
      if (a.idle > 0.01) {
        const shift = Math.sin(a.t * 0.9 + leg.off * 4) * 0.03 * a.idle;
        up += shift;
      }
      leg.upper.rotation.x = up;
      leg.lower.rotation.x = low;
    }

    // ruiter
    const riderBob = -bob * 0.6;
    this.rider.position.y = 0.5 + riderBob - a.duck * 0.05 + a.air * 0.06;
    this.torso.rotation.x = -0.75 - a.duck * 0.55 - a.air * 0.25 + a.idle * 0.55 + Math.sin(TAU * p) * 0.04 * run;
    this.riderHead.rotation.x = 0.6 + a.duck * 0.45 + a.air * 0.2 - a.idle * 0.5;
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
      this.neck.rotation.x = -0.25;
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

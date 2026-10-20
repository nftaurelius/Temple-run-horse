// Brutus de stier: de achtervolger die je probeert te pakken.

import * as THREE from './lib/three.module.min.js';
import { GeoBuilder, G, loft, shade } from './geo.js';

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });

function mesh(b) {
  const m = new THREE.Mesh(b.build(), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Bull {
  constructor() {
    this.root = new THREE.Group();
    this.t = 0;
    const coat = 0x3a2519;
    const dark = 0x22160f;
    const muzzleC = 0xc49a7c;
    const horn = 0xf1e6cc;

    const body = new THREE.Group();
    body.position.y = 1.05;
    this.root.add(body);
    this.body = body;
    const b = new GeoBuilder();
    b.add(loft([
      { p: [0, 0.1, 1.04], rx: 0.1, ry: 0.12 },
      { p: [0, 0.08, 0.92], rx: 0.33, ry: 0.36 },
      { p: [0, 0.04, 0.6], rx: 0.43, ry: 0.45 },
      { p: [0, 0.02, 0.2], rx: 0.47, ry: 0.5 },
      { p: [0, 0.08, -0.25], rx: 0.53, ry: 0.58 },
      { p: [0, 0.15, -0.62], rx: 0.5, ry: 0.6 },
      { p: [0, 0.1, -0.88], rx: 0.4, ry: 0.5 },
      { p: [0, 0.05, -1.02], rx: 0.2, ry: 0.28 },
    ], { radial: 18, color: coat }), coat);
    for (const s of [1, -1]) b.add(G.sphere(1, 12, 10), coat, [s * 0.2, -0.05, -0.6], [0, 0, 0], [0.3, 0.42, 0.4]);
    // kwastje van de staart begint hier
    body.add(mesh(b));

    // kop
    const head = new THREE.Group();
    head.position.set(0, 0.05, -1.0);
    body.add(head);
    this.head = head;
    const hb = new GeoBuilder();
    hb.add(loft([
      { p: [0, 0.12, 0.12], rx: 0.2, ry: 0.22, color: coat },
      { p: [0, 0.08, -0.08], rx: 0.25, ry: 0.27, color: coat },
      { p: [0, -0.06, -0.28], rx: 0.22, ry: 0.22, color: coat },
      { p: [0, -0.2, -0.44], rx: 0.2, ry: 0.17, color: muzzleC },
      { p: [0, -0.26, -0.52], rx: 0.17, ry: 0.13, color: muzzleC },
    ], { radial: 14 }), coat);
    // hoorns
    for (const s of [1, -1]) {
      hb.capsule([s * 0.2, 0.2, -0.06], [s * 0.42, 0.24, -0.06], 0.075, horn);
      hb.capsule([s * 0.42, 0.24, -0.06], [s * 0.55, 0.42, -0.14], 0.055, horn);
      hb.capsule([s * 0.55, 0.42, -0.14], [s * 0.56, 0.56, -0.24], 0.035, shade(horn, 0.8));
      // oren
      hb.add(G.cone(1, 1, 7), coat, [s * 0.3, 0.12, 0.02], [0, 0, s * 1.4], [0.06, 0.2, 0.04]);
      // ogen met boze wenkbrauwen
      hb.add(G.sphere(1, 8, 6), 0xffffff, [s * 0.2, 0.12, -0.17], [0, 0, 0], [0.05, 0.045, 0.04]);
      hb.add(G.sphere(1, 8, 6), 0x8a1010, [s * 0.215, 0.12, -0.2], [0, 0, 0], [0.025, 0.025, 0.02]);
      hb.add(G.box, dark, [s * 0.19, 0.19, -0.19], [0, 0, s * -0.45], [0.14, 0.03, 0.04]);
      // neusgaten
      hb.add(G.sphere(1, 7, 5), 0x3a2016, [s * 0.07, -0.25, -0.62], [0, 0, 0], [0.035, 0.03, 0.02]);
    }
    // kuif
    hb.add(G.sphere(1, 8, 6), dark, [0, 0.27, 0.0], [0, 0, 0], [0.16, 0.06, 0.12], { faceted: true });
    // neusring
    hb.add(new THREE.TorusGeometry(1, 0.16, 6, 14), 0xf2c94c, [0, -0.33, -0.6], [0.2, 0, 0], [0.08, 0.08, 0.08]);
    head.add(mesh(hb));
    this.nose = new THREE.Object3D();
    this.nose.position.set(0, -0.25, -0.66);
    head.add(this.nose);

    // staart
    const tail = new THREE.Group();
    tail.position.set(0, 0.12, 1.02);
    body.add(tail);
    this.tail = tail;
    const tb = new GeoBuilder();
    tb.limb([0, 0, 0], [0, -0.7, 0.05], 0.035, coat, 0.025, 6);
    tb.add(G.sphere(1, 8, 6), dark, [0, -0.78, 0.05], [0, 0, 0], [0.07, 0.14, 0.07], { faceted: true });
    tail.add(mesh(tb));

    // poten
    this.legs = [];
    const defs = [
      { x: 0.25, y: -0.32, z: -0.66, front: true, off: 0.6 },
      { x: -0.25, y: -0.32, z: -0.66, front: true, off: 0.5 },
      { x: 0.27, y: -0.25, z: 0.62, front: false, off: 0.1 },
      { x: -0.27, y: -0.25, z: 0.62, front: false, off: 0.0 },
    ];
    for (const d of defs) {
      const upper = new THREE.Group();
      upper.position.set(d.x, d.y, d.z);
      body.add(upper);
      const ub = new GeoBuilder();
      ub.limb([0, 0.05, 0], [0, -0.36, 0], 0.15, coat, 0.09, 10);
      upper.add(mesh(ub));
      const lower = new THREE.Group();
      lower.position.set(0, -0.36, 0);
      upper.add(lower);
      const lb = new GeoBuilder();
      lb.add(G.sphere(1, 8, 6), coat, [0, 0, 0], [0, 0, 0], [0.09, 0.09, 0.09]);
      lb.limb([0, 0, 0], [0, -0.3, 0], 0.08, coat, 0.07, 8);
      lb.add(G.cyl(0.07, 0.09, 0.1, 10), 0x1a1210, [0, -0.34, -0.01]);
      lower.add(mesh(lb));
      this.legs.push({ upper, lower, ...d });
    }
  }

  // phase: galopfase 0..1, charge: 0..1 hoe fel hij aanvalt
  update(dt, phase, charge = 1) {
    this.t += dt;
    const TAU = Math.PI * 2;
    const bob = Math.sin(TAU * (phase + 0.25)) * 0.09;
    this.body.position.y = 1.05 + bob;
    this.body.rotation.x = Math.sin(TAU * phase) * 0.08 - 0.05 * charge;
    this.head.rotation.x = -0.25 * charge + Math.sin(TAU * (phase + 0.1)) * 0.12;
    this.head.rotation.y = Math.sin(this.t * 3.1) * 0.12;
    this.tail.rotation.x = -0.6 - Math.sin(TAU * phase) * 0.3;
    this.tail.rotation.z = Math.sin(this.t * 7) * 0.3;
    for (const leg of this.legs) {
      const lp = TAU * (phase + leg.off);
      leg.upper.rotation.x = (leg.front ? 0.1 : -0.1) + Math.sin(lp) * 0.65;
      leg.lower.rotation.x = -Math.max(0, Math.cos(lp)) * (leg.front ? 1.2 : 0.8);
    }
  }
}

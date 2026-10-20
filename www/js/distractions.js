// Afleidingen die langs het scherm vliegen (zoals in Temple Run): vogels, een drone,
// vlinders, een plastic zak, bladeren en een heteluchtballon.

import * as THREE from './lib/three.module.min.js';
import { GeoBuilder, G } from './geo.js';

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
const bagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
const leafMats = [0xd98c2b, 0xc9632d, 0xe0b23a, 0x6aa648, 0x8a5a2b].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));

function built(b, m = mat) {
  return new THREE.Mesh(b.build(), m);
}

function makeBird(color) {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.add(G.sphere(1, 8, 6), color, [0, 0, 0], [0, 0, 0], [0.09, 0.08, 0.2]);
  b.add(G.sphere(1, 8, 6), color, [0, 0.03, -0.17], [0, 0, 0], [0.06, 0.06, 0.07]);
  b.add(G.cone(1, 1, 5), 0xf2b705, [0, 0.02, -0.25], [-Math.PI / 2, 0, 0], [0.02, 0.06, 0.02]);
  b.add(G.box, color, [0, 0.01, 0.2], [0, 0, 0], [0.12, 0.015, 0.12]);
  g.add(built(b));
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    const wb = new GeoBuilder();
    wb.add(G.box, color, [s * 0.18, 0, 0], [0, 0, 0], [0.36, 0.012, 0.16]);
    wb.add(G.box, color, [s * 0.4, 0, 0.03], [0, s * 0.25, 0], [0.16, 0.01, 0.1]);
    pivot.add(built(wb, wingMat));
    pivot.userData.side = s;
    g.add(pivot);
    (g.userData.wings ||= []).push(pivot);
  }
  return g;
}

function makeButterfly(color) {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.add(G.sphere(1, 6, 4), 0x222222, [0, 0, 0], [0, 0, 0], [0.012, 0.012, 0.05]);
  g.add(built(b));
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    const wb = new GeoBuilder();
    wb.add(G.sphere(1, 8, 4), color, [s * 0.05, 0, -0.02], [0, 0, 0], [0.05, 0.004, 0.045]);
    wb.add(G.sphere(1, 8, 4), color, [s * 0.04, 0, 0.035], [0, 0, 0], [0.035, 0.004, 0.03]);
    wb.add(G.sphere(1, 6, 4), 0xffffff, [s * 0.06, 0.003, -0.025], [0, 0, 0], [0.012, 0.003, 0.012]);
    pivot.add(built(wb, wingMat));
    pivot.userData.side = s;
    g.add(pivot);
    (g.userData.wings ||= []).push(pivot);
  }
  return g;
}

function makeDrone() {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  b.add(G.box, 0x2b2f36, [0, 0, 0], [0, 0, 0], [0.22, 0.08, 0.3]);
  b.add(G.box, 0xe8e8e8, [0, 0.045, 0], [0, 0, 0], [0.16, 0.02, 0.22]);
  for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
    b.limb([0, 0, 0], [x, 0.02, z], 0.015, 0x2b2f36);
    b.add(G.cyl(0.03, 0.03, 0.05, 8), 0x2b2f36, [x, 0.04, z]);
  }
  b.add(G.sphere(1, 8, 6), 0x111111, [0, -0.07, -0.12], [0, 0, 0], [0.05, 0.05, 0.05]);
  b.add(G.sphere(1, 6, 4), 0x4a90e2, [0, -0.07, -0.165], [0, 0, 0], [0.025, 0.025, 0.01]);
  g.add(built(b));
  g.userData.rotors = [];
  for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) {
    const rb = new GeoBuilder();
    rb.add(G.box, 0xdddddd, [0, 0, 0], [0, 0, 0], [0.26, 0.004, 0.03]);
    const rot = built(rb);
    rot.position.set(x, 0.07, z);
    g.add(rot);
    g.userData.rotors.push(rot);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  led.position.set(0, 0.02, 0.16);
  g.add(led);
  g.userData.led = led;
  return g;
}

function makeBag() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.25, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = 0.7 + Math.random() * 0.5;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 1.2, p.getZ(i) * f * 0.6);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, bagMat));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 10), bagMat);
  handle.position.y = 0.3;
  g.add(handle);
  return g;
}

function makeBalloon() {
  const g = new THREE.Group();
  const cols = [0xd6362e, 0xf2b705, 0x2f6fd6, 0xffffff, 0x3f8f3a, 0xff7a00];
  const env = new THREE.SphereGeometry(5, 16, 14);
  const colors = [];
  const p = env.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const band = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % cols.length;
    c.set(cols[band]);
    colors.push(c.r, c.g, c.b);
    if (p.getY(i) < 0) p.setY(i, p.getY(i) * 1.35);
  }
  env.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.computeVertexNormals();
  g.add(new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  const b = new GeoBuilder();
  b.add(G.cyl(0.9, 0.75, 0.9, 10), 0x8a6240, [0, -8.6, 0]);
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) b.limb([x, -8.2, z], [x * 2.2, -6.0, z * 2.2], 0.02, 0x333333);
  b.add(G.sphere(1, 8, 6), 0xffb347, [0, -7.6, 0], [0, 0, 0], [0.25, 0.3, 0.25]);
  g.add(built(b));
  return g;
}

export class Distractions {
  constructor(scene, camera, sound) {
    this.scene = scene;
    this.camera = camera;
    this.sound = sound;
    this.active = [];
    this.timer = 12;
    this.leafGeo = new THREE.PlaneGeometry(0.12, 0.08);
  }

  reset() {
    for (const a of this.active) a.obj.parent?.remove(a.obj);
    this.active = [];
    this.timer = 11;
  }

  // Grootte van het zichtbare beeld op afstand d voor de camera.
  view(d) {
    const v = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d;
    return { h: v, w: v * this.camera.aspect };
  }

  update(dt, ctx) {
    if (ctx.playing && ctx.meters > 120) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const pace = Math.max(0.45, 1 - ctx.meters / 4500);
        this.timer = (9 + Math.random() * 9) * pace;
        const types = ['birds', 'birds', 'drone', 'butterflies', 'bag', 'leaves', 'balloon'];
        this.spawn(types[Math.floor(Math.random() * types.length)], ctx);
      }
    }
    for (const a of this.active) {
      a.t += dt;
      a.update(dt, a);
    }
    this.active = this.active.filter((a) => {
      if (a.t < a.life) return true;
      a.obj.parent?.remove(a.obj);
      return false;
    });
  }

  addToCamera(obj) {
    this.camera.add(obj);
    return obj;
  }

  spawn(type, ctx) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (type === 'birds') {
      const flock = new THREE.Group();
      const d = 6 + Math.random() * 4;
      const v = this.view(d);
      const color = Math.random() < 0.3 ? 0xf4f4f4 : 0x2b2b30;
      const birds = [];
      for (let i = 0; i < 7 + Math.floor(Math.random() * 4); i++) {
        const bird = makeBird(color);
        bird.position.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2);
        bird.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        bird.userData.off = Math.random() * 6;
        flock.add(bird);
        birds.push(bird);
      }
      flock.position.set(-dir * (v.w + 3), v.h * 0.35, -d);
      this.addToCamera(flock);
      const speed = (2 * v.w + 6) / 2.6;
      this.sound.birds?.();
      this.active.push({
        obj: flock, t: 0, life: 2.8,
        update: (dt2, a) => {
          flock.position.x += dir * speed * dt2;
          flock.position.y += Math.sin(a.t * 2) * 0.02;
          for (const bird of birds) {
            const f = Math.sin(a.t * 18 + bird.userData.off);
            for (const w of bird.userData.wings) w.rotation.z = w.userData.side * f * 0.8;
          }
        },
      });
    } else if (type === 'drone') {
      const drone = makeDrone();
      drone.scale.setScalar(2.2);
      const d = 3.2;
      const v = this.view(d);
      drone.position.set(dir * (v.w + 1), v.h * 0.6, -d);
      this.addToCamera(drone);
      this.sound.drone?.(4);
      this.active.push({
        obj: drone, t: 0, life: 4.2,
        update: (dt2, a) => {
          const u = a.t / 4.2;
          drone.position.x = dir * (v.w + 1) * (1 - u * 2.2) + Math.sin(a.t * 2) * 0.2;
          drone.position.y = v.h * (0.6 - Math.sin(u * Math.PI) * 0.75);
          drone.position.z = -d - Math.sin(u * Math.PI) * 1.2;
          drone.rotation.z = -dir * 0.25 + Math.sin(a.t * 3) * 0.05;
          drone.rotation.y = Math.sin(a.t) * 0.3;
          for (const r of drone.userData.rotors) r.rotation.y += dt2 * 60;
          drone.userData.led.visible = Math.sin(a.t * 12) > 0;
        },
      });
    } else if (type === 'butterflies') {
      const group = new THREE.Group();
      const d = 2.6;
      const v = this.view(d);
      const flies = [];
      const cols = [0xff9f1c, 0x4cc9f0, 0xf28cc0, 0xffe14d, 0xffffff];
      for (let i = 0; i < 5; i++) {
        const bf = makeButterfly(cols[i % cols.length]);
        bf.position.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6);
        bf.userData.off = Math.random() * 6;
        bf.scale.setScalar(1.6);
        group.add(bf);
        flies.push(bf);
      }
      group.position.set(-dir * (v.w + 1), -v.h * 0.15, -d);
      this.addToCamera(group);
      this.active.push({
        obj: group, t: 0, life: 4.5,
        update: (dt2, a) => {
          group.position.x += dir * ((2 * v.w + 2) / 4.5) * dt2;
          for (const bf of flies) {
            bf.position.y += Math.sin(a.t * 4 + bf.userData.off) * dt2 * 0.6;
            bf.rotation.y = dir * -Math.PI / 2 + Math.sin(a.t * 3 + bf.userData.off) * 0.6;
            const f = Math.sin(a.t * 26 + bf.userData.off);
            for (const w of bf.userData.wings) w.rotation.z = w.userData.side * f * 1.1;
          }
        },
      });
    } else if (type === 'bag') {
      const bag = makeBag();
      const d = 3.4;
      const v = this.view(d);
      bag.position.set(-dir * (v.w + 0.8), -v.h * 0.1, -d);
      this.addToCamera(bag);
      this.sound.rustle?.();
      this.active.push({
        obj: bag, t: 0, life: 2.6,
        update: (dt2, a) => {
          bag.position.x += dir * ((2 * v.w + 1.6) / 2.6) * dt2;
          bag.position.y = -v.h * 0.1 + Math.sin(a.t * 3) * 0.5;
          bag.rotation.x += dt2 * 4;
          bag.rotation.z += dt2 * 3 * dir;
        },
      });
    } else if (type === 'leaves') {
      const group = new THREE.Group();
      const leaves = [];
      for (let i = 0; i < 34; i++) {
        const leaf = new THREE.Mesh(this.leafGeo, leafMats[i % leafMats.length]);
        const d = 2.5 + Math.random() * 5;
        const v = this.view(d);
        leaf.position.set(-dir * (v.w + Math.random() * 3), (Math.random() - 0.3) * v.h, -d);
        leaf.userData = { v: (2 * v.w + 4) / (1.5 + Math.random()), spin: Math.random() * 10, w: v.w };
        leaf.scale.setScalar(1 + Math.random());
        group.add(leaf);
        leaves.push(leaf);
      }
      this.addToCamera(group);
      this.sound.rustle?.();
      this.active.push({
        obj: group, t: 0, life: 3.4,
        update: (dt2, a) => {
          for (const leaf of leaves) {
            leaf.position.x += dir * leaf.userData.v * dt2;
            leaf.position.y += Math.sin(a.t * 5 + leaf.userData.spin) * dt2 * 0.8 - dt2 * 0.3;
            leaf.rotation.x += dt2 * 6;
            leaf.rotation.y += dt2 * leaf.userData.spin;
          }
        },
      });
    } else if (type === 'balloon') {
      // in de wereld: verschijnt voor je uit en drijft omhoog
      const balloon = makeBalloon();
      const fwd = new THREE.Vector3(-Math.sin(ctx.yaw), 0, -Math.cos(ctx.yaw));
      const right = new THREE.Vector3(Math.cos(ctx.yaw), 0, -Math.sin(ctx.yaw));
      balloon.position.copy(ctx.playerPos).addScaledVector(fwd, 70).addScaledVector(right, dir * (14 + Math.random() * 10)).setY(12);
      this.scene.add(balloon);
      this.sound.burner?.();
      this.active.push({
        obj: balloon, t: 0, life: 9,
        update: (dt2, a) => {
          balloon.position.y += dt2 * 1.6;
          balloon.position.addScaledVector(right, -dir * dt2 * 1.2);
          balloon.rotation.y += dt2 * 0.2;
          if (a.t > 2 && Math.random() < 0.01) this.sound.burner?.();
        },
      });
    }
  }
}

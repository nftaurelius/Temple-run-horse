// Lucht met zonnegloed, zachte wolken en heuvels aan de horizon. Beweegt mee met de camera.

import * as THREE from './lib/three.module.min.js';
import { cloudTexture } from './textures.js';
import { makeRng } from './geo.js';

export const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.45).normalize();
export const FOG_COLOR = 0xcfe4ec;

export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(0x2f78c8) },
          mid: { value: new THREE.Color(0x7cb8e8) },
          horizon: { value: new THREE.Color(FOG_COLOR) },
          sunDir: { value: SUN_DIR },
          sunCol: { value: new THREE.Color(0xfff1c8) },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 top, mid, horizon, sunDir, sunCol;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
            col = mix(col, top, smoothstep(0.22, 0.9, h));
            if (h < 0.0) col = horizon;
            float s = max(dot(d, sunDir), 0.0);
            col += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 5.0) * 0.08);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    dome.renderOrder = -10;
    this.group.add(dome);

    // wolken
    this.clouds = new THREE.Group();
    const texs = [cloudTexture(3), cloudTexture(8), cloudTexture(13)];
    const r = makeRng(21);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({ map: texs[i % 3], fog: false, depthWrite: false, transparent: true, opacity: 0.85 + r() * 0.15 });
      const sp = new THREE.Sprite(mat);
      const a = r() * Math.PI * 2;
      const el = 0.12 + r() * 0.35;
      const d = 380;
      sp.position.set(Math.cos(a) * d * Math.cos(el), Math.sin(el) * d, Math.sin(a) * d * Math.cos(el));
      const sc = 110 + r() * 90;
      sp.scale.set(sc, sc * 0.5, 1);
      sp.renderOrder = -9;
      this.clouds.add(sp);
    }
    this.group.add(this.clouds);

    // heuvels in lagen (verder weg = waziger)
    this.group.add(this.hills(330, 26, 60, 0x9fbfb0, 0xc2d8d6, 5));
    this.group.add(this.hills(270, 14, 34, 0x7da77a, 0xa9c8b2, 9));
    this.group.add(this.hills(215, 6, 18, 0x5f8f55, 0x8fb592, 17, true));
  }

  hills(radius, hMin, hMax, colBottom, colTop, seed, trees = false) {
    const r = makeRng(seed);
    const N = 160;
    const phases = [r() * 6, r() * 6, r() * 6, r() * 6];
    const pos = [];
    const col = [];
    const cb = new THREE.Color(colBottom);
    const ct = new THREE.Color(colTop);
    const height = (a) => {
      let h = Math.sin(a * 3 + phases[0]) * 0.35 + Math.sin(a * 7 + phases[1]) * 0.25 + Math.sin(a * 13 + phases[2]) * 0.15 + 0.5;
      if (trees) h += (Math.sin(a * 90 + phases[3]) * 0.5 + 0.5) * 0.12 + (Math.sin(a * 151) * 0.5 + 0.5) * 0.08;
      return hMin + (hMax - hMin) * Math.max(0, Math.min(1.2, h));
    };
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const h0 = height(a0), h1 = height(a1);
      const p = (a, y) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
      const quad = [p(a0, -30), p(a1, -30), p(a1, h1), p(a0, -30), p(a1, h1), p(a0, h0)];
      for (const v of quad) {
        pos.push(...v);
        const t = Math.max(0, v[1]) / hMax;
        const c = cb.clone().lerp(ct, t);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -8;
    return m;
  }

  update(dt, camera) {
    this.group.position.set(camera.position.x, 0, camera.position.z);
    this.clouds.rotation.y += dt * 0.003;
  }
}

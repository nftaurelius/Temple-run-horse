// Landschap: bomen, struiken, gras, bloemen, rotsen, publiek en tenten.

import * as THREE from './lib/three.module.min.js';
import { windUniforms } from './geo.js';

// Grasspriet: twee gekruiste, dubbelzijdige driehoeken (12 hoekpunten).
function bladeGeo() {
  const tris = [];
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const a = [-0.5 * ax, -0.5, -0.5 * az], b = [0.5 * ax, -0.5, 0.5 * az], c = [0, 0.5, 0];
    tris.push(a, b, c, b, a, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  // normalen iets omhoog laten wijzen zodat gras niet zwart wordt aan de achterkant
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i) * 0.5, z = n.getZ(i) * 0.5, y = 0.85;
    const l = Math.hypot(x, y, z);
    n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

// Gedeelde basisvormen (worden alleen als bron gebruikt, nooit direct getekend).
export const B = {
  box: new THREE.BoxGeometry(1, 1, 1),
  trunk: new THREE.CylinderGeometry(0.62, 1, 1, 6, 1, true),
  limb: new THREE.CylinderGeometry(0.85, 1, 1, 5, 1, true),
  ico0: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 7),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  blade: bladeGeo(),
  log: new THREE.CylinderGeometry(1, 1, 1, 14),
  log8: new THREE.CylinderGeometry(1, 1, 1, 8),
  rock: new THREE.DodecahedronGeometry(1, 0),
  rock1: new THREE.DodecahedronGeometry(1, 1),
  post: new THREE.CylinderGeometry(0.8, 1, 1, 6),
  sphere: new THREE.SphereGeometry(1, 10, 8),
  sphereLo: new THREE.SphereGeometry(1, 7, 5),
  halfSphere: new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  roof: new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4),
};

export const COL = {
  bark: 0x6b4a2b,
  barkDark: 0x4e3520,
  birch: 0xebe7dc,
  woodCut: 0xd9b88a,
  woodPale: 0xcfae80,
  leaf: [0x4f8a3a, 0x5d9a40, 0x467d34, 0x6aa648, 0x3f7230],
  leafLight: [0x8fbf5a, 0x9ccc62, 0x7fb04e],
  autumn: [0xd98c2b, 0xc9632d, 0xe0b23a],
  pine: [0x2f5e34, 0x376b3b, 0x2a5530],
  rock: [0x8b8a83, 0x9a978f, 0x7c7a73],
  straw: 0xe3c26b,
  hedge: 0x4f7a34,
  hedgeTop: 0x6b8f45,
  earth: 0x5a4130,
  white: 0xf4f4f0,
  red: 0xd6362e,
};

const FOLIAGE = (wind = 0.5) => ({ faceted: true, grad: [0.58, 1.14], attrs: { wind } });
const WOOD = { grad: [0.55, 1.0] };
const tipWind = (amount) => (x, y, z, bb) => ((y - bb.min.y) / Math.max(1e-5, bb.max.y - bb.min.y)) * amount;

// x/z zijn lokale coördinaten binnen het segment (x = zijwaarts, z = -afstand).
export function oak(b, x, z, sc, r, hi = true) {
  const leaf = r() < 0.06 ? COL.autumn[Math.floor(r() * 3)] : COL.leaf[Math.floor(r() * COL.leaf.length)];
  const crown = hi ? B.ico1 : B.ico0;
  b.add(B.trunk, COL.bark, [x, 1.3 * sc, z], [0, r() * 3, 0], [0.3 * sc, 2.6 * sc, 0.3 * sc], WOOD);
  if (hi) {
    b.between(B.limb, [x, 2.0 * sc, z], [x + 0.75 * sc, 2.9 * sc, z + 0.2 * sc], 0.1 * sc, COL.bark, WOOD);
    b.between(B.limb, [x, 2.2 * sc, z], [x - 0.6 * sc, 3.0 * sc, z - 0.3 * sc], 0.09 * sc, COL.bark, WOOD);
  }
  b.add(crown, leaf, [x, 3.35 * sc, z], [r(), r(), 0], [1.75 * sc, 1.45 * sc, 1.75 * sc], FOLIAGE(0.5));
  const a = r() * 6;
  const s = (1.0 + r() * 0.3) * sc;
  b.add(B.ico0, shiftLeaf(leaf, r), [x + Math.cos(a) * 1.05 * sc, (3.1 + r() * 0.5) * sc, z + Math.sin(a) * 1.05 * sc], [r(), r(), 0], [s, s * 0.85, s], FOLIAGE(0.55));
  if (hi) b.add(B.ico0, leaf, [x - Math.cos(a) * 0.5 * sc, 4.3 * sc, z - Math.sin(a) * 0.5 * sc], [r(), r(), 0], [1.05 * sc, 0.9 * sc, 1.05 * sc], FOLIAGE(0.65));
}

function shiftLeaf(c, r) {
  return COL.leaf[Math.floor(r() * COL.leaf.length)] ?? c;
}

export function pine(b, x, z, sc, r, hi = true) {
  const c = COL.pine[Math.floor(r() * 3)];
  b.add(B.trunk, COL.barkDark, [x, 0.7 * sc, z], [0, 0, 0], [0.2 * sc, 1.4 * sc, 0.2 * sc], WOOD);
  const tiers = hi ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = (1.55 - t * 1.15) * sc;
    b.add(B.cone, i % 2 ? c : 0x325f37, [x, (1.6 + i * 1.05) * sc, z], [0, r() * 3, 0], [w, 2.0 * sc, w], { faceted: true, grad: [0.5, 1.08], attrs: { wind: 0.25 + t * 0.2 } });
  }
}

export function birch(b, x, z, sc, r, hi = true) {
  b.add(B.trunk, COL.birch, [x, 1.6 * sc, z], [0, 0, 0], [0.16 * sc, 3.2 * sc, 0.16 * sc], WOOD);
  for (let i = 0; i < 5; i++) {
    b.add(B.box, 0x2a2622, [x, (0.5 + r() * 2.5) * sc, z], [0, r() * 3, 0], [0.33 * sc, 0.04 * sc, 0.12 * sc]);
  }
  const c = COL.leafLight[Math.floor(r() * 3)];
  for (let k = 0; k < (hi ? 3 : 2); k++) {
    const s = (0.8 + r() * 0.3) * sc;
    b.add(hi ? B.ico1 : B.ico0, c, [x + (r() - 0.5) * 0.9 * sc, (3.2 + k * 0.6) * sc, z + (r() - 0.5) * 0.9 * sc], [r(), r(), 0], [s, s * 1.15, s], FOLIAGE(0.7));
  }
}

export function bush(b, x, z, sc, r, flowers = false, hi = true) {
  const c = COL.leaf[Math.floor(r() * COL.leaf.length)];
  const n = 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const s = (0.55 + r() * 0.35) * sc;
    b.add(hi && k === 0 ? B.ico1 : B.ico0, c, [x + (r() - 0.5) * 0.8 * sc, s * 0.65, z + (r() - 0.5) * 0.8 * sc], [r(), r(), 0], [s, s * 0.8, s], FOLIAGE(0.25));
  }
  if (flowers) {
    const fc = [0xff6fa8, 0xffffff, 0xffd23f, 0xb08cff][Math.floor(r() * 4)];
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2;
      const rr = 0.45 * sc;
      b.add(B.ico0, fc, [x + Math.cos(a) * rr, (0.5 + r() * 0.4) * sc, z + Math.sin(a) * rr], [0, 0, 0], [0.07, 0.07, 0.07]);
    }
  }
}

export function tuft(b, x, z, r, tall = 1) {
  const greens = [0x5e9a3c, 0x6fae47, 0x4f8a34, 0x86bd56];
  const n = 3 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const h = (0.35 + r() * 0.4) * tall;
    const a = r() * Math.PI * 2;
    b.add(B.blade, greens[Math.floor(r() * greens.length)], [x + Math.cos(a) * 0.08, h / 2, z + Math.sin(a) * 0.08],
      [Math.cos(a) * 0.35 * r(), r() * 3, Math.sin(a) * 0.35 * r()], [0.07, h, 0.07],
      { grad: [0.5, 1.2], attrs: { wind: tipWind(1.4) } });
  }
}

export function flowers(b, x, z, r) {
  const cols = [0xfff3b0, 0xffd23f, 0xf28cc0, 0xffffff, 0xb08cff, 0xff7a5c];
  const col = cols[Math.floor(r() * cols.length)];
  for (let k = 0; k < 3; k++) {
    const fx = x + (r() - 0.5) * 0.6, fz = z + (r() - 0.5) * 0.6;
    const h = 0.18 + r() * 0.2;
    b.add(B.blade, 0x5e9a3c, [fx, h / 2, fz], [0, r() * 3, 0], [0.04, h, 0.04], { attrs: { wind: tipWind(0.8) } });
    b.add(B.ico0, col, [fx, h, fz], [0, 0, 0], [0.065, 0.045, 0.065], { attrs: { wind: 0.8 } });
  }
}

export function rock(b, x, z, sc, r) {
  const c = COL.rock[Math.floor(r() * 3)];
  b.add(B.rock, c, [x, 0.3 * sc, z], [r(), r(), r()], [0.7 * sc, 0.55 * sc, 0.65 * sc], { faceted: true, grad: [0.6, 1.1] });
  if (r() < 0.5) b.add(B.sphereLo, 0x6f9a48, [x, 0.62 * sc, z], [0, 0, 0], [0.45 * sc, 0.1 * sc, 0.4 * sc]);
}

export function stump(b, x, z, r) {
  b.add(B.log, COL.bark, [x, 0.25, z], [0, 0, 0], [0.32, 0.5, 0.32], WOOD);
  b.add(B.log, COL.woodCut, [x, 0.505, z], [0, 0, 0], [0.29, 0.01, 0.29]);
  if (r() < 0.5) b.add(B.sphereLo, 0xe8d9b5, [x + 0.2, 0.08, z + 0.25], [0, 0, 0], [0.08, 0.05, 0.08]);
}

export function fallenLog(b, x, z, r) {
  const len = 1.6 + r() * 1.4;
  const rot = r() * Math.PI;
  b.add(B.log, COL.bark, [x, 0.25, z], [0, rot, Math.PI / 2], [0.25, len, 0.25], WOOD);
}

// ---------- publiek ----------
const SHIRTS = [0xd6362e, 0x2f6fd6, 0xf2b705, 0x3f8f3a, 0xff7a00, 0x8a4fd8, 0xffffff, 0xf28cc0, 0x1d2b5e, 0x40c0c0];
const PANTS = [0x2d4a7a, 0x1f1f24, 0x8a7a5a, 0x3a3a44, 0x5a6f8a];
const SKIN = [0xf3cfae, 0xe0b08a, 0xc68b5e, 0x8d5a3b, 0x5e3a24];
const HAIR = [0x2a1a10, 0x5a3a22, 0xd9a95b, 0x8a4a2a, 0x111111, 0xbdbdbd];
const FLAGS = [[0xae1c28, 0xffffff, 0x21468b], [0x000000, 0xfdda24, 0xef3340], [0xff7a00, 0xff7a00, 0xff7a00], [0x3f8f3a, 0xffffff, 0x3f8f3a]];

// Eén toeschouwer. (x, z) lokaal; yaw = kijkrichting (naar het pad).
export function person(b, x, z, yaw, r) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const T = (lx, ly, lz) => [x + lx * cos + lz * sin, ly, z - lx * sin + lz * cos];
  const phase = r() * Math.PI * 2;
  const bounce = 0.08 + r() * 0.12;
  const base = { attrs: { phase, bounce, wave: 0 } };
  const waveA = { attrs: { phase, bounce, wave: 1 } };
  const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
  const pants = PANTS[Math.floor(r() * PANTS.length)];
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const h = 0.85 + r() * 0.25;
  const s = (v) => v * h;
  for (const side of [1, -1]) b.between(B.limb, T(0.09 * side, s(0.85), 0), T(0.1 * side, 0.03, 0.02), 0.065 * h, pants, base);
  b.between(B.trunk, T(0, s(0.8), 0), T(0, s(1.38), 0), 0.17 * h, shirt, base);
  b.add(B.ico0, shirt, T(0, s(1.38), 0), [0, 0, 0], [0.15 * h, 0.06, 0.13 * h], base);
  const armsUp = r() < 0.55;
  for (const side of [1, -1]) {
    if (armsUp) {
      const hand = T(0.3 * side, s(1.88), -0.06);
      b.between(B.limb, T(0.17 * side, s(1.33), 0), hand, 0.05 * h, shirt, waveA);
      b.add(B.ico0, skin, hand, [0, 0, 0], [0.05, 0.05, 0.05], waveA);
    } else {
      const hand = T(0.24 * side, s(0.92), -0.08);
      b.between(B.limb, T(0.19 * side, s(1.33), 0), hand, 0.05 * h, shirt, base);
      b.add(B.ico0, skin, hand, [0, 0, 0], [0.05, 0.05, 0.05], base);
    }
  }
  const head = T(0, s(1.38) + 0.17, 0);
  b.add(B.sphereLo, skin, head, [0, 0, 0], [0.12, 0.13, 0.12], base);
  const hatRoll = r();
  if (hatRoll < 0.3) {
    b.add(B.halfSphere, shirt === 0xffffff ? 0xd6362e : 0xffffff, [head[0], head[1] + 0.02, head[2]], [0, 0, 0], [0.13, 0.11, 0.13], base);
    b.add(B.box, 0xffffff, T(0, s(1.38) + 0.2, -0.13), [0, yaw, 0], [0.16, 0.015, 0.1], base);
  } else if (hatRoll < 0.4) {
    b.add(B.log8, 0x3a2a1a, [head[0], head[1] + 0.13, head[2]], [0, 0, 0], [0.2, 0.02, 0.2], base);
    b.add(B.log8, 0x3a2a1a, [head[0], head[1] + 0.2, head[2]], [0, 0, 0], [0.11, 0.14, 0.11], base);
  } else {
    b.add(B.halfSphere, hair, [head[0], head[1] + 0.01, head[2]], [0, 0, 0], [0.128, 0.12, 0.128], base);
  }
  // vlag of paraplu
  const extra = r();
  if (armsUp && extra < 0.3) {
    const hand = T(0.3, s(1.88), -0.06);
    const top = [hand[0], hand[1] + 0.6, hand[2]];
    b.between(B.limb, hand, top, 0.012, 0x7a5a38, waveA);
    const flag = FLAGS[Math.floor(r() * FLAGS.length)];
    for (let i = 0; i < 3; i++) {
      const p = T(0.3 + 0.2, s(1.88) + 0.5 - i * 0.1, -0.06);
      b.add(B.box, flag[i], p, [0, yaw, 0], [0.36, 0.1, 0.01], waveA);
    }
  } else if (!armsUp && extra < 0.15) {
    const col = SHIRTS[Math.floor(r() * SHIRTS.length)];
    const hand = T(0.24, s(0.92), -0.08);
    b.between(B.limb, hand, [hand[0], hand[1] + 1.25, hand[2]], 0.015, 0x333333, base);
    b.add(B.cone, col, [hand[0], hand[1] + 1.25, hand[2]], [0, r(), 0], [0.65, 0.3, 0.65], base);
  }
}

export function tent(b, x, z, yaw, r) {
  const c = [0xffffff, 0xd6362e, 0x2f6fd6, 0x3f8f3a][Math.floor(r() * 4)];
  b.add(B.box, 0xf6f4ee, [x, 1.1, z], [0, yaw, 0], [3.2, 2.2, 3.2], { grad: [0.8, 1.0] });
  b.add(B.roof, c, [x, 2.85, z], [0, yaw, 0], [2.35, 1.3, 2.35], { faceted: true });
  b.add(B.box, 0x3a2a1a, [x, 3.6, z], [0, 0, 0], [0.04, 0.5, 0.04]);
  b.add(B.box, c, [x + 0.18, 3.75, z], [0, yaw, 0], [0.32, 0.18, 0.01]);
}

// ---------- materialen ----------
export const crowdUniforms = { uCheer: { value: 0 } };

export function crowdMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uCheer = crowdUniforms.uCheer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float phase;\nattribute float bounce;\nattribute float wave;\nuniform float uTime;\nuniform float uCheer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float jump = max(0.0, sin(uTime * (5.0 + uCheer * 5.0) + phase));
        transformed.y += jump * bounce * (0.5 + uCheer * 1.2);
        transformed.x += sin(uTime * 9.0 + phase) * wave * 0.08 * (1.0 + uCheer);`);
  };
  m.customProgramCacheKey = () => 'crowd';
  return m;
}

// Gras met grootschalige kleurvariatie (op wereldpositie, zodat er geen herhaling opvalt).
export function grassMaterial(map) {
  const m = new THREE.MeshLambertMaterial({ map });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWXZ;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float nv = vnoise(vWXZ * 0.035) * 0.6 + vnoise(vWXZ * 0.11) * 0.4;
        diffuseColor.rgb *= mix(vec3(0.78, 0.84, 0.72), vec3(1.12, 1.1, 0.95), nv);`);
  };
  m.customProgramCacheKey = () => 'grass';
  return m;
}

// Opstijgende nevel bij een waterval.
const mistMaterialCache = {};
export function mistPoints(tex, count = 36, w = 4, d = 2) {
  if (!mistMaterialCache.m) {
    mistMaterialCache.m = new THREE.ShaderMaterial({
      uniforms: { uTime: windUniforms.uTime, uMap: { value: tex } },
      vertexShader: `
        attribute float seed;
        uniform float uTime;
        varying float vA;
        void main() {
          float t = fract(seed * 7.13 + uTime * 0.35);
          vec3 p = position;
          p.y += t * 3.0;
          p.x += sin(seed * 20.0 + uTime) * 0.4 * t;
          vA = (1.0 - t) * smoothstep(0.0, 0.15, t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (90.0 + t * 160.0) / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vA;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), t.a * vA * 0.55);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
  }
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * d;
    pos[i * 3 + 1] = Math.random() * 0.4;
    pos[i * 3 + 2] = (Math.random() - 0.5) * w;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, mistMaterialCache.m);
  pts.frustumCulled = false;
  return pts;
}

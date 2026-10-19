// Hulpjes om losse vormen met kleuren samen te voegen tot één geometrie (één draw call).

import * as THREE from './lib/three.module.min.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const flatCache = new WeakMap();
function flat(geo) {
  let g = flatCache.get(geo);
  if (!g) {
    g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    flatCache.set(geo, g);
  }
  return g;
}

export class GeoBuilder {
  constructor() {
    this.parts = [];
  }

  // pos/rot/scale als arrays; rot in radialen (Euler XYZ).
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    this.parts.push({ geo, color, matrix: _m.clone() });
    return this;
  }

  // Ledemaat van punt a naar punt b (cilinder met straal r).
  limb(a, b, r, color, rEnd = r, seg = 8) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(rEnd, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.parts.push({ geo, color, matrix: m });
    return this;
  }

  addMatrix(geo, color, matrix) {
    this.parts.push({ geo, color, matrix: matrix.clone() });
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build() {
    let count = 0;
    const prepared = this.parts.map((p) => {
      const g = flat(p.geo);
      count += g.attributes.position.count;
      return { g, color: p.color, matrix: p.matrix };
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    let o = 0;
    for (const { g, color, matrix } of prepared) {
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const n = P.count;
      nm.getNormalMatrix(matrix);
      _c.set(color); // ColorManagement zet sRGB-hex om naar lineair
      for (let i = 0; i < n; i++) {
        const k = (o + i) * 3;
        v.fromBufferAttribute(P, i).applyMatrix4(matrix);
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z;
        col[k] = _c.r; col[k + 1] = _c.g; col[k + 2] = _c.b;
      }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

// Veelgebruikte basisvormen (gedeeld, nooit direct gerenderd).
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg),
  sphere: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  cone: (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dodeca: (r) => new THREE.DodecahedronGeometry(r, 0),
};

// Seeded random zodat de wereld per seed hetzelfde blijft.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex, f) {
  _c.set(hex);
  if (f >= 1) _c.lerp(new THREE.Color(1, 1, 1), f - 1);
  else _c.multiplyScalar(f);
  return _c.getHex();
}

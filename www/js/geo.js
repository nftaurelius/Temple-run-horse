// Hulpjes om losse vormen met kleuren samen te voegen tot één geometrie (één draw call),
// plus "lofts": vloeiende organische vormen opgebouwd uit ellipsvormige ringen.

import * as THREE from './lib/three.module.min.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const flatCache = new WeakMap();
const facetCache = new WeakMap();
// faceted = harde randen (low-poly look), anders de gladde normalen van de bronvorm.
function flat(geo, faceted = false) {
  const cache = faceted ? facetCache : flatCache;
  let g = cache.get(geo);
  if (!g) {
    g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (faceted || !g.attributes.normal) g.computeVertexNormals();
    g.computeBoundingBox();
    cache.set(geo, g);
  }
  return g;
}

export class GeoBuilder {
  constructor() {
    this.parts = [];
  }

  // pos/rot/scale als arrays; rot in radialen (Euler XYZ).
  // opts.grad = [onder, boven]: kleurfactor van onder naar boven (nep-schaduw / ambient occlusion).
  // opts.attrs = { naam: waarde } extra per-vertex attributen (bijv. wind, fase).
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], opts = null) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    this.parts.push({ geo, color, matrix: _m.clone(), opts });
    return this;
  }

  // Ledemaat van punt a naar punt b (cilinder of capsule met straal r).
  limb(a, b, r, color, rEnd = r, seg = 8, opts = null) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(rEnd, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.parts.push({ geo, color, matrix: m, opts });
    return this;
  }

  // Ronde ledemaat (capsule) van a naar b.
  capsule(a, b, r, color, opts = null) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = Math.max(0.001, dir.length());
    const geo = capsuleGeo(r, len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.parts.push({ geo, color, matrix: m, opts });
    return this;
  }

  // Gedeelde eenheidsvorm (hoogte 1, langs Y) tussen punt a en b plaatsen met straal r.
  between(geo, a, b, r, color, opts = null) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = Math.max(0.001, dir.length());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    this.parts.push({ geo, color, matrix: m, opts });
    return this;
  }

  addMatrix(geo, color, matrix, opts = null) {
    this.parts.push({ geo, color, matrix: matrix.clone(), opts });
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(attrNames = []) {
    let count = 0;
    const prepared = this.parts.map((p) => {
      const g = flat(p.geo, p.opts?.faceted);
      count += g.attributes.position.count;
      return { g, color: p.color, matrix: p.matrix, opts: p.opts };
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const extra = attrNames.map(() => new Float32Array(count));
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    const c0 = new THREE.Color();
    let o = 0;
    for (const { g, color, matrix, opts } of prepared) {
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const C = g.attributes.color;
      const n = P.count;
      nm.getNormalMatrix(matrix);
      _c.set(color); // ColorManagement zet sRGB-hex om naar lineair
      const grad = opts?.grad;
      const bb = g.boundingBox;
      const h = bb ? Math.max(1e-5, bb.max.y - bb.min.y) : 1;
      for (let i = 0; i < n; i++) {
        const k = (o + i) * 3;
        let f = 1;
        if (grad) {
          const t = (P.getY(i) - bb.min.y) / h;
          f = grad[0] + (grad[1] - grad[0]) * t;
        }
        v.fromBufferAttribute(P, i).applyMatrix4(matrix);
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z;
        if (C) {
          c0.setRGB(C.getX(i), C.getY(i), C.getZ(i));
          col[k] = c0.r * f; col[k + 1] = c0.g * f; col[k + 2] = c0.b * f;
        } else {
          col[k] = _c.r * f; col[k + 1] = _c.g * f; col[k + 2] = _c.b * f;
        }
      }
      attrNames.forEach((name, ai) => {
        const val = opts?.attrs?.[name];
        if (val === undefined) return;
        const arr = extra[ai];
        if (typeof val === 'function') {
          for (let i = 0; i < n; i++) arr[o + i] = val(P.getX(i), P.getY(i), P.getZ(i), bb);
        } else arr.fill(val, o, o + n);
      });
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    attrNames.forEach((name, ai) => out.setAttribute(name, new THREE.BufferAttribute(extra[ai], 1)));
    out.computeBoundingSphere();
    return out;
  }
}

const capCache = new Map();
function capsuleGeo(r, len) {
  const key = r.toFixed(3) + ':' + len.toFixed(3);
  if (!capCache.has(key)) capCache.set(key, new THREE.CapsuleGeometry(r, len, 3, 8));
  return capCache.get(key);
}

// Loft: vloeiende buis door ringen. ring = { p: [x,y,z], rx, ry, color?, side? }
// rx ligt langs de X-as (breedte), ry staat loodrecht op de buisrichting en X.
// opts.radial = aantal hoekpunten per ring, opts.capStart/capEnd = uiteinden dichtmaken.
export function loft(rings, { radial = 14, capStart = true, capEnd = true, color = 0xffffff } = {}) {
  const pos = [];
  const cols = [];
  const idx = [];
  const side = new THREE.Vector3(1, 0, 0);
  const t = new THREE.Vector3();
  const u = new THREE.Vector3();
  const c = new THREE.Color();
  const pts = rings.map((r) => new THREE.Vector3(...r.p));
  rings.forEach((r, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    t.copy(next).sub(prev).normalize();
    u.crossVectors(side, t).normalize();
    c.set(r.color ?? color);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // lichte afplatting onder/boven via 'squash' (bijv. platte buik)
      const ry = sa < 0 ? r.ry * (r.belly ?? 1) : r.ry;
      pos.push(
        pts[i].x + side.x * ca * r.rx + u.x * sa * ry,
        pts[i].y + side.y * ca * r.rx + u.y * sa * ry,
        pts[i].z + side.z * ca * r.rx + u.z * sa * ry,
      );
      cols.push(c.r, c.g, c.b);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const cc = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const addCap = (ri, flip) => {
    const center = pts[ri];
    const ci = pos.length / 3;
    pos.push(center.x, center.y, center.z);
    c.set(rings[ri].color ?? color);
    cols.push(c.r, c.g, c.b);
    for (let j = 0; j < radial; j++) {
      const a = ri * radial + j;
      const b = ri * radial + ((j + 1) % radial);
      if (flip) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (capStart) addCap(0, false);
  if (capEnd) addCap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
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

// Wind-shader: laat bladeren en gras zachtjes bewegen (attribuut 'wind' = uitslag).
export const windUniforms = { uTime: { value: 0 } };
export function addWind(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wind;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (wind > 0.0) {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float w = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) + 0.5 * sin(uTime * 3.1 + wp.z * 0.6);
          transformed.x += w * wind * 0.08;
          transformed.z += cos(uTime * 1.3 + wp.x * 0.3) * wind * 0.05;
        }`);
  };
  material.customProgramCacheKey = () => 'wind';
  return material;
}

// Geometrie van hindernissen en power-ups (gecachet, gedeeld tussen segmenten).

import * as THREE from './lib/three.module.min.js';
import { LANE_WIDTH, TRACK_HALF } from './config.js';
import { GeoBuilder, makeRng } from './geo.js';
import { B, COL } from './scenery.js';

export const W = TRACK_HALF * 2 + 0.4; // breedte van hindernissen over het hele pad

const geoCache = new Map();
export function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

const WOOD = { grad: [0.72, 1.05] };
const LEAFY = { grad: [0.6, 1.12], faceted: true };

export function addFlags(b, x, h = 1.8) {
  // Cross-country: rode vlag rechts, witte vlag links.
  for (const s of [1, -1]) {
    b.add(B.post, COL.white, [s * x, h / 2, 0], [0, 0, 0], [0.045, h, 0.045]);
    b.add(B.box, s > 0 ? COL.red : COL.white, [s * (x + 0.26), h - 0.2, 0], [0, 0, 0], [0.48, 0.32, 0.02], { grad: [0.85, 1.0] });
    b.add(B.sphere, 0xf2c94c, [s * x, h + 0.03, 0], [0, 0, 0], [0.06, 0.06, 0.06]);
  }
}

// Boomstam langs de X-as, met lichte schijven aan de uiteinden.
export function addLogX(b, y, r, len, x = 0, z = 0, color = COL.bark) {
  b.add(B.log, color, [x, y, z], [0, 0, Math.PI / 2], [r, len, r], WOOD);
  for (const e of [1, -1]) {
    b.add(B.log, COL.woodCut, [x + e * len / 2, y, z], [0, 0, Math.PI / 2], [r * 0.93, 0.03, r * 0.93]);
    b.add(B.log, 0xb89466, [x + e * (len / 2 + 0.017), y, z], [0, 0, Math.PI / 2], [r * 0.55, 0.004, r * 0.55]);
    b.add(B.log, COL.woodCut, [x + e * (len / 2 + 0.019), y, z], [0, 0, Math.PI / 2], [r * 0.4, 0.004, r * 0.4]);
  }
  // schorsringen
  const rr = makeRng(Math.floor(len * 100 + r * 1000));
  for (let i = 0; i < Math.floor(len * 1.2); i++) {
    b.add(B.log, COL.barkDark, [x - len / 2 + rr() * len, y, z], [0, 0, Math.PI / 2], [r * 1.015, 0.05 + rr() * 0.08, r * 1.015]);
  }
}

export const OBST = {
  log: () => {
    const b = new GeoBuilder();
    addLogX(b, 0.46, 0.46, W);
    b.add(B.box, COL.barkDark, [W / 2 - 0.25, 0.12, 0], [0, 0, 0], [0.18, 0.24, 1.1], WOOD);
    b.add(B.box, COL.barkDark, [-W / 2 + 0.25, 0.12, 0], [0, 0, 0], [0.18, 0.24, 1.1], WOOD);
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  hedge: () => {
    const b = new GeoBuilder();
    b.add(B.box, 0x6e4f2e, [0, 0.2, 0], [0, 0, 0], [W, 0.4, 1.1], WOOD);
    b.add(B.box, COL.hedge, [0, 0.74, 0], [0, 0, 0], [W - 0.1, 0.75, 0.85], { grad: [0.6, 1.0] });
    const r = makeRng(9);
    for (let x = -W / 2 + 0.25; x < W / 2; x += 0.34) {
      for (const z of [-0.25, 0.2]) {
        b.add(B.ico1, r() < 0.5 ? COL.hedgeTop : COL.hedge, [x + (r() - 0.5) * 0.1, 1.08 + r() * 0.1, z], [r(), r(), 0], [0.24, 0.2, 0.26], LEAFY);
      }
    }
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  rails: () => {
    const b = new GeoBuilder();
    for (const x of [-W / 2, -W / 6, W / 6, W / 2]) b.add(B.log8, 0x9c7a50, [x, 0.72, 0], [0, 0, 0], [0.09, 1.44, 0.09], WOOD);
    for (const y of [0.55, 1.15]) b.add(B.log8, COL.woodPale, [0, y, 0], [0, 0, Math.PI / 2], [0.085, W + 0.15, 0.085], WOOD);
    b.add(B.log8, COL.woodPale, [0, 0.85, -0.05], [0, 0, Math.PI / 2], [0.075, W + 0.15, 0.075], WOOD);
    addFlags(b, W / 2 + 0.35);
    return b.build();
  },
  table: () => {
    const b = new GeoBuilder();
    b.add(B.box, 0x8a6a45, [0, 0.55, 0], [0, 0, 0], [W, 1.1, 1.7], WOOD);
    for (let z = -0.7; z <= 0.71; z += 0.35) b.add(B.box, 0xb08a5c, [0, 1.115, z], [0, 0, 0], [W + 0.04, 0.04, 0.3]);
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) b.add(B.box, 0x6e5234, [x, 0.55, 0.86], [0, 0, 0], [0.05, 1.0, 0.03]);
    addFlags(b, W / 2 + 0.3);
    return b.build();
  },
  branch: () => {
    const b = new GeoBuilder();
    const x = W / 2 + 0.3;
    const r = makeRng(4);
    for (const s of [1, -1]) {
      b.add(B.trunk, COL.bark, [s * x, 1.6, 0], [0, 0, 0], [0.34, 3.2, 0.34], WOOD);
      b.add(B.ico1, COL.leaf[1], [s * (x + 0.3), 3.6, 0], [0.3, 0.2, 0], [1.3, 1.0, 1.2], LEAFY);
    }
    addLogX(b, 2.6, 0.28, W + 1.0, 0, 0, COL.barkDark);
    for (let i = 0; i < 10; i++) {
      const px = -W / 2 + (i + 0.5) * (W / 10);
      b.add(B.ico1, COL.leaf[i % COL.leaf.length], [px, 3.0 + r() * 0.25, (r() - 0.5) * 0.4], [r(), r(), r()], [0.55, 0.42, 0.5], LEAFY);
    }
    // hangende ranken
    for (let i = 0; i < 9; i++) {
      const px = -W / 2 + 0.4 + r() * (W - 0.8);
      b.add(B.cone, COL.leaf[2], [px, 2.18, 0.05], [Math.PI, 0, 0], [0.09, 0.42, 0.09], LEAFY);
    }
    return b.build();
  },
  ditchBanks: () => {
    const b = new GeoBuilder();
    b.add(B.box, COL.earth, [0, 0.04, 1.3], [0, 0, 0], [W + 1, 0.1, 0.3]);
    b.add(B.box, COL.earth, [0, 0.04, -1.3], [0, 0, 0], [W + 1, 0.1, 0.3]);
    addLogX(b, 0.18, 0.18, W + 0.6, 0, 1.38);
    const r = makeRng(12);
    for (let i = 0; i < 14; i++) {
      const s = i < 7 ? 1 : -1;
      b.add(B.blade, 0x5f8f3a, [s * (W / 2 + 0.2 + r() * 0.6), 0.4, (r() - 0.5) * 2.2], [0, r() * 3, (r() - 0.5) * 0.3], [0.05, 0.8 + r() * 0.5, 0.05], { grad: [0.6, 1.15] });
    }
    addFlags(b, W / 2 + 0.6);
    return b.build();
  },
  trakehner: () => {
    const b = new GeoBuilder();
    b.add(B.box, COL.earth, [0, 0.04, 1.3], [0, 0, 0], [W + 1, 0.1, 0.3]);
    b.add(B.box, COL.earth, [0, 0.04, -1.3], [0, 0, 0], [W + 1, 0.1, 0.3]);
    for (const s of [1, -1]) b.add(B.log8, 0x7a5a38, [s * (W / 2 + 0.1), 0.7, 0], [0, 0, 0], [0.12, 1.4, 0.12], WOOD);
    addLogX(b, 0.95, 0.3, W + 0.4);
    addFlags(b, W / 2 + 0.5);
    return b.build();
  },
  haybale: () => {
    const b = new GeoBuilder();
    const len = LANE_WIDTH - 0.35;
    b.add(B.log, COL.straw, [0, 0.62, 0], [0, 0, Math.PI / 2], [0.62, len, 0.62], { grad: [0.75, 1.08] });
    for (const e of [1, -1]) {
      b.add(B.log, 0xc9a24a, [e * (len / 2 + 0.01), 0.62, 0], [0, 0, Math.PI / 2], [0.55, 0.02, 0.55]);
      b.add(B.log, 0xb38a3a, [e * (len / 2 + 0.02), 0.62, 0], [0, 0, Math.PI / 2], [0.3, 0.01, 0.3]);
    }
    for (const x of [-0.35, 0.35]) b.add(B.log, 0xb38a3a, [x, 0.62, 0], [0, 0, Math.PI / 2], [0.63, 0.04, 0.63]);
    return b.build();
  },
  laneLog: () => {
    const b = new GeoBuilder();
    addLogX(b, 0.42, 0.42, LANE_WIDTH - 0.3);
    return b.build();
  },
  tree: () => {
    const b = new GeoBuilder();
    b.add(B.trunk, COL.bark, [0, 1.6, 0], [0, 0, 0], [0.42, 3.2, 0.42], WOOD);
    b.add(B.ico1, COL.leaf[0], [0, 4.0, 0], [0.2, 0.4, 0], [1.7, 1.5, 1.7], LEAFY);
    b.add(B.ico1, COL.leaf[3], [0.6, 4.8, 0.2], [0.5, 0.1, 0.3], [1.1, 1.0, 1.1], LEAFY);
    b.add(B.ico1, COL.leaf[1], [-0.7, 4.3, -0.3], [0.5, 0.1, 0.3], [1.0, 0.9, 1.0], LEAFY);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + 0.4;
      b.add(B.cone6, COL.bark, [Math.cos(a) * 0.35, 0.15, Math.sin(a) * 0.35], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], [0.14, 0.5, 0.14], WOOD);
    }
    return b.build();
  },
  rock: () => {
    const b = new GeoBuilder();
    b.add(B.rock, COL.rock[0], [0, 0.7, 0], [0.3, 0.5, 0.1], [0.95, 0.85, 0.85], { faceted: true, grad: [0.65, 1.1] });
    b.add(B.rock, COL.rock[1], [0.45, 0.35, 0.3], [0.1, 0.2, 0.5], [0.45, 0.4, 0.45], { faceted: true, grad: [0.65, 1.1] });
    b.add(B.sphere, 0x6f9a48, [0.05, 1.32, 0.05], [0, 0, 0], [0.55, 0.14, 0.5]);
    return b.build();
  },
  waterRim: (len) => {
    const b = new GeoBuilder();
    const r = makeRng(Math.floor(len * 10));
    const rock = { faceted: true, grad: [0.7, 1.1] };
    for (const z of [len / 2, -len / 2]) {
      for (let x = -W / 2 - 1.2; x <= W / 2 + 1.2; x += 0.7) {
        b.add(B.rock, COL.rock[Math.floor(r() * 3)], [x, 0.06, z + (r() - 0.5) * 0.3], [r(), r(), r()], [0.36, 0.14, 0.3], rock);
      }
    }
    for (let z = -len / 2; z <= len / 2; z += 1.2) {
      for (const s of [1, -1]) {
        b.add(B.rock, COL.rock[Math.floor(r() * 3)], [s * (W / 2 + 1.5), 0.08, z], [r(), r(), r()], [0.4, 0.16, 0.45], rock);
        if (r() < 0.6) b.add(B.blade, 0x5f8f3a, [s * (W / 2 + 1.9 + r()), 0.45, z], [0, r() * 3, 0], [0.05, 0.9, 0.05], { grad: [0.6, 1.15] });
      }
    }
    return b.build();
  },
};

// ---------- power-ups ----------
export function powerupGeo(type) {
  return cached('pu-' + type, () => {
    const b = new GeoBuilder();
    if (type === 'magnet') {
      const tor = new THREE.TorusGeometry(0.34, 0.11, 8, 18, Math.PI);
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

// Nummerbord voor een hindernis (zoals op een echt cross-country parcours).
const numberMats = new Map();
export function numberMaterial(n) {
  if (numberMats.has(n)) return numberMats.get(n);
  if (numberMats.size > 60) {
    const [k, m] = numberMats.entries().next().value;
    m.map.dispose();
    m.dispose();
    numberMats.delete(k);
  }
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 96, 96);
  g.strokeStyle = '#1d4fa0';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 88, 88);
  g.fillStyle = '#1d4fa0';
  g.font = `bold ${n > 99 ? 40 : 54}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 48, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshLambertMaterial({ map: t });
  numberMats.set(n, m);
  return m;
}

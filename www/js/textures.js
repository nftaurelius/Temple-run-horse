// Procedurele textures getekend op een canvas, zodat er geen afbeeldingen nodig zijn.

import * as THREE from './lib/three.module.min.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Naadloze value-noise (wikkelt om bij de randen) met meerdere octaven.
function makeNoise(seed, period) {
  const r = rng(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x, y) => grid[((y % period + period) % period) * period + ((x % period + period) % period)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fbm(noises, x, y, w, h) {
  let v = 0, amp = 0.5, tot = 0;
  for (const n of noises) {
    v += n.fn((x / w) * n.p, (y / h) * n.p) * amp;
    tot += amp;
    amp *= 0.5;
  }
  return v / tot;
}

function octaves(seed, base, count) {
  return Array.from({ length: count }, (_, i) => ({ fn: makeNoise(seed + i * 17, base << i), p: base << i }));
}

export function grassTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const n = octaves(7, 4, 5);
  const dark = [72, 128, 46];
  const light = [128, 178, 72];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(n, x, y, S, S);
      const t = Math.min(1, Math.max(0, (v - 0.3) * 2.2));
      const i = (y * S + x) * 4;
      img.data[i] = dark[0] + (light[0] - dark[0]) * t;
      img.data[i + 1] = dark[1] + (light[1] - dark[1]) * t;
      img.data[i + 2] = dark[2] + (light[2] - dark[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const r = rng(9);
  // grassprieten
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S;
    const l = 3 + r() * 6;
    const shade = r();
    g.strokeStyle = shade < 0.5 ? `rgba(60,110,40,${0.35 + r() * 0.3})` : `rgba(160,205,100,${0.3 + r() * 0.3})`;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - l);
    g.stroke();
  }
  // klavertjes en bloemetjes
  const flowers = ['#fff7d6', '#ffd23f', '#f2a7d0', '#ffffff', '#c9b6ff'];
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = flowers[Math.floor(r() * flowers.length)];
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + Math.cos(k * 1.57) * 1.6, y + Math.sin(k * 1.57) * 1.6, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f2c94c';
    g.beginPath();
    g.arc(x, y, 0.9, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

// Zandpad met hoefsporen, kiezels en grasranden. Geeft { map, bump } terug.
export function trackTexture() {
  const W = 256, H = 1024;
  const [c, g] = canvas(W, H);
  const [bc, bg] = canvas(W, H);
  const img = g.createImageData(W, H);
  const bimg = bg.createImageData(W, H);
  const n = octaves(11, 4, 5);
  const edgeN = octaves(31, 8, 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fbm(n, x, y, W * 4, H);
      const u = x / W;
      // uitgesleten sporen in het midden van elke baan
      let rut = 0;
      for (const lane of [0.2, 0.5, 0.8]) rut += Math.exp(-((u - lane) ** 2) / 0.004);
      const e = fbm(edgeN, x, y, W * 2, H);
      const edgeDist = Math.min(u, 1 - u) + (e - 0.5) * 0.06;
      const grass = edgeDist < 0.05 ? 1 : edgeDist < 0.075 ? (0.075 - edgeDist) / 0.025 : 0;
      let rr = 196 - 30 * rut + (v - 0.5) * 60;
      let gg = 156 - 26 * rut + (v - 0.5) * 50;
      let bb = 104 - 20 * rut + (v - 0.5) * 40;
      rr = rr * (1 - grass) + (92 + v * 30) * grass;
      gg = gg * (1 - grass) + (142 + v * 30) * grass;
      bb = bb * (1 - grass) + (58 + v * 20) * grass;
      const i = (y * W + x) * 4;
      img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
      const h = 128 + (v - 0.5) * 90 - rut * 30 + grass * 40;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h; bimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  const r = rng(12);
  // hoefafdrukken
  for (let i = 0; i < 150; i++) {
    const lane = [0.2, 0.5, 0.8][Math.floor(r() * 3)];
    const x = lane * W + (r() - 0.5) * 34, y = r() * H;
    const rot = (r() - 0.5) * 1.2 + (r() < 0.5 ? Math.PI : 0);
    for (const [ctx, col] of [[g, 'rgba(110,74,42,0.28)'], [bg, 'rgba(40,40,40,0.4)']]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 3, Math.PI * 0.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.restore();
    }
  }
  // kiezels
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H;
    const s = 0.8 + r() * 2;
    const t = 150 + r() * 80;
    g.fillStyle = `rgba(${t},${t - 12},${t - 30},0.8)`;
    g.beginPath();
    g.ellipse(x, y, s, s * 0.8, r() * 3, 0, Math.PI * 2);
    g.fill();
    bg.fillStyle = 'rgba(230,230,230,0.8)';
    bg.beginPath();
    bg.ellipse(x, y, s, s * 0.8, 0, 0, Math.PI * 2);
    bg.fill();
  }
  // grasplukjes op de rand
  for (let i = 0; i < 700; i++) {
    const side = r() < 0.5 ? r() * 0.08 : 1 - r() * 0.08;
    const x = side * W, y = r() * H;
    g.strokeStyle = r() < 0.5 ? 'rgba(70,120,44,0.8)' : 'rgba(130,180,80,0.7)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6);
    g.stroke();
  }
  return { map: finish(c), bump: finish(bc, { srgb: false }) };
}

// Normal map met golfjes voor water (naadloos).
export function waterNormalTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const n = octaves(5, 8, 3);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      h[y * S + x] = Math.sin(u * 3 + v * 2) * 0.35 + Math.sin(u * 5 - v * 4) * 0.25 + Math.sin(v * 7 + u) * 0.15 + fbm(n, x, y, S, S) * 0.9;
    }
  }
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { srgb: false });
}

export function waterfallTexture() {
  const [c, g] = canvas(128, 256);
  const r = rng(5);
  g.fillStyle = 'rgba(190,230,250,0.85)';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 180; i++) {
    const x = r() * 128;
    const y = r() * 256;
    const l = 30 + r() * 90;
    g.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(120,190,230,0.7)';
    g.lineWidth = 1 + r() * 3;
    for (const oy of [0, -256]) {
      g.beginPath();
      g.moveTo(x, y + oy);
      g.lineTo(x, y + oy + l);
      g.stroke();
    }
  }
  return finish(c);
}

export function coinFaceTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(50, 45, 8, 64, 64, 64);
  grad.addColorStop(0, '#fff3a8');
  grad.addColorStop(0.6, '#f5c431');
  grad.addColorStop(1, '#c98a12');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b07810';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#a86e0c';
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(64, 60, 26, Math.PI * 0.85, Math.PI * 2.15);
  g.stroke();
  g.strokeStyle = '#ffe680';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 60, 26, Math.PI * 0.85, Math.PI * 2.15);
  g.stroke();
  g.fillStyle = '#a86e0c';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.95 + i * 0.22);
    g.beginPath();
    g.arc(64 + Math.cos(a) * 26, 60 + Math.sin(a) * 26, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c, { repeat: false });
}

export function dotTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(c, { repeat: false });
}

export function shadowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(c, { repeat: false, srgb: false });
}

// Zachte wolk van overlappende bolletjes.
export function cloudTexture(seed = 1) {
  const [c, g] = canvas(256, 128);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * 176;
    const y = 50 + r() * 40 - Math.sin(((x - 40) / 176) * Math.PI) * 18;
    const rad = 16 + r() * 26 * Math.sin(((x - 40) / 176) * Math.PI + 0.2);
    const grad = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.65, 'rgba(250,252,255,0.75)');
    grad.addColorStop(1, 'rgba(235,242,250,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // lichte schaduw aan de onderkant
  const sh = g.createLinearGradient(0, 70, 0, 128);
  sh.addColorStop(0, 'rgba(180,195,215,0)');
  sh.addColorStop(1, 'rgba(180,195,215,0.35)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, 256, 128);
  return finish(c, { repeat: false });
}

// Modderpoel met natte glans en onregelmatige rand (transparant).
export function mudTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const n = octaves(21, 4, 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(n, x, y, S, S);
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
      const d = Math.hypot(dx * 1.05, dy) + (v - 0.5) * 0.5;
      const a = d < 0.78 ? 1 : d < 0.92 ? (0.92 - d) / 0.14 : 0;
      const wet = v > 0.55 ? 1 : 0;
      const i = (y * S + x) * 4;
      img.data[i] = 92 - wet * 30 + v * 30;
      img.data[i + 1] = 64 - wet * 22 + v * 20;
      img.data[i + 2] = 40 - wet * 14 + v * 12;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, { repeat: false });
}

export function bannerTexture(text, bg = '#d6362e', fg = '#ffffff') {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = -128; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 128);
    g.lineTo(x + 32, 128);
    g.lineTo(x + 96, 0);
    g.lineTo(x + 64, 0);
    g.fill();
  }
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = 'bold 72px "Lilita One", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return finish(c, { repeat: false });
}

// Bord met tekst, of met pijlen als text 'L', 'R' of 'T' is.
export function signTexture(text, bg = '#ffd23f', fg = '#2a1d0e') {
  const [c, g] = canvas(256, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 118);
  g.fillStyle = fg;
  const chevron = (x, dir) => {
    g.beginPath();
    g.moveTo(x + 22 * dir, 64);
    g.lineTo(x - 18 * dir, 26);
    g.lineTo(x - 18 * dir, 46);
    g.lineTo(x - 2 * dir, 64);
    g.lineTo(x - 18 * dir, 82);
    g.lineTo(x - 18 * dir, 102);
    g.closePath();
    g.fill();
  };
  if (text === 'L') [70, 128, 186].forEach((x) => chevron(x, -1));
  else if (text === 'R') [70, 128, 186].forEach((x) => chevron(x, 1));
  else if (text === 'T') {
    chevron(56, -1);
    chevron(100, -1);
    chevron(156, 1);
    chevron(200, 1);
  } else {
    g.font = 'bold 76px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 68);
  }
  return finish(c, { repeat: false });
}

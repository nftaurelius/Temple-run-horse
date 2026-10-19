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

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function grassTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(7);
  g.fillStyle = '#6fa64a';
  g.fillRect(0, 0, 256, 256);
  // zachte vlekken
  for (let i = 0; i < 60; i++) {
    const x = r() * 256, y = r() * 256, rad = 12 + r() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() < 0.5 ? 'rgba(92,150,58,0.5)' : 'rgba(130,180,80,0.45)';
    grad.addColorStop(0, tone);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      g.beginPath();
      g.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  // grassprieten
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256, y = r() * 256;
    const l = 2 + r() * 4;
    const shade = 60 + Math.floor(r() * 70);
    g.strokeStyle = `rgba(${shade - 20},${shade + 80},${shade - 30},0.7)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 2, y - l);
    g.stroke();
  }
  // bloemetjes
  const flowers = ['#fff7d6', '#ffd23f', '#f2a7d0', '#ffffff'];
  for (let i = 0; i < 40; i++) {
    g.fillStyle = flowers[Math.floor(r() * flowers.length)];
    g.beginPath();
    g.arc(r() * 256, r() * 256, 1 + r() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

export function trackTexture() {
  const [c, g] = canvas(256, 512);
  const r = rng(11);
  g.fillStyle = '#c49a62';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(r() * 60) - 30;
    g.fillStyle = `rgba(${150 + v},${110 + v},${70 + v},0.5)`;
    g.fillRect(r() * 256, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  // uitgesleten hoefpaden per baan
  for (const lane of [0.2, 0.5, 0.8]) {
    for (let i = 0; i < 70; i++) {
      const x = lane * 256 + (r() - 0.5) * 40;
      const y = r() * 512;
      g.fillStyle = 'rgba(120,82,48,0.35)';
      g.beginPath();
      g.ellipse(x, y, 5 + r() * 4, 4 + r() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // grasranden
  const edge = g.createLinearGradient(0, 0, 256, 0);
  edge.addColorStop(0, 'rgba(98,150,64,1)');
  edge.addColorStop(0.07, 'rgba(98,150,64,0.0)');
  edge.addColorStop(0.93, 'rgba(98,150,64,0.0)');
  edge.addColorStop(1, 'rgba(98,150,64,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 512);
  return finish(c);
}

export function waterTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f8fbf');
  grad.addColorStop(1, '#3aa3cf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(220,245,255,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const x = r() * 256, y = r() * 256, w = 10 + r() * 26;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 3, x + w, y);
    g.stroke();
  }
  return finish(c);
}

export function waterfallTexture() {
  const [c, g] = canvas(128, 256);
  const r = rng(5);
  g.fillStyle = 'rgba(190,230,250,0.85)';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 160; i++) {
    const x = r() * 128;
    const y = r() * 256;
    const l = 30 + r() * 90;
    g.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(120,190,230,0.7)';
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y + l);
    g.stroke();
    // naadloos herhalen
    g.beginPath();
    g.moveTo(x, y - 256);
    g.lineTo(x, y - 256 + l);
    g.stroke();
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
  // hoefijzer
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

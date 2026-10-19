// Opstarten: spel, besturing, geluid en offline-ondersteuning.

import { Game } from './game.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { getSave } from './save.js';

const s = getSave();
const sound = new Sound();
sound.sfxOn = s.settings.sound;
sound.musicOn = s.settings.music;

const ui = new UI(document.getElementById('ui'));
let game;
try {
  game = new Game(document.getElementById('game'), ui, sound);
} catch (err) {
  document.querySelector('#loading .loader').replaceWith(Object.assign(document.createElement('p'), {
    className: 'install-hint',
    textContent: 'Dit apparaat ondersteunt geen 3D (WebGL). Probeer een andere browser.',
  }));
  throw err;
}
ui.attach(game, sound);

const input = new Input(document.body);
input.on((a) => game.input(a));

// Audio mag op iOS pas starten na een aanraking.
const unlock = () => {
  sound.unlock();
  if (sound.musicOn && sound.ctx) sound.startMusic();
};
for (const ev of ['touchend', 'mousedown', 'keydown']) window.addEventListener(ev, unlock, { passive: true });

requestAnimationFrame(() => requestAnimationFrame(() => ui.showMenu()));

// Dubbeltik-zoom en knijp-zoom op iOS voorkomen.
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('button')) e.preventDefault();
  lastTouch = now;
}, { passive: false });

// Offline spelen via een service worker (alleen op https, niet in een iframe).
let framed = false;
try { framed = window.self !== window.top; } catch { framed = true; }
if ('serviceWorker' in navigator && location.protocol === 'https:' && !framed) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.__galop = { game, ui, sound };

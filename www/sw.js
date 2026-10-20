// Service worker: bewaart het spel zodat het ook zonder internet werkt.
const CACHE = 'galop-v3';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './fonts/lilita-one.woff2',
  './fonts/nunito.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/lib/three.module.min.js',
  './js/main.js',
  './js/game.js',
  './js/world.js',
  './js/obstacles.js',
  './js/scenery.js',
  './js/sky.js',
  './js/bull.js',
  './js/distractions.js',
  './js/missions.js',
  './js/horse.js',
  './js/geo.js',
  './js/textures.js',
  './js/effects.js',
  './js/ui.js',
  './js/audio.js',
  './js/input.js',
  './js/save.js',
  './js/config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eerst het netwerk proberen (zodat updates direct binnenkomen), anders uit de cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

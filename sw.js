// Offline support. The app itself is cached when installed; each instrument's sounds are cached the first
// time you use them. When you upload a new version, change VERSION so phones pick up the new files.
const VERSION = 'v3';
const APP = 'chords-app-' + VERSION;
const SOUNDS = 'chords-sounds-v1';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'chords.js', 'samples.js', 'piano.js', 'pianoview.js', 'app.js', 'video.js', 'mp4-muxer.js', 'mp4rec.js', 'recorder.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== APP && k !== SOUNDS).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isSound = new URL(req.url).pathname.includes('/sounds/');
  if (isSound) {
    // sounds never change: cache first
    e.respondWith(caches.open(SOUNDS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // app files: use the network when online (so updates show up), the cache when offline
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});

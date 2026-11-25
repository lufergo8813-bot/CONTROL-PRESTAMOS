// Service worker: permite abrir la app sin conexión. Cambie VERSION en cada publicación para forzar la actualización.
const VERSION = 'prestamos-v1.1.0';
const APP = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/calc.js', 'js/store.js', 'js/pdf.js', 'js/email.js', 'js/ui.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Nunca cachear datos de sincronización ni el servicio de correo
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('script.google')) return;
  // Librerías de PDF y tipografía (CDN): caché primero
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Archivos de la app: red primero (para recibir actualizaciones), caché si no hay conexión
  e.respondWith(fetch(e.request).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return res; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

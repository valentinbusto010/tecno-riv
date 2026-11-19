// Service worker de la app: guarda una copia de la app para poder abrirla sin internet.
// Siempre intenta primero la red (para tener lo último) y si no hay conexión usa la copia.
// Los datos en vivo vienen de Supabase (otro dominio): no pasan por acá.
const VERSION = 'tecnoriv-20261119-194537'; // armar-app.ps1 lo reemplaza por la fecha de cada publicación
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest',
  './src/app.js', './src/calculos.js', './src/cifrado.js', './src/config.js', './src/datos.js',
  './src/escena.js', './src/estilos.css', './src/formato.js', './src/tarjetas.js', './src/vivo.js',
  './vendor/three.module.min.js', './vendor/fuentes/archivo-black-latin.woff2', './vendor/fuentes/montserrat-latin.woff2',
  './iconos/icono-32.png', './iconos/icono-192.png', './iconos/icono-512.png', './iconos/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});

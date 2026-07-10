const CACHE = "millas-v2";
const FILES = [
  "./index.html",
  "./manifest.json",
  "./screens/carrera.html",
  "./screens/datos.html",
  "./screens/score.html",
  "./screens/ajustes.html",
  "./icon.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

// Estrategia: cache-first, con fallback a red. Esto es lo que permite abrir
// la app sin señal en zonas sin cobertura.
self.addEventListener("fetch", (e)=>{
  e.respondWith(
    caches.match(e.request).then(cached=> cached || fetch(e.request))
  );
});

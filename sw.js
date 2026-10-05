// sw.js — service worker: cache dell'app shell (lettura offline dell'interfaccia).
//
// I DATI (catalogo.json, playlist.json) NON passano da qui: arrivano da
// api.github.com (cross-origin, autenticato) e li mette in cache dati.js/playlist.js
// per conto proprio (Cache Storage "jukebox-dati", localStorage per le playlist).
// Qui si mette in cache solo lo "shell" statico dell'app.

const CACHE = "jukebox-v9"; // bump a ogni deploy per invalidare lo shell

const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/main.js",
  "js/ui.js",
  "js/config.js",
  "js/api.js",
  "js/dati.js",
  "js/cerca.js",
  "js/generi.js",
  "js/comandi.js",
  "js/file.js",
  "js/lettore.js",
  "js/regole.js",
  "js/dj.js",
  "js/motori.js",
  "js/link.js",
  "js/coda.js",
  "js/playlist.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "fonts/yellowtail-400.woff2",
  "fonts/oswald-400-600.woff2",
  "fonts/courier-prime-400.woff2",
  "fonts/courier-prime-700.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("jukebox-v")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                        // scritture: solo rete
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // api.github.com e Deezer: passano alla rete
  // Solo i file dell'app: in anteprima il catalogo sta fuori dallo scope
  // (../app-dati/) e lo mette in cache dati.js per conto suo.
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // App shell: NETWORK-FIRST. Online → sempre l'ultima versione (e aggiorna la
  // cache); offline → fallback alla cache (o allo shell per la navigazione).
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("index.html")))
  );
});

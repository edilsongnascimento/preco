const CACHE_NAME = 'consulta-precos-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest',
  './produtos.json',
  './vendor/zxing-browser.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('consulta-precos-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            await caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response.clone()));
          }
          return response;
        })
        .catch(async (error) => {
          const cached = await caches.match('./index.html');
          if (!cached) throw error;
          console.warn('Sem conexão: exibindo a versão salva do aplicativo.');
          return cached;
        })
    );
    return;
  }

  if (new URL(request.url).pathname.endsWith('/produtos.json')) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(async (error) => {
          const cached = await caches.match(request);
          if (!cached) throw error;
          console.warn('Sem conexão: usando a lista de produtos salva.');
          return cached;
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then(async (response) => {
        if (response.ok) {
          await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    })
  );
});

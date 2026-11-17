const cacheName = 'whippit-shell-v11';
const shell = [
  './','./index.html','./style.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png',
  './app.js','./ui.js','./catalog.js','./curated.js','./planner.js','./storage.js',
  './source-catalog.js','./pantry-profile.js','./account-ui.js','./recipe-tools.js','./recipe-library.js','./planner-worker.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    shell.map(path => new Request(new URL(path,self.registration.scope),{cache:'reload'}))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(
    key => key.startsWith('whippit-shell-') && key !== cacheName
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !shell.some(path => new URL(path,self.registration.scope).href === request.url)) return;
  event.respondWith(fetch(request,{cache:'no-cache'}).catch(async () => (await caches.open(cacheName)).match(request)));
});

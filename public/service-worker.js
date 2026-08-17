// Service worker mínimo — necessário apenas para habilitar a instalação (PWA) no PC e no Android.
// Não faz cache nem altera o comportamento do app.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passa direto para a rede, sem interceptar/alterar nada.
});

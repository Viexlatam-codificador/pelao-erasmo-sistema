// ============================================================================
// El Pelao Erasmo — Service worker mínimo
//
// Su único propósito es permitir que el navegador ofrezca "Instalar app" /
// "Agregar a pantalla de inicio" en Android (Chrome exige que exista un
// service worker que responda a fetch para mostrar ese botón).
//
// A propósito NO guarda nada en caché: este sistema se actualiza seguido
// (pedidos, precios, rutas, el código mismo) y cachear páginas viejas podría
// hacer que alguien vea una versión desactualizada del sistema sin darse
// cuenta — algo que ya causó problemas serios antes en este proyecto. Así
// que cada carga siempre pide todo de nuevo a la red, tal como si no
// existiera este archivo; solo cambia que ahora se puede "instalar".
// ============================================================================

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

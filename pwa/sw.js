// KB-1511: minimal service worker for the installable PWA at /harmonia-webclient/pwa/.
//
// It exists only so the page is installable and can route notification clicks back to the app.
// It deliberately registers NO network-intercepting handler and caches nothing: a cached
// index.html or wasm would serve a stale bundle after every deploy (KB-232, KB-260 were
// "still broken" reports that were really stale clients). Every request goes to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/harmonia-webclient/pwa/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith(target) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});

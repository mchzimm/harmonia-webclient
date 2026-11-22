// KB-1511: minimal service worker for the installable PWA at /harmonia-webclient/pwa/.
//
// It exists so the page is installable, can show the closed-app unread badge (KB-1513 push
// handler) and can route notification clicks back to the app.
// It caches nothing and never calls respondWith: a cached index.html or wasm would serve a
// stale bundle after every deploy (KB-232, KB-260 were "still broken" reports that were really
// stale clients). Every request goes to the network via browser default handling.
// KB-1581: Chrome/Brave on Android only offer install when the SW has a fetch listener, so a
// pass-through no-op listener is registered below.
const PWA_PATH = "/harmonia-webclient/pwa/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

// KB-1581: pass-through. No respondWith, so the browser does its normal network fetch.
self.addEventListener("fetch", () => {});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// KB-1513: Web Push. The gateway sends ONE constant-shape declarative payload (crates/server/src/
// push/payload.rs): top-level `app_badge` (absolute unread total) plus a generic `notification`
// (title/body/tag/navigate). It never carries message text, sender or channel. Browsers that run
// this handler (Chrome/Android, Firefox, iOS mutable path) get the same visible result as the
// declarative path: one notification with the shared tag, and the absolute badge.
function badgeFrom(m, n) {
  let raw = m.app_badge;
  if (raw === undefined || raw === null) raw = n.app_badge;
  if (typeof raw === "string") {
    if (!/^[0-9]+$/.test(raw)) return NaN;
    raw = Number(raw);
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return NaN;
  return Math.floor(raw);
}

// Only a URL inside this PWA on this origin is followed; anything else opens the PWA root.
function safeTarget(navigate) {
  try {
    const u = new URL(String(navigate), self.location.origin);
    if (u.origin === self.location.origin && u.pathname.startsWith(PWA_PATH)) return u.pathname;
  } catch (e) {}
  return PWA_PATH;
}

function guarded(fn) {
  try {
    const p = fn();
    return p && p.catch ? p.catch(() => {}) : Promise.resolve();
  } catch (e) {
    return Promise.resolve();
  }
}

self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch (e) {
    m = {};
  }
  if (!m || typeof m !== "object") m = {};
  const n = m.notification && typeof m.notification === "object" ? m.notification : {};
  const jobs = [
    guarded(() =>
      self.registration.showNotification(typeof n.title === "string" && n.title ? n.title : "Harmonia", {
        body: typeof n.body === "string" && n.body ? n.body : "New message",
        tag: typeof n.tag === "string" && n.tag ? n.tag : "harmonia-unread",
        renotify: false,
        data: { navigate: safeTarget(n.navigate) },
      })
    ),
  ];
  const b = badgeFrom(m, n);
  const nav = self.navigator;
  if (Number.isFinite(b) && nav && nav.setAppBadge) {
    jobs.push(guarded(() => (b > 0 ? nav.setAppBadge(b) : nav.clearAppBadge())));
  }
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const target = safeTarget(data && data.navigate);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith(PWA_PATH) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});

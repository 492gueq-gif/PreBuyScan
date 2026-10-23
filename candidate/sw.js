/* PreBuyScan service worker: keeps the app shell available offline and loads it fast.
 * Network first for our own files (so updates arrive immediately), cache as fallback.
 * Market, explorer and RPC requests (other origins) are never cached. */
const V = "pbs-shell-v5";
const SHELL = ["./", "index.html", "sellsim.js", "creator.js", "bubblemap.js", "profile.js", "share.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "logo-mark.png", "logo-full.jpg", "og.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
      if (res.ok) cache.put(req.url.split("?")[0] === self.registration.scope || req.mode === "navigate" ? "./" : req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("./") : Response.error());
    }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

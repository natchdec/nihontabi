/* Nihontabi service worker: network-first for pages, stale-while-revalidate for data/images (offline use). */
const V = "nt-v2", MAXIMG = 500;
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(["/", "/manifest.webmanifest", "/analytics.js"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("nt-") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function trim(cache) { const ks = await cache.keys(); const img = ks.filter(r => r.url.includes("/img/p/")); for (let i = 0; i < img.length - MAXIMG; i++) await cache.delete(img[i]); }
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname === "/sw.js") return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("/"))));
    return;
  }
  if (/^\/data\/(px_[a-z]+|hotel_prices)\.json$/.test(u.pathname)) { // prices change daily: network first, cached copy only when offline
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); } return res; }).catch(() => caches.match(r)));
    return;
  }
  if (/^\/(data|img|og|icons)\//.test(u.pathname)) {
    e.respondWith(caches.open(V).then(async ca => {
      const hit = await ca.match(r);
      const net = fetch(r).then(res => { if (res.ok) { ca.put(r, res.clone()).then(() => trim(ca)); } return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

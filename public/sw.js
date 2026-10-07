/*
 * SmartPress service worker (hand-written; no next-pwa/Serwist).
 *
 * This is a TEMPLATE. scripts/inject-sw.mjs runs after `next build` and writes the
 * real out/sw.js: it fills in the precache list (a walk of out/ after pruning) and a
 * cache name carrying a content hash of that list, so every deploy that changes any
 * file gets a fresh cache and the old ones are deleted on activate.
 *
 * Strategy
 *  - Precached files: cache-first. The list covers lazily loaded files too (pdf.js
 *    worker, cmaps, codec wasm, dynamic chunks), because worker fetches go through
 *    this same cache.
 *  - HEAD (Next link prefetch): answered from the cache.
 *  - Navigations: network-first, falling back to the cached page, then cached "/".
 *  - No skipWaiting on its own. A waiting worker takes over only when the page asks
 *    for it (the "Update ready" toast), and the page never asks mid-batch.
 */
const CACHE_NAME = "smartpress-__CACHE_HASH__";
const PRECACHE = /*PRECACHE_START*/[]/*PRECACHE_END*/;

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // `reload` bypasses the HTTP cache so a half-stale response can't be pinned.
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter((n) => n.startsWith("smartpress-") && n !== CACHE_NAME)
                .map((n) => caches.delete(n)),
        );
        await self.clients.claim();
    })());
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET" && req.method !== "HEAD") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Next's link prefetch sends HEAD to a page's URL to check its status. Answer it
    // from the cache (headers only) so it doesn't hit the network when offline.
    if (req.method === "HEAD") {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const hit = await cache.match(req, { ignoreSearch: true, ignoreMethod: true });
            return hit ? new Response(null, { status: hit.status, statusText: hit.statusText, headers: hit.headers }) : fetch(req);
        })());
        return;
    }

    if (req.mode === "navigate") {
        event.respondWith((async () => {
            // When the browser already knows it is offline, don't spend a doomed request.
            // onLine can lie in the other direction (true with no route), hence the catch.
            try {
                if (self.navigator.onLine === false) throw new Error("offline");
                return await fetch(req);
            } catch {
                const cache = await caches.open(CACHE_NAME);
                return (await cache.match(req, { ignoreSearch: true }))
                    || (await cache.match("/"))
                    || Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || fetch(req);
    })());
});

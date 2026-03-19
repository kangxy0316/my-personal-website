const CACHE_NAME = "kxy-site-v8";
const STATIC_ASSET_PATHS = new Set([
    "/avatar.png",
    "/manifest.webmanifest",
    "/assets/curry/1.jpg",
    "/assets/curry/2.jpg",
    "/assets/curry/3.jpg"
]);

self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/")) return;

    const isHtmlRequest = request.mode === "navigate" || request.destination === "document";
    const isAppShellRequest =
        url.pathname === "/" ||
        url.pathname === "/index.html" ||
        url.pathname === "/assets/style.css" ||
        url.pathname === "/assets/app.js";

    if (isHtmlRequest || isAppShellRequest) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (STATIC_ASSET_PATHS.has(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});

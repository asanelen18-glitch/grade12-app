const CACHE_NAME = "grade12-hub-v1";

const FILES_TO_CACHE = [
    "/grade12-app/",
    "/grade12-app/index.html",
    "/grade12-app/notes.html",
    "/grade12-app/maths.html",
    "/grade12-app/past-papers.html",
    "/grade12-app/maths-2025.html"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

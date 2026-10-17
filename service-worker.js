
const CACHE_NAME = "grade12-hub-v3";

const FILES_TO_CACHE = [
    "/",
    "/index.html",
    "/notes.html",
    "/maths.html",
    "/past-papers.html",
    "/maths-2025.html",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png"
];

// Install: cache available app files without failing the
// entire installation if one optional file is unavailable.
self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            await Promise.all(
                FILES_TO_CACHE.map(async file => {
                    try {
                        const response = await fetch(file, {
                            cache: "reload"
                        });

                        if (response.ok) {
                            await cache.put(file, response);
                        }
                    } catch (error) {
                        console.warn("Could not cache:", file);
                    }
                })
            );

            await self.skipWaiting();
        })()
    );
});

// Activate: remove older Grade 12 Hub caches only.
self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();

            await Promise.all(
                keys
                    .filter(key =>
                        key.startsWith("grade12-hub-") &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            );

            await self.clients.claim();
        })()
    );
});

// Fetch: never intercept API requests, non-GET requests,
// or requests to other origins.
self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);

    if (
        request.method !== "GET" ||
        url.origin !== self.location.origin ||
        url.pathname.startsWith("/api/")
    ) {
        return;
    }

    // For page navigation, try the network first.
    // If offline, use a cached page when available.
    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);

                    if (response.ok) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, response.clone());
                    }

                    return response;
                } catch (error) {
                    const cachedPage = await caches.match(request);

                    if (cachedPage) return cachedPage;

                    const homePage = await caches.match("/index.html");

                    if (homePage) return homePage;

                    return new Response("You are offline.", {
                        status: 503,
                        headers: {
                            "Content-Type": "text/plain; charset=utf-8"
                        }
                    });
                }
            })()
        );

        return;
    }

    // For other same-origin GET requests, use the cache
    // first and fetch from the network if not cached.
    event.respondWith(
        (async () => {
            const cached = await caches.match(request);

            if (cached) return cached;

            return fetch(request);
        })()
    );
});

// Push: display reminders even when the page is closed,
// provided the browser and operating system deliver the push.
self.addEventListener("push", event => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = {
            body: event.data
                ? event.data.text()
                : "You have a study reminder."
        };
    }

    const title = data.title || "Grade 12 Hub reminder";

    const options = {
        body: data.body || "Check your Study Planner.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.itemId
            ? `planner-${data.itemId}`
            : "grade12-reminder",
        data: {
            url: data.url || "/study-planner.html"
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click: open or focus Grade 12 Hub.
self.addEventListener("notificationclick", event => {
    event.notification.close();

    const target = new URL(
        event.notification.data?.url || "/study-planner.html",
        self.location.origin
    ).href;

    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true
            });

            for (const client of windows) {
                if (
                    client.url.startsWith(self.location.origin) &&
                    "focus" in client
                ) {
                    if ("navigate" in client) {
                        await client.navigate(target);
                    }

                    await client.focus();
                    return;
                }
            }

            if (self.clients.openWindow) {
                await self.clients.openWindow(target);
            }
        })()
    );
});


const CACHE_NAME = "grade12-hub-v4";

const FILES_TO_CACHE = [
    "/",
    "/index.html",
    "/notes.html",
    "/maths.html",
    "/past-papers.html",
    "/maths-2025.html",
    "/study-planner.html",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png"
];

// INSTALL: Cache app files without failing if an optional
// file is unavailable.
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
                        console.warn("Could not cache:", file, error);
                    }
                })
            );

            await self.skipWaiting();
        })()
    );
});

// ACTIVATE: Remove only older Grade 12 Hub caches.
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

// FETCH: Do not intercept API requests, non-GET requests,
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

    // Page navigation: network first, cached page if offline.
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

                    if (cachedPage) {
                        return cachedPage;
                    }

                    const homePage = await caches.match("/index.html");

                    if (homePage) {
                        return homePage;
                    }

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

    // Other same-origin GET requests: cache first.
    event.respondWith(
        (async () => {
            const cached = await caches.match(request);

            if (cached) {
                return cached;
            }

            return fetch(request);
        })()
    );
});

// PUSH: Display a notification when the browser delivers
// a push message to this service worker.
self.addEventListener("push", event => {
    event.waitUntil(
        (async () => {
            let data = {};

            try {
                if (event.data) {
                    const raw = event.data.text();

                    try {
                        data = JSON.parse(raw);
                    } catch (parseError) {
                        data = {
                            body: raw
                        };
                    }
                }
            } catch (error) {
                data = {};
            }

            const title =
                typeof data.title === "string" && data.title.trim()
                    ? data.title.trim()
                    : "Grade 12 Hub reminder";

            const body =
                typeof data.body === "string" && data.body.trim()
                    ? data.body.trim()
                    : "You have a study reminder. Open your Study Planner.";

            // Only allow links to this website.
            let target = "/study-planner.html";

            if (
                typeof data.url === "string" &&
                data.url.startsWith("/") &&
                !data.url.startsWith("//")
            ) {
                target = data.url;
            }

            const options = {
                body,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                tag: data.itemId
                    ? `grade12-planner-${data.itemId}`
                    : "grade12-hub-reminder",
                renotify: false,
                timestamp: Date.now(),
                data: {
                    url: target
                }
            };

            await self.registration.showNotification(title, options);
        })()
    );
});

// NOTIFICATION CLICK: Close the notification and open
// or focus the relevant Grade 12 Hub page.
self.addEventListener("notificationclick", event => {
    event.notification.close();

    event.waitUntil(
        (async () => {
            let target = "/study-planner.html";
            const savedUrl = event.notification.data?.url;

            if (
                typeof savedUrl === "string" &&
                savedUrl.startsWith("/") &&
                !savedUrl.startsWith("//")
            ) {
                target = savedUrl;
            }

            const targetUrl = new URL(
                target,
                self.location.origin
            ).href;

            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true
            });

            // Focus an existing Grade 12 Hub window if possible.
            for (const client of windows) {
                if (
                    client.url.startsWith(self.location.origin) &&
                    "focus" in client
                ) {
                    if (client.url !== targetUrl && "navigate" in client) {
                        try {
                            await client.navigate(targetUrl);
                        } catch (error) {
                            console.warn(
                                "Could not navigate existing window:",
                                error
                            );
                        }
                    }

                    await client.focus();
                    return;
                }
            }

            // Otherwise, open a new window.
            if (self.clients.openWindow) {
                await self.clients.openWindow(targetUrl);
            }
        })()
    );
});

// OPTIONAL: Allow a message from the app to activate this worker.
// This does not send a notification by itself.
self.addEventListener("message", event => {
    if (event.data === "SKIP_WAITING") {
        event.waitUntil(self.skipWaiting());
    }
});

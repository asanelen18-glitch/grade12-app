const CACHE_NAME = "grade12-hub-v2";

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

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );

    self.clients.claim();
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
/* Grade 12 Hub push notifications.
   Add these listeners to the existing service-worker.js.
   Keep the existing cache/install/fetch handlers. */

self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "You have a study reminder." };
  }

  const title = data.title || "Grade 12 Hub reminder";
  const options = {
    body: data.body || "Check your Study Planner.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.itemId ? `planner-${data.itemId}` : "grade12-reminder",
    data: { url: data.url || "/study-planner.html" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/study-planner.html",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }

    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});


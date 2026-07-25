const STATIC_CACHE = "yamada-static-05c";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", () => {
  // Atualizações aguardam o comando explícito da interface.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("yamada-static-") && key !== STATIC_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) return cached;
      const response = await network;
      return response || new Response("Offline", { status: 503, statusText: "Offline" });
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "" };
  }

  const title = data.title || "Yamada";
  const options = {
    body: data.body || "Há uma nova atualização.",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.renotify),
    requireInteraction: Boolean(data.requireInteraction),
    data: {
      url: data.url || "/",
      orderReferenceId: data.orderReferenceId || "",
      kind: data.kind || "",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    }),
  );
});

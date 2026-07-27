const STATIC_CACHE = "yamada-static-06c7";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const DEFAULT_ICON = "/icon-192x192.png";

self.addEventListener("install", () => {
  // Atualizações aguardam o comando explícito da interface.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_APP_BADGE") {
    event.waitUntil(clearAppBadge());
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

async function setAppBadge(count) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (typeof self.navigator?.setAppBadge === "function") {
      if (safeCount > 0) await self.navigator.setAppBadge(safeCount);
      else if (typeof self.navigator.clearAppBadge === "function") await self.navigator.clearAppBadge();
    }
  } catch (error) {
    console.warn("[sw] Não foi possível atualizar o badge do app:", error);
  }
}

async function clearAppBadge() {
  try {
    if (typeof self.navigator?.clearAppBadge === "function") {
      await self.navigator.clearAppBadge();
    }
  } catch (error) {
    console.warn("[sw] Não foi possível limpar o badge do app:", error);
  }
}

async function notifyOpenClients(data) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: "YAMADA_PUSH_RECEIVED",
        kind: data.kind || "",
        badgeCount: Math.max(0, Math.floor(Number(data.badgeCount) || 0)),
        url: data.url || "/",
      }),
    ),
  );
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "" };
  }

  const title = data.title || "Yamada";
  const badgeCount = Math.max(0, Math.floor(Number(data.badgeCount) || 0));
  const options = {
    body: data.body || "Há uma nova atualização.",
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_ICON,
    tag: data.tag || undefined,
    renotify: Boolean(data.renotify),
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : [180, 80, 180],
    data: {
      url: data.url || "/",
      orderReferenceId: data.orderReferenceId || "",
      orderId: data.orderId || "",
      sellerId: data.sellerId || "",
      eventId: data.eventId || "",
      kind: data.kind || "",
      badgeCount,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setAppBadge(badgeCount),
      notifyOpenClients(data),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    Promise.all([
      clearAppBadge(),
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
    ]),
  );
});

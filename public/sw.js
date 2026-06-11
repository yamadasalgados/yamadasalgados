/* Service Worker: Cache Leve + Notificações Push */

const CACHE_VERSION = "v1";
const CACHE_NAME = `yamada-cache-${CACHE_VERSION}`;

// Cache mínimo (ajuste os paths para o que existe no seu /public)
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Helper: cache com tolerância (não quebra o SW se algum arquivo faltar)
async function precacheSafe() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
  // opcional: log somente em dev (não recomendo logar muito em produção)
  // console.log("[SW] precache results", results);
  return results;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheSafe());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("yamada-cache-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );

      // Assume controle das abas
      await self.clients.claim();
    })()
  );
});

/**
 * Cache leve:
 * - Navegação: network-first (pra sempre pegar conteúdo atualizado), fallback cache offline
 * - Assets GET same-origin: stale-while-revalidate (rápido e leve)
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só mexe com GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Só cacheia o que é do seu próprio domínio
  if (url.origin !== self.location.origin) return;

  // Navegação (HTML): network-first
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match("/") || Response.error();
        }
      })()
    );
    return;
  }

  // Assets: stale-while-revalidate (bom e leve)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});

// Listener de Push
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Novo evento disponível!";
  const body = data.body || "Abra para ver os produtos e fazer seu pedido.";
  const rawUrl = data.url || "/";

  // aceita url relativa ou absoluta
  const targetUrl = (() => {
    try {
      return new URL(rawUrl, self.location.origin).toString();
    } catch {
      return self.location.origin + "/";
    }
  })();

  const options = {
    body,
    // Use os ícones que realmente existem no /public
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: targetUrl },

    // Agrupa notificações do mesmo tipo
    tag: data.tag || "new-event-alert",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação
self.addEventListener("notificationclick", (event) => {
  const targetUrl = event.notification?.data?.url || (self.location.origin + "/");
  event.notification.close();

  event.waitUntil(
    (async () => {
      const target = new URL(targetUrl, self.location.origin);

      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // foca uma aba que esteja no mesmo origin e mesma "rota base"
      for (const client of allClients) {
        try {
          const cUrl = new URL(client.url);
          if (cUrl.origin === target.origin && cUrl.pathname === target.pathname && "focus" in client) {
            return client.focus();
          }
        } catch {}
      }

      // se não tiver, abre nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(target.toString());
      }
    })()
  );
});

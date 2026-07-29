export type PushLanguage = "pt" | "en" | "ja";

export type PushEnvironment = {
  isIos: boolean;
  isStandalone: boolean;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  supported: boolean;
  permission: NotificationPermission | "unavailable";
};

export type PushTestStatus =
  | "queued"
  | "processing"
  | "sent"
  | "partial"
  | "error";

export type PushTestResult = {
  ok: boolean;
  status: PushTestStatus;
  code: string;
  message: string;
  sentCount: number;
  failedCount: number;
  serverVapidFingerprint: string;
};

export function detectPushEnvironment(): PushEnvironment {
  if (typeof window === "undefined") {
    return {
      isIos: false,
      isStandalone: false,
      hasNotification: false,
      hasServiceWorker: false,
      hasPushManager: false,
      supported: false,
      permission: "unavailable",
    };
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  const isIos =
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;
  const hasNotification = "Notification" in window;
  const hasServiceWorker = "serviceWorker" in window.navigator;
  const hasPushManager = "PushManager" in window;

  return {
    isIos,
    isStandalone,
    hasNotification,
    hasServiceWorker,
    hasPushManager,
    supported: hasNotification && hasServiceWorker && hasPushManager,
    permission: hasNotification ? Notification.permission : "unavailable",
  };
}

export function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

export function applicationServerKeyMatches(
  subscription: PushSubscription,
  publicKey: string,
): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = new Uint8Array(urlBase64ToArrayBuffer(publicKey));
  const actual = new Uint8Array(current);
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

export async function currentKeySubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription | null> {
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return null;
  if (applicationServerKeyMatches(existing, publicKey)) return existing;
  await existing.unsubscribe().catch(() => false);
  return null;
}

export async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await window.navigator.serviceWorker.getRegistration("/");
  const registration =
    existing ??
    (await window.navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }));

  await window.navigator.serviceWorker.ready;
  return registration;
}

export async function vapidFingerprint(publicKey: string): Promise<string> {
  const normalized = publicKey.trim();
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(normalized);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function showLocalPushTest(
  registration: ServiceWorkerRegistration,
  language: PushLanguage,
): Promise<void> {
  const copy = {
    pt: {
      title: "Teste local de notificação 🔔",
      body: "O aparelho e o Service Worker conseguem mostrar notificações.",
    },
    en: {
      title: "Local notification test 🔔",
      body: "This device and its service worker can display notifications.",
    },
    ja: {
      title: "端末の通知テスト 🔔",
      body: "この端末とService Workerは通知を表示できます。",
    },
  } as const;
  const text = copy[language];

  const options: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body: text.body,
    icon: "/icon-192x192.png",
    badge: "/notification-badge.png",
    tag: `order-app-local-test-${Date.now()}`,
    renotify: true,
    silent: false,
    vibrate: [250, 100, 250, 100, 400],
    data: { url: "/", kind: "local-push-test", badgeCount: 1 },
  };

  await registration.showNotification(text.title, options);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function waitForPushTest(params: {
  url: string;
  token: string;
  requestId: string;
  timeoutMs?: number;
}): Promise<PushTestResult> {
  const deadline = Date.now() + (params.timeoutMs ?? 45_000);
  let lastStatus: PushTestStatus | "unknown" = "unknown";

  while (Date.now() < deadline) {
    const separator = params.url.includes("?") ? "&" : "?";
    const response = await fetch(
      `${params.url}${separator}requestId=${encodeURIComponent(params.requestId)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${params.token}` },
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | (Partial<PushTestResult> & { ok?: boolean; error?: string })
      | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "PUSH_TEST_STATUS_FAILED");
    }

    const status = payload.status;
    if (
      status === "queued" ||
      status === "processing" ||
      status === "sent" ||
      status === "partial" ||
      status === "error"
    ) {
      lastStatus = status;
    }
    if (status === "sent" || status === "partial" || status === "error") {
      return {
        ok: status === "sent" || status === "partial",
        status,
        code: typeof payload.code === "string" ? payload.code : "",
        message: typeof payload.message === "string" ? payload.message : "",
        sentCount: Number(payload.sentCount) || 0,
        failedCount: Number(payload.failedCount) || 0,
        serverVapidFingerprint:
          typeof payload.serverVapidFingerprint === "string"
            ? payload.serverVapidFingerprint
            : "",
      };
    }

    await sleep(1_200);
  }

  const suffix =
    lastStatus === "queued"
      ? "QUEUED"
      : lastStatus === "processing"
        ? "PROCESSING"
        : "UNKNOWN";
  throw new Error(`PUSH_TEST_TIMEOUT_${suffix}`);
}

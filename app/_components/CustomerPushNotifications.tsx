"use client";

import { Bell, BellOff, Loader2, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CustomerSession } from "@/app/hooks/useCustomerSession";

type Props = {
  session: CustomerSession;
  language: "pt" | "en" | "ja";
  compact?: boolean;
  promptOnce?: boolean;
};

type State =
  | "checking"
  | "unsupported"
  | "install_required"
  | "denied"
  | "ready"
  | "subscribed"
  | "loading"
  | "error";

const PROMPT_DISMISSED_KEY = "yamada:customer-push-prompt-dismissed:v1";

const COPY = {
  pt: {
    title: "Acompanhe seu pedido",
    body: "Receba avisos quando o pedido entrar em preparação, ficar pronto, for entregue ou cancelado.",
    enable: "Ativar avisos",
    enabling: "Ativando...",
    enabled: "Notificações de pedidos ativadas neste aparelho.",
    disable: "Desativar",
    denied: "As notificações estão bloqueadas nas configurações do navegador.",
    unsupported: "Este navegador não oferece notificações push.",
    installTitle: "Instale o app primeiro",
    installBody: "No iPhone, adicione esta página à Tela de Início e abra o app instalado para ativar os avisos.",
    error: "Não foi possível ativar as notificações.",
    missingKey: "A chave pública de notificações não está configurada.",
  },
  en: {
    title: "Track your order",
    body: "Get alerts when your order enters preparation, is ready, delivered, or cancelled.",
    enable: "Enable alerts",
    enabling: "Enabling...",
    enabled: "Order notifications are enabled on this device.",
    disable: "Disable",
    denied: "Notifications are blocked in your browser settings.",
    unsupported: "This browser does not support push notifications.",
    installTitle: "Install the app first",
    installBody: "On iPhone, add this page to the Home Screen and open the installed app to enable alerts.",
    error: "Could not enable notifications.",
    missingKey: "The public notification key is not configured.",
  },
  ja: {
    title: "注文状況を通知",
    body: "準備開始、準備完了、受け渡し済み、キャンセル時にお知らせします。",
    enable: "通知を有効にする",
    enabling: "設定中...",
    enabled: "この端末で注文通知が有効です。",
    disable: "無効にする",
    denied: "ブラウザ設定で通知がブロックされています。",
    unsupported: "このブラウザはプッシュ通知に対応していません。",
    installTitle: "先にアプリをインストール",
    installBody: "iPhoneでは、このページをホーム画面に追加し、インストールしたアプリから通知を有効にしてください。",
    error: "通知を有効にできませんでした。",
    missingKey: "通知用の公開キーが設定されていません。",
  },
};

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

async function serviceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

export default function CustomerPushNotifications({
  session,
  language,
  compact = false,
  promptOnce = false,
}: Props) {
  const text = COPY[language];
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");
  const [promptDismissed, setPromptDismissed] = useState(false);

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  useEffect(() => {
    if (!promptOnce || typeof window === "undefined") return;
    setPromptDismissed(window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "1");
  }, [promptOnce]);

  const dismissPrompt = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    }
    setPromptDismissed(true);
  }, []);

  const syncSubscription = useCallback(
    async (subscription: PushSubscription) => {
      if (!session.user) throw new Error(text.error);
      const token = await session.user.getIdToken();
      const response = await fetch("/api/customer/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          language,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || text.error);
      }
    },
    [language, session.user, text.error],
  );

  const check = useCallback(async () => {
    if (!session.registered || !session.user) return;
    if (!supported) {
      setState("unsupported");
      return;
    }
    if (isIosDevice() && !isStandalone()) {
      setState("install_required");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    if (publicKey.trim().length < 20) {
      setError(text.missingKey);
      setState("error");
      return;
    }

    try {
      const registration = await serviceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setState("ready");
        return;
      }
      await syncSubscription(subscription);
      setState("subscribed");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : text.error);
      setState("error");
    }
  }, [publicKey, session.registered, session.user, supported, syncSubscription, text.error, text.missingKey]);

  useEffect(() => {
    if (!session.loading) void check();
  }, [check, session.loading]);

  const enable = useCallback(async () => {
    if (!session.user || !supported) return;
    try {
      setState("loading");
      setError("");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }
      const registration = await serviceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        });
      }
      await syncSubscription(subscription);
      setState("subscribed");
      if (promptOnce) dismissPrompt();
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : text.error);
      setState("error");
    }
  }, [dismissPrompt, promptOnce, publicKey, session.user, supported, syncSubscription, text.error]);

  const disable = useCallback(async () => {
    if (!session.user || !supported) return;
    try {
      setState("loading");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const token = await session.user.getIdToken();
        await fetch("/api/customer/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe().catch(() => false);
      }
      setState("ready");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : text.error);
      setState("error");
    }
  }, [session.user, supported, text.error]);

  if (!session.registered || state === "checking") return null;
  if (promptOnce && (promptDismissed || state === "subscribed" || state === "unsupported")) return null;

  const baseClass = compact
    ? "relative rounded-2xl border p-3"
    : "relative rounded-3xl border p-4 shadow-sm";

  const closeButton = promptOnce ? (
    <button
      type="button"
      onClick={dismissPrompt}
      className="absolute right-2 top-2 rounded-lg p-1.5 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      aria-label="Close"
    >
      <X size={15} />
    </button>
  ) : null;

  if (state === "unsupported") {
    return (
      <div className={`${baseClass} border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300`}>
        {closeButton}
        <div className="flex items-center gap-3 text-xs font-bold"><BellOff size={17} /> {text.unsupported}</div>
      </div>
    );
  }

  if (state === "install_required") {
    return (
      <div className={`${baseClass} border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100`}>
        {closeButton}
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 shrink-0" size={19} />
          <div><p className="text-sm font-black">{text.installTitle}</p><p className="mt-1 text-xs font-medium opacity-80">{text.installBody}</p></div>
        </div>
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <div className={`${baseClass} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100`}>
        {closeButton}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Bell size={18} /><p className="text-xs font-black">{text.enabled}</p></div>
          <button type="button" onClick={() => void disable()} className="rounded-xl border border-emerald-300 px-3 py-2 text-[11px] font-black dark:border-emerald-800">{text.disable}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${baseClass} border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100`}>
      {closeButton}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 shrink-0" size={19} />
          <div>
            <p className="text-sm font-black">{text.title}</p>
            <p className="mt-1 text-xs font-medium opacity-80">{state === "denied" ? text.denied : text.body}</p>
            {state === "error" && <p className="mt-2 text-xs font-bold text-red-700 dark:text-red-300">{error || text.error}</p>}
          </div>
        </div>
        {state !== "denied" && (
          <button type="button" onClick={() => void enable()} disabled={state === "loading"} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-60">
            {state === "loading" ? <Loader2 className="animate-spin" size={15} /> : <Bell size={15} />}
            {state === "loading" ? text.enabling : text.enable}
          </button>
        )}
      </div>
    </div>
  );
}

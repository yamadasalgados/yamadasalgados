"use client";

import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";

type Language = "pt" | "en" | "ja";

type State =
  | "checking"
  | "unsupported"
  | "install_required"
  | "denied"
  | "ready"
  | "subscribed"
  | "loading"
  | "error";

const COPY = {
  pt: {
    title: "Avisos de novos pedidos",
    body: "Receba uma notificação mesmo quando o painel estiver fechado ou em segundo plano.",
    enable: "Ativar neste aparelho",
    enabling: "Ativando…",
    enabled: "Notificações de novos pedidos estão ativas neste aparelho.",
    disable: "Desativar para esta loja",
    denied: "As notificações estão bloqueadas nas configurações do navegador.",
    unsupported: "Este navegador não oferece notificações push.",
    installTitle: "Instale o app primeiro",
    installBody: "No iPhone ou iPad, adicione o site à Tela de Início e abra o app instalado.",
    missingKey: "A chave pública de notificações não está configurada.",
    error: "Não foi possível configurar as notificações.",
  },
  en: {
    title: "New order alerts",
    body: "Receive a notification even when the dashboard is closed or running in the background.",
    enable: "Enable on this device",
    enabling: "Enabling…",
    enabled: "New order notifications are enabled on this device.",
    disable: "Disable for this store",
    denied: "Notifications are blocked in your browser settings.",
    unsupported: "This browser does not support push notifications.",
    installTitle: "Install the app first",
    installBody: "On iPhone or iPad, add the site to the Home Screen and open the installed app.",
    missingKey: "The public notification key is not configured.",
    error: "Could not configure notifications.",
  },
  ja: {
    title: "新規注文の通知",
    body: "管理画面を閉じている時やバックグラウンドでも新しい注文を通知します。",
    enable: "この端末で有効にする",
    enabling: "設定中…",
    enabled: "この端末で新規注文通知が有効です。",
    disable: "この店舗の通知を無効にする",
    denied: "ブラウザ設定で通知がブロックされています。",
    unsupported: "このブラウザはプッシュ通知に対応していません。",
    installTitle: "先にアプリをインストール",
    installBody: "iPhone・iPadではホーム画面に追加し、インストールしたアプリから開いてください。",
    missingKey: "通知用の公開キーが設定されていません。",
    error: "通知を設定できませんでした。",
  },
} as const;

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}

function applicationServerKeyMatches(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = new Uint8Array(urlBase64ToArrayBuffer(publicKey));
  const actual = new Uint8Array(current);
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

async function currentKeySubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription | null> {
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return null;
  if (applicationServerKeyMatches(existing, publicKey)) return existing;
  await existing.unsubscribe().catch(() => false);
  return null;
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

export default function SellerPushNotifications({ language }: { language: Language }) {
  const { user, sellerId } = useSellerSession();
  const text = COPY[language];
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }, []);

  const syncSubscription = useCallback(
    async (subscription: PushSubscription) => {
      const token = await user.getIdToken();
      const response = await fetch("/api/seller/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerId,
          subscription: subscription.toJSON(),
          language,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || text.error);
    },
    [language, sellerId, text.error, user],
  );

  const check = useCallback(async () => {
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
      const subscription = await currentKeySubscription(registration, publicKey);
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
  }, [publicKey, supported, syncSubscription, text.error, text.missingKey]);

  useEffect(() => {
    void check();
  }, [check]);

  const enable = useCallback(async () => {
    if (!supported) return;
    try {
      setState("loading");
      setError("");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }
      const registration = await serviceWorkerRegistration();
      let subscription = await currentKeySubscription(registration, publicKey);
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        });
      }
      await syncSubscription(subscription);
      setState("subscribed");
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : text.error);
      setState("error");
    }
  }, [publicKey, supported, syncSubscription, text.error]);

  const disable = useCallback(async () => {
    if (!supported) return;
    try {
      setState("loading");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const token = await user.getIdToken();
        const response = await fetch("/api/seller/push/unsubscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sellerId, endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error(text.error);
      }
      setState("ready");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : text.error);
      setState("error");
    }
  }, [sellerId, supported, text.error, user]);

  const icon = state === "subscribed" ? Bell : state === "denied" ? BellOff : Smartphone;
  const Icon = icon;
  const description =
    state === "unsupported"
      ? text.unsupported
      : state === "install_required"
        ? `${text.installTitle}. ${text.installBody}`
        : state === "denied"
          ? text.denied
          : state === "subscribed"
            ? text.enabled
            : error || text.body;

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0 flex-1">
          <h2 className="font-black">{text.title}</h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-900/75 dark:text-emerald-200/80">
            {description}
          </p>
        </div>
      </div>

      {(state === "ready" || state === "error") && (
        <button
          type="button"
          onClick={() => void enable()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-800"
        >
          <Bell size={17} />
          {text.enable}
        </button>
      )}

      {state === "loading" && (
        <p className="inline-flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-200">
          <Loader2 className="animate-spin" size={16} />
          {text.enabling}
        </p>
      )}

      {state === "subscribed" && (
        <button
          type="button"
          onClick={() => void disable()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-neutral-950/60 dark:text-emerald-200"
        >
          <BellOff size={16} />
          {text.disable}
        </button>
      )}
    </section>
  );
}

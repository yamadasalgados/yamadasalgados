"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/lib/i18n";

type Props = {
  sellerId?: string;
  regionId?: string;
  vapidPublicKey: string;
  subscribeApiPath?: string; // default: "/api/region/subscribe"
};

type State = "idle" | "unsupported" | "denied" | "ready" | "subscribed" | "loading" | "error";

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);

  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes.buffer;
}

async function getSWRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export default function PushSubscribeBanner({
  sellerId,
  regionId,
  vapidPublicKey,
  subscribeApiPath = "/api/region/subscribe",
}: Props) {
  const { t } = useI18n(); // ✅ Integrado nativamente ao ecossistema auditado do core
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }, []);

  const keyOk = useMemo(() => String(vapidPublicKey || "").trim().length > 20, [vapidPublicKey]);

  const syncToBackend = useCallback(
    async (subJson: any) => {
      const resp = await fetch(subscribeApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subJson,
          sellerId,
          regionId,
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || t("push.save_failed"));
      }
      return data;
    },
    [subscribeApiPath, sellerId, regionId, t]
  );

  const checkStatus = useCallback(async () => {
    if (!sellerId || !regionId) return;

    if (!supported) {
      setState("unsupported");
      return;
    }

    if (!keyOk) {
      setError(t("push.vapid_missing"));
      setState("error");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    try {
      const reg = await getSWRegistration();
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        try {
          await syncToBackend(sub.toJSON());
        } catch {
          // Mantém o estado reativo ativo na UI mesmo sob falha silenciosa de sincronia secundária
        }
        setState("subscribed");
      } else {
        setState("ready");
      }
    } catch (err) {
      console.error("[Push Engine] Falha ao varrer assinaturas:", err);
      setState("ready");
    }
  }, [sellerId, regionId, supported, keyOk, t, syncToBackend]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const subscribe = useCallback(async () => {
    if (!sellerId || !regionId || !supported || !keyOk) return;

    try {
      setState("loading");
      setError("");

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "ready");
        return;
      }

      const reg = await getSWRegistration();
      let appKey: ArrayBuffer;
      try {
        appKey = urlBase64ToArrayBuffer(vapidPublicKey);
      } catch {
        setError(t("push.vapid_missing"));
        setState("error");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });

      await syncToBackend(sub.toJSON());
      setState("subscribed");
    } catch (err: any) {
      console.error("[Push Engine] Erro ao subscrever canal:", err);
      setError(err?.message || t("push.enable_failed"));
      setState("error");
    }
  }, [sellerId, regionId, supported, keyOk, vapidPublicKey, syncToBackend, t]);

  if (!sellerId || !regionId || state === "unsupported") return null;

  if (state === "subscribed") {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-950/20 p-4 text-xs font-black text-green-800 dark:text-green-400 animate-fade-in">
        {t("push.subscribed")}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-md space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">{t("push.title")}</p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium leading-tight">
            {t("push.subtitle")}
          </p>
        </div>

        <button
          onClick={subscribe}
          disabled={state === "loading"}
          className="flex-shrink-0 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-5 py-3 shadow-md hover:scale-105 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {state === "loading" ? t("push.enabling") : t("push.enable")}
        </button>
      </div>

      {state === "denied" && (
        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/20 leading-relaxed">
          {t("push.denied")}
        </p>
      )}

      {state === "error" && !!error && (
        <p className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 p-2.5 rounded-xl border border-red-200 dark:border-red-900/20 leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}
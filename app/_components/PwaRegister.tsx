"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Nova versão disponível",
    body: "Atualize agora para usar a versão mais recente do app.",
    update: "Atualizar",
    close: "Fechar",
  },
  en: {
    title: "New version available",
    body: "Update now to use the latest version of the app.",
    update: "Update",
    close: "Close",
  },
  ja: {
    title: "新しいバージョンがあります",
    body: "最新バージョンに更新してください。",
    update: "更新",
    close: "閉じる",
  },
};

export default function PwaRegister() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const reloadingRef = useRef(false);

  const inspectRegistration = useCallback((registration: ServiceWorkerRegistration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      setWaitingWorker(registration.waiting);
      setDismissed(false);
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting || installing);
          setDismissed(false);
        }
      });
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let interval = 0;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        inspectRegistration(registration);
        await registration.update().catch(() => undefined);
        interval = window.setInterval(
          () => void registration.update().catch(() => undefined),
          6 * 60 * 60 * 1000,
        );
      } catch (error) {
        console.warn("[PWA] Falha ao registrar Service Worker:", error);
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (interval) window.clearInterval(interval);
    };
  }, [inspectRegistration]);

  const update = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  if (!waitingWorker || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[10000] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <RefreshCw size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-neutral-950 dark:text-white">{text.title}</p>
          <p className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">{text.body}</p>
          <button type="button" onClick={update} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white">
            {text.update}
          </button>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label={text.close} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

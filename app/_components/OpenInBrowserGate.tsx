"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/lib/i18n";
 
type Props = {
  url: string;
};

const DISMISS_KEY = "yamada_open_in_browser_dismissed_v1";

export default function OpenInBrowserGate({ url }: Props) {
  const { t } = useI18n();
  const [ua, setUa] = useState("");
  const [dismissed, setDismissed] = useState(true); // Começa true para evitar hidratação quebrada no SSR

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
      setUa(navigator.userAgent || "");
    } catch {
      setDismissed(false);
    }
  }, []);

  // ✅ Corrigido: Varredura isolada e desacoplada de escopo de terceiros (Evita falhas estáticas de build)
  const isMeta = useMemo(() => {
    if (!ua) return false;
    return /FBAN|FBAV|Instagram|FB_IAB|FB4A|FB4I/i.test(ua);
  }, [ua]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  }, []);

  const handleOpen = useCallback(() => {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Falha silenciosa
    } finally {
      dismiss();
    }
  }, [url, dismiss]);

  if (!isMeta || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 dark:bg-black/90 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-[32px] bg-white dark:bg-neutral-900 p-8 space-y-6 shadow-2xl border border-neutral-100 dark:border-neutral-800">
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white uppercase">
            {t("open_browser.title")}
          </h2>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {t("open_browser.subtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpen}
          className="w-full rounded-2xl bg-black dark:bg-white text-white dark:text-black py-4 font-black text-sm uppercase tracking-wider shadow-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          {t("open_browser.cta")}
        </button>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 underline underline-offset-4 hover:text-neutral-600"
          >
            {t("open_browser.reload")}
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {t("open_browser.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
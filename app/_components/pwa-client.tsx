"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/lib/i18n";

function isMetaInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|FB_IAB|FB4A|FB4I/i.test(ua);
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function tryOpenExternalBrowser(url: string) {
  const ua = navigator.userAgent || "";
  
  if (/Android/i.test(ua)) {
    // Isola o protocolo e remove fragmentos residuais injetados pelo Webview da Meta
    const noProto = url.replace(/^https?:\/\//, "").split("#")[0];
    const intent = `intent://${noProto}#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intent;
    return;
  }

  // iOS e sistemas legados: Força a abertura disparando um nó fantasma no DOM com target seguro
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function PWAClient() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setUrl(window.location.href);
  }, []);

  const metaData = useMemo(() => {
    if (!isMounted) return { isMeta: false, isIos: false };
    return {
      isMeta: isMetaInAppBrowser(navigator.userAgent),
      isIos: isIOS()
    };
  }, [isMounted]);

  if (!isMounted || !metaData.isMeta) return null;

  return (
    <div className="sticky top-0 z-[100] w-full bg-amber-50/95 dark:bg-neutral-900/95 border-b border-amber-200 dark:border-neutral-800 backdrop-blur-sm shadow-md animate-fade-in">
      <div className="max-w-4xl mx-auto px-4 py-3.5">
        <div className="flex flex-col gap-3.5">
          <div className="space-y-1">
            <p className="font-black text-xs uppercase tracking-widest text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
              ⚠️ {t("open_browser.title")}
            </p>
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {t("open_browser.subtitle")}
            </p>
            {metaData.isIos && (
              <p className="text-[10px] bg-amber-200/40 dark:bg-amber-950/30 p-2 rounded-xl text-amber-900 dark:text-amber-300 font-medium">
                 No iPhone: toque em <span className="font-black">...</span> ou no ícone de bússola e selecione <span className="font-black">"Abrir no Safari"</span>.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => tryOpenExternalBrowser(url)}
              className="flex-1 px-4 py-3 rounded-2xl text-xs font-black bg-black text-white dark:bg-white dark:text-black active:scale-[0.98] transition-all shadow-md"
            >
              {t("open_browser.cta")}
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  alert(t("clipboard.copied"));
                } catch {
                  window.prompt(t("clipboard.prompt"), url);
                }
              }}
              className="px-4 py-3 rounded-2xl text-xs font-black bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700 transition"
            >
              {t("share.copy_link")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import { Download, Share2, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Language = "pt" | "en" | "ja";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const DISMISSED_KEY = "yamada:pwa-install-dismissed:v1";

const COPY = {
  pt: {
    offlineTitle: "Sem conexão com a internet",
    offlineBody: "Você pode consultar a tela, mas aguarde a conexão voltar antes de finalizar ou alterar um pedido.",
    installTitle: "Instale o app Yamada",
    installBody: "Abra mais rápido, acompanhe pedidos e receba avisos sem procurar o link novamente.",
    install: "Instalar app",
    iosTitle: "Adicionar à Tela de Início",
    iosBody: "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
    later: "Agora não",
    close: "Fechar",
  },
  en: {
    offlineTitle: "No internet connection",
    offlineBody: "You can view this screen, but wait until the connection returns before placing or changing an order.",
    installTitle: "Install the Yamada app",
    installBody: "Open it faster, track orders and receive alerts without searching for the link again.",
    install: "Install app",
    iosTitle: "Add to Home Screen",
    iosBody: "In Safari, tap Share and then “Add to Home Screen”.",
    later: "Not now",
    close: "Close",
  },
  ja: {
    offlineTitle: "インターネットに接続されていません",
    offlineBody: "画面の確認はできますが、注文の確定・変更は接続が戻ってから行ってください。",
    installTitle: "Yamadaアプリをインストール",
    installBody: "リンクを探さず、すぐに開いて注文確認や通知を利用できます。",
    install: "アプリをインストール",
    iosTitle: "ホーム画面に追加",
    iosBody: "Safariの共有ボタンを押し、「ホーム画面に追加」を選択してください。",
    later: "後で",
    close: "閉じる",
  },
} as const;

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export default function CustomerAppReadiness({
  language,
  compact = false,
}: {
  language: Language;
  compact?: boolean;
}) {
  const text = COPY[language];
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const platform = useMemo(() => {
    if (typeof navigator === "undefined") return { ios: false, safari: false };
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/i.test(ua);
    const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    return { ios, safari };
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(isStandaloneMode());
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onBeforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setInstallPrompt(promptEvent);
      setDismissed(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const dismissInstall = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!installPrompt || installing) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else {
        dismissInstall();
      }
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  const showIosInstructions = platform.ios && platform.safari && !installed && !dismissed;
  const showInstallButton = Boolean(installPrompt) && !installed && !dismissed;

  if (online && !showIosInstructions && !showInstallButton) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!online && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 ${
            compact ? "px-3 py-2.5" : "p-4"
          }`}
        >
          <WifiOff className="mt-0.5 shrink-0" size={compact ? 18 : 20} />
          <div>
            <p className="text-sm font-black">{text.offlineTitle}</p>
            <p className="mt-0.5 text-xs font-medium opacity-80">{text.offlineBody}</p>
          </div>
        </div>
      )}

      {(showInstallButton || showIosInstructions) && (
        <div
          className={`relative flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/35 dark:text-blue-100 ${
            compact ? "px-3 py-3" : "p-4"
          }`}
        >
          <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
            {showIosInstructions ? <Share2 size={18} /> : <Download size={18} />}
          </div>
          <div className="min-w-0 flex-1 pr-7">
            <p className="text-sm font-black">{showIosInstructions ? text.iosTitle : text.installTitle}</p>
            <p className="mt-0.5 text-xs font-medium opacity-80">
              {showIosInstructions ? text.iosBody : text.installBody}
            </p>
            {showInstallButton && (
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Download size={15} />
                {text.install}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={dismissInstall}
            aria-label={text.close}
            title={text.later}
            className="absolute right-2 top-2 rounded-lg p-1.5 opacity-60 transition hover:bg-blue-100 hover:opacity-100 dark:hover:bg-blue-900/50"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

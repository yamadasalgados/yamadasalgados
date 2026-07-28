"use client";

import { Download, ExternalLink, Share2, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Language = "pt" | "en" | "ja";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

// Versão nova para que quem dispensou a faixa antiga veja a orientação corrigida no iPhone.
const DISMISSED_KEY = "yamada:pwa-install-dismissed:v2";

const COPY = {
  pt: {
    offlineTitle: "Sem conexão com a internet",
    offlineBody: "Você pode consultar a tela, mas aguarde a conexão voltar antes de finalizar ou alterar um pedido.",
    installTitle: "Instale o app Yamada",
    installBody: "Abra mais rápido, acompanhe pedidos e receba avisos sem procurar o link novamente.",
    install: "Instalar app",
    iosTitle: "Instale o Yamada no iPhone",
    iosSafariBody: "Toque no botão Compartilhar do Safari e escolha “Adicionar à Tela de Início”. Depois abra o ícone Yamada criado na tela inicial.",
    iosOtherBody: "No iPhone, a instalação deve ser feita pelo Safari. Abra este mesmo endereço no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.",
    iosStepOne: "1. Abra no Safari",
    iosStepTwo: "2. Compartilhar",
    iosStepThree: "3. Adicionar à Tela de Início",
    understood: "Entendi",
    later: "Agora não",
    close: "Fechar",
  },
  en: {
    offlineTitle: "No internet connection",
    offlineBody: "You can view this screen, but wait until the connection returns before placing or changing an order.",
    installTitle: "Install the Yamada app",
    installBody: "Open it faster, track orders and receive alerts without searching for the link again.",
    install: "Install app",
    iosTitle: "Install Yamada on iPhone",
    iosSafariBody: "Tap Safari's Share button and choose “Add to Home Screen”. Then open the Yamada icon created on your Home Screen.",
    iosOtherBody: "On iPhone, installation must be completed in Safari. Open this same address in Safari, tap Share and choose “Add to Home Screen”.",
    iosStepOne: "1. Open in Safari",
    iosStepTwo: "2. Share",
    iosStepThree: "3. Add to Home Screen",
    understood: "Got it",
    later: "Not now",
    close: "Close",
  },
  ja: {
    offlineTitle: "インターネットに接続されていません",
    offlineBody: "画面の確認はできますが、注文の確定・変更は接続が戻ってから行ってください。",
    installTitle: "Yamadaアプリをインストール",
    installBody: "リンクを探さず、すぐに開いて注文確認や通知を利用できます。",
    install: "アプリをインストール",
    iosTitle: "iPhoneにYamadaを追加",
    iosSafariBody: "Safariの共有ボタンを押し、「ホーム画面に追加」を選択してください。その後、ホーム画面に作成されたYamadaアイコンから開きます。",
    iosOtherBody: "iPhoneではSafariからインストールします。同じURLをSafariで開き、共有から「ホーム画面に追加」を選択してください。",
    iosStepOne: "1. Safariで開く",
    iosStepTwo: "2. 共有",
    iosStepThree: "3. ホーム画面に追加",
    understood: "確認しました",
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
  mode = "all",
}: {
  language: Language;
  compact?: boolean;
  mode?: "all" | "install" | "offline";
}) {
  const text = COPY[language];
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [ready, setReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const platform = useMemo(() => {
    if (typeof navigator === "undefined") {
      return { ios: false, safari: false };
    }

    const ua = navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    return { ios, safari };
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(isStandaloneMode());
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");

    const revealTimer = window.setTimeout(() => setReady(true), 700);
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
      window.clearTimeout(revealTimer);
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

  const installEnabled = mode !== "offline";
  const offlineEnabled = mode !== "install";
  const showOffline = offlineEnabled && !online;
  const showIosInstructions = installEnabled && ready && platform.ios && !installed && !dismissed;
  const showInstallButton = installEnabled && ready && Boolean(installPrompt) && !installed && !dismissed;

  if (!showOffline && !showIosInstructions && !showInstallButton) return null;

  return (
    <>
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {showOffline && (
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

        {showInstallButton && !showIosInstructions && (
          <div
            className={`relative flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/35 dark:text-blue-100 ${
              compact ? "px-3 py-3" : "p-4"
            }`}
          >
            <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
              <Download size={18} />
            </div>
            <div className="min-w-0 flex-1 pr-7">
              <p className="text-sm font-black">{text.installTitle}</p>
              <p className="mt-0.5 text-xs font-medium opacity-80">{text.installBody}</p>
              <button
                type="button"
                onClick={() => void install()}
                disabled={installing}
                className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Download size={15} />
                {text.install}
              </button>
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

      {showIosInstructions && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="yamada-ios-install-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-neutral-950 shadow-2xl dark:bg-neutral-900 dark:text-neutral-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                  {platform.safari ? <Share2 size={22} /> : <ExternalLink size={22} />}
                </div>
                <div>
                  <h2 id="yamada-ios-install-title" className="text-lg font-black">{text.iosTitle}</h2>
                  <p className="mt-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                    {platform.safari ? text.iosSafariBody : text.iosOtherBody}
                  </p>
                </div>
              </div>
              <button type="button" onClick={dismissInstall} className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label={text.close}>
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 grid gap-2 text-sm font-black">
              {!platform.safari && <div className="rounded-2xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">{text.iosStepOne}</div>}
              <div className="rounded-2xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">{text.iosStepTwo}</div>
              <div className="rounded-2xl bg-neutral-100 px-4 py-3 dark:bg-neutral-800">{text.iosStepThree}</div>
            </div>

            <button type="button" onClick={dismissInstall} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-neutral-950">
              {text.understood}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

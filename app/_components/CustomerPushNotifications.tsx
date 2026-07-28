"use client";

import {
  Bell,
  BellOff,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CustomerSession } from "@/app/hooks/useCustomerSession";
import {
  currentKeySubscription,
  detectPushEnvironment,
  getPushServiceWorkerRegistration,
  showLocalPushTest,
  urlBase64ToArrayBuffer,
  vapidFingerprint,
  waitForPushTest,
} from "@/app/lib/push-client";

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

type TestState = "idle" | "loading" | "success" | "error";

const PROMPT_DISMISSED_KEY = "yamada:customer-push-prompt-dismissed:v1";

const COPY = {
  pt: {
    title: "Acompanhe seu pedido",
    body: "Receba avisos quando o pedido entrar em preparação, ficar pronto, for entregue ou cancelado.",
    enable: "Ativar avisos",
    enabling: "Ativando...",
    enabled: "Notificações de pedidos ativadas neste aparelho.",
    disable: "Desativar",
    denied: "As notificações estão bloqueadas nas configurações do aparelho ou navegador.",
    unsupported: "Este aparelho não oferece Web Push nesta forma de abertura.",
    installTitle: "Abra pelo ícone instalado",
    installBody: "No iPhone ou iPad, adicione o site à Tela de Início e abra o ícone Yamada. Notificações não são ativadas dentro de uma aba comum do Safari ou Chrome.",
    error: "Não foi possível ativar as notificações.",
    missingKey: "A chave pública de notificações não está configurada na versão publicada.",
    localTest: "Teste do aparelho",
    serverTest: "Teste completo",
    testing: "Testando...",
    localSuccess: "Teste local exibido. O aparelho e o Service Worker estão funcionando.",
    serverSuccess: "Teste completo aceito pelo serviço push. A notificação deve aparecer neste aparelho.",
    serverPartial: "O servidor enviou o teste, mas também encontrou uma assinatura antiga com erro.",
    vapidMismatch: "As chaves VAPID da Vercel e das Firebase Functions são diferentes.",
    noSubscription: "A assinatura deste aparelho não foi encontrada no Firebase. Desative e ative novamente.",
    staleSubscription: "A assinatura foi criada com uma chave antiga. Desative e ative novamente.",
    pushRejected: "O serviço push recusou a assinatura. Desative e ative novamente.",
    timeout: "O teste não terminou a tempo. Consulte os logs da função notifyPushTestRequest.",
    diagnosticError: "O teste completo falhou.",
    diagnostics: "Diagnóstico",
    permission: "permissão",
    standalone: "instalado",
    browserTab: "aba do navegador",
  },
  en: {
    title: "Track your order",
    body: "Get alerts when your order enters preparation, is ready, delivered, or cancelled.",
    enable: "Enable alerts",
    enabling: "Enabling...",
    enabled: "Order notifications are enabled on this device.",
    disable: "Disable",
    denied: "Notifications are blocked in the device or browser settings.",
    unsupported: "This device does not offer Web Push in the current opening mode.",
    installTitle: "Open the installed icon",
    installBody: "On iPhone or iPad, add the site to the Home Screen and open the Yamada icon. Notifications cannot be enabled inside a normal Safari or Chrome tab.",
    error: "Could not enable notifications.",
    missingKey: "The public notification key is missing from the deployed version.",
    localTest: "Device test",
    serverTest: "Full test",
    testing: "Testing...",
    localSuccess: "Local test displayed. The device and service worker are working.",
    serverSuccess: "The push service accepted the full test. The notification should appear on this device.",
    serverPartial: "The server sent the test but also found an old subscription with an error.",
    vapidMismatch: "The Vercel and Firebase Functions VAPID keys do not match.",
    noSubscription: "This device subscription was not found in Firebase. Disable and enable it again.",
    staleSubscription: "The subscription uses an old key. Disable and enable it again.",
    pushRejected: "The push service rejected the subscription. Disable and enable it again.",
    timeout: "The test did not finish in time. Check the notifyPushTestRequest logs.",
    diagnosticError: "The full test failed.",
    diagnostics: "Diagnostics",
    permission: "permission",
    standalone: "installed",
    browserTab: "browser tab",
  },
  ja: {
    title: "注文状況を通知",
    body: "準備開始、準備完了、受け渡し済み、キャンセル時にお知らせします。",
    enable: "通知を有効にする",
    enabling: "設定中...",
    enabled: "この端末で注文通知が有効です。",
    disable: "無効にする",
    denied: "端末またはブラウザの設定で通知がブロックされています。",
    unsupported: "現在の開き方ではWeb Pushを利用できません。",
    installTitle: "インストールしたアイコンから開く",
    installBody: "iPhone・iPadではホーム画面に追加し、Yamadaのアイコンから開いてください。SafariやChromeの通常タブ内では通知を有効にできません。",
    error: "通知を有効にできませんでした。",
    missingKey: "公開中のバージョンに通知用公開キーがありません。",
    localTest: "端末テスト",
    serverTest: "完全テスト",
    testing: "テスト中...",
    localSuccess: "端末テストを表示しました。端末とService Workerは動作しています。",
    serverSuccess: "Pushサービスが完全テストを受理しました。この端末に通知が表示されます。",
    serverPartial: "テストは送信されましたが、古い購読にもエラーがありました。",
    vapidMismatch: "VercelとFirebase FunctionsのVAPIDキーが一致していません。",
    noSubscription: "この端末の購読がFirebaseにありません。無効化して再度有効にしてください。",
    staleSubscription: "古いキーで作成された購読です。無効化して再度有効にしてください。",
    pushRejected: "Pushサービスが購読を拒否しました。無効化して再度有効にしてください。",
    timeout: "テストが時間内に完了しませんでした。notifyPushTestRequestのログを確認してください。",
    diagnosticError: "完全テストに失敗しました。",
    diagnostics: "診断",
    permission: "権限",
    standalone: "インストール済み",
    browserTab: "ブラウザタブ",
  },
} as const;

function diagnosticMessage(
  code: string,
  fallback: string,
  text: (typeof COPY)[keyof typeof COPY],
): string {
  if (code === "VAPID_MISMATCH") return text.vapidMismatch;
  if (code === "NO_SUBSCRIPTION") return text.noSubscription;
  if (code === "STALE_SUBSCRIPTION") return text.staleSubscription;
  if (code === "PUSH_REJECTED") return text.pushRejected;
  if (code === "PUSH_TEST_TIMEOUT") return text.timeout;
  return fallback || text.diagnosticError;
}

export default function CustomerPushNotifications({
  session,
  language,
  compact = false,
  promptOnce = false,
}: Props) {
  const text = COPY[language];
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const environment = useMemo(() => detectPushEnvironment(), []);
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [localTestState, setLocalTestState] = useState<TestState>("idle");
  const [serverTestState, setServerTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");

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
    async (subscription: PushSubscription): Promise<string> => {
      if (!session.user) throw new Error(text.error);
      const token = await session.user.getIdToken();
      const fingerprint = await vapidFingerprint(publicKey);
      const response = await fetch("/api/customer/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          language,
          vapidFingerprint: fingerprint,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; subscriptionId?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.subscriptionId) {
        throw new Error(payload?.error || text.error);
      }
      setSubscriptionId(payload.subscriptionId);
      return payload.subscriptionId;
    },
    [language, publicKey, session.user, text.error],
  );

  const check = useCallback(async () => {
    if (!session.registered || !session.user) return;

    // No iPhone/iPad, primeiro explicamos a exigência da Tela de Início.
    // Em uma aba normal, PushManager pode não ser exposto e antes isso aparecia
    // incorretamente como "navegador incompatível".
    if (environment.isIos && !environment.isStandalone) {
      setState("install_required");
      return;
    }
    if (!environment.supported) {
      setState("unsupported");
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
      const registration = await getPushServiceWorkerRegistration();
      const subscription = await currentKeySubscription(registration, publicKey);
      if (!subscription) {
        setSubscriptionId("");
        setState("ready");
        return;
      }
      await syncSubscription(subscription);
      setState("subscribed");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : text.error);
      setState("error");
    }
  }, [environment, publicKey, session.registered, session.user, syncSubscription, text.error, text.missingKey]);

  useEffect(() => {
    if (!session.loading) void check();
  }, [check, session.loading]);

  const enable = useCallback(async () => {
    if (!session.user || !environment.supported) return;
    try {
      setState("loading");
      setError("");
      setTestMessage("");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }
      const registration = await getPushServiceWorkerRegistration();
      let subscription = await currentKeySubscription(registration, publicKey);
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
  }, [dismissPrompt, environment.supported, promptOnce, publicKey, session.user, syncSubscription, text.error]);

  const disable = useCallback(async () => {
    if (!session.user || !environment.supported) return;
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
      }
      // Não removemos a PushSubscription do navegador porque a mesma origem pode
      // estar cadastrada também para o seller neste aparelho.
      setSubscriptionId("");
      setState("ready");
      setTestMessage("");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : text.error);
      setState("error");
    }
  }, [environment.supported, session.user, text.error]);

  const localTest = useCallback(async () => {
    try {
      setLocalTestState("loading");
      setTestMessage("");
      const registration = await getPushServiceWorkerRegistration();
      await showLocalPushTest(registration, language);
      setLocalTestState("success");
      setTestMessage(text.localSuccess);
    } catch (testError) {
      setLocalTestState("error");
      setTestMessage(testError instanceof Error ? testError.message : text.diagnosticError);
    }
  }, [language, text.diagnosticError, text.localSuccess]);

  const serverTest = useCallback(async () => {
    if (!session.user) return;
    try {
      setServerTestState("loading");
      setTestMessage("");
      const registration = await getPushServiceWorkerRegistration();
      const subscription = await currentKeySubscription(registration, publicKey);
      if (!subscription) throw new Error(text.noSubscription);
      const currentSubscriptionId = subscriptionId || (await syncSubscription(subscription));
      const token = await session.user.getIdToken();
      const clientVapidFingerprint = await vapidFingerprint(publicKey);
      const response = await fetch("/api/customer/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscriptionId: currentSubscriptionId,
          language,
          clientVapidFingerprint,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; requestId?: string; error?: string; code?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.requestId) {
        throw new Error(payload?.error || payload?.code || text.diagnosticError);
      }
      const result = await waitForPushTest({
        url: "/api/customer/push/test",
        token,
        requestId: payload.requestId,
      });
      if (!result.ok) {
        throw new Error(`${result.code}|${result.message}`);
      }
      setServerTestState("success");
      setTestMessage(result.status === "partial" ? text.serverPartial : text.serverSuccess);
    } catch (testError) {
      const raw = testError instanceof Error ? testError.message : "";
      const [code, fallback] = raw.includes("|") ? raw.split("|", 2) : [raw, raw];
      setServerTestState("error");
      setTestMessage(diagnosticMessage(code, fallback, text));
    }
  }, [language, publicKey, session.user, subscriptionId, syncSubscription, text]);

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

        {!promptOnce && (
          <div className="mt-4 border-t border-emerald-200 pt-4 dark:border-emerald-900/60">
            <p className="text-[11px] font-black uppercase tracking-wide opacity-70">{text.diagnostics}</p>
            <p className="mt-1 text-[11px] font-semibold opacity-70">
              {text.permission}: {environment.permission} · {environment.isStandalone ? text.standalone : text.browserTab}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void localTest()}
                disabled={localTestState === "loading" || serverTestState === "loading"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[11px] font-black disabled:opacity-50 dark:border-emerald-800 dark:bg-neutral-950/60"
              >
                {localTestState === "loading" ? <Loader2 className="animate-spin" size={14} /> : <FlaskConical size={14} />}
                {localTestState === "loading" ? text.testing : text.localTest}
              </button>
              <button
                type="button"
                onClick={() => void serverTest()}
                disabled={localTestState === "loading" || serverTestState === "loading"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"
              >
                {serverTestState === "loading" ? <Loader2 className="animate-spin" size={14} /> : serverTestState === "success" ? <CheckCircle2 size={14} /> : <Send size={14} />}
                {serverTestState === "loading" ? text.testing : text.serverTest}
              </button>
            </div>
            {testMessage && (
              <p className={`mt-3 rounded-xl p-3 text-[11px] font-bold ${localTestState === "error" || serverTestState === "error" ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" : "bg-white/80 text-emerald-900 dark:bg-neutral-950/50 dark:text-emerald-100"}`}>
                {testMessage}
              </p>
            )}
          </div>
        )}
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

"use client";

import {
  Bell,
  BellOff,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Send,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import {
  currentKeySubscription,
  detectPushEnvironment,
  getPushServiceWorkerRegistration,
  showLocalPushTest,
  urlBase64ToArrayBuffer,
  vapidFingerprint,
  waitForPushTest,
} from "@/app/lib/push-client";

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

type TestState = "idle" | "loading" | "success" | "error";

const COPY = {
  pt: {
    title: "Avisos de novos pedidos",
    body: "Receba uma notificação mesmo quando o painel estiver fechado ou em segundo plano.",
    enable: "Ativar neste aparelho",
    enabling: "Ativando…",
    enabled: "Notificações de novos pedidos estão ativas neste aparelho.",
    disable: "Desativar para esta loja",
    denied: "As notificações estão bloqueadas nas configurações do aparelho ou navegador.",
    unsupported: "Este aparelho não oferece Web Push nesta forma de abertura.",
    installTitle: "Abra pelo ícone instalado",
    installBody: "No iPhone ou iPad, adicione o site à Tela de Início e abra o ícone Yamada. Notificações não são ativadas dentro de uma aba comum do Safari ou Chrome.",
    missingKey: "A chave pública de notificações não está configurada na versão publicada.",
    error: "Não foi possível configurar as notificações.",
    localTest: "Teste do aparelho",
    serverTest: "Teste completo",
    testing: "Testando…",
    localSuccess: "Teste local exibido. O aparelho e o Service Worker estão funcionando.",
    serverSuccess: "Teste completo aceito pelo serviço push. A notificação deve aparecer neste aparelho.",
    serverPartial: "O servidor enviou o teste, mas também encontrou uma assinatura antiga com erro.",
    vapidMismatch: "As chaves VAPID da Vercel e das Firebase Functions são diferentes.",
    noSubscription: "A assinatura deste aparelho não foi encontrada no Firebase. Desative e ative novamente.",
    staleSubscription: "A assinatura foi criada com uma chave antiga. Desative e ative novamente.",
    pushRejected: "O serviço push recusou a assinatura. Desative e ative novamente.",
    timeoutQueued: "A solicitação foi salva, mas a função notifyPushTestRequest não começou. Publique essa função no Firebase e tente novamente.",
    timeoutProcessing: "A função começou, mas não terminou. Verifique os logs de notifyPushTestRequest e a configuração VAPID_PRIVATE.",
    timeout: "O teste não terminou a tempo. Consulte os logs da função notifyPushTestRequest.",
    diagnosticError: "O teste completo falhou.",
    diagnostics: "Diagnóstico",
    permission: "permissão",
    standalone: "instalado",
    browserTab: "aba do navegador",
  },
  en: {
    title: "New order alerts",
    body: "Receive a notification even when the dashboard is closed or running in the background.",
    enable: "Enable on this device",
    enabling: "Enabling…",
    enabled: "New order notifications are enabled on this device.",
    disable: "Disable for this store",
    denied: "Notifications are blocked in the device or browser settings.",
    unsupported: "This device does not offer Web Push in the current opening mode.",
    installTitle: "Open the installed icon",
    installBody: "On iPhone or iPad, add the site to the Home Screen and open the Yamada icon. Notifications cannot be enabled inside a normal Safari or Chrome tab.",
    missingKey: "The public notification key is missing from the deployed version.",
    error: "Could not configure notifications.",
    localTest: "Device test",
    serverTest: "Full test",
    testing: "Testing…",
    localSuccess: "Local test displayed. The device and service worker are working.",
    serverSuccess: "The push service accepted the full test. The notification should appear on this device.",
    serverPartial: "The server sent the test but also found an old subscription with an error.",
    vapidMismatch: "The Vercel and Firebase Functions VAPID keys do not match.",
    noSubscription: "This device subscription was not found in Firebase. Disable and enable it again.",
    staleSubscription: "The subscription uses an old key. Disable and enable it again.",
    pushRejected: "The push service rejected the subscription. Disable and enable it again.",
    timeoutQueued: "The request was saved, but notifyPushTestRequest did not start. Deploy that Firebase function and try again.",
    timeoutProcessing: "The function started but did not finish. Check the notifyPushTestRequest logs and VAPID_PRIVATE configuration.",
    timeout: "The test did not finish in time. Check the notifyPushTestRequest logs.",
    diagnosticError: "The full test failed.",
    diagnostics: "Diagnostics",
    permission: "permission",
    standalone: "installed",
    browserTab: "browser tab",
  },
  ja: {
    title: "新規注文の通知",
    body: "管理画面を閉じている時やバックグラウンドでも新しい注文を通知します。",
    enable: "この端末で有効にする",
    enabling: "設定中…",
    enabled: "この端末で新規注文通知が有効です。",
    disable: "この店舗の通知を無効にする",
    denied: "端末またはブラウザの設定で通知がブロックされています。",
    unsupported: "現在の開き方ではWeb Pushを利用できません。",
    installTitle: "インストールしたアイコンから開く",
    installBody: "iPhone・iPadではホーム画面に追加し、Yamadaのアイコンから開いてください。SafariやChromeの通常タブ内では通知を有効にできません。",
    missingKey: "公開中のバージョンに通知用公開キーがありません。",
    error: "通知を設定できませんでした。",
    localTest: "端末テスト",
    serverTest: "完全テスト",
    testing: "テスト中…",
    localSuccess: "端末テストを表示しました。端末とService Workerは動作しています。",
    serverSuccess: "Pushサービスが完全テストを受理しました。この端末に通知が表示されます。",
    serverPartial: "テストは送信されましたが、古い購読にもエラーがありました。",
    vapidMismatch: "VercelとFirebase FunctionsのVAPIDキーが一致していません。",
    noSubscription: "この端末の購読がFirebaseにありません。無効化して再度有効にしてください。",
    staleSubscription: "古いキーで作成された購読です。無効化して再度有効にしてください。",
    pushRejected: "Pushサービスが購読を拒否しました。無効化して再度有効にしてください。",
    timeoutQueued: "リクエストは保存されましたが、notifyPushTestRequestが開始されませんでした。Firebaseへこの関数をデプロイしてください。",
    timeoutProcessing: "関数は開始しましたが完了しませんでした。notifyPushTestRequestのログとVAPID_PRIVATEを確認してください。",
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
  if (code === "PUSH_TEST_TIMEOUT_QUEUED") return text.timeoutQueued;
  if (code === "PUSH_TEST_TIMEOUT_PROCESSING") return text.timeoutProcessing;
  if (code === "PUSH_TEST_TIMEOUT" || code === "PUSH_TEST_TIMEOUT_UNKNOWN") return text.timeout;
  return fallback || text.diagnosticError;
}

export default function SellerPushNotifications({ language }: { language: Language }) {
  const { user, sellerId } = useSellerSession();
  const text = COPY[language];
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const environment = useMemo(() => detectPushEnvironment(), []);
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [localTestState, setLocalTestState] = useState<TestState>("idle");
  const [serverTestState, setServerTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");

  const syncSubscription = useCallback(
    async (subscription: PushSubscription): Promise<string> => {
      const token = await user.getIdToken();
      const fingerprint = await vapidFingerprint(publicKey);
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
    [language, publicKey, sellerId, text.error, user],
  );

  const check = useCallback(async () => {
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
  }, [environment, publicKey, syncSubscription, text.error, text.missingKey]);

  useEffect(() => {
    void check();
  }, [check]);

  const enable = useCallback(async () => {
    if (!environment.supported) return;
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
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : text.error);
      setState("error");
    }
  }, [environment.supported, publicKey, syncSubscription, text.error]);

  const disable = useCallback(async () => {
    if (!environment.supported) return;
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
      setSubscriptionId("");
      setState("ready");
      setTestMessage("");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : text.error);
      setState("error");
    }
  }, [environment.supported, sellerId, text.error, user]);

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
    try {
      setServerTestState("loading");
      setTestMessage("");
      const registration = await getPushServiceWorkerRegistration();
      const subscription = await currentKeySubscription(registration, publicKey);
      if (!subscription) throw new Error(text.noSubscription);
      const currentSubscriptionId = subscriptionId || (await syncSubscription(subscription));
      const token = await user.getIdToken();
      const clientVapidFingerprint = await vapidFingerprint(publicKey);
      const response = await fetch("/api/seller/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerId,
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
        url: `/api/seller/push/test?sellerId=${encodeURIComponent(sellerId)}`,
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
  }, [language, publicKey, sellerId, subscriptionId, syncSubscription, text, user]);

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
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void disable()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-neutral-950/60 dark:text-emerald-200"
          >
            <BellOff size={16} />
            {text.disable}
          </button>

          <div className="border-t border-emerald-200 pt-4 dark:border-emerald-900/60">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-900/65 dark:text-emerald-200/70">{text.diagnostics}</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-900/65 dark:text-emerald-200/70">
              {text.permission}: {environment.permission} · {environment.isStandalone ? text.standalone : text.browserTab}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void localTest()}
                disabled={localTestState === "loading" || serverTestState === "loading"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-neutral-950/60 dark:text-emerald-200"
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
        </div>
      )}
    </section>
  );
}

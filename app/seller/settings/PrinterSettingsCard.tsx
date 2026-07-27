"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Printer, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";

type PrintSettingsResponse = {
  enabled: boolean;
  autoPrint: boolean;
  copies: "both" | "production" | "customer";
  configured: boolean;
  tokenPrefix: string;
  online: boolean;
  lastSeenAt: string | null;
  lastPrintedAt: string | null;
  lastError: string | null;
};

const EMPTY: PrintSettingsResponse = {
  enabled: false,
  autoPrint: true,
  copies: "both",
  configured: false,
  tokenPrefix: "",
  online: false,
  lastSeenAt: null,
  lastPrintedAt: null,
  lastError: null,
};

export default function PrinterSettingsCard({ lang }: { lang: string }) {
  const { user, sellerId } = useSellerSession();
  const [settings, setSettings] = useState<PrintSettingsResponse>(EMPTY);
  const [stationToken, setStationToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const copy = useMemo(
    () =>
      lang === "ja"
        ? {
            title: "自動印刷",
            subtitle: "Macで動く無料のYamada Print Serviceに注文を送信します。",
            enabled: "自動印刷を有効にする",
            auto: "新規注文を自動印刷",
            copies: "印刷する控え",
            both: "製造用 + お客様用",
            production: "製造用のみ",
            customer: "お客様用のみ",
            generate: "接続キーを生成",
            rotate: "接続キーを再発行",
            test: "テスト印刷を送信",
            online: "印刷サービス接続中",
            offline: "印刷サービス未接続",
            lastSeen: "最終接続",
            lastPrint: "最終印刷",
            tokenHelp: "このキーは一度だけ表示されます。Macのprint-service/.envに貼り付けてください。",
            copied: "コピーしました。",
            saved: "印刷設定を保存しました。",
            queued: "テスト印刷をキューに追加しました。",
            loading: "印刷設定を読み込んでいます…",
            never: "未接続",
          }
        : lang === "en"
          ? {
              title: "Automatic printing",
              subtitle: "Send orders to the free Yamada Print Service running on your Mac.",
              enabled: "Enable print station",
              auto: "Automatically print new orders",
              copies: "Copies to print",
              both: "Production + customer",
              production: "Production only",
              customer: "Customer only",
              generate: "Generate connection key",
              rotate: "Replace connection key",
              test: "Queue test print",
              online: "Print service online",
              offline: "Print service offline",
              lastSeen: "Last connection",
              lastPrint: "Last print",
              tokenHelp: "This key is shown once. Paste it into print-service/.env on the Mac.",
              copied: "Copied.",
              saved: "Print settings saved.",
              queued: "Test print queued.",
              loading: "Loading print settings…",
              never: "Never",
            }
          : {
              title: "Impressão automática",
              subtitle: "Envie pedidos para o Yamada Print Service gratuito executado no seu Mac.",
              enabled: "Ativar estação de impressão",
              auto: "Imprimir novos pedidos automaticamente",
              copies: "Vias para imprimir",
              both: "Produção + cliente",
              production: "Somente produção",
              customer: "Somente cliente",
              generate: "Gerar chave de conexão",
              rotate: "Substituir chave de conexão",
              test: "Enviar impressão de teste",
              online: "Serviço de impressão conectado",
              offline: "Serviço de impressão desconectado",
              lastSeen: "Última conexão",
              lastPrint: "Última impressão",
              tokenHelp: "Esta chave aparece uma única vez. Cole em print-service/.env no Mac.",
              copied: "Chave copiada.",
              saved: "Configuração de impressão salva.",
              queued: "Impressão de teste adicionada à fila.",
              loading: "Carregando configuração de impressão…",
              never: "Nunca",
            },
    [lang],
  );

  const callApi = useCallback(
    async (body?: Record<string, unknown>) => {
      const token = await user.getIdToken(true);
      const url = body
        ? "/api/print/settings"
        : `/api/print/settings?sellerId=${encodeURIComponent(sellerId)}`;
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify({ sellerId, ...body }) } : {}),
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        settings?: PrintSettingsResponse;
        token?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "PRINT_SETTINGS_FAILED");
      }
      return payload;
    },
    [sellerId, user],
  );

  const refresh = useCallback(async () => {
    setError("");
    try {
      const payload = await callApi();
      if (payload.settings) setSettings(payload.settings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "PRINT_SETTINGS_FAILED");
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const run = useCallback(
    async (body: Record<string, unknown>, successMessage: string) => {
      setWorking(true);
      setError("");
      setMessage("");
      try {
        const payload = await callApi(body);
        if (payload.settings) setSettings(payload.settings);
        if (payload.token) setStationToken(payload.token);
        setMessage(successMessage);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "PRINT_SETTINGS_FAILED");
      } finally {
        setWorking(false);
      }
    },
    [callApi],
  );

  if (loading) {
    return (
      <section className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
        <p className="text-sm font-black text-violet-700 dark:text-violet-200">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-3xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Printer className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300" />
          <div>
            <h2 className="font-black">{copy.title}</h2>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-violet-900/75 dark:text-violet-200/80">
              {copy.subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-violet-200 bg-white p-2 dark:border-violet-800 dark:bg-neutral-950"
          aria-label="Atualizar"
        >
          <RefreshCw size={17} />
        </button>
      </div>

      <div className={`flex items-center gap-3 rounded-2xl border p-4 ${
        settings.online
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950/60 dark:text-neutral-200"
      }`}>
        {settings.online ? <Wifi size={20} /> : <WifiOff size={20} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{settings.online ? copy.online : copy.offline}</p>
          <p className="mt-1 text-[11px] font-semibold opacity-75">
            {copy.lastSeen}: {formatDate(settings.lastSeenAt, copy.never)} · {copy.lastPrint}: {formatDate(settings.lastPrintedAt, copy.never)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900/50 dark:bg-neutral-950/60">
          <span className="text-sm font-black">{copy.enabled}</span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setSettings((current) => ({ ...current, enabled }));
              void run({ action: "update", enabled, autoPrint: settings.autoPrint, copies: settings.copies }, copy.saved);
            }}
            className="h-5 w-5 accent-violet-700"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900/50 dark:bg-neutral-950/60">
          <span className="text-sm font-black">{copy.auto}</span>
          <input
            type="checkbox"
            checked={settings.autoPrint}
            disabled={!settings.enabled}
            onChange={(event) => {
              const autoPrint = event.target.checked;
              setSettings((current) => ({ ...current, autoPrint }));
              void run({ action: "update", enabled: settings.enabled, autoPrint, copies: settings.copies }, copy.saved);
            }}
            className="h-5 w-5 accent-violet-700"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-xs font-black uppercase tracking-wide text-violet-800 dark:text-violet-200">{copy.copies}</span>
        <select
          value={settings.copies}
          onChange={(event) => {
            const copies = event.target.value as PrintSettingsResponse["copies"];
            setSettings((current) => ({ ...current, copies }));
            void run({ action: "update", enabled: settings.enabled, autoPrint: settings.autoPrint, copies }, copy.saved);
          }}
          className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black dark:border-violet-900/50 dark:bg-neutral-950"
        >
          <option value="both">{copy.both}</option>
          <option value="production">{copy.production}</option>
          <option value="customer">{copy.customer}</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={working}
          onClick={() => void run({ action: "rotate_token" }, copy.saved)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          <KeyRound size={18} />
          {settings.configured ? copy.rotate : copy.generate}
        </button>
        <button
          type="button"
          disabled={working || !settings.configured || !settings.enabled}
          onClick={() => void run({ action: "test" }, copy.queued)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-violet-300 bg-white px-4 py-3 text-sm font-black disabled:opacity-50 dark:border-violet-800 dark:bg-neutral-950"
        >
          <Send size={18} />
          {copy.test}
        </button>
      </div>

      {stationToken && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-black text-amber-900 dark:text-amber-200">{copy.tokenHelp}</p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={stationToken}
              className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-xs dark:border-amber-800 dark:bg-neutral-950"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(stationToken);
                setMessage(copy.copied);
              }}
              className="rounded-xl border border-amber-300 bg-white px-3 dark:border-amber-800 dark:bg-neutral-950"
            >
              <Copy size={17} />
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={17} /> {message}
        </p>
      )}
      {(error || settings.lastError) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error || settings.lastError}
        </p>
      )}
      {settings.configured && !stationToken && (
        <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Chave configurada: {settings.tokenPrefix}…
        </p>
      )}
    </section>
  );
}

function formatDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
}

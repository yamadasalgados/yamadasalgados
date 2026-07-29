"use client";

import {
  CheckSquare2,
  LoaderCircle,
  QrCode,
  ReceiptText,
  Save,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import {
  DEFAULT_RECEIPT_SETTINGS,
  receiptCheckboxGlyph,
  type ReceiptCheckboxStyle,
  type ReceiptCopySettings,
  type ReceiptQrDestination,
  type ReceiptSettings,
} from "@/app/lib/receipt-settings";

type Language = "pt" | "en" | "ja";
type CopyKey = "production" | "customer";

function languageKey(value: string): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    title: "Recibo personalizado",
    subtitle: "Escolha o conteúdo de cada via. O logo e os textos vêm da Identidade white-label acima.",
    production: "Via do seller / produção",
    customer: "Via do cliente",
    showLogo: "Mostrar logo",
    showHeader: "Mostrar texto do cabeçalho",
    showFooter: "Mostrar texto do rodapé",
    checkbox: "Caixa de conferência antes de cada produto",
    checkboxStyle: "Estilo da caixa",
    qr: "Mostrar QR Code",
    qrDestination: "Destino do QR Code",
    qrLabel: "Texto abaixo do QR Code",
    customUrl: "Link personalizado",
    sellerOrder: "Detalhe do pedido no painel do seller",
    customerTracking: "Acompanhamento do pedido pelo cliente",
    store: "Página pública da loja",
    custom: "Link personalizado",
    trackingFallback: "Quando o pedido não estiver ligado a uma conta, o QR de acompanhamento abrirá a loja.",
    save: "Salvar recibos",
    saving: "Salvando…",
    saved: "Configuração dos recibos salva.",
    loading: "Carregando recibos…",
    preview: "Exemplo",
    styles: {
      square: "Quadrado: □",
      brackets: "Colchetes: [ ]",
      circle: "Círculo: ○",
      line: "Linha: ____",
    },
  },
  en: {
    title: "Personalized receipt",
    subtitle: "Choose the content of each copy. The logo and texts come from the white-label identity above.",
    production: "Seller / production copy",
    customer: "Customer copy",
    showLogo: "Show logo",
    showHeader: "Show header text",
    showFooter: "Show footer text",
    checkbox: "Checklist mark before each product",
    checkboxStyle: "Checklist style",
    qr: "Show QR code",
    qrDestination: "QR code destination",
    qrLabel: "Text below QR code",
    customUrl: "Custom link",
    sellerOrder: "Order detail in seller dashboard",
    customerTracking: "Customer order tracking",
    store: "Public store page",
    custom: "Custom link",
    trackingFallback: "When an order is not linked to an account, the tracking QR opens the store.",
    save: "Save receipts",
    saving: "Saving…",
    saved: "Receipt settings saved.",
    loading: "Loading receipts…",
    preview: "Example",
    styles: {
      square: "Square: □",
      brackets: "Brackets: [ ]",
      circle: "Circle: ○",
      line: "Line: ____",
    },
  },
  ja: {
    title: "カスタムレシート",
    subtitle: "各控えの内容を設定します。ロゴと文章は上のホワイトラベル店舗情報から使用します。",
    production: "販売者・製造用",
    customer: "お客様用",
    showLogo: "ロゴを表示",
    showHeader: "ヘッダー文章を表示",
    showFooter: "フッター文章を表示",
    checkbox: "各商品の前に確認欄を表示",
    checkboxStyle: "確認欄の形式",
    qr: "QRコードを表示",
    qrDestination: "QRコードのリンク先",
    qrLabel: "QRコード下の文章",
    customUrl: "カスタムリンク",
    sellerOrder: "販売者画面の注文詳細",
    customerTracking: "お客様の注文確認ページ",
    store: "公開店舗ページ",
    custom: "カスタムリンク",
    trackingFallback: "アカウントに紐づかない注文では、注文確認QRは店舗ページを開きます。",
    save: "レシート設定を保存",
    saving: "保存中…",
    saved: "レシート設定を保存しました。",
    loading: "レシート設定を読み込んでいます…",
    preview: "例",
    styles: {
      square: "四角: □",
      brackets: "括弧: [ ]",
      circle: "丸: ○",
      line: "線: ____",
    },
  },
} as const;

export default function ReceiptSettingsCard({ lang }: { lang: string }) {
  const { user, sellerId } = useSellerSession();
  const copy = COPY[languageKey(lang)];
  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const callApi = useCallback(async (body?: Record<string, unknown>) => {
    const token = await user.getIdToken(true);
    const response = await fetch(
      body ? "/api/print/receipt-settings" : `/api/print/receipt-settings?sellerId=${encodeURIComponent(sellerId)}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify({ sellerId, ...body }) } : {}),
        cache: "no-store",
      },
    );
    const payload = await response.json() as {
      ok?: boolean;
      settings?: ReceiptSettings;
      error?: string;
    };
    if (!response.ok || !payload.ok || !payload.settings) {
      throw new Error(payload.error || "RECEIPT_SETTINGS_FAILED");
    }
    return payload.settings;
  }, [sellerId, user]);

  useEffect(() => {
    let active = true;
    void callApi()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "RECEIPT_SETTINGS_FAILED");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [callApi]);

  const updateCopy = useCallback((key: CopyKey, patch: Partial<ReceiptCopySettings>) => {
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      setSettings(await callApi({ settings }));
      setMessage(copy.saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "RECEIPT_SETTINGS_FAILED");
    } finally {
      setSaving(false);
    }
  }, [callApi, copy.saved, settings]);

  const panels = useMemo<Array<{ key: CopyKey; title: string }>>(
    () => [
      { key: "production", title: copy.production },
      { key: "customer", title: copy.customer },
    ],
    [copy.customer, copy.production],
  );

  if (loading) {
    return (
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="inline-flex items-center gap-2 text-sm font-black text-neutral-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> {copy.loading}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
      <div className="flex items-start gap-3">
        <ReceiptText className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" />
        <div>
          <h2 className="text-lg font-black">{copy.title}</h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-neutral-500 dark:text-neutral-400">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {panels.map(({ key, title }) => (
          <ReceiptCopyPanel
            key={key}
            title={title}
            value={settings[key]}
            copy={copy}
            onChange={(patch) => updateCopy(key, patch)}
          />
        ))}
      </div>

      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
        {copy.trackingFallback}
      </p>

      {(message || error) && (
        <FeedbackBanner tone={error ? "error" : "success"} role={error ? "alert" : "status"}>
          {error || message}
        </FeedbackBanner>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700 disabled:opacity-50"
      >
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}

function ReceiptCopyPanel({
  title,
  value,
  copy,
  onChange,
}: {
  title: string;
  value: ReceiptCopySettings;
  copy: (typeof COPY)[Language];
  onChange: (patch: Partial<ReceiptCopySettings>) => void;
}) {
  return (
    <article className="space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
      <h3 className="font-black">{title}</h3>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <Toggle checked={value.showLogo} onChange={(checked) => onChange({ showLogo: checked })}>{copy.showLogo}</Toggle>
        <Toggle checked={value.showHeaderText} onChange={(checked) => onChange({ showHeaderText: checked })}>{copy.showHeader}</Toggle>
        <Toggle checked={value.showFooterText} onChange={(checked) => onChange({ showFooterText: checked })}>{copy.showFooter}</Toggle>
      </div>

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
        <Toggle checked={value.checkboxEnabled} onChange={(checked) => onChange({ checkboxEnabled: checked })}>
          <span className="inline-flex items-center gap-2"><CheckSquare2 className="h-4 w-4" />{copy.checkbox}</span>
        </Toggle>
        {value.checkboxEnabled && (
          <label className="block text-xs font-black">
            <span className="mb-1.5 block text-neutral-500">{copy.checkboxStyle}</span>
            <select
              value={value.checkboxStyle}
              onChange={(event) => onChange({ checkboxStyle: event.target.value as ReceiptCheckboxStyle })}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-900"
            >
              {(Object.keys(copy.styles) as ReceiptCheckboxStyle[]).map((style) => (
                <option key={style} value={style}>{copy.styles[style]}</option>
              ))}
            </select>
            <span className="mt-2 block rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
              {copy.preview}: {receiptCheckboxGlyph(value.checkboxStyle)} 2x Produto
            </span>
          </label>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
        <Toggle checked={value.qrEnabled} onChange={(checked) => onChange({ qrEnabled: checked })}>
          <span className="inline-flex items-center gap-2"><QrCode className="h-4 w-4" />{copy.qr}</span>
        </Toggle>
        {value.qrEnabled && (
          <>
            <Field label={copy.qrDestination}>
              <select
                value={value.qrDestination}
                onChange={(event) => onChange({ qrDestination: event.target.value as ReceiptQrDestination })}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="seller_order">{copy.sellerOrder}</option>
                <option value="customer_tracking">{copy.customerTracking}</option>
                <option value="store">{copy.store}</option>
                <option value="custom">{copy.custom}</option>
              </select>
            </Field>

            {value.qrDestination === "custom" && (
              <Field label={copy.customUrl}>
                <input
                  type="url"
                  value={value.qrCustomUrl}
                  onChange={(event) => onChange({ qrCustomUrl: event.target.value })}
                  placeholder="https://"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
                />
              </Field>
            )}

            <Field label={copy.qrLabel}>
              <input
                value={value.qrLabel}
                onChange={(event) => onChange({ qrLabel: event.target.value })}
                maxLength={120}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
              />
            </Field>
          </>
        )}
      </div>
    </article>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-black dark:border-neutral-700 dark:bg-neutral-950">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
      />
      <span className="leading-4">{children}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-black">
      <span className="mb-1.5 block text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

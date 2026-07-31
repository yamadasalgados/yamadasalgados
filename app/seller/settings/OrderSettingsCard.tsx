"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  LoaderCircle,
  PackageCheck,
  Save,
  ShieldCheck,
} from "lucide-react";

import FeedbackBanner from "@/app/_components/FeedbackBanner";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  normalizeSellerOrderSettings,
  type StockOrderPolicy,
} from "@/app/lib/order-settings-schema";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    title: "Pedidos e disponibilidade de estoque",
    subtitle:
      "Defina o comportamento do checkout quando a quantidade solicitada ultrapassar o estoque disponível.",
    acceptPending: "Aceitar pedido e confirmar depois",
    acceptPendingHelp:
      "A quantidade faltante é registrada como pendência de estoque ou produção. O seller confirma prazo, substituição ou disponibilidade posteriormente.",
    block: "Bloquear acima do estoque disponível",
    blockHelp:
      "O cliente não consegue adicionar itens esgotados nem ultrapassar a quantidade disponível no catálogo.",
    serverTitle: "Validação protegida no servidor",
    serverHelp:
      "A regra escolhida também é aplicada na API de criação do pedido, evitando que alterações feitas apenas no navegador contornem o estoque.",
    save: "Salvar regra de pedidos",
    saving: "Salvando…",
    saved: "Regra de pedidos salva.",
    loading: "Carregando regra de pedidos…",
  },
  en: {
    title: "Orders and stock availability",
    subtitle:
      "Choose what checkout should do when the requested quantity exceeds available stock.",
    acceptPending: "Accept the order and confirm later",
    acceptPendingHelp:
      "Missing quantities are recorded as a stock or production pending item. The seller confirms timing, substitution, or availability later.",
    block: "Block orders above available stock",
    blockHelp:
      "Customers cannot add sold-out products or exceed the catalog's available quantity.",
    serverTitle: "Server-protected validation",
    serverHelp:
      "The selected rule is also enforced by the order creation API, preventing browser-only changes from bypassing stock controls.",
    save: "Save order rule",
    saving: "Saving…",
    saved: "Order rule saved.",
    loading: "Loading order rule…",
  },
  ja: {
    title: "注文と在庫状況",
    subtitle:
      "注文数が在庫数を超えた場合のチェックアウト動作を設定します。",
    acceptPending: "注文を受け付けて後で確認",
    acceptPendingHelp:
      "不足分は在庫・製造の保留として記録され、販売者が後から納期、代替品、在庫状況を確認します。",
    block: "在庫数を超える注文をブロック",
    blockHelp:
      "在庫切れ商品を追加できず、カタログの在庫数を超えて注文できません。",
    serverTitle: "サーバー側でも保護",
    serverHelp:
      "選択したルールは注文作成APIでも検証され、ブラウザ側だけの変更では在庫制御を回避できません。",
    save: "注文ルールを保存",
    saving: "保存中…",
    saved: "注文ルールを保存しました。",
    loading: "注文ルールを読み込んでいます…",
  },
} as const;

export default function OrderSettingsCard() {
  const { lang } = useI18n();
  const session = useSellerSession();
  const copy = COPY[languageKey(lang)];
  const [policy, setPolicy] = useState<StockOrderPolicy>("accept_pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPolicy(
      normalizeSellerOrderSettings(session.profile.orderSettings)
        .stockOrderPolicy,
    );
    setLoading(false);
  }, [session.profile.orderSettings]);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await setDoc(
        doc(db, "sellers", session.sellerId),
        {
          orderSettings: {
            schemaVersion: 1,
            stockOrderPolicy: policy,
            acceptOrdersWithoutStock: policy === "accept_pending",
          },
          updatedAt: serverTimestamp(),
          updatedBy: session.user.uid,
        },
        { merge: true },
      );
      await session.reloadProfile();
      setMessage(copy.saved);
    } catch (saveError: unknown) {
      console.error("[OrderSettingsCard] save:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "ORDER_SETTINGS_SAVE_FAILED",
      );
    } finally {
      setSaving(false);
    }
  }, [copy.saved, policy, session]);

  if (loading) {
    return (
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
        <p className="inline-flex items-center gap-2 text-sm font-black text-neutral-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {copy.loading}
        </p>
      </section>
    );
  }

  const options: Array<{
    value: StockOrderPolicy;
    title: string;
    description: string;
  }> = [
    {
      value: "accept_pending",
      title: copy.acceptPending,
      description: copy.acceptPendingHelp,
    },
    {
      value: "block",
      title: copy.block,
      description: copy.blockHelp,
    },
  ];

  return (
    <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <PackageCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {options.map((option) => {
          const selected = policy === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setPolicy(option.value)}
              aria-pressed={selected}
              className={`rounded-3xl border p-5 text-left transition ${
                selected
                  ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200 dark:border-amber-500 dark:bg-amber-950/30 dark:ring-amber-900/70"
                  : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`h-4 w-4 rounded-full border-4 ${
                    selected
                      ? "border-amber-600 bg-white dark:bg-neutral-950"
                      : "border-neutral-300 dark:border-neutral-700"
                  }`}
                />
                <span className="text-sm font-black">{option.title}</span>
              </span>
              <span className="mt-3 block text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
        <div>
          <h3 className="text-sm font-black text-blue-950 dark:text-blue-100">
            {copy.serverTitle}
          </h3>
          <p className="mt-1 text-xs font-medium leading-relaxed text-blue-900/70 dark:text-blue-200/75">
            {copy.serverHelp}
          </p>
        </div>
      </div>

      {(message || error) && (
        <FeedbackBanner
          tone={error ? "error" : "success"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </FeedbackBanner>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {saving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}

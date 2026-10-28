"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Privacidade na busca de lojas",
    detail: "Escolha se os clientes poderão encontrar sua loja pesquisando pelo nome no Order System.",
    visible: "Permitir que encontrem minha loja na busca",
    stateVisible: "Sua loja pode aparecer na pesquisa por nome.",
    stateHidden: "Sua loja NÃO aparece na pesquisa. Clientes podem entrar com seu link direto.",
    help: "Não listada não significa privada: quem tiver o link poderá abrir a loja e consultar os produtos públicos. Esta opção não protege pedidos nem dados internos.",
    save: "Salvar visibilidade",
    saving: "Salvando...",
    saved: "Visibilidade salva. A busca será atualizada nas próximas consultas.",
    error: "Não foi possível carregar a preferência. Tente novamente.",
    retry: "Tentar novamente",
  },
  en: {
    title: "Store search privacy",
    detail: "Choose whether customers can find your store by name through Order System search.",
    visible: "Allow my store to appear in search",
    stateVisible: "Your store may appear in store-name search results.",
    stateHidden: "Your store is NOT listed in search. Customers can open it using a direct link.",
    help: "Unlisted is not private: anyone with the link can view public products. This setting does not control order or private-data access.",
    save: "Save visibility",
    saving: "Saving...",
    saved: "Saved. New searches will use this setting.",
    error: "Could not load this setting. Please try again.",
    retry: "Retry",
  },
  ja: {
    title: "店舗検索の公開設定",
    detail: "Order System の店名検索で店舗を表示するか選べます。",
    visible: "店舗を検索結果に表示する",
    stateVisible: "店名検索に店舗が表示されます。",
    stateHidden: "検索結果に表示されません。直接リンクを持つ方は店舗を開けます。",
    help: "非掲載は非公開ではありません。リンクを知っている方は公開商品を閲覧できます。注文や個人情報の権限設定は変更されません。",
    save: "公開設定を保存",
    saving: "保存中...",
    saved: "保存しました。次回の検索から反映されます。",
    error: "設定を取得できませんでした。再試行してください。",
    retry: "再試行",
  },
} as const;

export default function StoreDiscoverySettingsCard() {
  const { sellerId, user } = useSellerSession();
  const { lang } = useI18n();
  const copy = COPY[lang === "en" || lang === "ja" ? lang : "pt"];
  const [enabled, setEnabled] = useState(false);
  const [stored, setStored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!sellerId) return;
    const controller = new AbortController();
    setLoaded(false);
    setFailed(false);
    setNotice("");
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/seller/store-discovery?sellerId=${encodeURIComponent(sellerId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json() as { ok?: boolean; discoverableInSearch?: boolean; error?: string };
        if (!response.ok || data.ok !== true) throw new Error(data.error || copy.error);
        if (!controller.signal.aborted) {
          const value = data.discoverableInSearch === true;
          setEnabled(value);
          setStored(value);
          setLoaded(true);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailed(true);
          setNotice(error instanceof Error ? error.message : copy.error);
        }
      }
    })();
    return () => controller.abort();
  }, [sellerId, user, revision, copy.error]);

  async function save() {
    if (!loaded || busy || enabled === stored) return;
    setBusy(true);
    setFailed(false);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/seller/store-discovery", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ sellerId, discoverableInSearch: enabled }),
      });
      const data = await response.json() as { ok?: boolean; discoverableInSearch?: boolean; error?: string };
      if (!response.ok || data.ok !== true || data.discoverableInSearch !== enabled) {
        throw new Error(data.error || copy.error);
      }
      setStored(enabled);
      setNotice(copy.saved);
    } catch (error) {
      setFailed(true);
      setNotice(error instanceof Error ? error.message : copy.error);
    } finally {
      setBusy(false);
    }
  }

  const dirty = loaded && enabled !== stored;
  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6" aria-labelledby="store-discovery-title">
      <div className="flex items-start gap-3">
        <Search aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-500" />
        <div className="space-y-1">
          <h2 id="store-discovery-title" className="text-lg font-black">{copy.title}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{copy.detail}</p>
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-neutral-200 p-4 text-sm font-bold dark:border-neutral-700">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-orange-500"
          checked={enabled}
          disabled={!loaded || busy}
          onChange={(event) => { setEnabled(event.target.checked); setNotice(""); }}
        />
        {copy.visible}
      </label>
      {loaded && (
        <p className="flex items-start gap-2 text-sm" role="status">
          {enabled ? <Eye aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <EyeOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
          {enabled ? copy.stateVisible : copy.stateHidden}
        </p>
      )}
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{copy.help}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => void save()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {busy ? copy.saving : copy.save}
        </button>
        {failed && !loaded && (
          <button type="button" onClick={() => setRevision((v) => v + 1)} className="min-h-11 rounded-xl border px-5 py-3 text-sm font-bold">{copy.retry}</button>
        )}
      </div>
      {notice && <p role="status" aria-live="polite" className={`text-sm ${failed ? "text-red-500" : "text-emerald-600 dark:text-emerald-300"}`}>{notice}</p>}
    </section>
  );
}

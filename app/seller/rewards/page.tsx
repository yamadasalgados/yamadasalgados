"use client";

import {
  Gift,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import PageHeader from "@/app/_components/PageHeader";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";
import {
  giftSellerRewardPoints,
  loadSellerRewardGiftHistory,
  lookupSellerRewardAccount,
  type SellerRewardAccount,
  type SellerRewardGiftHistory,
} from "@/app/lib/seller-rewards-client";

const COPY = {
  pt: {
    eyebrow: "Fidelidade",
    title: "Presentear pontos",
    description:
      "Localize uma conta pelo e-mail usado no login, confira o saldo e adicione pontos com registro completo da operação.",
    lookupTitle: "Conta que receberá os pontos",
    lookupHint: "Use o e-mail exato, telefone internacional (+...) ou UID da conta.",
    identifier: "E-mail, telefone ou UID",
    search: "Localizar conta",
    searching: "Procurando...",
    noAccount: "Localize uma conta antes de continuar.",
    currentBalance: "Saldo atual",
    earned: "Ganhos em compras",
    gifted: "Recebidos de presente",
    points: "Quantidade de pontos",
    reason: "Motivo ou observação",
    reasonPlaceholder: "Ex.: agradecimento pela divulgação do evento",
    gift: "Adicionar pontos",
    gifting: "Adicionando...",
    confirm: "Confirmar o presente de {points} pontos para {name}?",
    success: "Pontos adicionados com sucesso. Novo saldo: {balance}.",
    history: "Histórico de presentes",
    historyHint: "Cada operação guarda destinatário, saldo anterior, saldo novo, motivo e responsável.",
    empty: "Ainda não há presentes de pontos registrados.",
    refresh: "Atualizar",
    before: "Antes",
    after: "Depois",
    by: "Por",
    auditTitle: "Proteção e auditoria",
    auditText:
      "A operação é executada no servidor, usa uma chave contra duplicidade e não pode ser alterada pelo navegador. Os pontos pertencem somente a esta loja.",
    accountDisabled: "Conta desativada",
    back: "Painel",
  },
  en: {
    eyebrow: "Loyalty",
    title: "Gift points",
    description:
      "Find an account by the email used to sign in, review its balance, and add points with a complete audit record.",
    lookupTitle: "Account receiving the points",
    lookupHint: "Use the exact email, international phone (+...), or account UID.",
    identifier: "Email, phone, or UID",
    search: "Find account",
    searching: "Searching...",
    noAccount: "Find an account before continuing.",
    currentBalance: "Current balance",
    earned: "Earned from purchases",
    gifted: "Received as gifts",
    points: "Number of points",
    reason: "Reason or note",
    reasonPlaceholder: "Example: thank you for promoting the event",
    gift: "Add points",
    gifting: "Adding...",
    confirm: "Confirm the gift of {points} points to {name}?",
    success: "Points added successfully. New balance: {balance}.",
    history: "Gift history",
    historyHint: "Each operation records the recipient, previous balance, new balance, reason, and actor.",
    empty: "No point gifts have been recorded yet.",
    refresh: "Refresh",
    before: "Before",
    after: "After",
    by: "By",
    auditTitle: "Protection and audit",
    auditText:
      "The operation runs on the server, uses an idempotency key, and cannot be changed in the browser. Points belong only to this store.",
    accountDisabled: "Disabled account",
    back: "Dashboard",
  },
  ja: {
    eyebrow: "ロイヤルティ",
    title: "ポイントをプレゼント",
    description:
      "ログインに使用したメールアドレスでアカウントを確認し、残高を見てから監査記録付きでポイントを追加します。",
    lookupTitle: "ポイントを受け取るアカウント",
    lookupHint: "正確なメールアドレス、国際電話番号（+...）、またはUIDを入力してください。",
    identifier: "メール、電話番号、またはUID",
    search: "アカウントを検索",
    searching: "検索中...",
    noAccount: "先にアカウントを検索してください。",
    currentBalance: "現在の残高",
    earned: "購入で獲得",
    gifted: "プレゼントで獲得",
    points: "ポイント数",
    reason: "理由・メモ",
    reasonPlaceholder: "例：イベント紹介へのお礼",
    gift: "ポイントを追加",
    gifting: "追加中...",
    confirm: "{name}さんに{points}ポイントを付与しますか？",
    success: "ポイントを追加しました。新しい残高：{balance}。",
    history: "プレゼント履歴",
    historyHint: "受取人、変更前後の残高、理由、実行者をすべて記録します。",
    empty: "ポイントプレゼントの履歴はまだありません。",
    refresh: "更新",
    before: "変更前",
    after: "変更後",
    by: "実行者",
    auditTitle: "保護と監査",
    auditText:
      "処理はサーバーで実行され、重複防止キーを使用します。ブラウザから改ざんできず、ポイントはこの店舗専用です。",
    accountDisabled: "無効なアカウント",
    back: "ダッシュボード",
  },
} as const;

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "_");
  }
  return `gift_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function displayAccountName(account: SellerRewardAccount): string {
  return account.name || account.email || account.phone || account.uid;
}

export default function SellerRewardsPage() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const sellerSession = useSellerSession();
  const sellerId = sellerSession.sellerId;

  const [identifier, setIdentifier] = useState("");
  const [account, setAccount] = useState<SellerRewardAccount | null>(null);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<SellerRewardGiftHistory[]>([]);
  const [searching, setSearching] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pendingGiftRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const locale = language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "pt-BR";
  const pointValue = useMemo(
    () => Math.max(0, Math.floor(Number(points) || 0)),
    [points],
  );

  const refreshHistory = useCallback(async () => {
    if (!sellerId) return;
    setLoadingHistory(true);
    try {
      setHistory(await loadSellerRewardGiftHistory(sellerId));
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Erro ao carregar histórico.");
    } finally {
      setLoadingHistory(false);
    }
  }, [sellerId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const handleLookup = useCallback(async () => {
    if (!sellerId || !identifier.trim()) return;
    setSearching(true);
    setError("");
    setSuccess("");
    setAccount(null);
    try {
      setAccount(
        await lookupSellerRewardAccount({
          sellerId,
          identifier: identifier.trim(),
        }),
      );
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Conta não encontrada.");
    } finally {
      setSearching(false);
    }
  }, [identifier, sellerId]);

  const handleGift = useCallback(async () => {
    if (!sellerId || !account) {
      setError(text.noAccount);
      return;
    }
    if (pointValue <= 0) {
      setError(language === "ja" ? "1ポイント以上を入力してください。" : language === "en" ? "Enter at least 1 point." : "Informe pelo menos 1 ponto.");
      return;
    }

    const name = displayAccountName(account);
    const confirmation = text.confirm
      .replace("{points}", String(pointValue))
      .replace("{name}", name);
    if (!window.confirm(confirmation)) return;

    const giftReason =
      reason.trim() ||
      (language === "ja"
        ? "販売者からのプレゼント"
        : language === "en"
          ? "Gift from the seller"
          : "Presente do seller");
    const fingerprint = `${sellerId}:${account.uid}:${pointValue}:${giftReason}`;
    const clientRequestId =
      pendingGiftRequestRef.current?.fingerprint === fingerprint
        ? pendingGiftRequestRef.current.id
        : requestId();
    pendingGiftRequestRef.current = { fingerprint, id: clientRequestId };

    setGifting(true);
    setError("");
    setSuccess("");
    try {
      const result = await giftSellerRewardPoints({
        sellerId,
        customerUid: account.uid,
        points: pointValue,
        reason: giftReason,
        clientRequestId,
      });
      setAccount({ ...account, ...result.account, pointsBalance: result.balanceAfter });
      setPoints("");
      setReason("");
      setSuccess(text.success.replace("{balance}", String(result.balanceAfter)));
      pendingGiftRequestRef.current = null;
      await refreshHistory();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Não foi possível adicionar os pontos.");
    } finally {
      setGifting(false);
    }
  }, [account, language, pointValue, reason, refreshHistory, sellerId, text]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={text.eyebrow}
        back={<BackLink href="/seller" label={text.back} />}
        title={text.title}
        description={text.description}
        action={
          <button
            type="button"
            onClick={() => void refreshHistory()}
            disabled={loadingHistory}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-black transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            <RefreshCw size={16} className={loadingHistory ? "animate-spin" : ""} />
            {text.refresh}
          </button>
        }
      />

      {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}
      {success && <FeedbackBanner tone="success">{success}</FeedbackBanner>}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
              <UserRound size={22} />
            </span>
            <div>
              <h2 className="text-lg font-black">{text.lookupTitle}</h2>
              <p className="mt-1 text-xs font-bold leading-relaxed text-neutral-500 dark:text-neutral-400">{text.lookupHint}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-xs font-black text-neutral-600 dark:text-neutral-300">{text.identifier}</span>
              <input
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  if (account) setAccount(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLookup();
                }}
                autoComplete="off"
                placeholder="name@example.com"
                className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleLookup()}
              disabled={searching || !identifier.trim()}
              className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-neutral-950"
            >
              {searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
              {searching ? text.searching : text.search}
            </button>
          </div>

          {account && (
            <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
              <div className="flex items-start gap-4">
                {account.photoURL ? (
                  <img src={account.photoURL} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white"><UserRound size={26} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black">{displayAccountName(account)}</p>
                  {account.email && <p className="mt-1 truncate text-xs font-bold text-neutral-500 dark:text-neutral-400">{account.email}</p>}
                  {account.phone && <p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">{account.phone}</p>}
                  <p className="mt-2 break-all text-[10px] font-bold text-neutral-400">UID: {account.uid}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-xl font-black text-violet-700 dark:text-violet-300">{account.pointsBalance}</p><p className="text-[11px] font-bold text-neutral-500">{text.currentBalance}</p></div>
                <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-xl font-black">{account.lifetimeEarned ?? 0}</p><p className="text-[11px] font-bold text-neutral-500">{text.earned}</p></div>
                <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-xl font-black">{account.lifetimeGifted ?? 0}</p><p className="text-[11px] font-bold text-neutral-500">{text.gifted}</p></div>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-black text-neutral-600 dark:text-neutral-300">{text.points}</span>
              <input
                type="number"
                min={1}
                max={1_000_000}
                step={1}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-black text-neutral-600 dark:text-neutral-300">{text.reason}</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder={text.reasonPlaceholder}
                className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleGift()}
            disabled={gifting || !account || pointValue <= 0}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {gifting ? <Loader2 size={18} className="animate-spin" /> : <Gift size={18} />}
            {gifting ? text.gifting : text.gift}
          </button>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-emerald-600 p-3 text-white"><ShieldCheck size={22} /></span>
            <div>
              <h2 className="text-lg font-black text-emerald-950 dark:text-emerald-100">{text.auditTitle}</h2>
              <p className="mt-2 text-sm font-bold leading-relaxed text-emerald-800/80 dark:text-emerald-200/80">{text.auditText}</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-white/80 p-5 dark:bg-neutral-900/70">
            <Sparkles className="text-violet-600" size={24} />
            <p className="mt-3 text-sm font-black">1 ponto = 1 unidade da moeda da loja</p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-neutral-500 dark:text-neutral-400">
              {language === "ja"
                ? "プレゼントポイントは通常の残高に加算され、割引や商品交換に使用できます。"
                : language === "en"
                  ? "Gifted points are added to the regular balance and may be used for discounts or product redemption."
                  : "Os pontos presenteados entram no saldo normal e podem ser usados em desconto ou troca por produto."}
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-neutral-100 p-3 dark:bg-neutral-800"><History size={21} /></span>
            <div><h2 className="text-lg font-black">{text.history}</h2><p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">{text.historyHint}</p></div>
          </div>
          {loadingHistory && <Loader2 className="animate-spin text-neutral-400" size={20} />}
        </div>

        {!loadingHistory && history.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-neutral-50 p-6 text-center text-sm font-bold text-neutral-500 dark:bg-neutral-950">{text.empty}</p>
        ) : (
          <div className="mt-5 divide-y divide-neutral-100 dark:divide-neutral-800">
            {history.map((item) => (
              <article key={item.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black">{item.customerName || item.customerEmail || item.customerUid}</p>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">+{item.points}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-neutral-500 dark:text-neutral-400">{item.customerEmail || item.customerPhone || item.customerUid}</p>
                  <p className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">{item.reason}</p>
                  <p className="mt-2 text-[10px] font-bold text-neutral-400">
                    {item.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt)) : ""}
                    {item.createdBy ? ` · ${text.by}: ${item.createdBy}` : ""}
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-50 px-4 py-3 text-right dark:bg-neutral-950">
                  <p className="text-xs font-bold text-neutral-400">{text.before}: {item.balanceBefore}</p>
                  <p className="mt-1 text-lg font-black text-emerald-600">{text.after}: {item.balanceAfter}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

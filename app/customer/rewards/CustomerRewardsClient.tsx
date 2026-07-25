"use client";

import { Gift, Loader2, RefreshCw, Sparkles, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import useCustomerRewards from "@/app/hooks/useCustomerRewards";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Minhas recompensas",
    subtitle: "Acompanhe os pontos ganhos e usados nesta loja.",
    login: "Entre para consultar seus pontos",
    balance: "Saldo disponível",
    earned: "Total ganho",
    redeemed: "Total usado",
    refunded: "Total devolvido",
    history: "Histórico",
    empty: "Ainda não há movimentações nesta carteira.",
    earn: "Pontos ganhos",
    redeem: "Pontos usados",
    refund: "Estorno de pontos",
    adjustment: "Ajuste",
    order: "Pedido",
    after: "Saldo após movimento",
    back: "Voltar",
    orders: "Meus pedidos",
    store: "Visitar loja",
    refresh: "Atualizar",
    rule: "Você ganha 1 ponto a cada 100 pagos em produtos. Os pontos entram quando o pedido é entregue.",
    missing: "Abra esta página a partir de uma loja para consultar a carteira correta.",
  },
  en: {
    title: "My rewards",
    subtitle: "Track points earned and used at this store.",
    login: "Sign in to view your points",
    balance: "Available balance",
    earned: "Total earned",
    redeemed: "Total used",
    refunded: "Total refunded",
    history: "History",
    empty: "There are no wallet transactions yet.",
    earn: "Points earned",
    redeem: "Points used",
    refund: "Points refund",
    adjustment: "Adjustment",
    order: "Order",
    after: "Balance after transaction",
    back: "Back",
    orders: "My orders",
    store: "Visit store",
    refresh: "Refresh",
    rule: "You earn 1 point per 100 paid for products. Points are credited when the order is delivered.",
    missing: "Open this page from a store to view the correct wallet.",
  },
  ja: {
    title: "ポイント",
    subtitle: "この店舗で獲得・使用したポイントを確認できます。",
    login: "ログインしてポイントを確認",
    balance: "利用可能ポイント",
    earned: "累計獲得",
    redeemed: "累計使用",
    refunded: "返還ポイント",
    history: "履歴",
    empty: "ポイント履歴はまだありません。",
    earn: "ポイント獲得",
    redeem: "ポイント使用",
    refund: "ポイント返還",
    adjustment: "調整",
    order: "注文",
    after: "取引後残高",
    back: "戻る",
    orders: "注文履歴",
    store: "ショップを見る",
    refresh: "更新",
    rule: "商品のお支払い100ごとに1ポイント。注文が受け渡し済みになった時点で付与されます。",
    missing: "店舗ページから開くと、その店舗のポイントを確認できます。",
  },
};

function safePath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/customer/orders";
}

function Inner() {
  const params = useSearchParams();
  const sellerId = (params.get("sellerId") || "").trim();
  const next = useMemo(() => safePath(params.get("next")), [params]);
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const session = useCustomerSession();
  const rewards = useCustomerRewards(sellerId, session.registered && Boolean(sellerId));
  const locale = language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "pt-BR";

  if (session.loading) {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950"><Loader2 className="animate-spin" /></main>;
  }

  if (!session.registered) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950">
        <section className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-7 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <Gift className="mx-auto text-violet-600" size={38} />
          <h1 className="mt-4 text-xl font-black text-neutral-950 dark:text-white">{text.login}</h1>
          <Link href={`/customer/login?next=${encodeURIComponent(`/customer/rewards?sellerId=${sellerId}&next=${encodeURIComponent(next)}`)}`} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white dark:bg-white dark:text-neutral-950">{text.login}</Link>
        </section>
      </main>
    );
  }

  if (!sellerId) {
    return <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950"><section className="mx-auto max-w-xl rounded-3xl border border-neutral-200 bg-white p-7 text-center font-bold dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">{text.missing}</section></main>;
  }

  const wallet = rewards.wallet;

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:py-12">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink href={next} label={text.back} />
          <button type="button" onClick={() => void rewards.refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-black transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"><RefreshCw size={15} className={rewards.loading ? "animate-spin" : ""} />{text.refresh}</button>
        </div>

        <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-lg sm:p-8">
          <div className="flex items-start gap-3"><Sparkles size={26} /><div><p className="text-xs font-black uppercase tracking-widest text-violet-100">{wallet?.storeName || text.title}</p><h1 className="mt-1 text-3xl font-black">{text.title}</h1><p className="mt-2 text-sm font-medium text-violet-100">{text.subtitle}</p></div></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-4">
            {[
              { label: text.balance, value: wallet?.pointsBalance ?? 0, icon: Gift },
              { label: text.earned, value: wallet?.lifetimeEarned ?? 0, icon: Sparkles },
              { label: text.redeemed, value: wallet?.lifetimeRedeemed ?? 0, icon: TicketPercent },
              { label: text.refunded, value: wallet?.lifetimeRefunded ?? 0, icon: RefreshCw },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl bg-white/15 p-4 backdrop-blur">
                <Icon size={18} />
                <p className="mt-3 text-2xl font-black">{value}</p>
                <p className="text-xs font-bold text-violet-100">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-black/15 px-4 py-3 text-xs font-bold text-violet-50">{text.rule}</p>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-7">
          <h2 className="text-lg font-black">{text.history}</h2>
          {rewards.loading && !wallet ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-neutral-400" /></div>
          ) : rewards.error ? (
            <div className="mt-5"><FeedbackBanner tone="error" role="alert">{rewards.error}</FeedbackBanner></div>
          ) : !wallet?.transactions.length ? (
            <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm font-bold text-neutral-500 dark:bg-neutral-950">{text.empty}</p>
          ) : (
            <div className="mt-5 divide-y divide-neutral-100 dark:divide-neutral-800">
              {wallet.transactions.map((transaction) => {
                const positive = transaction.type === "earn" || transaction.type === "refund";
                const label = transaction.type === "earn" ? text.earn : transaction.type === "redeem" ? text.redeem : transaction.type === "refund" ? text.refund : text.adjustment;
                return (
                  <div key={transaction.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-black">{transaction.label || label}</p><p className="mt-1 text-xs font-medium text-neutral-500">{transaction.orderId ? `${text.order} #${transaction.orderId}` : label} · {transaction.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(transaction.createdAt)) : ""}</p></div>
                    <div className="text-right"><p className={`text-lg font-black ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : "-"}{transaction.points}</p><p className="text-[11px] font-bold text-neutral-400">{text.after}: {transaction.balanceAfter}</p></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function CustomerRewardsClient() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950"><Loader2 className="animate-spin" /></main>}><Inner /></Suspense>;
}

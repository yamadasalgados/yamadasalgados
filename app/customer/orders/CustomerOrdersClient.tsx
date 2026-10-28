"use client";

import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import useCustomerSession from "@/app/hooks/useCustomerSession";
import PageHeader from "@/app/_components/PageHeader";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import {
  loadCustomerOrders,
  type CustomerOrderSummary,
} from "@/app/lib/customer-order-client";
import { useI18n } from "@/app/lib/i18n";
import { formatMoneyMinor } from "@/app/lib/money";

type Filter = "all" | "open" | "completed";

const COPY = {
  pt: {
    title: "Meus pedidos",
    subtitle: "Acompanhe pedidos da loja permanente e dos eventos.",
    back: "Voltar",
    profile: "Meu perfil",
    all: "Todos",
    open: "Em andamento",
    completed: "Finalizados",
    loading: "Carregando pedidos...",
    empty: "Você ainda não possui pedidos nesta categoria.",
    error: "Não foi possível carregar seus pedidos.",
    retry: "Tentar novamente",
    refresh: "Atualizar",
    loginTitle: "Entre para ver seus pedidos",
    loginBody: "Os pedidos feitos com sua conta aparecem aqui automaticamente.",
    login: "Entrar ou cadastrar",
    storeOrder: "Loja permanente",
    eventOrder: "Evento",
    items: "itens",
    details: "Acompanhar pedido",
    visitStore: "Visitar loja",
    received: "Pedido recebido",
    production: "Em preparação",
    ready: "Pronto",
    delivered: "Entregue",
    cancelled: "Cancelado",
    noDate: "Data a combinar",
  },
  en: {
    title: "My orders",
    subtitle: "Track permanent-store and event orders.",
    back: "Back",
    profile: "My profile",
    all: "All",
    open: "In progress",
    completed: "Completed",
    loading: "Loading orders...",
    empty: "You do not have orders in this category yet.",
    error: "Could not load your orders.",
    retry: "Try again",
    refresh: "Refresh",
    loginTitle: "Sign in to view your orders",
    loginBody: "Orders placed with your account appear here automatically.",
    login: "Sign in or register",
    storeOrder: "Permanent store",
    eventOrder: "Event",
    items: "items",
    details: "Track order",
    visitStore: "Visit store",
    received: "Order received",
    production: "In preparation",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
    noDate: "Date to be arranged",
  },
  ja: {
    title: "注文履歴",
    subtitle: "常設店とイベントの注文状況を確認できます。",
    back: "戻る",
    profile: "マイプロフィール",
    all: "すべて",
    open: "対応中",
    completed: "完了",
    loading: "注文を読み込み中...",
    empty: "このカテゴリーの注文はまだありません。",
    error: "注文を読み込めませんでした。",
    retry: "再試行",
    refresh: "更新",
    loginTitle: "ログインして注文を確認",
    loginBody: "アカウントで注文した内容が自動的に表示されます。",
    login: "ログイン・新規登録",
    storeOrder: "常設店",
    eventOrder: "イベント",
    items: "点",
    details: "注文を確認",
    visitStore: "ショップを見る",
    received: "注文受付",
    production: "準備中",
    ready: "準備完了",
    delivered: "受け渡し済み",
    cancelled: "キャンセル",
    noDate: "日付は要相談",
  },
};

type StageCopy = {
  cancelled: string;
  delivered: string;
  ready: string;
  production: string;
  received: string;
};

function orderStage(
  order: CustomerOrderSummary,
  text: StageCopy,
): { label: string; className: string; dotClassName: string } {
  if (order.status === "cancelled") {
    return {
      label: text.cancelled,
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
      dotClassName: "bg-red-500",
    };
  }
  if (order.status === "delivered") {
    return {
      label: text.delivered,
      className: "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
      dotClassName: "bg-neutral-500",
    };
  }
  if (order.status === "ready") {
    return {
      label: text.ready,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
      dotClassName: "bg-emerald-500 animate-pulse",
    };
  }
  if (
    order.readinessReasonCodes.includes("made_to_order") ||
    order.readinessReasonCodes.includes("stock_shortage")
  ) {
    return {
      label: text.production,
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
      dotClassName: "bg-amber-500",
    };
  }
  return {
    label: text.received,
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300",
    dotClassName: "bg-blue-500",
  };
}

function localeFor(language: "pt" | "en" | "ja") {
  return language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "pt-BR";
}

export default function CustomerOrdersClient() {
  const session = useCustomerSession();
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const locale = localeFor(language);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  const refresh = useCallback(async (soft = false) => {
    if (!session.registered) return;
    soft ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      setOrders(await loadCustomerOrders());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.registered, text.error]);

  useEffect(() => {
    if (session.loading) return;
    if (!session.registered) {
      setLoading(false);
      setOrders([]);
      return;
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, session.loading, session.registered]);

  const filtered = useMemo(() => {
    if (filter === "open") {
      return orders.filter((order) => order.status === "pending" || order.status === "ready");
    }
    if (filter === "completed") {
      return orders.filter((order) => order.status === "delivered" || order.status === "cancelled");
    }
    return orders;
  }, [filter, orders]);

  const counts = useMemo(() => ({
    all: orders.length,
    open: orders.filter((order) => order.status === "pending" || order.status === "ready").length,
    completed: orders.filter((order) => order.status === "delivered" || order.status === "cancelled").length,
  }), [orders]);

  if (session.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="animate-spin" size={32} />
      </main>
    );
  }

  if (!session.registered) {
    return (
      <main className="min-h-screen bg-neutral-50 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-white">
        <section className="mx-auto mt-16 max-w-lg rounded-3xl border border-neutral-200 bg-white p-7 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <UserRound className="mx-auto text-neutral-400" size={44} />
          <h1 className="mt-4 text-2xl font-black">{text.loginTitle}</h1>
          <p className="mt-2 text-sm text-neutral-500">{text.loginBody}</p>
          <Link
            href="/customer/login?next=%2Fcustomer%2Forders"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-5 py-3 font-black text-white transition active:scale-[0.99] dark:bg-white dark:text-black"
          >
            {text.login}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 pb-28 pt-4 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        <PageHeader
          title={text.title}
          description={text.subtitle}
          action={
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-black transition hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} size={15} />
              {text.refresh}
            </button>
          }
        />

        <div
          role="tablist"
          aria-label={text.title}
          className="sticky top-[3.75rem] z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-neutral-200 bg-white/95 p-1.5 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95"
        >
          {(["open", "completed", "all"] as Filter[]).map((value) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(value)}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-black transition active:scale-[0.98] ${
                  active
                    ? "bg-black text-white shadow-sm dark:bg-white dark:text-black"
                    : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="truncate">
                  {value === "all" ? text.all : value === "open" ? text.open : text.completed}
                </span>
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    active
                      ? "bg-white/20 text-white dark:bg-black/15 dark:text-black"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {counts[value]}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-neutral-200 bg-white p-12 dark:border-neutral-800 dark:bg-neutral-900">
            <Loader2 className="animate-spin" size={28} />
            <span className="ml-3 text-sm font-bold text-neutral-500">{text.loading}</span>
          </div>
        ) : error ? (
          <FeedbackBanner tone="error" role="alert">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error || text.error}</span>
              <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white">
                {text.retry}
              </button>
            </div>
          </FeedbackBanner>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <ShoppingBag className="mx-auto text-neutral-400" size={38} />
            <p className="mt-4 text-sm font-bold text-neutral-500">{text.empty}</p>
            {filter !== "all" && orders.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-xs font-black dark:border-neutral-700"
              >
                {text.all} ({counts.all})
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filtered.map((order) => {
              const stage = orderStage(order, text);
              const title = order.eventTitle || order.storeName || (order.source === "event" ? text.eventOrder : text.storeOrder);
              const deliveryLabel = [order.deliveryDate || text.noDate, order.deliveryTimeSlot].filter(Boolean).join(" • ");

              return (
                <article
                  key={order.referenceId}
                  className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          {order.source === "event" ? text.eventOrder : text.storeOrder}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-neutral-400">
                          #{order.orderId.slice(0, 10)}
                        </span>
                      </div>
                      <h2 className="mt-1 truncate text-lg font-black sm:text-xl">{title}</h2>
                    </div>

                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${stage.className}`}>
                      <span className={`h-2 w-2 rounded-full ${stage.dotClassName}`} />
                      {stage.label}
                    </span>
                  </div>

                  {/* Chips compactos sem ruído visual em ecrãs pequenos */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
                      <PackageCheck size={15} className="text-neutral-400" />
                      {order.totalItems} {text.items}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
                      <CalendarDays size={15} className="text-neutral-400" />
                      {deliveryLabel}
                    </span>
                    {order.createdAt ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        <Clock3 size={14} className="text-neutral-400" />
                        {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(order.createdAt))}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3.5 dark:border-neutral-800">
                    <p className="text-xl font-black sm:text-2xl">
                      {formatMoneyMinor(order.totalAmountMinor, order.currency, locale)}
                    </p>
                    <div className="flex items-center gap-2">
                      {order.storeHref && (
                        <Link
                          href={order.storeHref}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black transition hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
                        >
                          <Store size={15} />
                          <span className="hidden sm:inline">{text.visitStore}</span>
                        </Link>
                      )}
                      <Link
                        href={`/customer/orders/${encodeURIComponent(order.referenceId)}`}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-black px-4 py-2 text-xs font-black text-white transition active:scale-[0.98] dark:bg-white dark:text-black"
                      >
                        {text.details}
                        <ChevronRight size={15} />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
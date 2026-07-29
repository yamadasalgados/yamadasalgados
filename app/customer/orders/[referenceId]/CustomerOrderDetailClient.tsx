"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gift,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Store,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import useCustomerSession from "@/app/hooks/useCustomerSession";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import {
  loadCustomerOrder,
  type CustomerOrderDetail,
  type CustomerOrderStatus,
} from "@/app/lib/customer-order-client";
import { useI18n } from "@/app/lib/i18n";
import { formatMoneyMinor } from "@/app/lib/money";

type Props = { referenceId: string };

type Stage = "received" | "production" | "ready" | "delivered";

const COPY = {
  pt: {
    back: "Meus pedidos",
    title: "Acompanhar pedido",
    loading: "Carregando pedido...",
    error: "Não foi possível carregar o pedido.",
    retry: "Tentar novamente",
    refresh: "Atualizar",
    loginTitle: "Entre para acompanhar este pedido",
    login: "Entrar ou cadastrar",
    orderNumber: "Número do pedido",
    received: "Pedido recebido",
    receivedHelp: "O vendedor recebeu sua solicitação.",
    production: "Em preparação",
    productionHelp: "Os itens estão sendo produzidos ou separados.",
    ready: "Pronto",
    readyHelp: "O pedido está pronto para retirada ou entrega.",
    delivered: "Entregue",
    deliveredHelp: "O pedido foi finalizado.",
    cancelled: "Pedido cancelado",
    cancelledHelp: "Este pedido não seguirá para produção ou entrega.",
    items: "Itens do pedido",
    quantity: "Quantidade",
    subtotal: "Subtotal",
    discount: "Desconto da oferta",
    pointsDiscount: "Desconto em pontos",
    pointsUsed: "Pontos utilizados",
    pointsPending: "Pontos após a entrega",
    pointsCredited: "Pontos creditados",
    pointsVoided: "Pontos não concedidos",
    pointsRefunded: "Pontos devolvidos",
    rewardProduct: "Produto trocado",
    shipping: "Frete / entrega",
    total: "Total",
    delivery: "Entrega",
    date: "Data",
    time: "Horário",
    mode: "Forma",
    address: "Endereço",
    note: "Observações",
    customer: "Dados do cliente",
    name: "Nome",
    phone: "Telefone",
    email: "E-mail",
    history: "Atualizações",
    store: "Visitar loja",
    event: "Abrir evento",
    profile: "Meu perfil",
    pickup: "Retirada",
    deliveryMode: "Entrega",
    postal: "Correio",
    arrange: "A combinar",
    noInfo: "Não informado",
    updated: "Atualizado",
    unitsProduced: "produzidas",
    productionPending: "a produzir",
  },
  en: {
    back: "My orders",
    title: "Track order",
    loading: "Loading order...",
    error: "Could not load the order.",
    retry: "Try again",
    refresh: "Refresh",
    loginTitle: "Sign in to track this order",
    login: "Sign in or register",
    orderNumber: "Order number",
    received: "Order received",
    receivedHelp: "The seller received your request.",
    production: "In preparation",
    productionHelp: "The items are being produced or picked.",
    ready: "Ready",
    readyHelp: "The order is ready for pickup or delivery.",
    delivered: "Delivered",
    deliveredHelp: "The order has been completed.",
    cancelled: "Order cancelled",
    cancelledHelp: "This order will not proceed to production or delivery.",
    items: "Order items",
    quantity: "Quantity",
    subtotal: "Subtotal",
    discount: "Offer discount",
    pointsDiscount: "Points discount",
    pointsUsed: "Points used",
    pointsPending: "Points after delivery",
    pointsCredited: "Points credited",
    pointsVoided: "Points not awarded",
    pointsRefunded: "Points refunded",
    rewardProduct: "Redeemed product",
    shipping: "Shipping / delivery",
    total: "Total",
    delivery: "Fulfilment",
    date: "Date",
    time: "Time",
    mode: "Method",
    address: "Address",
    note: "Notes",
    customer: "Customer details",
    name: "Name",
    phone: "Phone",
    email: "Email",
    history: "Updates",
    store: "Visit store",
    event: "Open event",
    profile: "My profile",
    pickup: "Pickup",
    deliveryMode: "Delivery",
    postal: "Postal shipping",
    arrange: "To be arranged",
    noInfo: "Not provided",
    updated: "Updated",
    unitsProduced: "produced",
    productionPending: "to produce",
  },
  ja: {
    back: "注文履歴",
    title: "注文状況",
    loading: "注文を読み込み中...",
    error: "注文を読み込めませんでした。",
    retry: "再試行",
    refresh: "更新",
    loginTitle: "ログインして注文を確認",
    login: "ログイン・新規登録",
    orderNumber: "注文番号",
    received: "注文受付",
    receivedHelp: "販売者が注文を受け付けました。",
    production: "準備中",
    productionHelp: "商品の製作・取り分けを行っています。",
    ready: "準備完了",
    readyHelp: "受け取りまたは配達の準備ができました。",
    delivered: "受け渡し済み",
    deliveredHelp: "注文が完了しました。",
    cancelled: "キャンセル済み",
    cancelledHelp: "この注文は製作・配達されません。",
    items: "注文商品",
    quantity: "数量",
    subtotal: "小計",
    discount: "キャンペーン割引",
    pointsDiscount: "ポイント割引",
    pointsUsed: "使用ポイント",
    pointsPending: "受け渡し後の獲得ポイント",
    pointsCredited: "獲得済みポイント",
    pointsVoided: "付与対象外ポイント",
    pointsRefunded: "返還ポイント",
    rewardProduct: "交換商品",
    shipping: "送料・配達料",
    total: "合計",
    delivery: "受け取り情報",
    date: "日付",
    time: "時間",
    mode: "方法",
    address: "住所",
    note: "備考",
    customer: "お客様情報",
    name: "お名前",
    phone: "電話番号",
    email: "メールアドレス",
    history: "更新履歴",
    store: "ショップを見る",
    event: "イベントを開く",
    profile: "マイプロフィール",
    pickup: "受け取り",
    deliveryMode: "配達",
    postal: "郵送",
    arrange: "要相談",
    noInfo: "未入力",
    updated: "更新",
    unitsProduced: "製作済み",
    productionPending: "未製作",
  },
};

function localeFor(language: "pt" | "en" | "ja") {
  return language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "pt-BR";
}

function currentStage(order: CustomerOrderDetail): Stage {
  if (order.status === "delivered") return "delivered";
  if (order.status === "ready") return "ready";
  if (
    order.readinessReasonCodes.includes("made_to_order") ||
    order.readinessReasonCodes.includes("stock_shortage") ||
    order.items.some((item) => item.productionRequired > 0 || item.producedQuantity > 0)
  ) {
    return "production";
  }
  return "received";
}

type DetailCopy = {
  ready: string;
  delivered: string;
  cancelled: string;
  production: string;
  pickup: string;
  deliveryMode: string;
  postal: string;
  arrange: string;
};

function statusLabel(status: CustomerOrderStatus, text: DetailCopy) {
  if (status === "ready") return text.ready;
  if (status === "delivered") return text.delivered;
  if (status === "cancelled") return text.cancelled;
  return text.production;
}

function deliveryModeLabel(value: string, text: DetailCopy) {
  if (value === "pickup") return text.pickup;
  if (value === "delivery") return text.deliveryMode;
  if (value === "postal") return text.postal;
  return text.arrange;
}

export default function CustomerOrderDetailClient({ referenceId }: Props) {
  const session = useCustomerSession();
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const locale = localeFor(language);
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (soft = false) => {
    if (!session.registered || !referenceId) return;
    soft ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      setOrder(await loadCustomerOrder(referenceId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [referenceId, session.registered, text.error]);

  useEffect(() => {
    if (session.loading) return;
    if (!session.registered) {
      setLoading(false);
      return;
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(true), 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, session.loading, session.registered]);

  const stage = useMemo(() => (order ? currentStage(order) : "received"), [order]);
  const stages: Array<{ id: Stage; label: string; help: string }> = [
    { id: "received", label: text.received, help: text.receivedHelp },
    { id: "production", label: text.production, help: text.productionHelp },
    { id: "ready", label: text.ready, help: text.readyHelp },
    { id: "delivered", label: text.delivered, help: text.deliveredHelp },
  ];
  const stageIndex = stages.findIndex((item) => item.id === stage);

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
        <section className="mx-auto mt-20 max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <UserRound className="mx-auto" size={44} />
          <h1 className="mt-5 text-2xl font-black">{text.loginTitle}</h1>
          <Link
            href={`/customer/login?next=${encodeURIComponent(`/customer/orders/${referenceId}`)}`}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-5 py-3 font-black text-white dark:bg-white dark:text-black"
          >
            {text.login}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          back={<BackLink href="/customer/orders" label={text.back} />}
          title={text.title}
          action={
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-black transition hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} size={15} /> {text.refresh}
            </button>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-neutral-200 bg-white p-12 dark:border-neutral-800 dark:bg-neutral-900">
            <Loader2 className="animate-spin" size={28} />
            <span className="ml-3 text-sm font-bold text-neutral-500">{text.loading}</span>
          </div>
        ) : error || !order ? (
          <FeedbackBanner tone="error" role="alert">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error || text.error}</span>
              <button type="button" onClick={() => void refresh()} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white">
                {text.retry}
              </button>
            </div>
          </FeedbackBanner>
        ) : (
          <>
            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-neutral-400">{text.orderNumber}</p>
                  <p className="mt-1 break-all font-mono text-lg font-black">#{order.orderId}</p>
                  <h2 className="mt-3 text-2xl font-black">{order.eventTitle || order.storeName}</h2>
                  <p className="mt-1 text-xs font-bold text-neutral-400">
                    {order.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(order.createdAt)) : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.eventHref && (
                    <Link href={order.eventHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">
                      <ExternalLink size={15} /> {text.event}
                    </Link>
                  )}
                  {order.storeHref && (
                    <Link href={order.storeHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">
                      <Store size={15} /> {text.store}
                    </Link>
                  )}
                </div>
              </div>

              {order.status === "cancelled" ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  <div className="flex items-center gap-3">
                    <XCircle size={26} />
                    <div>
                      <p className="font-black">{text.cancelled}</p>
                      <p className="mt-1 text-sm">{text.cancelledHelp}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-7 grid gap-3 md:grid-cols-4">
                  {stages.map((item, index) => {
                    const complete = index <= stageIndex;
                    const active = index === stageIndex;
                    return (
                      <div key={item.id} className={`rounded-2xl border p-4 ${complete ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30" : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/50"}`}>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${complete ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"}`}>
                          {complete ? <Check size={17} /> : index + 1}
                        </div>
                        <p className={`mt-3 text-sm font-black ${active ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{item.label}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{item.help}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-right text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {text.updated}: {order.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(order.updatedAt)) : "—"}
              </p>
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="flex items-center gap-2 text-lg font-black"><ShoppingBag size={20} /> {text.items}</h2>
              <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
                {order.items.map((item) => (
                  <div key={`${item.productId}-${item.name}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800"><PackageCheck size={22} /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{item.name}</p>
                      <p className="mt-1 text-xs font-bold text-neutral-500">{text.quantity}: {item.quantity}</p>
                      {item.options.length > 0 && (
                        <ul className="mt-2 space-y-1 rounded-xl bg-violet-50 p-3 text-xs font-bold text-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
                          {item.options.map((option) => (
                            <li key={option.productId || option.name} className="flex justify-between gap-3">
                              <span>{option.name}</span>
                              <span>{option.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {(item.productionRequired > 0 || item.producedQuantity > 0) && (
                        <p className="mt-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                          {item.producedQuantity} {text.unitsProduced} • {item.productionRequired} {text.productionPending}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-black">{formatMoneyMinor(item.subtotalMinor, order.currency, locale)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-800">
                <div className="flex justify-between text-neutral-500"><span>{text.subtotal}</span><span>{formatMoneyMinor(order.subtotalMinor, order.currency, locale)}</span></div>
                {order.offerDiscountMinor > 0 && <div className="flex justify-between text-emerald-600"><span>{text.discount}</span><span>- {formatMoneyMinor(order.offerDiscountMinor, order.currency, locale)}</span></div>}
                {order.rewardsDiscountMinor > 0 && <div className="flex justify-between text-violet-600"><span>{text.pointsDiscount}</span><span>- {formatMoneyMinor(order.rewardsDiscountMinor, order.currency, locale)}</span></div>}
                {order.shippingFeeMinor > 0 && <div className="flex justify-between text-neutral-500"><span>{text.shipping}</span><span>{formatMoneyMinor(order.shippingFeeMinor, order.currency, locale)}</span></div>}
                <div className="flex justify-between border-t border-neutral-100 pt-3 text-xl font-black dark:border-neutral-800"><span>{text.total}</span><span>{formatMoneyMinor(order.totalAmountMinor, order.currency, locale)}</span></div>
              </div>
            </section>

            {(order.pointsRedeemed > 0 || order.pointsToEarn > 0) && (
              <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-900/60 dark:bg-violet-950/25">
                <h2 className="flex items-center gap-2 text-lg font-black text-violet-950 dark:text-violet-100"><Gift size={20} /> {language === "ja" ? "ポイント" : language === "en" ? "Rewards" : "Recompensas"}</h2>
                <div className="mt-4 space-y-2 text-sm font-bold text-violet-800 dark:text-violet-200">
                  {order.pointsRedeemed > 0 && <div className="flex justify-between"><span>{order.rewardRedemptionStatus === "refunded" ? text.pointsRefunded : text.pointsUsed}</span><span>{order.pointsRedeemed}</span></div>}
                  {order.rewardProductName && <div className="flex justify-between gap-4"><span>{text.rewardProduct}</span><span className="text-right">{order.rewardProductName}</span></div>}
                  {order.pointsToEarn > 0 && (
                    <div className="flex justify-between">
                      <span>
                        {order.rewardStatus === "credited"
                          ? text.pointsCredited
                          : order.rewardStatus === "void"
                            ? text.pointsVoided
                            : text.pointsPending}
                      </span>
                      <span>{order.pointsToEarn}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="flex items-center gap-2 text-lg font-black"><CalendarDays size={20} /> {text.delivery}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <InfoRow
                    label={text.mode}
                    value={order.fulfillmentLabel || deliveryModeLabel(order.deliveryMode, text)}
                  />
                  {order.deliveryRegionName && (
                    <InfoRow
                      label={language === "ja" ? "配達地域" : language === "en" ? "Delivery region" : "Região de delivery"}
                      value={order.deliveryRegionName}
                    />
                  )}
                  <InfoRow label={text.date} value={order.deliveryDate || text.noInfo} />
                  <InfoRow label={text.time} value={order.deliveryTimeSlot || text.noInfo} />
                  <InfoRow label={text.address} value={order.address || text.noInfo} />
                </dl>
                {order.fulfillmentInstructions && (
                  <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                    <p className="whitespace-pre-wrap">{order.fulfillmentInstructions}</p>
                  </div>
                )}
                {order.locationLink && (
                  <a href={order.locationLink} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-black underline">
                    <MapPin size={15} /> {text.address}
                  </a>
                )}
                {order.note && <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-sm dark:bg-neutral-950/60"><p className="text-xs font-black uppercase text-neutral-400">{text.note}</p><p className="mt-2 whitespace-pre-wrap">{order.note}</p></div>}
              </section>

              <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="flex items-center gap-2 text-lg font-black"><UserRound size={20} /> {text.customer}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <InfoRow label={text.name} value={order.customerName || text.noInfo} />
                  <InfoRow label={text.phone} value={order.customerPhone || text.noInfo} />
                  <InfoRow label={text.email} value={order.customerEmail || text.noInfo} />
                </dl>
              </section>
            </div>

            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="flex items-center gap-2 text-lg font-black"><Clock3 size={20} /> {text.history}</h2>
              <div className="mt-4 space-y-3">
                {order.history.map((entry, index) => (
                  <div key={`${entry.createdAt}-${index}`} className="flex gap-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-950/60">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black"><CheckCircle2 size={15} /></div>
                    <div>
                      <p className="text-sm font-black">{statusLabel(entry.status, text)}</p>
                      <p className="mt-1 text-xs font-bold text-neutral-400">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-neutral-800">
      <dt className="shrink-0 font-bold text-neutral-400">{label}</dt>
      <dd className="break-words text-right font-black">{value}</dd>
    </div>
  );
}

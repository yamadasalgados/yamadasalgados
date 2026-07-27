"use client";

import Link from "next/link";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  parseStoreOrder,
  storeOrderDateToMillis,
} from "@/app/lib/store-order";
import {
  formatStoreOrderCurrency,
  formatStoreOrderDate,
  getDeliveryModeLabel,
  getStatusLabel,
  getStoreOrderErrorText,
  getStoreOrderLocale,
  getStoreOrderText,
} from "@/app/lib/store-order-ui";
import {
  useI18n,
} from "@/app/lib/i18n";
import useSellerId from "@/app/hooks/useSellerId";
import PageHeader from "@/app/_components/PageHeader";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

import {
  type StoreOrder,
  type StoreOrderStatus,
} from "@/app/types/store-order";
import {
  FULFILLMENT_ORDER_STATUS,
} from "@/app/lib/order-status";

type FilterKey =
  | "active"
  | StoreOrderStatus;

const ACTIVE_STATUS = new Set<
  StoreOrderStatus
>([
  "pending",
  "confirmed",
  "made_to_order",
  "preparing",
  "ready",
]);

const STATUS_STYLES: Record<
  StoreOrderStatus,
  {
    badge: string;
    border: string;
  }
> = {
  pending: {
    badge:
      "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800",
    border:
      "border-l-amber-400",
  },
  confirmed: {
    badge:
      "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-800",
    border:
      "border-l-blue-500",
  },
  made_to_order: {
    badge:
      "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-800",
    border:
      "border-l-violet-500",
  },
  preparing: {
    badge:
      "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800",
    border:
      "border-l-orange-500",
  },
  ready: {
    badge:
      "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800",
    border:
      "border-l-emerald-500",
  },
  delivered: {
    badge:
      "bg-green-50 text-green-800 ring-green-200 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-800",
    border:
      "border-l-green-600",
  },
  cancelled: {
    badge:
      "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800",
    border:
      "border-l-rose-500",
  },
};

function StoreOrderSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-6 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-4 h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="mt-5 h-10 w-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

export default function StoreOrdersClient() {
  const {
    lang,
  } = useI18n();

  const locale =
    getStoreOrderLocale(lang);

  const text =
    getStoreOrderText(locale);

  const {
    loading: sellerLoading,
    sellerId,
    errorCode: sellerErrorCode,
    reload: reloadSeller,
  } = useSellerId();

  const [orders, setOrders] =
    useState<StoreOrder[]>([]);
  const [activeFilter, setActiveFilter] =
    useState<FilterKey>("active");
  const [loading, setLoading] =
    useState(true);
  const [loadFailed, setLoadFailed] =
    useState(false);
  const [reloadKey, setReloadKey] =
    useState(0);

  useEffect(() => {
    if (sellerLoading || !sellerId) return;
    let cancelled = false;

    async function markStoreOrdersRead() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/seller/notifications/mark-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sellerId, scope: "store" }),
        });
        if (!cancelled && response.ok) {
          window.dispatchEvent(new Event("yamada:seller-order-badge-refresh"));
        }
      } catch (error) {
        console.warn("[StoreOrdersClient] Falha ao limpar badge:", error);
      }
    }

    void markStoreOrdersRead();
    return () => {
      cancelled = true;
    };
  }, [sellerId, sellerLoading]);

  useEffect(() => {
    if (sellerLoading) {
      setLoading(true);
      return;
    }

    if (!sellerId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadFailed(false);

    const ordersReference =
      collection(
        db,
        "sellers",
        sellerId,
        "storeOrders",
      );

    let fallbackUnsubscribe:
      | (() => void)
      | undefined;

    const sortOrders = (
      loadedOrders: StoreOrder[],
    ) =>
      loadedOrders.sort(
        (a, b) =>
          storeOrderDateToMillis(
            b.createdAt,
          ) -
          storeOrderDateToMillis(
            a.createdAt,
          ),
      );

    const applySnapshot = (
      documents: Array<{
        id: string;
        data: () => Record<
          string,
          unknown
        >;
      }>,
    ) => {
      setOrders(
        sortOrders(
          documents.map(
            (document) =>
              parseStoreOrder(
                document.id,
                document.data(),
              ),
          ),
        ),
      );

      setLoading(false);
      setLoadFailed(false);
    };

    const primaryQuery = query(
      ordersReference,
      orderBy(
        "createdAt",
        "desc",
      ),
      limit(300),
    );

    const primaryUnsubscribe =
      onSnapshot(
        primaryQuery,
        (snapshot) => {
          applySnapshot(
            snapshot.docs,
          );
        },
        (primaryError) => {
          console.warn(
            "[StoreOrdersClient] Consulta ordenada falhou; usando fallback:",
            primaryError,
          );

          fallbackUnsubscribe?.();

          fallbackUnsubscribe =
            onSnapshot(
              ordersReference,
              (snapshot) => {
                applySnapshot(
                  snapshot.docs,
                );
              },
              (fallbackError) => {
                console.error(
                  "[StoreOrdersClient] Fallback falhou:",
                  fallbackError,
                );

                setLoading(false);
                setLoadFailed(true);
              },
            );
        },
      );

    return () => {
      primaryUnsubscribe();
      fallbackUnsubscribe?.();
    };
  }, [
    reloadKey,
    sellerId,
    sellerLoading,
  ]);

  const counts = useMemo(() => {
    const result: Record<
      FilterKey,
      number
    > = {
      active: 0,
      pending: 0,
      confirmed: 0,
      made_to_order: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of orders) {
      result[order.status] += 1;

      if (
        ACTIVE_STATUS.has(
          order.status,
        )
      ) {
        result.active += 1;
      }
    }

    return result;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (
      activeFilter === "active"
    ) {
      return orders.filter(
        (order) =>
          ACTIVE_STATUS.has(
            order.status,
          ),
      );
    }

    return orders.filter(
      (order) =>
        order.status ===
        activeFilter,
    );
  }, [
    activeFilter,
    orders,
  ]);

  const tabs: Array<{
    key: FilterKey;
    label: string;
  }> = [
    {
      key: "active",
      label:
        lang === "ja"
          ? "対応中"
          : lang === "en"
            ? "Active"
            : "Ativos",
    },
    ...FULFILLMENT_ORDER_STATUS.map(
      (status) => ({
        key: status,
        label: getStatusLabel(
          status,
          locale,
        ),
      }),
    ),
  ];

  const listError =
    sellerErrorCode
      ? getStoreOrderErrorText(
          sellerErrorCode,
          locale,
        )
      : loadFailed
        ? getStoreOrderErrorText(
            "ORDER_LOAD_FAILED",
            locale,
          )
        : "";

  function retry() {
    setReloadKey(
      (current) => current + 1,
    );
    reloadSeller();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={lang === "ja" ? "注文" : lang === "en" ? "Orders" : "Pedidos"}
          title={lang === "ja" ? "店舗注文" : lang === "en" ? "Store Orders" : "Pedidos da Loja"}
          description={lang === "ja" ? "通常店舗から受け付けた注文を管理します。" : lang === "en" ? "Manage orders received through the permanent store." : "Gerencie os pedidos recebidos pela loja permanente."}
        />

        <section className="mt-5 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2">
            {tabs.map((tab) => {
              const selected =
                activeFilter ===
                tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setActiveFilter(
                      tab.key,
                    )
                  }
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition",
                    selected
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  {tab.label}

                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
                    {counts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {loading ? (
          <section className="mt-4 grid gap-4 md:grid-cols-2">
            {Array.from({
              length: 4,
            }).map((_, index) => (
              <StoreOrderSkeleton
                key={index}
              />
            ))}
          </section>
        ) : listError ? (
          <section className="mt-4 space-y-4">
            <FeedbackBanner tone="error" role="alert">{listError}</FeedbackBanner>

            <button
              type="button"
              onClick={retry}
              className="mt-5 rounded-xl bg-rose-900 px-5 py-2.5 font-bold text-white dark:bg-rose-700"
            >
              {text.retry}
            </button>
          </section>
        ) : visibleOrders.length === 0 ? (
          <section className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="font-bold text-slate-700 dark:text-slate-300">
              {lang === "ja"
                ? "注文はありません。"
                : lang === "en"
                  ? "No orders found."
                  : "Nenhum pedido encontrado."}
            </p>
          </section>
        ) : (
          <section className="mt-4 grid gap-4 md:grid-cols-2">
            {visibleOrders.map(
              (order) => {
                const statusStyle =
                  STATUS_STYLES[
                    order.status
                  ];

                const itemCount =
                  order.items.reduce(
                    (sum, item) =>
                      sum +
                      Math.max(
                        0,
                        item.qty,
                      ),
                    0,
                  );

                return (
                  <article
                    key={order.id}
                    className={[
                      "group rounded-2xl border border-l-4 border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900",
                      statusStyle.border,
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black">
                          {order.customerName ||
                            text.noName}
                        </h2>

                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          #
                          {order.id
                            .slice(0, 8)
                            .toUpperCase()}
                        </p>
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset",
                          statusStyle.badge,
                        ].join(" ")}
                      >
                        {getStatusLabel(
                          order.status,
                          locale,
                        )}
                      </span>
                    </div>

                    <div className="mt-5 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50">
                      <p className="font-semibold">
                        {order.deliveryDate ||
                          "—"}{" "}
                        {order.deliveryTimeSlot ||
                          ""}
                      </p>

                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {formatStoreOrderDate(
                          order.createdAt,
                          locale,
                        )}{" "}
                        • {itemCount}{" "}
                        {itemCount === 1
                          ? text.item
                          : text.items}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {getDeliveryModeLabel(
                          order.deliveryMode,
                          locale,
                        )}
                      </span>

                      <p className="text-xl font-black">
                        {formatStoreOrderCurrency(
                          order.totalAmount,
                          locale,
                          order.currency,
                        )}
                      </p>
                    </div>

                    <Link
                      href={`/seller/store-orders/${encodeURIComponent(
                        order.id,
                      )}`}
                      prefetch
                      className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      {lang === "ja"
                        ? "詳細を見る"
                        : lang === "en"
                          ? "View details"
                          : "Ver detalhes"}{" "}
                      →
                    </Link>
                  </article>
                );
              },
            )}
          </section>
        )}
      </div>
    </main>
  );
}

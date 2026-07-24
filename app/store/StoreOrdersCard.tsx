"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";
import {
  useI18n,
} from "@/app/lib/i18n";
import {
  isOpenOrderStatus,
  normalizeOrderStatus,
} from "@/app/lib/order-status";

type Props = {
  sellerId: string;
};

type StoreOrder = {
  status?: unknown;
  totalAmount?: unknown;
  sellerUnread?: boolean;
};

type Metrics = {
  unread: number;
  pending: number;
  madeToOrder: number;
  production: number;
  openCount: number;
  openAmount: number;
};

const EMPTY: Metrics = {
  unread: 0,
  pending: 0,
  madeToOrder: 0,
  production: 0,
  openCount: 0,
  openAmount: 0,
};

export default function StoreOrdersCard({
  sellerId,
}: Props) {
  const {
    lang,
  } = useI18n();

  const text =
    lang === "ja"
      ? {
          title: "店舗注文",
          subtitle:
            "対応が必要な常設店舗の注文",
          unread: "新着",
          pending: "保留中",
          madeToOrder: "受注生産",
          production: "製作・準備中",
          openAmount: "対応中の合計",
          openOrders: "注文を開く",
        }
      : lang === "en"
        ? {
            title: "Store orders",
            subtitle:
              "Permanent-store orders requiring attention",
            unread: "New",
            pending: "Pending",
            madeToOrder:
              "Made to order",
            production:
              "In production",
            openAmount:
              "Open order total",
            openOrders:
              "Open orders",
          }
        : {
            title:
              "Pedidos da Loja",
            subtitle:
              "Pedidos do catálogo que precisam de atenção",
            unread: "Novos",
            pending: "Pendentes",
            madeToOrder:
              "Encomendas",
            production:
              "Em produção",
            openAmount:
              "Total em aberto",
            openOrders:
              "Abrir pedidos",
          };

  const locale =
    lang === "ja"
      ? "ja-JP"
      : lang === "en"
        ? "en-US"
        : "pt-BR";

  const [loading, setLoading] =
    useState(true);
  const [metrics, setMetrics] =
    useState<Metrics>(EMPTY);

  useEffect(() => {
    if (!sellerId) {
      setMetrics(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);

    return onSnapshot(
      collection(
        db,
        "sellers",
        sellerId,
        "storeOrders",
      ),
      (snapshot) => {
        const next: Metrics = {
          ...EMPTY,
        };

        snapshot.forEach(
          (orderDocument) => {
            const order =
              orderDocument.data() as StoreOrder;

            if (
              !isOpenOrderStatus(
                order.status,
              )
            ) {
              return;
            }

            const status =
              normalizeOrderStatus(
                order.status,
              );

            next.openCount += 1;
            next.openAmount +=
              Number(
                order.totalAmount ??
                  0,
              ) || 0;

            if (
              order.sellerUnread ===
              true
            ) {
              next.unread += 1;
            }

            if (
              status === "pending" ||
              status === "confirmed"
            ) {
              next.pending += 1;
            } else if (
              status ===
              "made_to_order"
            ) {
              next.madeToOrder += 1;
            } else if (
              status === "preparing" ||
              status === "ready"
            ) {
              next.production += 1;
            }
          },
        );

        setMetrics(next);
        setLoading(false);
      },
      (error) => {
        console.error(
          "[StoreOrdersCard] Falha ao acompanhar pedidos:",
          error,
        );
        setMetrics(EMPTY);
        setLoading(false);
      },
    );
  }, [sellerId]);

  const openAmount = useMemo(
    () =>
      new Intl.NumberFormat(
        locale,
        {
          style: "currency",
          currency: "JPY",
          maximumFractionDigits: 0,
        },
      ).format(
        metrics.openAmount,
      ),
    [
      locale,
      metrics.openAmount,
    ],
  );

  // A cápsula é um alerta operacional, não um relatório fixo.
  if (
    loading ||
    metrics.openCount === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-orange-200 bg-white p-6 shadow-sm dark:border-orange-900/50 dark:bg-neutral-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-4xl">
            🛒
          </div>

          <h3 className="mt-3 text-xl font-black text-neutral-950 dark:text-white">
            {text.title}
          </h3>

          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {text.subtitle}
          </p>
        </div>

        {metrics.unread > 0 && (
          <div className="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-red-600 px-3 font-black text-white">
            {metrics.unread}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          title={text.unread}
          value={metrics.unread}
        />

        <Metric
          title={text.pending}
          value={metrics.pending}
        />

        <Metric
          title={text.madeToOrder}
          value={
            metrics.madeToOrder
          }
        />

        <Metric
          title={text.production}
          value={metrics.production}
        />
      </div>

      <div className="mt-6 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-800">
        <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
          {text.openAmount}
        </p>

        <p className="mt-1 text-2xl font-black text-neutral-950 dark:text-white">
          {openAmount}
        </p>
      </div>

      <Link
        href="/seller/store-orders"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-black text-white transition hover:opacity-85 dark:bg-white dark:text-black"
      >
        {text.openOrders} →
      </Link>
    </section>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
        {title}
      </p>

      <p className="mt-1 text-2xl font-black text-neutral-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

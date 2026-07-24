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
  type Timestamp,
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

type EventData = {
  title?: unknown;
  name?: unknown;
  status?: unknown;
  deliveryDates?: unknown;
  deliveryDate?: unknown;
  endDate?: unknown;
  eventEndDate?: unknown;
  closingDate?: unknown;
  endsAt?: unknown;
  endAt?: unknown;
};

type OrderData = {
  status?: unknown;
  totalAmount?: unknown;
  sellerUnread?: boolean;
};

type EventAlert = {
  eventId: string;
  title: string;
  endMillis: number | null;
  unread: number;
  pending: number;
  madeToOrder: number;
  production: number;
  openCount: number;
  openAmount: number;
};

function toDate(
  value: unknown,
): Date | null {
  if (!value) return null;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (
      value as Timestamp
    ).toDate === "function"
  ) {
    try {
      return (
        value as Timestamp
      ).toDate();
    } catch {
      return null;
    }
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime(),
    )
      ? null
      : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (!text) return null;

  const dateOnly =
    text.match(
      /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/,
    );

  if (dateOnly) {
    const [, year, month, day] =
      dateOnly;

    const date = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T23:59:59.999+09:00`,
    );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  const date = new Date(text);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function eventEndMillis(
  event: EventData,
): number | null {
  const directCandidates = [
    event.endDate,
    event.eventEndDate,
    event.closingDate,
    event.endsAt,
    event.endAt,
    event.deliveryDate,
  ];

  const dates: Date[] =
    directCandidates
      .map(toDate)
      .filter(
        (date): date is Date =>
          date !== null,
      );

  if (
    Array.isArray(
      event.deliveryDates,
    )
  ) {
    for (
      const value
      of event.deliveryDates
    ) {
      const date = toDate(value);
      if (date) dates.push(date);
    }
  }

  if (dates.length === 0) {
    return null;
  }

  return Math.max(
    ...dates.map(
      (date) => date.getTime(),
    ),
  );
}

function isEligibleEvent(
  event: EventData,
): boolean {
  const status = String(
    event.status ?? "active",
  ).toLowerCase();

  if (status !== "active") {
    return false;
  }

  const end = eventEndMillis(event);

  return end === null ||
    Date.now() <= end;
}

export default function EventOrdersAlerts({
  sellerId,
}: Props) {
  const {
    lang,
  } = useI18n();

  const text =
    lang === "ja"
      ? {
          title: "イベント注文",
          subtitle:
            "対応が必要なイベント注文",
          unread: "新着",
          pending: "保留中",
          madeToOrder: "受注生産",
          production: "製作・準備中",
          openAmount: "対応中の合計",
          eventEnds: "終了日",
          openOrders: "注文を開く",
          viewEvent: "イベントを見る",
          unnamedEvent:
            "名称未設定のイベント",
        }
      : lang === "en"
        ? {
            title: "Event orders",
            subtitle:
              "Event orders requiring attention",
            unread: "New",
            pending: "Pending",
            madeToOrder:
              "Made to order",
            production:
              "In production",
            openAmount:
              "Open order total",
            eventEnds: "Ends",
            openOrders:
              "Open orders",
            viewEvent: "View event",
            unnamedEvent:
              "Untitled event",
          }
        : {
            title:
              "Pedidos de Evento",
            subtitle:
              "Pedidos de evento que precisam de atenção",
            unread: "Novos",
            pending: "Pendentes",
            madeToOrder:
              "Encomendas",
            production:
              "Em produção",
            openAmount:
              "Total em aberto",
            eventEnds:
              "Encerramento",
            openOrders:
              "Abrir pedidos",
            viewEvent:
              "Ver evento",
            unnamedEvent:
              "Evento sem título",
          };

  const locale =
    lang === "ja"
      ? "ja-JP"
      : lang === "en"
        ? "en-US"
        : "pt-BR";

  const [alerts, setAlerts] =
    useState<
      Record<string, EventAlert>
    >({});
  const [now, setNow] =
    useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      60_000,
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sellerId) {
      setAlerts({});
      return;
    }

    let orderUnsubscribers:
      Array<() => void> = [];
    let generation = 0;

    const clearOrderListeners = () => {
      for (
        const unsubscribe
        of orderUnsubscribers
      ) {
        unsubscribe();
      }
      orderUnsubscribers = [];
    };

    const unsubscribeEvents =
      onSnapshot(
        collection(
          db,
          "sellers",
          sellerId,
          "events",
        ),
        (eventsSnapshot) => {
          generation += 1;
          const activeGeneration =
            generation;

          clearOrderListeners();
          setAlerts({});

          eventsSnapshot.forEach(
            (eventDocument) => {
              const event =
                eventDocument.data() as EventData;

              if (
                !isEligibleEvent(
                  event,
                )
              ) {
                return;
              }

              const eventId =
                eventDocument.id;
              const title =
                String(
                  event.title ??
                    event.name ??
                    "",
                ).trim() ||
                text.unnamedEvent;
              const endMillis =
                eventEndMillis(event);

              const unsubscribeOrders =
                onSnapshot(
                  collection(
                    db,
                    "sellers",
                    sellerId,
                    "events",
                    eventId,
                    "orders",
                  ),
                  (ordersSnapshot) => {
                    if (
                      generation !==
                      activeGeneration
                    ) {
                      return;
                    }

                    const next: EventAlert = {
                      eventId,
                      title,
                      endMillis,
                      unread: 0,
                      pending: 0,
                      madeToOrder: 0,
                      production: 0,
                      openCount: 0,
                      openAmount: 0,
                    };

                    ordersSnapshot.forEach(
                      (orderDocument) => {
                        const order =
                          orderDocument.data() as OrderData;

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

                    setAlerts(
                      (current) => {
                        const updated = {
                          ...current,
                        };

                        if (
                          next.openCount > 0 &&
                          (
                            next.endMillis === null ||
                            Date.now() <=
                              next.endMillis
                          )
                        ) {
                          updated[eventId] =
                            next;
                        } else {
                          delete updated[
                            eventId
                          ];
                        }

                        return updated;
                      },
                    );
                  },
                  (error) => {
                    console.error(
                      `[EventOrdersAlerts] Falha nos pedidos do evento ${eventId}:`,
                      error,
                    );
                  },
                );

              orderUnsubscribers.push(
                unsubscribeOrders,
              );
            },
          );
        },
        (error) => {
          console.error(
            "[EventOrdersAlerts] Falha ao acompanhar eventos:",
            error,
          );
          setAlerts({});
        },
      );

    return () => {
      generation += 1;
      unsubscribeEvents();
      clearOrderListeners();
    };
  }, [
    sellerId,
    text.unnamedEvent,
  ]);

  const visibleAlerts = useMemo(
    () =>
      Object.values(alerts)
        .filter(
          (alert) =>
            alert.endMillis === null ||
            now <= alert.endMillis,
        )
        .sort(
        (a, b) => {
          if (
            a.unread !== b.unread
          ) {
            return b.unread -
              a.unread;
          }

          return (
            a.endMillis ??
            Number.MAX_SAFE_INTEGER
          ) -
            (
              b.endMillis ??
              Number.MAX_SAFE_INTEGER
            );
        },
      ),
    [alerts, now],
  );

  if (
    visibleAlerts.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-5">
      {visibleAlerts.map(
        (alert) => {
          const amount =
            new Intl.NumberFormat(
              locale,
              {
                style: "currency",
                currency: "JPY",
                maximumFractionDigits: 0,
              },
            ).format(
              alert.openAmount,
            );

          const endLabel =
            alert.endMillis === null
              ? ""
              : new Intl.DateTimeFormat(
                  locale,
                  {
                    timeZone:
                      "Asia/Tokyo",
                    year: "numeric",
                    month: "short",
                    day: "2-digit",
                  },
                ).format(
                  new Date(
                    alert.endMillis,
                  ),
                );

          return (
            <section
              key={alert.eventId}
              className="rounded-[2rem] border border-violet-200 bg-white p-6 shadow-sm dark:border-violet-900/50 dark:bg-neutral-900"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-4xl">
                    🎉
                  </div>

                  <p className="mt-3 text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-300">
                    {text.title}
                  </p>

                  <h3 className="mt-1 text-xl font-black text-neutral-950 dark:text-white">
                    {alert.title}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {text.subtitle}
                  </p>

                  {endLabel && (
                    <p className="mt-2 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                      {text.eventEnds}: {endLabel}
                    </p>
                  )}
                </div>

                {alert.unread > 0 && (
                  <div className="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-red-600 px-3 font-black text-white">
                    {alert.unread}
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  title={text.unread}
                  value={alert.unread}
                />

                <Metric
                  title={text.pending}
                  value={alert.pending}
                />

                <Metric
                  title={text.madeToOrder}
                  value={
                    alert.madeToOrder
                  }
                />

                <Metric
                  title={text.production}
                  value={
                    alert.production
                  }
                />
              </div>

              <div className="mt-6 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-800">
                <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                  {text.openAmount}
                </p>

                <p className="mt-1 text-2xl font-black text-neutral-950 dark:text-white">
                  {amount}
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Link
                  href={`/seller/events/${encodeURIComponent(
                    alert.eventId,
                  )}?tab=orders`}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-black text-white transition hover:opacity-85 dark:bg-white dark:text-black"
                >
                  {text.openOrders} →
                </Link>

                <Link
                  href={`/event/${encodeURIComponent(
                    sellerId,
                  )}/${encodeURIComponent(
                    alert.eventId,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black text-neutral-900 transition hover:border-black dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:border-white"
                >
                  {text.viewEvent} ↗
                </Link>
              </div>
            </section>
          );
        },
      )}
    </div>
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

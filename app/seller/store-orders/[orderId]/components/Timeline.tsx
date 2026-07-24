import {
  Check,
  Circle,
  XCircle,
} from "lucide-react";

import {
  formatStoreOrderDate,
  getStatusLabel,
} from "@/app/lib/store-order-ui";
import {
  storeOrderDateToMillis,
} from "@/app/lib/store-order";

import type {
  StoreOrderDate,
  StoreOrderHistory,
  StoreOrderStatus,
} from "@/app/types/store-order";

type Props = {
  status: StoreOrderStatus;
  history?: StoreOrderHistory[];
  createdAt?: StoreOrderDate;
  locale: string;
};

const STANDARD_FLOW: StoreOrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
];

const MADE_TO_ORDER_FLOW: StoreOrderStatus[] = [
  "pending",
  "confirmed",
  "made_to_order",
  "preparing",
  "ready",
  "delivered",
];

export default function Timeline({
  status,
  history = [],
  createdAt,
  locale,
}: Props) {
  if (status === "cancelled") {
    const cancellation =
      [...history]
        .reverse()
        .find(
          (entry) =>
            entry.status ===
            "cancelled",
        );

    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
        <div className="flex items-start gap-3">
          <XCircle
            className="mt-0.5 shrink-0 text-red-700 dark:text-red-300"
            size={24}
          />

          <div>
            <h2 className="font-black">
              {getStatusLabel(
                "cancelled",
                locale,
              )}
            </h2>

            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {formatStoreOrderDate(
                cancellation?.createdAt,
                locale,
              )}
            </p>

            {cancellation?.note && (
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {cancellation.note}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const usesMadeToOrder =
    status === "made_to_order" ||
    history.some(
      (entry) =>
        entry.status ===
        "made_to_order",
    );

  const flow = usesMadeToOrder
    ? MADE_TO_ORDER_FLOW
    : STANDARD_FLOW;

  const currentIndex =
    Math.max(
      0,
      flow.indexOf(status),
    );

  const sortedHistory =
    [...history].sort(
      (a, b) =>
        storeOrderDateToMillis(
          a.createdAt,
        ) -
        storeOrderDateToMillis(
          b.createdAt,
        ),
    );

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 sm:p-6">
      <div
        className={[
          "grid gap-3 sm:grid-cols-3",
          usesMadeToOrder
            ? "lg:grid-cols-6"
            : "lg:grid-cols-5",
        ].join(" ")}
      >
        {flow.map(
          (
            step,
            index,
          ) => {
            const completed =
              index <= currentIndex;

            const historyEntry =
              sortedHistory.find(
                (entry) =>
                  entry.status ===
                  step,
              );

            const date =
              step === "pending" &&
              !historyEntry
                ? createdAt
                : historyEntry?.createdAt;

            return (
              <div
                key={step}
                aria-current={
                  step === status
                    ? "step"
                    : undefined
                }
                className={[
                  "relative rounded-2xl border p-4",
                  completed
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                    : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950/50",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      completed
                        ? "bg-green-600 text-white dark:bg-green-500 dark:text-neutral-950"
                        : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300",
                    ].join(" ")}
                  >
                    {completed ? (
                      <Check size={16} />
                    ) : (
                      <Circle size={12} />
                    )}
                  </span>

                  <p className="text-sm font-black">
                    {getStatusLabel(
                      step,
                      locale,
                    )}
                  </p>
                </div>

                {date && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatStoreOrderDate(
                      date,
                      locale,
                    )}
                  </p>
                )}
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

import {
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock3,
  PackageCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import {
  formatStoreOrderDate,
  getStatusLabel,
  getStoreOrderText,
} from "@/app/lib/store-order-ui";
import {
  storeOrderDateToMillis,
} from "@/app/lib/store-order";

import type {
  StoreOrderHistory,
  StoreOrderStatus,
} from "@/app/types/store-order";

type Props = {
  history?: StoreOrderHistory[];
  locale: string;
};

function HistoryIcon({
  status,
}: {
  status: StoreOrderStatus;
}) {
  switch (status) {
    case "pending":
      return (
        <ShoppingCart
          className="text-amber-600 dark:text-amber-300"
          size={20}
        />
      );

    case "confirmed":
      return (
        <CheckCircle2
          className="text-blue-600 dark:text-blue-300"
          size={20}
        />
      );

    case "made_to_order":
      return (
        <ClipboardList
          className="text-violet-600 dark:text-violet-300"
          size={20}
        />
      );

    case "preparing":
      return (
        <ChefHat
          className="text-orange-600 dark:text-orange-300"
          size={20}
        />
      );

    case "ready":
      return (
        <PackageCheck
          className="text-emerald-600 dark:text-emerald-300"
          size={20}
        />
      );

    case "delivered":
      return (
        <CheckCircle2
          className="text-green-600 dark:text-green-300"
          size={20}
        />
      );

    case "cancelled":
      return (
        <XCircle
          className="text-red-600 dark:text-red-300"
          size={20}
        />
      );

    default:
      return <Clock3 size={20} />;
  }
}

export default function HistoryCard({
  history = [],
  locale,
}: Props) {
  const text =
    getStoreOrderText(locale);

  const sorted =
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
    <section className="rounded-3xl border border-neutral-200 bg-white text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex items-center gap-3 border-b border-neutral-200 p-6 dark:border-neutral-800">
        <CalendarClock
          className="text-indigo-600 dark:text-indigo-300"
          size={26}
        />

        <h2 className="text-2xl font-black">
          {text.history}
        </h2>
      </div>

      {sorted.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {text.historyEmpty}
        </p>
      ) : (
        <div className="p-6">
          {sorted.map(
            (
              entry,
              index,
            ) => (
              <div
                key={`${entry.status}-${storeOrderDateToMillis(
                  entry.createdAt,
                )}-${index}`}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <div className="rounded-full bg-neutral-100 p-2 dark:bg-neutral-800">
                    <HistoryIcon
                      status={
                        entry.status
                      }
                    />
                  </div>

                  {index <
                    sorted.length -
                      1 && (
                    <div className="my-2 h-12 w-px bg-neutral-200 dark:bg-neutral-700" />
                  )}
                </div>

                <div className="min-w-0 flex-1 pb-7">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-black">
                        {getStatusLabel(
                          entry.status,
                          locale,
                        )}
                      </h3>

                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatStoreOrderDate(
                          entry.createdAt,
                          locale,
                        )}
                      </p>
                    </div>

                    {entry.updatedBy && (
                      <span className="max-w-full break-all rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold dark:bg-neutral-800">
                        {entry.updatedBy}
                      </span>
                    )}
                  </div>

                  {entry.note && (
                    <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-950/50">
                      {entry.note}
                    </p>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

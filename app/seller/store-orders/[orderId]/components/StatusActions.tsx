"use client";

import {
  useState,
} from "react";

import {
  FULFILLMENT_ORDER_STATUS,
} from "@/app/lib/order-status";
import {
  getStatusLabel,
  getStoreOrderText,
} from "@/app/lib/store-order-ui";

import type {
  StoreOrderStatus,
} from "@/app/types/store-order";

type Props = {
  currentStatus: StoreOrderStatus;
  loading: boolean;
  locale: string;
  onChange: (
    status: StoreOrderStatus,
    note?: string,
  ) => Promise<void>;
};

const STATUS_STYLE: Record<
  StoreOrderStatus,
  string
> = {
  pending:
    "border-amber-300 bg-amber-50 text-amber-900 ring-amber-300 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700",
  confirmed:
    "border-blue-300 bg-blue-50 text-blue-900 ring-blue-300 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-700",
  made_to_order:
    "border-violet-300 bg-violet-50 text-violet-900 ring-violet-300 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100 dark:ring-violet-700",
  preparing:
    "border-orange-300 bg-orange-50 text-orange-900 ring-orange-300 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-700",
  ready:
    "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-300 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-700",
  delivered:
    "border-green-300 bg-green-50 text-green-900 ring-green-300 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100 dark:ring-green-700",
  cancelled:
    "border-red-300 bg-red-50 text-red-900 ring-red-300 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-700",
};

export default function StatusActions({
  currentStatus,
  loading,
  locale,
  onChange,
}: Props) {
  const text =
    getStoreOrderText(locale);

  const [note, setNote] =
    useState("");
  const [savingStatus, setSavingStatus] =
    useState<StoreOrderStatus | null>(
      null,
    );
  const [actionError, setActionError] = useState("");

  async function handleChange(
    status: StoreOrderStatus,
  ) {
    if (
      loading ||
      savingStatus ||
      status === currentStatus
    ) {
      return;
    }

    if (
      status === "cancelled" &&
      !window.confirm(
        text.confirmCancel,
      )
    ) {
      return;
    }

    setSavingStatus(status);
    setActionError("");

    try {
      await onChange(
        status,
        note,
      );

      setNote("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status.",
      );
    } finally {
      setSavingStatus(null);
    }
  }

  const busy =
    loading ||
    savingStatus !== null;

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <h2 className="text-xl font-black">
        {text.statusActions}
      </h2>

      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {text.statusHelp}
      </p>

      <textarea
        value={note}
        onChange={(event) =>
          setNote(
            event.target.value,
          )
        }
        placeholder={text.statusNote}
        rows={3}
        disabled={busy}
        className="mt-5 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-neutral-500 disabled:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400 dark:disabled:bg-neutral-800"
      />

      {actionError && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {actionError}
        </p>
      )}

      <div className="mt-5 grid gap-3">
        {FULFILLMENT_ORDER_STATUS.map(
          (status) => {
            const selected =
              status ===
              currentStatus;

            const saving =
              status ===
              savingStatus;

            return (
              <button
                key={status}
                type="button"
                onClick={() =>
                  void handleChange(
                    status,
                  )
                }
                disabled={
                  busy || selected
                }
                aria-pressed={
                  selected
                }
                className={[
                  "min-h-12 rounded-xl border px-4 py-3 text-left font-black transition disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? `${STATUS_STYLE[status]} ring-2 ring-offset-2 dark:ring-offset-neutral-900`
                    : "border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-100 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                {saving
                  ? text.saving
                  : getStatusLabel(
                      status,
                      locale,
                    )}
              </button>
            );
          },
        )}
      </div>
    </section>
  );
}

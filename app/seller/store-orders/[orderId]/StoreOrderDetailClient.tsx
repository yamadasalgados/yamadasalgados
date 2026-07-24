"use client";

import {
  useCallback,
  useEffect,
} from "react";
import {
  useRouter,
} from "next/navigation";

import {
  useI18n,
} from "@/app/lib/i18n";
import {
  getStoreOrderErrorText,
  getStoreOrderLocale,
  getStoreOrderText,
} from "@/app/lib/store-order-ui";
import useStoreOrder from "@/app/hooks/useStoreOrder";

import Header from "./components/Header";
import Timeline from "./components/Timeline";
import CustomerCard from "./components/CustomerCard";
import ItemsCard from "./components/ItemsCard";
import HistoryCard from "./components/HistoryCard";
import StatusActions from "./components/StatusActions";

type Props = {
  orderId: string;
};

export default function StoreOrderDetailClient({
  orderId,
}: Props) {
  const router = useRouter();
  const {
    lang,
  } = useI18n();

  const locale =
    getStoreOrderLocale(lang);

  const text =
    getStoreOrderText(locale);

  const {
    loading,
    saving,
    errorCode,
    order,
    reload,
    updateStatus,
  } = useStoreOrder(orderId);

  const errorMessage =
    getStoreOrderErrorText(
      errorCode,
      locale,
    );

  useEffect(() => {
    router.prefetch(
      "/seller/store-orders",
    );
  }, [router]);

  const handleBack = useCallback(() => {
    router.push(
      "/seller/store-orders",
    );
  }, [router]);

  const handleRetry = useCallback(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="h-11 w-36 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />

          {Array.from({
            length: 3,
          }).map((_, index) => (
            <section
              key={index}
              className="animate-pulse space-y-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="h-7 w-2/5 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-20 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-20 rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
            </section>
          ))}
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
          <button
            type="button"
            onClick={handleBack}
            className="mb-6 rounded-xl border border-neutral-200 bg-white px-4 py-2 font-bold shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            ← {text.back}
          </button>

          <section
            role="alert"
            className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/60 dark:bg-red-950/30"
          >
            <h1 className="text-2xl font-black text-red-900 dark:text-red-200">
              {text.notFound}
            </h1>

            <p className="mt-3 text-sm text-red-700 dark:text-red-300">
              {errorMessage ||
                text.notFoundBody}
            </p>

            <button
              type="button"
              onClick={handleRetry}
              className="mt-6 rounded-xl bg-red-800 px-5 py-2.5 font-bold text-white transition hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              {text.retry}
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Header
          order={order}
          locale={locale}
          onBack={handleBack}
        />

        {errorMessage && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
          >
            <span>{errorMessage}</span>

            <button
              type="button"
              onClick={handleRetry}
              className="rounded-xl border border-red-300 bg-white px-4 py-2 font-bold transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:hover:bg-red-900/50"
            >
              {text.retry}
            </button>
          </div>
        )}

        <Timeline
          status={order.status}
          history={order.history}
          createdAt={order.createdAt}
          locale={locale}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <CustomerCard
              order={order}
              locale={locale}
            />

            <ItemsCard
              order={order}
              locale={locale}
            />

            <HistoryCard
              history={order.history}
              locale={locale}
            />
          </div>

          <aside className="min-w-0 xl:sticky xl:top-6">
            <StatusActions
              currentStatus={
                order.status
              }
              loading={saving}
              locale={locale}
              onChange={
                updateStatus
              }
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

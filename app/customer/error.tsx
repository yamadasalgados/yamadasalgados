"use client";

import { AlertTriangle, RefreshCw, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Não foi possível abrir esta área",
    body: "Tente novamente. Seus pedidos e dados da conta continuam salvos.",
    retry: "Tentar novamente",
    orders: "Meus pedidos",
  },
  en: {
    title: "This area could not be opened",
    body: "Try again. Your orders and account information are still saved.",
    retry: "Try again",
    orders: "My orders",
  },
  ja: {
    title: "この画面を開けませんでした",
    body: "もう一度お試しください。注文とアカウント情報は保存されています。",
    retry: "再試行",
    orders: "注文履歴",
  },
} as const;

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];

  useEffect(() => {
    console.error("[customer-area]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm dark:border-red-900/60 dark:bg-neutral-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-black">{text.title}</h1>
        <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-300">{text.body}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white dark:bg-white dark:text-neutral-950"
          >
            <RefreshCw size={17} />
            {text.retry}
          </button>
          <Link
            href="/customer/orders"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black dark:border-neutral-700"
          >
            <ShoppingBag size={17} />
            {text.orders}
          </Link>
        </div>
      </section>
    </main>
  );
}

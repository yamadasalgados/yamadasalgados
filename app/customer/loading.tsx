"use client";

import { Loader2 } from "lucide-react";

import { useI18n } from "@/app/lib/i18n";

export default function CustomerLoading() {
  const { lang } = useI18n();
  const label = lang === "ja" ? "読み込み中…" : lang === "en" ? "Loading…" : "Carregando…";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-sm font-bold text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        <Loader2 className="animate-spin" size={20} />
        {label}
      </div>
    </main>
  );
}

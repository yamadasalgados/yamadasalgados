"use client";   

import Link from "next/link";
import { useI18n } from "@/app/lib/i18n"; // Ajustado para o caminho correto dentro de _old

export default function HomePage() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center px-4 text-center">
      <div className="space-y-6 max-w-2xl">
        <img
          src="/logo-yamada.png"
          alt="Yamada Salgados"
          className="mx-auto h-28 w-28 rounded-[2.5rem] shadow-2xl transition-transform hover:scale-105"
        />

        <div className="space-y-2">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-neutral-900 dark:text-white">
            Order <span className="text-neutral-500 dark:text-neutral-400">System</span>
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 font-medium max-w-md mx-auto">
            {t("home.subtitle")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6 w-full max-w-sm mx-auto">
          <Link
            href="/login"
            className="flex-1 px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-base hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl text-center"
          >
            {t("home.cta.login")}
          </Link>

          <Link
            href="/login?mode=register"
            className="flex-1 px-8 py-4 bg-white dark:bg-neutral-900 text-black dark:text-white border border-neutral-200 dark:border-neutral-800 rounded-2xl font-black text-base hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-center"
          >
            {t("home.cta.register")}
          </Link>
        </div>
      </div>
    </main>
  );
}
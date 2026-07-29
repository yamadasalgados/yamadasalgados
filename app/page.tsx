"use client";

import Link from "next/link";
import { useI18n } from "@/app/lib/i18n";
import {
  PLATFORM_LOGO_PATH,
  PLATFORM_NAME,
} from "@/app/lib/platform-brand";

export default function HomePage() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-2xl space-y-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PLATFORM_LOGO_PATH}
          alt={PLATFORM_NAME}
          className="mx-auto h-28 w-28 rounded-[2.5rem] shadow-2xl transition-transform hover:scale-105"
        />

        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-neutral-900 dark:text-white md:text-6xl">
            {PLATFORM_NAME}
          </h1>
          <p className="mx-auto max-w-md text-lg font-medium text-neutral-600 dark:text-neutral-400">
            {t("home.subtitle")}
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-4 pt-6 sm:flex-row">
          <Link
            href="/login"
            className="flex-1 rounded-2xl bg-black px-8 py-4 text-center text-base font-black text-white shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-black"
          >
            {t("home.cta.login")}
          </Link>

          <Link
            href="/login?mode=register"
            className="flex-1 rounded-2xl border border-neutral-200 bg-white px-8 py-4 text-center text-base font-black text-black transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800/50"
          >
            {t("home.cta.register")}
          </Link>
        </div>
      </div>
    </main>
  );
}

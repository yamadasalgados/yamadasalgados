"use client";

import Link from "next/link";
import { useI18n } from "@/app/lib/i18n";

export default function AdminHomePage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Section: Visão Geral / Welcome Banner Internacionalizado */}
      <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-6 space-y-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {t("admin.home.overview.title")}
        </h2>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 max-w-2xl leading-relaxed">
          {t("admin.home.overview.desc")}
        </p>
      </section>

      {/* Section: Grid de Ações Rápidas Internacionalizadas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ActionCard
          title={t("admin.home.card.sellers.title")}
          desc={t("admin.home.card.sellers.desc")}
          href="/admin/sellers"
          icon="🏪"
        />
        <ActionCard
          title={t("admin.home.card.cleanup.title")}
          desc={t("admin.home.card.cleanup.desc")}
          href="/admin/cleanup"
          icon="🧹"
        />
        <ActionCard
          title={t("admin.home.card.events.title")}
          desc={t("admin.home.card.events.desc")}
          href="/admin/events"
          icon="📅"
        />
        <ActionCard
          title={t("admin.home.card.settings.title")}
          desc={t("admin.home.card.settings.desc")}
          href="/admin/settings"
          icon="⚙️"
        />
      </section>
    </div>
  );
}

// 🎨 Componente Modular de Cartão de Ação
function ActionCard({ title, desc, href, icon }: { title: string; desc: string; href: string; icon: string }) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 transition-all hover:scale-[1.02] active:scale-[0.99] hover:shadow-lg dark:hover:bg-neutral-800/40 flex flex-col justify-between min-h-[140px]"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xl">{icon}</span>
          {/* Setinha discreta que aparece no hover */}
          <span className="text-neutral-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-xs font-black">
            ➔
          </span>
        </div>
        <div>
          <h3 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed font-medium">
            {desc}
          </p>
        </div>
      </div>
    </Link>
  );
}
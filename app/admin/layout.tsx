"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; 
import AdminGuard from "@/app/_components/AdminGuard"; 
import { useI18n } from "@/app/lib/i18n"; 

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const pathname = usePathname();

  // Mapeamento dinâmico para os rótulos de navegação baseado no idioma
  const labels = {
    dashboard: lang === "ja" ? "ダッシュボード" : lang === "en" ? "Dashboard" : "Painel",
    sellers: lang === "ja" ? "販売者管理" : lang === "en" ? "Sellers" : "Sellers",
    events: lang === "ja" ? "イベント" : lang === "en" ? "Events" : "Eventos",
    config: lang === "ja" ? "設定" : lang === "en" ? "Config" : "Config",
  };

  return (
    <AdminGuard>
      {({ user }) => (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">


          {/* Conteúdo Dinâmico com Animação de Transição Global para as Páginas */}
          <main className="min-h-[60vh] animate-fade-in">
            {children}
          </main>
        </div>
      )}
    </AdminGuard>
  );
}

// Componente auxiliar para estilizar os botões ativos/inativos do menu
function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-xl text-xs font-black px-4 py-2.5 transition-all active:scale-[0.98] border ${
        active
          ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-md"
          : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-800 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}
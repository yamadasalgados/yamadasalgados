import Link from "next/link";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

export default function AdminCleanupPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Limpeza de contas"
        description="A limpeza automática antiga foi desativada para proteger contas Lifetime e anuais."
        back={<BackLink href="/admin" label="Voltar ao painel" />}
      />

      <FeedbackBanner tone="warning">Nesta etapa, nenhuma conta é apagada automaticamente.</FeedbackBanner>

      <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-black">
          Proteção aplicada
        </h2>
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          O novo modelo separa status da conta e acesso comercial. Uma futura rotina de limpeza deverá verificar
          <code className="mx-1 font-black">accountStatus</code>,
          <code className="mx-1 font-black">access.mode</code>,
          <code className="mx-1 font-black">access.status</code> e
          <code className="mx-1 font-black">access.currentPeriodEnd</code>
          no backend antes de apagar qualquer dado.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/plans"
          className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          Gerenciar planos
        </Link>
        <Link
          href="/admin/sellers"
          className="rounded-2xl border border-neutral-300 px-5 py-3 text-sm font-black dark:border-neutral-700"
        >
          Ver vendedores
        </Link>
      </div>
    </main>
  );
}

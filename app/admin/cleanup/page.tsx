import Link from "next/link";

export default function AdminCleanupPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-black">
          Limpeza de contas
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          A limpeza automática antiga foi desativada para não excluir contas Lifetime ou anuais por engano.
        </p>
      </header>

      <section className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
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
        <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
          Nesta etapa, nenhuma conta é apagada automaticamente.
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

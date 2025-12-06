// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Yamada Salgados –{" "}
          <span className="text-orange-600">Eventos por região</span>
        </h1>
        <p className="text-sm text-neutral-700">
          Organize suas vendas por cidade, data e vendedora usando links
          personalizados para cada evento.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white shadow-sm border border-neutral-200 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Para vendedoras</h2>
          <ul className="text-xs text-neutral-700 space-y-1 list-disc pl-4">
            <li>Criar eventos por região e data de entrega</li>
            <li>Selecionar produtos específicos para cada evento</li>
            <li>Gerar link único para enviar pelo WhatsApp</li>
          </ul>
        </div>

        <div className="rounded-xl bg-white shadow-sm border border-neutral-200 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Para clientes</h2>
          <ul className="text-xs text-neutral-700 space-y-1 list-disc pl-4">
            <li>Acessam apenas os produtos daquele evento</li>
            <li>Escolhem quantidades rapidamente</li>
            <li>Enviam o pedido direto pelo WhatsApp</li>
          </ul>
        </div>
      </section>

      <div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 transition"
        >
          Entrar como vendedora
        </Link>
      </div>
    </main>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CustomerNav } from "@/app/_components/RoleNavigation";
import CustomerShellStatus from "@/app/_components/CustomerShellStatus";
import useCustomerSession from "@/app/hooks/useCustomerSession";

function CustomerAccessLayout({ children }: { children: ReactNode }) {
  const session = useCustomerSession();
  const router = useRouter();
  const business = session.accountRole === "seller" || session.accountRole === "admin";
  const destination = session.dashboardHref || (session.accountRole === "admin" ? "/admin" : "/seller");
  useEffect(() => { if (business && !session.loading) router.replace(destination); }, [business, session.loading, destination, router]);
  if (business) return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-center">
        <h1 className="text-xl font-black">Você está conectado como vendedor/administrador</h1>
        <p className="mt-3 text-sm text-neutral-300">Esta área é exclusiva para clientes. Seu painel está disponível abaixo.</p>
        <Link href={destination} className="mt-5 block rounded-xl bg-white px-4 py-3 font-black text-neutral-950">Abrir meu painel</Link>
      </section>
    </main>
  );
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <CustomerNav />
      <CustomerShellStatus />
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>
  );
}

export default function CustomerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/customer/login")) return <>{children}</>;
  return <CustomerAccessLayout>{children}</CustomerAccessLayout>;
}

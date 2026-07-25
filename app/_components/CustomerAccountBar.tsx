"use client";

import Link from "next/link";
import { Gift, LogIn, LogOut, ShoppingBag, Store, UserRound } from "lucide-react";

import type { CustomerSession } from "@/app/hooks/useCustomerSession";
import CustomerPushNotifications from "@/app/_components/CustomerPushNotifications";

type Props = {
  session: CustomerSession;
  returnTo: string;
  language: "pt" | "en" | "ja";
  storeHref?: string;
};

const COPY = {
  pt: {
    guestTitle: "Ganhe pontos nas compras",
    guestBody: "Cadastre-se para ganhar 1 ponto a cada ¥100 pagos.",
    enter: "Entrar ou cadastrar",
    registered: "Conta do cliente",
    points: "pontos",
    exit: "Sair",
    profile: "Meu perfil",
    orders: "Meus pedidos",
    visitStore: "Visitar loja",
    loading: "Carregando conta...",
  },
  en: {
    guestTitle: "Earn points on purchases",
    guestBody: "Register to earn 1 point for every ¥100 paid.",
    enter: "Sign in or register",
    registered: "Customer account",
    points: "points",
    exit: "Sign out",
    profile: "My profile",
    orders: "My orders",
    visitStore: "Visit store",
    loading: "Loading account...",
  },
  ja: {
    guestTitle: "お買い物でポイント獲得",
    guestBody: "登録すると、お支払い¥100ごとに1ポイント貯まります。",
    enter: "ログイン・新規登録",
    registered: "お客様アカウント",
    points: "ポイント",
    exit: "ログアウト",
    profile: "マイプロフィール",
    orders: "注文履歴",
    visitStore: "ショップを見る",
    loading: "アカウントを読み込み中...",
  },
};

export default function CustomerAccountBar({ session, returnTo, language, storeHref }: Props) {
  const text = COPY[language];
  const loginHref = `/customer/login?next=${encodeURIComponent(returnTo || "/")}`;

  if (session.loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs font-bold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        {text.loading}
      </div>
    );
  }

  if (!session.registered) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Gift size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-amber-950 dark:text-amber-100">{text.guestTitle}</p>
            <p className="mt-0.5 text-xs font-medium text-amber-800/80 dark:text-amber-200/70">{text.guestBody}</p>
          </div>
        </div>
        <Link
          href={loginHref}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-700"
        >
          <LogIn size={16} />
          {text.enter}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <UserRound size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-emerald-950 dark:text-emerald-100">
            {session.displayName || text.registered}
          </p>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {session.profile?.pointsBalance ?? 0} {text.points}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {storeHref && (
          <Link
            href={storeHref}
            className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
          >
            <Store size={15} />
            {text.visitStore}
          </Link>
        )}
        <Link
          href="/customer/orders"
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          <ShoppingBag size={15} />
          {text.orders}
        </Link>
        <Link
          href={`/customer/profile?next=${encodeURIComponent(returnTo || "/")}`}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          <UserRound size={15} />
          {text.profile}
        </Link>
        <button
          type="button"
          onClick={() => void session.signOutCustomer()}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          <LogOut size={15} />
          {text.exit}
        </button>
      </div>
      </div>
      <CustomerPushNotifications session={session} language={language} compact />
    </div>
  );
}

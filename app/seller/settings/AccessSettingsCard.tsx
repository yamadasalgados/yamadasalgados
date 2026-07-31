"use client";

import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Crown,
  Package,
  Tags,
} from "lucide-react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    title: "Conta, acesso e plano",
    subtitle:
      "Consulte o acesso efetivo da loja e abra a área de planos quando precisar alterar a assinatura.",
    plan: "Plano",
    mode: "Modalidade",
    interval: "Cobrança",
    status: "Status",
    events: "Limite de eventos",
    products: "Limite de produtos",
    lifetime: "Acesso vitalício",
    subscription: "Assinatura",
    monthly: "Mensal",
    annual: "Anual",
    none: "Não definido",
    active: "Acesso liberado",
    inactive: "Acesso não liberado",
    manage: "Gerenciar plano e assinatura",
  },
  en: {
    title: "Account, access, and plan",
    subtitle:
      "Review the store's effective access and open plan management whenever the subscription needs to change.",
    plan: "Plan",
    mode: "Access mode",
    interval: "Billing",
    status: "Status",
    events: "Event limit",
    products: "Product limit",
    lifetime: "Lifetime access",
    subscription: "Subscription",
    monthly: "Monthly",
    annual: "Annual",
    none: "Not defined",
    active: "Access enabled",
    inactive: "Access not enabled",
    manage: "Manage plan and subscription",
  },
  ja: {
    title: "アカウント・アクセス・プラン",
    subtitle:
      "店舗の有効なアクセス状態を確認し、契約変更が必要な場合はプラン管理へ移動します。",
    plan: "プラン",
    mode: "アクセス方式",
    interval: "請求",
    status: "状態",
    events: "イベント上限",
    products: "商品上限",
    lifetime: "永久アクセス",
    subscription: "サブスクリプション",
    monthly: "月払い",
    annual: "年払い",
    none: "未設定",
    active: "アクセス有効",
    inactive: "アクセス無効",
    manage: "プランと契約を管理",
  },
} as const;

export default function AccessSettingsCard() {
  const { lang } = useI18n();
  const { profile } = useSellerSession();
  const copy = COPY[languageKey(lang)];

  const accessMode =
    profile.accessMode === "lifetime" ? copy.lifetime : copy.subscription;
  const billing =
    profile.accessMode === "lifetime"
      ? "—"
      : profile.billingInterval === "annual"
        ? copy.annual
        : profile.billingInterval === "monthly"
          ? copy.monthly
          : copy.none;
  const status = String(profile.subscriptionStatus || "none").toUpperCase();

  const metrics = [
    {
      label: copy.plan,
      value: String(profile.plan || "starter").toUpperCase(),
      icon: Crown,
    },
    { label: copy.mode, value: accessMode, icon: Tags },
    { label: copy.interval, value: billing, icon: CalendarDays },
    { label: copy.status, value: status, icon: CheckCircle2 },
    {
      label: copy.events,
      value:
        typeof profile.maxEvents === "number" ? String(profile.maxEvents) : "—",
      icon: CalendarDays,
    },
    {
      label: copy.products,
      value:
        typeof profile.maxProducts === "number"
          ? String(profile.maxProducts)
          : "—",
      icon: Package,
    },
  ];

  return (
    <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
      <div>
        <h2 className="text-xl font-black">{copy.title}</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
          {copy.subtitle}
        </p>
      </div>

      <div
        className={`rounded-3xl border p-5 ${
          profile.accessActive
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
            : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20"
        }`}
      >
        <p
          className={`text-sm font-black ${
            profile.accessActive
              ? "text-emerald-800 dark:text-emerald-200"
              : "text-amber-800 dark:text-amber-200"
          }`}
        >
          {profile.accessActive ? copy.active : copy.inactive}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/60"
          >
            <Icon className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
              {label}
            </p>
            <p className="mt-1 break-words text-sm font-black">{value}</p>
          </div>
        ))}
      </div>

      <Link
        href="/seller/rent"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-violet-700 px-5 text-sm font-black text-white transition hover:bg-violet-800"
      >
        {copy.manage}
      </Link>
    </section>
  );
}

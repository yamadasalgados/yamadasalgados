"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/app/lib/i18n";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const LABELS = {
  pt: {
    identity: "Identidade",
    regional: "Região",
    orders: "Pedidos",
    fulfillment: "Entrega",
    notifications: "Avisos",
    printing: "Impressão",
    account: "Conta",
  },
  en: {
    identity: "Identity",
    regional: "Region",
    orders: "Orders",
    fulfillment: "Fulfillment",
    notifications: "Alerts",
    printing: "Printing",
    account: "Account",
  },
  ja: {
    identity: "店舗情報",
    regional: "地域",
    orders: "注文",
    fulfillment: "受渡し",
    notifications: "通知",
    printing: "印刷",
    account: "アカウント",
  },
} as const;

export default function SettingsSectionNav() {
  const pathname = usePathname();
  const { lang } = useI18n();
  const labels = LABELS[languageKey(lang)];

  const items = [
    { href: "/seller/settings/identity", label: labels.identity },
    { href: "/seller/settings/regional", label: labels.regional },
    { href: "/seller/settings/orders", label: labels.orders },
    { href: "/seller/settings/fulfillment", label: labels.fulfillment },
    { href: "/seller/settings/notifications", label: labels.notifications },
    { href: "/seller/settings/printing", label: labels.printing },
    { href: "/seller/settings/account", label: labels.account },
  ];

  return (
    <nav
      aria-label="Settings sections"
      className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-xs font-black transition ${
                active
                  ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

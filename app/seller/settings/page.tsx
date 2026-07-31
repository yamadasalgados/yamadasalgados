"use client";

import Link from "next/link";

import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Globe2,
  Gift,
  PackageCheck,
  PackageSearch,
  Printer,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Truck,
  UserRound,
} from "lucide-react";

import PageHeader from "@/app/_components/PageHeader";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";
import SettingsCategoryCard from "@/app/seller/settings/_components/SettingsCategoryCard";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "O que você deseja configurar?",
    description:
      "Cada assunto fica em uma área própria. Assim você encontra rapidamente a configuração desejada sem percorrer uma página longa.",
    settingsTitle: "Configurações",
    settingsDescription:
      "Identidade, operação, entrega, avisos, impressão e acesso.",
    shortcutsTitle: "Acessos do painel",
    shortcutsDescription:
      "Atalhos para todas as áreas operacionais do seller, inclusive as que não aparecem na barra inferior.",
    categories: {
      identity: {
        title: "Identidade e loja pública",
        description: "Nome comercial, descrição, logo, banner, cores, contatos e textos da marca.",
        meta: "Marca e apresentação",
      },
      regional: {
        title: "Região, idioma e moeda",
        description: "País de operação, fuso horário, moeda e idioma padrão do painel e da loja.",
        meta: "Configuração regional",
      },
      orders: {
        title: "Pedidos e estoque",
        description: "Defina se pedidos acima do estoque são bloqueados ou recebidos como pendentes.",
        meta: "Regras do checkout",
      },
      fulfillment: {
        title: "Retirada, delivery e correio",
        description: "Métodos de atendimento, taxas, mínimos, regiões, prazos e tabela de frete.",
        meta: "Entrega e envio",
      },
      notifications: {
        title: "Avisos de novos pedidos",
        description: "Ative Web Push e teste as notificações em cada aparelho usado pelo seller.",
        meta: "Notificações",
      },
      printing: {
        title: "Impressão e recibos",
        description: "Perfis de impressora, vias, papel, intensidade, QR Code e caixas de conferência.",
        meta: "Print Service",
      },
      account: {
        title: "Conta, acesso e plano",
        description: "Consulte o plano atual, status da assinatura e acesse a área de contratação.",
        meta: "Assinatura",
      },
    },
    shortcuts: {
      orders: "Pedidos",
      events: "Eventos",
      production: "Produção",
      products: "Produtos",
      offers: "Ofertas",
      rewards: "Pontos",
      reports: "Relatórios",
      onboarding: "Cadastro inicial",
      plans: "Planos",
      store: "Ver loja pública",
    },
    storeFallback: "Seller",
  },
  en: {
    eyebrow: "Store settings",
    title: "What would you like to configure?",
    description:
      "Each subject has its own area, so you can reach the right setting without scrolling through one long page.",
    settingsTitle: "Settings",
    settingsDescription: "Identity, operations, fulfillment, alerts, printing, and access.",
    shortcutsTitle: "Dashboard access",
    shortcutsDescription:
      "Shortcuts to every seller operating area, including pages not shown in the mobile bar.",
    categories: {
      identity: {
        title: "Identity and public store",
        description: "Business name, description, logo, banner, colors, contacts, and brand texts.",
        meta: "Brand and presentation",
      },
      regional: {
        title: "Region, language, and currency",
        description: "Operating country, time zone, currency, and default dashboard/store language.",
        meta: "Regional settings",
      },
      orders: {
        title: "Orders and stock",
        description: "Choose whether orders above stock are blocked or accepted as pending.",
        meta: "Checkout rules",
      },
      fulfillment: {
        title: "Pickup, delivery, and postal",
        description: "Methods, fees, minimums, areas, time estimates, and weight-based postage.",
        meta: "Fulfillment",
      },
      notifications: {
        title: "New-order alerts",
        description: "Enable Web Push and test notifications on every seller device.",
        meta: "Notifications",
      },
      printing: {
        title: "Printing and receipts",
        description: "Printer profiles, copies, paper, intensity, QR codes, and checklist boxes.",
        meta: "Print Service",
      },
      account: {
        title: "Account, access, and plan",
        description: "Review the current plan and subscription status, and open plan management.",
        meta: "Subscription",
      },
    },
    shortcuts: {
      orders: "Orders",
      events: "Events",
      production: "Production",
      products: "Products",
      offers: "Offers",
      rewards: "Rewards",
      reports: "Reports",
      onboarding: "Onboarding",
      plans: "Plans",
      store: "View public store",
    },
    storeFallback: "Seller",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "何を設定しますか？",
    description:
      "設定内容ごとにページを分けました。長いページを探さず、目的の項目へすぐ移動できます。",
    settingsTitle: "設定",
    settingsDescription: "店舗情報、運用、配送、通知、印刷、アクセスを管理します。",
    shortcutsTitle: "販売者画面へのアクセス",
    shortcutsDescription:
      "モバイル下部メニューに表示されない項目を含む、すべての運用ページへのショートカットです。",
    categories: {
      identity: {
        title: "店舗情報と公開ストア",
        description: "店舗名、紹介、ロゴ、バナー、色、連絡先、ブランド文章を設定します。",
        meta: "ブランド表示",
      },
      regional: {
        title: "地域・言語・通貨",
        description: "営業国、タイムゾーン、通貨、管理画面と店舗の既定言語を設定します。",
        meta: "地域設定",
      },
      orders: {
        title: "注文と在庫",
        description: "在庫を超える注文を停止するか、保留として受け付けるか設定します。",
        meta: "注文ルール",
      },
      fulfillment: {
        title: "受取・配達・郵送",
        description: "受取方法、料金、最低金額、地域、日数、重量別送料を設定します。",
        meta: "受渡し設定",
      },
      notifications: {
        title: "新規注文通知",
        description: "販売者が使用する各端末でWeb Pushを有効化し、通知をテストします。",
        meta: "通知",
      },
      printing: {
        title: "印刷とレシート",
        description: "プリンター、控え、用紙、濃度、QRコード、確認欄を設定します。",
        meta: "Print Service",
      },
      account: {
        title: "アカウント・アクセス・プラン",
        description: "現在のプランと契約状態を確認し、プラン管理へ移動します。",
        meta: "契約",
      },
    },
    shortcuts: {
      orders: "注文",
      events: "イベント",
      production: "製造",
      products: "商品",
      offers: "オファー",
      rewards: "ポイント",
      reports: "レポート",
      onboarding: "初期設定",
      plans: "プラン",
      store: "公開ストアを見る",
    },
    storeFallback: "販売者",
  },
} as const;

export default function SellerSettingsPage() {
  const { lang } = useI18n();
  const { sellerId, profile } = useSellerSession();
  const copy = COPY[languageKey(lang)];

  const categories = [
    {
      href: "/seller/settings/identity",
      icon: Store,
      ...copy.categories.identity,
      accent: "orange" as const,
    },
    {
      href: "/seller/settings/regional",
      icon: Globe2,
      ...copy.categories.regional,
      accent: "blue" as const,
    },
    {
      href: "/seller/settings/orders",
      icon: PackageCheck,
      ...copy.categories.orders,
      accent: "amber" as const,
    },
    {
      href: "/seller/settings/fulfillment",
      icon: Truck,
      ...copy.categories.fulfillment,
      accent: "emerald" as const,
    },
    {
      href: "/seller/settings/notifications",
      icon: Bell,
      ...copy.categories.notifications,
      accent: "rose" as const,
    },
    {
      href: "/seller/settings/printing",
      icon: Printer,
      ...copy.categories.printing,
      accent: "violet" as const,
    },
    {
      href: "/seller/settings/account",
      icon: UserRound,
      ...copy.categories.account,
      accent: "neutral" as const,
    },
  ];

  const shortcuts = [
    { href: "/seller/store-orders", label: copy.shortcuts.orders, icon: ClipboardList },
    { href: "/seller/events", label: copy.shortcuts.events, icon: CalendarDays },
    { href: "/seller/production", label: copy.shortcuts.production, icon: PackageSearch },
    { href: "/seller/products", label: copy.shortcuts.products, icon: ShoppingBag },
    { href: "/seller/offers", label: copy.shortcuts.offers, icon: Gift },
    { href: "/seller/rewards", label: copy.shortcuts.rewards, icon: Sparkles },
    { href: "/seller/reports", label: copy.shortcuts.reports, icon: ChartNoAxesCombined },
    { href: "/seller/onboarding", label: copy.shortcuts.onboarding, icon: Settings },
    { href: "/seller/rent", label: copy.shortcuts.plans, icon: Tags },
    {
      href: `/store/${encodeURIComponent(sellerId)}`,
      label: copy.shortcuts.store,
      icon: Store,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-neutral-500 dark:text-neutral-400">
            <span>{profile.storeName || copy.storeFallback}</span>
            <span className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <span>{String(profile.plan || "starter").toUpperCase()}</span>
          </div>
        }
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-black tracking-tight">{copy.settingsTitle}</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {copy.settingsDescription}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <SettingsCategoryCard key={category.href} {...category} />
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <div>
          <h2 className="text-lg font-black tracking-tight">{copy.shortcutsTitle}</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {copy.shortcutsDescription}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-black transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Icon className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" />
              <span className="min-w-0 truncate">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

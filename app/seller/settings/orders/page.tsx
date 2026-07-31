"use client";

import { useI18n } from "@/app/lib/i18n";
import OrderSettingsCard from "@/app/seller/settings/OrderSettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Pedidos e estoque",
    description: "Defina a política usada pelo checkout quando faltar estoque.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Orders and stock",
    description: "Choose the checkout policy used when stock is insufficient.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "注文と在庫",
    description: "在庫不足時にチェックアウトで使用するルールを設定します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerOrderSettingsPage() {
  const { lang } = useI18n();
  const copy = COPY[languageKey(lang)];
  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <OrderSettingsCard />
    </SettingsPageScaffold>
  );
}

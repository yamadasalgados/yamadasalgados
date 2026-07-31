"use client";

import { useI18n } from "@/app/lib/i18n";
import RegionalSettingsCard from "@/app/seller/settings/RegionalSettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Região, idioma e moeda",
    description: "Controle a localização operacional e a experiência regional da loja.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Region, language, and currency",
    description: "Control the store's operating location and regional experience.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "地域・言語・通貨",
    description: "店舗の営業地域と地域表示を管理します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerRegionalSettingsPage() {
  const { lang } = useI18n();
  const copy = COPY[languageKey(lang)];
  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <RegionalSettingsCard />
    </SettingsPageScaffold>
  );
}

"use client";

import { useI18n } from "@/app/lib/i18n";
import SellerIdentitySettingsCard from "@/app/seller/settings/SellerIdentitySettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Identidade e loja pública",
    description: "Edite a apresentação pública da marca em um único lugar.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Identity and public store",
    description: "Edit the brand's public presentation in one place.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "店舗情報と公開ストア",
    description: "ブランドの公開表示を一か所で編集します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerIdentitySettingsPage() {
  const { lang } = useI18n();
  const copy = COPY[languageKey(lang)];

  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <SellerIdentitySettingsCard language={lang} />
    </SettingsPageScaffold>
  );
}

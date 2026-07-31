"use client";

import { useI18n } from "@/app/lib/i18n";
import AccessSettingsCard from "@/app/seller/settings/AccessSettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Conta, acesso e plano",
    description: "Consulte os limites e o status atual de acesso da loja.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Account, access, and plan",
    description: "Review the store's current limits and access status.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "アカウント・アクセス・プラン",
    description: "店舗の現在の上限とアクセス状態を確認します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerAccountSettingsPage() {
  const { lang } = useI18n();
  const copy = COPY[languageKey(lang)];
  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <AccessSettingsCard />
    </SettingsPageScaffold>
  );
}

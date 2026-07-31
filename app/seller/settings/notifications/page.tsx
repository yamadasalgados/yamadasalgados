"use client";

import SellerPushNotifications from "@/app/_components/SellerPushNotifications";
import { useI18n } from "@/app/lib/i18n";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Avisos de novos pedidos",
    description:
      "Ative e teste as notificações em cada celular ou computador usado pela operação.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "New-order alerts",
    description:
      "Enable and test notifications on every phone or computer used by the operation.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "新規注文通知",
    description: "運用で使用する各スマートフォンやパソコンで通知を有効化し、テストします。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerNotificationSettingsPage() {
  const { lang } = useI18n();
  const language = languageKey(lang);
  const copy = COPY[language];

  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <SellerPushNotifications language={language} />
    </SettingsPageScaffold>
  );
}

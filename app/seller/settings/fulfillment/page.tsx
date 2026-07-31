"use client";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";
import FulfillmentSettingsCard from "@/app/seller/settings/FulfillmentSettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Retirada, delivery e correio",
    description:
      "Configure cada forma de atendimento, suas regras, regiões, taxas e prazos.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Pickup, delivery, and postal",
    description:
      "Configure each fulfillment method, including rules, areas, fees, and timing.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "受取・配達・郵送",
    description: "各受渡し方法のルール、地域、料金、日数を設定します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerFulfillmentSettingsPage() {
  const { lang } = useI18n();
  const session = useSellerSession();
  const copy = COPY[languageKey(lang)];

  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <FulfillmentSettingsCard
        sellerId={session.sellerId}
        userUid={session.user.uid}
        currency={session.profile.currency || "JPY"}
        language={lang}
      />
    </SettingsPageScaffold>
  );
}

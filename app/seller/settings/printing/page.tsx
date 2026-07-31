"use client";

import { useI18n } from "@/app/lib/i18n";
import PrinterSettingsCard from "@/app/seller/settings/PrinterSettingsCard";
import ReceiptSettingsCard from "@/app/seller/settings/ReceiptSettingsCard";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";

function languageKey(value: string): "pt" | "en" | "ja" {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    eyebrow: "Configurações da loja",
    title: "Impressão e recibos",
    description:
      "Gerencie estações, impressoras, vias e o conteúdo impresso de cada pedido.",
    back: "Voltar às configurações",
  },
  en: {
    eyebrow: "Store settings",
    title: "Printing and receipts",
    description:
      "Manage stations, printers, copies, and the printed content of each order.",
    back: "Back to settings",
  },
  ja: {
    eyebrow: "店舗設定",
    title: "印刷とレシート",
    description: "印刷ステーション、プリンター、控え、注文ごとの印刷内容を管理します。",
    back: "設定へ戻る",
  },
} as const;

export default function SellerPrintingSettingsPage() {
  const { lang } = useI18n();
  const copy = COPY[languageKey(lang)];

  return (
    <SettingsPageScaffold
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      backLabel={copy.back}
    >
      <div className="space-y-6">
        <PrinterSettingsCard lang={lang} />
        <ReceiptSettingsCard lang={lang} />
      </div>
    </SettingsPageScaffold>
  );
}

"use client";

import CustomerAppReadiness from "@/app/_components/CustomerAppReadiness";
import { useI18n } from "@/app/lib/i18n";

export default function GlobalPwaInstallCoach() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  return <CustomerAppReadiness language={language} compact mode="install" />;
}

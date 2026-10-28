"use client";

import CustomerAppReadiness from "@/app/_components/CustomerAppReadiness";
import { usePathname } from "next/navigation";
import { useI18n } from "@/app/lib/i18n";

export default function GlobalPwaInstallCoach() {
  const { lang } = useI18n();
  const pathname = usePathname();
  // Installing the PWA is optional: never interrupt first-time shopping or event orders.
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  if (pathname.startsWith("/store/") || pathname.startsWith("/event/")) return null;
  return <CustomerAppReadiness language={language} compact mode="install" />;
}

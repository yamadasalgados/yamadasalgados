"use client";

import CustomerAppReadiness from "@/app/_components/CustomerAppReadiness";
import SellerPushNotifications from "@/app/_components/SellerPushNotifications";
import { useI18n } from "@/app/lib/i18n";

export default function SellerShellStatus() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-4 sm:px-6">
      <CustomerAppReadiness language={language} compact mode="offline" />
      <SellerPushNotifications language={language} compact promptOnce />
    </div>
  );
}

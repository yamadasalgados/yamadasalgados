"use client";

import { usePathname } from "next/navigation";

import CustomerAppReadiness from "@/app/_components/CustomerAppReadiness";
import CustomerPushNotifications from "@/app/_components/CustomerPushNotifications";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import { useI18n } from "@/app/lib/i18n";

export default function CustomerShellStatus() {
  const session = useCustomerSession();
  const pathname = usePathname();
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const onProfile = pathname.startsWith("/customer/profile");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-4 sm:px-6">
      <CustomerAppReadiness language={language} compact />
      {session.registered && !onProfile && (
        <CustomerPushNotifications
          session={session}
          language={language}
          compact
          promptOnce
        />
      )}
    </div>
  );
}

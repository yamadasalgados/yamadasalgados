"use client";

import EventClient from "./EventClient";
import { useI18n } from "@/app/lib/i18n";

export default function EventClientLoader({
  sellerId,
  id,
}: {
  sellerId: string;
  id: string;
}) {
  const { lang } = useI18n();

  if (!sellerId || !id) {
    return (
      <main className="p-6 max-w-md mx-auto text-center">
        <p className="text-xs font-bold text-red-500 bg-red-50/50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200/40">
          {lang === "ja" ? "無効なリンク。URLを確認してください。" : lang === "en" ? "Invalid link template. Please verify the URL structure." : "Link inválido. Use a estrutura padrão /event/<sellerId>/<eventId>"}
        </p>
      </main>
    );
  }

  return <EventClient sellerId={sellerId} id={id} />;
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/app/lib/i18n";
import EventClientLoader from "./EventClientLoader";

type ResolvedEventIds = {
  sellerId: string;
  eventId: string;
};

export default function CatchAllEventPage() {
  const params = useParams();
  const { lang } = useI18n();
  const [invalidLink, setInvalidLink] = useState(false);
  const [resolvedIds, setResolvedIds] =
    useState<ResolvedEventIds | null>(null);

  const idArray = useMemo(() => {
    const raw = (params as { id?: string | string[] })?.id;

    if (Array.isArray(raw)) {
      return raw;
    }

    if (typeof raw === "string") {
      return [raw];
    }

    return [];
  }, [params]);

  useEffect(() => {
    setInvalidLink(false);
    setResolvedIds(null);

    // Modelo V2: /event/{sellerId}/{eventId}.
    // Links antigos com apenas eventId não são mais consultados na raiz.
    if (idArray.length !== 2) {
      setInvalidLink(true);
      return;
    }

    const sellerId = idArray[0]?.trim();
    const eventId = idArray[1]?.trim();

    if (!sellerId || !eventId) {
      setInvalidLink(true);
      return;
    }

    setResolvedIds({ sellerId, eventId });
  }, [idArray]);

  if (invalidLink) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="text-xl font-black text-neutral-900 dark:text-white">
          {lang === "ja"
            ? "イベントが見つかりません"
            : lang === "en"
              ? "Event not found"
              : "Evento não encontrado"}
        </h1>
        <p className="text-xs font-medium text-neutral-400">
          {lang === "ja"
            ? "リンクが正しくないか、古い形式の可能性があります。"
            : lang === "en"
              ? "The link is invalid or uses an obsolete format."
              : "O link é inválido ou utiliza um formato antigo que não é mais aceito."}
        </p>
      </main>
    );
  }

  if (!resolvedIds) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  return (
    <EventClientLoader
      sellerId={resolvedIds.sellerId}
      id={resolvedIds.eventId}
    />
  );
}

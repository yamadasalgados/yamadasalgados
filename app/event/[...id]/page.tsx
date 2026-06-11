"use client";

import { 
  useCallback, 
  useEffect, 
  useMemo, 
  useRef, 
  useState 
} from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import EventClientLoader from "./EventClientLoader";

export default function CatchAllEventPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useI18n();
  const [error, setError] = useState(false);
  
  // O Next.js retorna os parâmetros em formato de array para o [...id]
  const idArray = useMemo(() => {
    const raw = (params as any)?.id;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") return [raw];
    return [];
  }, [params]);

  const [resolvedIds, setResolvedIds] = useState<{ sellerId: string; eventId: string } | null>(null);

  useEffect(() => {
    if (idArray.length === 0) return;

    // CASO 1: URL Nova com 2 parâmetros -> /event/sellerUid/eventId
    if (idArray.length >= 2) {
      setResolvedIds({
        sellerId: idArray[0].trim(),
        eventId: idArray[1].trim(),
      });
      return;
    }

    // CASO 2: URL Antiga com 1 parâmetro -> /event/eventId (Faz o Fallback Automático)
    if (idArray.length === 1) {
      const targetEventId = idArray[0].trim();
      
      async function resolveLegacyLink() {
        try {
          const snap = await getDoc(doc(db, "events", targetEventId));
          if (snap.exists()) {
            const data = snap.data();
            const foundSellerId = String(data?.sellerId || "").trim();
            if (foundSellerId) {
              // Atualiza a URL no navegador para o padrão novo sem dar refresh
              router.replace(`/event/${foundSellerId}/${targetEventId}`);
              setResolvedIds({
                sellerId: foundSellerId,
                eventId: targetEventId,
              });
              return;
            }
          }
          setError(true);
        } catch (e) {
          console.error("Erro ao interceptar link dinâmico legado:", e);
          setError(true);
        }
      }

      resolveLegacyLink();
    }
  }, [idArray, router]);

  if (error) {
    return (
      <main className="p-8 text-center max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-black text-neutral-900 dark:text-white">
          {lang === "ja" ? "イベントが見つかりません" : lang === "en" ? "Event not found" : "Evento não encontrado"}
        </h1>
        <p className="text-xs font-medium text-neutral-400">
          {lang === "ja" ? "リンクが正しくないか、イベントが終了している可能性があります。" : lang === "en" ? "The link might be incorrect or the event has ended." : "O link pode estar incorreto ou o evento já foi encerrado pelo administrador."}
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

  return <EventClientLoader sellerId={resolvedIds.sellerId} id={resolvedIds.eventId} />;
}
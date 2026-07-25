"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

type Detail = {
  sellerId: string;
  eventId: string;
  title: string;
  status: string;
  region: string;
  orderCount: number;
  data: Record<string, unknown>;
};

export default function AdminEventDetailPage() {
  const params =
    useParams<{
      id: string;
    }>();

  const rawId =
    decodeURIComponent(
      String(
        params.id ?? "",
      ),
    );

  const separator =
    rawId.indexOf("~");

  const sellerId =
    separator >= 0
      ? rawId.slice(0, separator)
      : "";
  const eventId =
    separator >= 0
      ? rawId.slice(separator + 1)
      : "";

  const [detail, setDetail] =
    useState<Detail | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      if (
        !sellerId ||
        !eventId
      ) {
        setLoading(false);
        setError(
          "Identificador de evento inválido.",
        );
        return;
      }

      setLoading(true);
      setError("");

      try {
        const reference =
          doc(
            db,
            "sellers",
            sellerId,
            "events",
            eventId,
          );
        const [
          snapshot,
          orderCount,
        ] = await Promise.all([
          getDoc(reference),
          getCountFromServer(
            collection(
              reference,
              "orders",
            ),
          ),
        ]);

        if (!snapshot.exists()) {
          throw new Error(
            "EVENT_NOT_FOUND",
          );
        }

        const data =
          snapshot.data();

        setDetail({
          sellerId,
          eventId,
          title:
            String(
              data.title ??
              data.name ??
              eventId,
            ),
          status:
            String(
              data.status ??
              "unknown",
            ),
          region:
            String(
              data.regionName ??
              data.region ??
              data.regionId ??
              "",
            ),
          orderCount:
            orderCount.data().count,
          data,
        });
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "EVENT_DETAIL_FAILED",
        );
      } finally {
        setLoading(false);
      }
    },
    [eventId, sellerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="p-6 text-sm text-neutral-500">
        Carregando…
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="space-y-4 p-6">
        <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>
        <BackLink href="/admin/events" label="Voltar aos eventos" />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Evento"
        title={detail.title}
        description={`${detail.sellerId} / ${detail.eventId}`}
        back={<BackLink href="/admin/events" label="Voltar aos eventos" />}
      />

      <MetricStrip
        items={[
          { label: "Status", value: detail.status },
          { label: "Região", value: detail.region || "—" },
          { label: "Pedidos", value: detail.orderCount },
        ]}
      />

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="font-black">
          Snapshot do evento
        </h2>
        <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
          {JSON.stringify(
            detail.data,
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}


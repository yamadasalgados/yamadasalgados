"use client";

import Link from "next/link";
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
        <p className="text-red-600">
          {error}
        </p>
        <Link
          href="/admin/events"
          className="text-sm font-black underline"
        >
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header>
        <Link
          href="/admin/events"
          className="text-xs font-black text-neutral-500 underline"
        >
          ← Eventos
        </Link>
        <h1 className="mt-3 text-3xl font-black">
          {detail.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {detail.sellerId} / {detail.eventId}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card
          label="Status"
          value={detail.status}
        />
        <Card
          label="Região"
          value={detail.region || "—"}
        />
        <Card
          label="Pedidos"
          value={String(
            detail.orderCount,
          )}
        />
      </section>

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

function Card({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <p className="mt-2 break-words text-xl font-black">
        {value}
      </p>
    </div>
  );
}

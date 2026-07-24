"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  collectionGroup,
  getDocs,
  type Timestamp,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";

type EventRow = {
  eventId: string;
  sellerId: string;
  title: string;
  status: string;
  createdAt?: Timestamp;
};

export default function AdminEventsPage() {
  const [rows, setRows] =
    useState<EventRow[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const snapshot =
          await getDocs(
            collectionGroup(
              db,
              "events",
            ),
          );

        const next =
          snapshot.docs
            .filter(
              (document) =>
                document.ref.parent
                  .parent?.parent.id ===
                "sellers",
            )
            .map((document) => {
              const data =
                document.data();
              const sellerId =
                document.ref.parent
                  .parent?.id ?? "";

              return {
                eventId:
                  document.id,
                sellerId,
                title:
                  String(
                    data.title ??
                    data.name ??
                    document.id,
                  ),
                status:
                  String(
                    data.status ??
                    "unknown",
                  ),
                createdAt:
                  data.createdAt,
              };
            });

        next.sort(
          (left, right) =>
            (
              right.createdAt
                ?.toMillis?.() ?? 0
            ) -
            (
              left.createdAt
                ?.toMillis?.() ?? 0
            ),
        );

        setRows(next);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "EVENT_LIST_FAILED",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">
          Eventos
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Somente sellers/{"{sellerId}"}/events.
        </p>
      </header>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">
            Carregando…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">
            Nenhum evento criado.
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((row) => (
              <Link
                key={`${row.sellerId}-${row.eventId}`}
                href={`/admin/events/${encodeURIComponent(
                  `${row.sellerId}~${row.eventId}`,
                )}`}
                className="grid gap-2 p-5 hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-black">
                    {row.title}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {row.sellerId}
                  </p>
                </div>
                <p className="text-xs font-black uppercase text-neutral-500">
                  {row.status}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

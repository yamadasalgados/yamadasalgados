"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { auth } from "@/app/lib/firebase";
import PageHeader from "@/app/_components/PageHeader";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

type EventRow = {
  eventId: string;
  sellerId: string;
  title: string;
  status: string;
  createdAtMillis: number;
};

type EventsResponse = {
  ok?: boolean;
  rows?: EventRow[];
  truncated?: boolean;
  error?: string;
};

export default function AdminEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Sua sessão não está ativa. Entre novamente.");
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/events", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as EventsResponse | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.rows)) {
        throw new Error(payload?.error || "Não foi possível listar os eventos.");
      }
      setRows(payload.rows);
      setTruncated(Boolean(payload.truncated));
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "EVENT_LIST_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Admin" title="Eventos" description="Visão consolidada dos eventos criados pelos sellers." />
      {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}
      {truncated && <FeedbackBanner tone="warning">A lista foi limitada aos primeiros 1.000 documentos. Consulte o painel de cada loja para históricos maiores.</FeedbackBanner>}
      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">{error ? "Não foi possível carregar eventos." : "Nenhum evento criado."}</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((row) => (
              <Link key={`${row.sellerId}-${row.eventId}`}
                href={`/admin/events/${encodeURIComponent(`${row.sellerId}~${row.eventId}`)}`}
                className="grid gap-2 p-5 hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate font-black">{row.title}</p>
                  <p className="truncate text-xs text-neutral-500">{row.sellerId}</p>
                </div>
                <p className="text-xs font-black uppercase text-neutral-500">{row.status}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

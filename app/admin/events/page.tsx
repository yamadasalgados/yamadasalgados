"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs, limit, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";
import { useI18n } from "@/app/lib/i18n";

type EventStatus = "active" | "closed" | "cancelled";

type FireEvent = {
  title?: string;
  name?: string;
  regionName?: string;
  region?: string;
  status?: EventStatus | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  revenueYen?: number;
  revenue?: number;
  sellerId?: string;
  regionId?: string;
};

type EventRow = {
  id: string;
  title: string;
  region: string;
  status: EventStatus;
  createdAtText: string;
  updatedAtText: string;
  revenueYen: number;
  sellerId: string;
  regionId: string;
};

function normalizeStatus(s: any): EventStatus {
  const st = String(s || "active");
  if (st === "closed" || st === "cancelled" || st === "active") return st;
  return "active";
}

export default function AdminEventsPage() {
  const { t } = useI18n();
  return (
    <AdminGuard>
      {() => (
        <Suspense fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
          </div>
        }>
          <AdminEventsInner />
        </Suspense>
      )}
    </AdminGuard>
  );
}

function AdminEventsInner() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const search = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [copiedMsg, setCopiedMsg] = useState("");

  const [qText, setQText] = useState("");
  const statusFilter = (search.get("status") as any) || "active";
  const sellerFilterParam = String(search.get("sellerId") || "").trim();
  const [sellerInput, setSellerInput] = useState(sellerFilterParam);

  const yen = useCallback(
    (n: number) => {
      const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "ja-JP";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
      }).format(Math.round(n || 0));
    },
    [lang]
  );

  const fmtDate = useCallback((ts?: Timestamp) => {
    if (!ts) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "Asia/Tokyo",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ts.toDate());
  }, []);

  useEffect(() => {
    setSellerInput(sellerFilterParam);
  }, [sellerFilterParam]);

  const handleChangeFilter = useCallback(
    (v: string) => {
      const params = new URLSearchParams(search.toString());
      if (v === "all") params.delete("status");
      else params.set("status", v);
      router.replace(`/admin/events?${params.toString()}`);
    },
    [router, search]
  );

  const applySeller = useCallback(() => {
    const params = new URLSearchParams(search.toString());
    const v = sellerInput.trim();
    if (!v) params.delete("sellerId");
    else params.set("sellerId", v);
    router.replace(`/admin/events?${params.toString()}`);
  }, [router, search, sellerInput]);

  const clearSeller = useCallback(() => {
    setSellerInput("");
    const params = new URLSearchParams(search.toString());
    params.delete("sellerId");
    router.replace(`/admin/events?${params.toString()}`);
  }, [router, search]);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      setErrMsg("");

      try {
        const qEvents = sellerFilterParam
          ? query(
              collection(db, "events"),
              where("sellerId", "==", sellerFilterParam),
              orderBy("createdAt", "desc"),
              limit(300)
            )
          : query(collection(db, "events"), orderBy("createdAt", "desc"), limit(300));

        const snap = await getDocs(qEvents);

        const list: EventRow[] = snap.docs.map((d) => {
          const e = d.data() as FireEvent;
          const rev = Number(e.revenueYen || e.revenue || 0);

          return {
            id: d.id,
            title: String((e.title || e.name || t("events.noTitle"))).trim(),
            region: String((e.regionName || e.region || "")).trim(),
            status: normalizeStatus(e.status),
            createdAtText: fmtDate(e.createdAt),
            updatedAtText: fmtDate(e.updatedAt),
            revenueYen: rev,
            sellerId: String(e.sellerId || "").trim(),
            regionId: String(e.regionId || "").trim(),
          };
        });

        setEvents(list);
      } catch (e: any) {
        console.error(e);
        setErrMsg(t("events.err.load"));
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, [sellerFilterParam, t, fmtDate]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    const byStatus = statusFilter === "all" ? events : events.filter((e) => e.status === statusFilter);
    if (!t) return byStatus;

    return byStatus.filter((e) => {
      const hay = `${e.title} ${e.region} ${e.id} ${e.sellerId} ${e.regionId}`.toLowerCase();
      return hay.includes(t);
    });
  }, [events, statusFilter, qText]);

  const counts = useMemo(
    () => ({
      active: events.filter((e) => e.status === "active").length,
      closed: events.filter((e) => e.status === "closed").length,
      cancelled: events.filter((e) => e.status === "cancelled").length,
      total: events.length,
    }),
    [events]
  );

  const handleCopyLink = useCallback(async (id: string) => {
    try {
      const url = `${window.location.origin}/event/${id}`;
      await navigator.clipboard.writeText(url);
      setCopiedMsg(t("common.copied"));
      setTimeout(() => setCopiedMsg(""), 2000);
    } catch {
      setErrMsg(t("common.copyError"));
    }
  }, [t]);

  return (
    <main className="max-w-5xl mx-auto pb-20 space-y-6 animate-fade-in">
      {/* HEADER */}
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
              {t("admin.events.title")}
            </h1>
            <p className="text-sm font-medium text-neutral-400">
              {t("admin.events.subtitle")}
            </p>
          </div>

          <Link
            href="/admin/sellers"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-5 py-3.5 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition uppercase tracking-wider self-start sm:self-center"
          >
            {t("admin.events.btn.sellers")}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={t("admin.events.search.placeholder")}
            className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-xs bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none transition"
          />

          <div className="flex gap-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-1 rounded-xl">
            <input
              value={sellerInput}
              onChange={(e) => setSellerInput(e.target.value)}
              placeholder={t("admin.events.seller.placeholder")}
              className="w-full bg-transparent px-3 text-xs text-neutral-900 dark:text-white focus:outline-none"
            />
            <button
              onClick={applySeller}
              className="px-4 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-black transition uppercase tracking-wider"
            >
              Apply
            </button>
            <button
              onClick={clearSeller}
              className="px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-black text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none items-center">
            <FilterPill
              label={`${t("admin.events.badge.active")} (${counts.active})`}
              active={statusFilter === "active"}
              onClick={() => handleChangeFilter("active")}
            />
            <FilterPill
              label={`${t("admin.events.badge.closed")} (${counts.closed})`}
              active={statusFilter === "closed"}
              onClick={() => handleChangeFilter("closed")}
            />
            <FilterPill
              label={`${t("admin.events.badge.cancelled")} (${counts.cancelled})`}
              active={statusFilter === "cancelled"}
              onClick={() => handleChangeFilter("cancelled")}
            />
            <FilterPill
              label={`${t("admin.events.badge.all")} (${counts.total})`}
              active={statusFilter === "all"}
              onClick={() => handleChangeFilter("all")}
            />
          </div>
        </div>
      </header>

      {copiedMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-full text-xs font-black shadow-2xl z-50 tracking-wider uppercase">
          {copiedMsg}
        </div>
      )}

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {errMsg}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 bg-neutral-100 dark:bg-neutral-900 rounded-3xl" />
          <div className="h-44 bg-neutral-100 dark:bg-neutral-900 rounded-3xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2.5rem] border border-dashed border-neutral-200 dark:border-neutral-800 p-20 text-center bg-neutral-50/50 dark:bg-neutral-900/10">
          <p className="text-sm font-bold text-neutral-400 dark:text-neutral-500 italic">{t("admin.events.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((ev) => (
            <div
              key={ev.id}
              className="border border-neutral-200 dark:border-neutral-800 rounded-[2rem] bg-white dark:bg-neutral-900 p-5 shadow-sm hover:shadow-md flex flex-col justify-between min-h-[200px] transition-all animate-fade-in"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 truncate flex-1">
                  <h3 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight truncate">{ev.title}</h3>
                  <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 truncate">{ev.region || t("events.noRegion")}</p>

                  <div className="mt-2 text-[10px] font-mono text-neutral-400 space-y-0.5">
                    <div>evId: <span className="font-bold text-neutral-700 dark:text-neutral-300">{ev.id}</span></div>
                    <div>sId: <span className="font-bold text-neutral-700 dark:text-neutral-300">{ev.sellerId || "—"}</span></div>
                    <div>rId: <span className="font-bold text-neutral-700 dark:text-neutral-300">{ev.regionId || "—"}</span></div>
                  </div>
                </div>
                <StatusBadge status={ev.status} t={t} />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-neutral-100 dark:border-neutral-800/80 pt-4 mt-4 text-[10px] uppercase font-black text-neutral-400">
                <div className="space-y-0.5">
                  <p>{t("admin.events.label.start")}</p>
                  <p className="text-xs text-neutral-800 dark:text-neutral-200">{ev.createdAtText.split(",")[0]}</p>
                </div>
                <div className="space-y-0.5">
                  <p>{t("admin.events.label.revenue")}</p>
                  <p className="text-xs text-neutral-900 dark:text-white">
                    {ev.status === "closed" ? yen(ev.revenueYen) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => handleCopyLink(ev.id)}
                  className="px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition active:scale-[0.96]"
                  title="Copiar link público"
                >
                  🔗
                </button>

                <Link
                  href={`/event/${ev.id}`}
                  target="_blank"
                  className="px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center transition active:scale-[0.96]"
                  title="Abrir evento público"
                >
                  👁️
                </Link>

                <Link
                  href={`/admin/events/${ev.id}`}
                  className="flex-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white py-3 rounded-xl text-xs font-black text-center transition active:scale-[0.99]"
                  title="Auditar detalhes (admin)"
                >
                  {t("admin.events.btn.audit")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wide border transition-all whitespace-nowrap active:scale-95 ${
        active 
          ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-sm" 
          : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status, t }: { status: EventStatus; t: (k: string) => string }) {
  const map: Record<EventStatus, string> = {
    active: "bg-emerald-500 text-white",
    closed: "bg-neutral-400 text-neutral-900 dark:text-white dark:bg-neutral-800",
    cancelled: "bg-red-500 text-white",
  };

  return (
    <span className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${map[status]}`}>
      {status}
    </span>
  );
}
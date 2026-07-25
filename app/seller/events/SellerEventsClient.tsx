"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/app/lib/firebase";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";
import { formatMoneyMajor } from "@/app/lib/money";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import PageHeader from "@/app/_components/PageHeader";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

type EventStatus = "active" | "closed" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
  timeZone?: string;
};

type FireEvent = {
  title?: string;
  regionName?: string;
  name?: string;
  region?: string;
  status?: EventStatus | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  revenueYen?: number;
  revenue?: number;
};

type EventRow = {
  id: string;
  title: string;
  region: string;
  status: EventStatus;
  createdAtText: string;
  updatedAtText: string;
  revenueYen: number;
};

export default function SellerEventsPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const search = useSearchParams();

  const sellerSession = useSellerSession();
  const profile = sellerSession.profile as UserDoc;

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [copiedMsg, setCopiedMsg] = useState("");

  const statusFilter = (search.get("status") as any) || "active";

  const sellerId = sellerSession.sellerId;
  const inactive = profile?.active === false;

  const canQueryEvents = useMemo(() => !inactive, [inactive]);

  const money = useCallback(
    (amount: number) =>
      formatMoneyMajor(
        amount,
        profile?.currency ?? "JPY",
        profile?.regionalLocale ??
          (lang === "pt"
            ? "pt-BR"
            : lang === "en"
              ? "en-US"
              : "ja-JP"),
      ),
    [
      lang,
      profile?.currency,
      profile?.regionalLocale,
    ],
  );

  const fmtDate = useCallback((ts?: Timestamp) => {
    if (!ts) return "—";
    return new Intl.DateTimeFormat(
      profile?.regionalLocale ?? "pt-BR",
      {
      timeZone: profile?.timeZone || "Asia/Tokyo",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      },
    ).format(ts.toDate());
  }, [
    profile?.regionalLocale,
    profile?.timeZone,
  ]);

  // 3) Carregamento de Eventos
  useEffect(() => {
    async function loadEvents() {
      if (!canQueryEvents || !sellerId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrMsg("");

      try {
        const snap = await getDocs(
          query(collection(db, "sellers", sellerId, "events"), orderBy("createdAt", "desc"), limit(150))
        );

        const list: EventRow[] = snap.docs.map((d) => {
          const e = d.data() as FireEvent;
          const rev = Number(e.revenueYen || e.revenue || 0);
          const st = String(e.status || "active");
          const statusNormalized = (["closed", "cancelled", "active"].includes(st) ? st : "active") as EventStatus;

          return {
            id: d.id,
            title: String(e.title || e.name || t("events.noTitle")).trim(),
            region: String(e.regionName || e.region || "").trim(),
            status: statusNormalized,
            createdAtText: fmtDate(e.createdAt),
            updatedAtText: fmtDate(e.updatedAt),
            revenueYen: rev,
          };
        });

        setEvents(list);
      } catch (e: any) {
        console.error(e);
        const msg = String(e?.message || "");
        if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) {
          setErrMsg("Restrição de segurança: Permissão de leitura negada para este seller.");
        } else if (msg.includes("index") || msg.includes("FAILED_PRECONDITION")) {
          setErrMsg("Índice composto ausente no Firestore. Verifique o link gerado no console.");
        } else {
          setErrMsg(t("events.err.load"));
        }
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, [canQueryEvents, sellerId, t, fmtDate]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return events;
    return events.filter((e) => e.status === statusFilter);
  }, [events, statusFilter]);

  const counts = useMemo(
    () => ({
      active: events.filter((e) => e.status === "active").length,
      closed: events.filter((e) => e.status === "closed").length,
      total: events.length,
    }),
    [events]
  );


  const filterLabels =
    lang === "ja"
      ? { active: "開催中", closed: "終了", all: "すべて" }
      : lang === "en"
        ? { active: "Active", closed: "Closed", all: "All" }
        : { active: "Ativos", closed: "Encerrados", all: "Todos" };

  const handleChangeFilter = (v: string) => {
    const params = new URLSearchParams(search.toString());
    if (v === "all") params.delete("status");
    else params.set("status", v);
    router.replace(`/seller/events?${params.toString()}`);
  };

  const handleCopyLink = async (sId: string, evId: string) => {
    try {
      const url = `${window.location.origin}/event/${sId}/${evId}`;
      await navigator.clipboard.writeText(url);
      setCopiedMsg(t("common.copied"));
      setTimeout(() => setCopiedMsg(""), 2000);
    } catch {
      setErrMsg(t("common.copyError"));
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 bg-white p-4 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-white sm:p-6">
      <PageHeader
        eyebrow={t("events.title")}
        title={t("events.title")}
        action={
          <Link
            href="/seller/events/new"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-black px-5 text-sm font-black text-white shadow-sm transition hover:opacity-85 dark:bg-white dark:text-black"
          >
            + {t("events.new")}
          </Link>
        }
      />

      <MetricStrip
        items={[
          {
            label: filterLabels.active,
            value: counts.active,
            active: statusFilter === "active",
            onClick: () => handleChangeFilter("active"),
            tone: "success",
          },
          {
            label: filterLabels.closed,
            value: counts.closed,
            active: statusFilter === "closed",
            onClick: () => handleChangeFilter("closed"),
          },
          {
            label: filterLabels.all,
            value: counts.total,
            active: statusFilter === "all",
            onClick: () => handleChangeFilter("all"),
          },
        ]}
      />

      {copiedMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-full text-xs font-black shadow-2xl z-50 tracking-wider transition-all uppercase">
          {copiedMsg}
        </div>
      )}

      {errMsg && (
        <FeedbackBanner tone="error" role="alert">{errMsg}</FeedbackBanner>
      )}

      {loading ? (
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 bg-neutral-100 dark:bg-neutral-900 rounded-3xl" />
          <div className="h-44 bg-neutral-100 dark:bg-neutral-900 rounded-3xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2.5rem] border border-dashed border-neutral-200 dark:border-neutral-800 p-20 text-center bg-neutral-50/50 dark:bg-neutral-900/10">
          <p className="text-sm font-bold text-neutral-400 dark:text-neutral-500 italic">{t("events.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((ev) => (
            <div key={ev.id} className="border border-neutral-200 dark:border-neutral-800 rounded-[2rem] bg-white dark:bg-neutral-900 p-5 shadow-sm hover:shadow-md flex flex-col justify-between min-h-[190px] transition-all">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 truncate flex-1">
                  <h3 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight truncate">{ev.title}</h3>
                  <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 truncate">{ev.region || t("events.noRegion")}</p>
                </div>
                <StatusBadge status={ev.status} />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-neutral-100 dark:border-neutral-800/80 pt-4 mt-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{t("events.start")}</p>
                  <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{ev.createdAtText.split(",")[0]}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{t("events.revenue")}</p>
                  <p className="text-xs font-black text-neutral-900 dark:text-white">{ev.status === "closed" ? money(ev.revenueYen) : "—"}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <Link href={`/seller/events/${ev.id}`} className="flex-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white py-3 rounded-xl text-xs font-black text-center transition active:scale-[0.99]">
                  {t("events.panel")}
                </Link>

                <button onClick={() => handleCopyLink(sellerId, ev.id)} className="px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition active:scale-[0.96]" title="Copiar link público">
                  🔗
                </button>

                <Link href={`/event/${sellerId}/${ev.id}`} target="_blank" className="px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-center transition active:scale-[0.96]" title="Visualizar Landpage">
                  👁️
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
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
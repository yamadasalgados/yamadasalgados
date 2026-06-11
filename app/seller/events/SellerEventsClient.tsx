"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs, limit, orderBy, query, doc, getDoc, Timestamp } from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";

type EventStatus = "active" | "closed" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
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

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [copiedMsg, setCopiedMsg] = useState("");

  const statusFilter = (search.get("status") as any) || "active";

  const sellerId =
    (typeof profile?.sellerId === "string" && profile.sellerId.trim()) ||
    (authUser?.uid ?? "");

  const role = profile?.role ?? null;
  const inactive = profile?.active === false;

  const canQueryEvents = useMemo(() => {
    if (!authUser || inactive) return false;
    return true;
  }, [authUser, inactive]);

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

  // 1) Monitor de Sessão
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // 2) Carregamento Resiliente do Perfil
  useEffect(() => {
    if (!authUser) return;

    async function loadProfile() {
      setProfileMissing(false);
      try {
        const snap = await getDoc(doc(db, "users", authUser!.uid));
        if (!snap.exists()) {
          setProfileMissing(true);
          return;
        }
        const data = snap.data() as UserDoc;
        setProfile(data);
      } catch (e) {
        console.error("Erro ao carregar perfil:", e);
      }
    }

    loadProfile();
  }, [authUser]);

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

  if (checkingAuth) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (profileMissing || inactive) {
    return (
      <div className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{t("events.guard")}</p>
          <Link href="/seller" className="w-full py-3 block rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase tracking-wider">{t("common.back")}</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in max-w-5xl mx-auto">
      {/* HEADER */}
      <header className="space-y-4 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{t("events.title")}</h1>
          <Link href="/seller/events/new" className="rounded-2xl bg-black dark:bg-white dark:text-black text-white text-xs font-black px-5 py-3.5 transition-all hover:scale-[1.02] shadow-md uppercase tracking-wider">
            + {t("events.new")}
          </Link>
        </div>

        {/* FILTROS PILLS */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <FilterPill label={t("events.filter.active").replace("{n}", String(counts.active))} active={statusFilter === "active"} onClick={() => handleChangeFilter("active")} />
          <FilterPill label={t("events.filter.closed").replace("{n}", String(counts.closed))} active={statusFilter === "closed"} onClick={() => handleChangeFilter("closed")} />
          <FilterPill label={t("events.filter.all").replace("{n}", String(counts.total))} active={statusFilter === "all"} onClick={() => handleChangeFilter("all")} />
        </div>
      </header>

      {copiedMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-full text-xs font-black shadow-2xl z-50 tracking-wider transition-all uppercase">
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
                  <p className="text-xs font-black text-neutral-900 dark:text-white">{ev.status === "closed" ? yen(ev.revenueYen) : "—"}</p>
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

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-5 py-2 rounded-full text-xs font-black tracking-wide border transition-all active:scale-95 ${active ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-sm" : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800 dark:hover:bg-neutral-800"}`}>
      {label}
    </button>
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
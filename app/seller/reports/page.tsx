"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

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
  closedAt?: Timestamp;
  revenueYen?: number;
  revenue?: number;
  sellerId?: string;
};

type Row = {
  id: string;
  title: string;
  region: string;
  closedAt: Timestamp | null;
  closedAtText: string;
  revenueYen: number;
};

// --- 🛠️ Funções Utilitárias Core ---



function monthKey(ts: Timestamp | null) {
  if (!ts) return "0000-00";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function asClosedRow(id: string, e: FireEvent, fallbackTitle: string): Row | null {
  if (String(e.status || "active") !== "closed") return null;

  const rev =
    (Number.isFinite(e.revenueYen as any) ? Number(e.revenueYen) : 0) ||
    (Number.isFinite(e.revenue as any) ? Number(e.revenue) : 0);

  const title = String(e.title || e.name || fallbackTitle).trim();
  const region = String(e.regionName || e.region || "").trim();
  const closedAt = e.closedAt || e.updatedAt || e.createdAt || null;

  const closedAtText = closedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "Asia/Tokyo",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(closedAt.toDate())
    : "";

  return {
    id,
    title,
    region,
    closedAt,
    closedAtText,
    revenueYen: rev > 0 ? Math.round(rev) : 0,
  };
}

async function loadClosedEventsForSeller(sellerId: string, fallbackTitle: string): Promise<Row[]> {
  if (!sellerId) return [];

  const qNew = query(collection(db, "sellers", sellerId, "events"), orderBy("createdAt", "desc"), limit(500));
  const qLegacy = query(collection(db, "events"), where("sellerId", "==", sellerId), orderBy("createdAt", "desc"), limit(500));

  const [snapNew, snapLegacy] = await Promise.all([
    getDocs(qNew).catch(() => null),
    getDocs(qLegacy).catch(() => null),
  ]);

  const map = new Map<string, Row>();

  if (snapNew) {
    snapNew.docs.forEach((d) => {
      const row = asClosedRow(d.id, d.data() as FireEvent, fallbackTitle);
      if (row) map.set(d.id, row);
    });
  }

  if (snapLegacy) {
    snapLegacy.docs.forEach((d) => {
      if (map.has(d.id)) return;
      const row = asClosedRow(d.id, d.data() as FireEvent, fallbackTitle);
      if (row) map.set(d.id, row);
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const at = a.closedAt?.toMillis?.() ? a.closedAt.toMillis() : 0;
    const bt = b.closedAt?.toMillis?.() ? b.closedAt.toMillis() : 0;
    return bt - at;
  });
}

// --- 🚀 Componente Principal ---

export default function SellerReportsPage() {
  const { t, lang } = useI18n();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  const role = profile?.role ?? null;
  const sellerId = typeof profile?.sellerId === "string" ? profile.sellerId : "";
  const regionId = typeof profile?.regionId === "string" ? profile.regionId : "";
  const inactive = profile?.active === false;

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

  const canLoad = useMemo(() => {
    if (!authUser || inactive) return false;
    if (role !== "seller" && role !== "admin") return false;
    if (role === "seller" && (!sellerId || !regionId)) return false;
    if (role === "admin" && !sellerId) return false;
    return true;
  }, [authUser, inactive, role, sellerId, regionId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  const loadProfile = useCallback(async (u: User) => {
    setErrMsg("");
    setProfileMissing(false);
    setLoadingProfile(true);

    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists()) {
        setProfileMissing(true);
        return;
      }
      const data = snap.data() as UserDoc;
      setProfile({
        role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
        sellerId: typeof data.sellerId === "string" ? data.sellerId : "",
        regionId: typeof data.regionId === "string" ? data.regionId : "",
        active: data.active !== false,
      });
    } catch {
      setErrMsg(t("reports.err.profileLoad"));
    } finally {
      setLoadingProfile(false);
    }
  }, [t]);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser);
  }, [authUser, loadProfile]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;
    setErrMsg("");
    setLoadingProfile(true);
    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
    } catch {
      setErrMsg(t("reports.err.profileCreate"));
    } finally {
      setLoadingProfile(false);
    }
  }, [authUser, loadProfile, t]);

  useEffect(() => {
    const run = async () => {
      if (!canLoad) {
        setRows([]);
        return;
      }
      setErrMsg("");
      setLoadingReports(true);
      try {
        const fallbackTitle = t("reports.fallback.untitledEvent") || "Sales Event";
        const list = await loadClosedEventsForSeller(sellerId, fallbackTitle);
        setRows(list);
      } catch {
        setErrMsg(t("reports.err.reportsLoad"));
        setRows([]);
      } finally {
        setLoadingReports(false);
      }
    };
    run();
  }, [canLoad, sellerId, t]);

  const totalAll = useMemo(() => rows.reduce((acc, r) => acc + (r.revenueYen || 0), 0), [rows]);

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; total: number; count: number }>();
    rows.forEach((r) => {
      const key = monthKey(r.closedAt);
      const cur = map.get(key) || { key, total: 0, count: 0 };
      cur.total += r.revenueYen || 0;
      cur.count += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  function cleanFirestoreData(data: DocumentData) {
  const out: Record<string, any> = {};

  Object.entries(data || {}).forEach(([key, value]) => {
    if (value instanceof Timestamp) {
      out[key] = value.toDate().toISOString();
    } else {
      out[key] = value;
    }
  });

  return out;
}

const downloadFullBackup = useCallback(async () => {
  if (!sellerId || !authUser) return;

  try {
    setErrMsg("");

    const userSnap = await getDoc(doc(db, "users", authUser.uid));

    const productsSnap = await getDocs(
      query(collection(db, "sellers", sellerId, "products"), limit(1000))
    );

    const eventsSnap = await getDocs(
      query(collection(db, "sellers", sellerId, "events"), limit(1000))
    );

    const events = await Promise.all(
      eventsSnap.docs.map(async (eventDoc) => {
        const ordersSnap = await getDocs(
          query(collection(db, "sellers", sellerId, "events", eventDoc.id, "orders"), limit(2000))
        );

        const orders = await Promise.all(
          ordersSnap.docs.map(async (orderDoc) => {
            const messagesSnap = await getDocs(
              query(
                collection(
                  db,
                  "sellers",
                  sellerId,
                  "events",
                  eventDoc.id,
                  "orders",
                  orderDoc.id,
                  "messages"
                ),
                orderBy("createdAt", "asc"),
                limit(1000)
              )
            );

            return {
              id: orderDoc.id,
              ...cleanFirestoreData(orderDoc.data()),
              messages: messagesSnap.docs.map((m) => ({
                id: m.id,
                ...cleanFirestoreData(m.data()),
              })),
            };
          })
        );

        return {
          id: eventDoc.id,
          ...cleanFirestoreData(eventDoc.data()),
          orders,
        };
      })
    );

    const backup = {
      exportedAt: new Date().toISOString(),
      sellerId,
      userId: authUser.uid,
      profile: userSnap.exists() ? cleanFirestoreData(userSnap.data()) : null,
      reports: rows.map((r) => ({
        id: r.id,
        title: r.title,
        region: r.region,
        closedAt: r.closedAt ? r.closedAt.toDate().toISOString() : null,
        closedAtText: r.closedAtText,
        revenueYen: r.revenueYen,
      })),
      products: productsSnap.docs.map((p) => ({
        id: p.id,
        ...cleanFirestoreData(p.data()),
      })),
      events,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `yamada-full-backup-${sellerId}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("FULL BACKUP ERROR:", e);
    setErrMsg(t("reports.export.fullError"));
  }
}, [sellerId, authUser, rows, t]);

  function csvEscape(value: any) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

const downloadCsv = useCallback(() => {
  const header = [
    "eventId",
    "title",
    "region",
    "closedAt",
    "revenueYen",
  ];

  const lines = rows.map((r) => [
    r.id,
    r.title,
    r.region,
    r.closedAtText,
    r.revenueYen,
  ]);

  const csv = [header, ...lines]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `yamada-reports-${sellerId}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}, [rows, sellerId]);

  if (checkingAuth || (authUser && !profile && !profileMissing)) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t("reports.profileMissing.title")}</h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4 mt-4 shadow-xl">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">{t("reports.profileMissing.hint")}</p>
          <button onClick={handleCreateProfileNow} disabled={loadingProfile} className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-4 shadow-xl text-sm transition-all">
            {loadingProfile ? t("common.saving") : t("reports.profileMissing.create")}
          </button>
        </div>
      </main>
    );
  }

  if (inactive) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("reports.inactive.title")}</h1>
          <p className="text-sm text-neutral-500 mt-2">{t("reports.inactive.desc")}</p>
        </div>
      </main>
    );
  }

  if (!canLoad) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("reports.notConfigured.title")}</h1>
          <p className="text-xs font-bold text-red-500 bg-red-50/50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200/40">
            {role === "seller" ? t("reports.notConfigured.descSellerMissing") : t("reports.notConfigured.descRoleMissing")}
          </p>
          <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-black text-white text-xs font-black uppercase tracking-wider">{t("common.logout")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in max-w-5xl mx-auto">
<div className="flex flex-wrap gap-2">
  <button
    type="button"
    onClick={downloadCsv}
    disabled={rows.length === 0}
    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs font-black px-5 py-3 uppercase tracking-wider shadow-sm transition disabled:opacity-40"
  >
    {t("reports.export.csv")}
  </button>

  <button
    type="button"
    onClick={downloadFullBackup}
    disabled={!sellerId}
    className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-5 py-3 uppercase tracking-wider shadow-md transition disabled:opacity-40"
  >
    {t("reports.export.fullBackup")}
  </button>
</div>

      {loadingReports && <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem]" />}
      {errMsg && <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">{errMsg}</div>}

      {!loadingReports && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MiniCard title={t("reports.cards.total")} value={yen(totalAll)} hint={t("reports.cards.totalHint")} tone="good" />
            <MiniCard title={t("reports.cards.count")} value={String(rows.length)} hint={t("reports.cards.countHint")} tone="neutral" />
            <MiniCard title={t("reports.cards.average")} value={rows.length ? yen(totalAll / rows.length) : "—"} hint={t("reports.cards.averageHint")} tone="neutral" />
          </section>

          <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("reports.monthly.title")}</h2>
            {monthly.length === 0 ? (
              <p className="text-xs font-bold text-neutral-400 italic p-4 text-center">{t("reports.monthly.empty")}</p>
            ) : (
              <div className="overflow-hidden border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900 shadow-sm">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="text-left px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t("reports.monthly.table.month")}</th>
                      <th className="text-center px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t("reports.monthly.table.events")}</th>
                      <th className="text-right px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t("reports.monthly.table.total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/40 font-medium">
                    {monthly.map((m) => (
                      <tr key={m.key} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition">
                        <td className="px-4 py-3 text-neutral-900 dark:text-neutral-200 font-bold">{m.key}</td>
                        <td className="px-4 py-3 text-center text-neutral-500 dark:text-neutral-400">{m.count}</td>
                        <td className="px-4 py-3 text-right text-neutral-900 dark:text-white font-black">{yen(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("reports.list.title")}</h2>
            {rows.length === 0 ? (
              <div className="rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-8 text-center bg-neutral-50/50 dark:bg-neutral-900/20">
                <p className="text-sm font-black text-neutral-700 dark:text-neutral-300">{t("reports.list.empty")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[160px] animate-fade-in">
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight truncate">{r.title}</h4>
                      <p className="text-xs font-medium text-neutral-400 truncate">{r.region || "—"}</p>
                    </div>

                    <div className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800/80 pt-3 mt-4">
                      <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{t("reports.list.closedAt")}: <span className="font-bold text-neutral-700 dark:text-neutral-300">{r.closedAtText || "—"}</span></p>
                      <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{t("reports.list.revenue")}: <span className="text-xs font-black text-neutral-900 dark:text-white">{yen(r.revenueYen)}</span></p>
                    </div>

                    <div className="mt-4 flex gap-2 w-full">
                      <Link href={`/seller/events/${r.id}`} className="flex-1 text-center py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider shadow-sm transition active:scale-[0.98]">
                        {t("reports.list.openEvent")}
                      </Link>
                    <Link
                      href={`/event/${sellerId}/${r.id}`}
                      target="_blank"
                      className="flex-1 text-center py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-black uppercase tracking-wider transition active:scale-[0.98]"
                    >
                      {t("reports.list.openLanding")}
                    </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function MiniCard({ title, value, hint, tone }: { title: string; value: string; hint: string; tone: "good" | "neutral" }) {
  const toneCls =
    tone === "good" ? "border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-950/10" : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900";

  return (
    <div className={`rounded-[2rem] border p-5 shadow-sm ${toneCls} animate-fade-in`}>
      <p className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-black mt-2 tracking-tight text-neutral-900 dark:text-white">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-2 leading-relaxed">{hint}</p>
    </div>
  );
}
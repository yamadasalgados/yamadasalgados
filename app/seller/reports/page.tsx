"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/app/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { firestoreDateToDate } from "@/app/lib/access-control";
import { formatMoneyMajor } from "@/app/lib/money";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";
import { useI18n } from "@/app/lib/i18n";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import PageHeader from "@/app/_components/PageHeader";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

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

function asClosedRow(
  id: string,
  e: FireEvent,
  fallbackTitle: string,
  locale: string,
  timeZone: string,
): Row | null {
  if (String(e.status || "active") !== "closed") return null;

  const rev =
    (Number.isFinite(e.revenueYen as any) ? Number(e.revenueYen) : 0) ||
    (Number.isFinite(e.revenue as any) ? Number(e.revenue) : 0);

  const title = String(e.title || e.name || fallbackTitle).trim();
  const region = String(e.regionName || e.region || "").trim();
  const closedAt = e.closedAt || e.updatedAt || e.createdAt || null;

  const closedAtText = closedAt
    ? new Intl.DateTimeFormat(locale, {
        timeZone,
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

async function loadClosedEventsForSeller(
  sellerId: string,
  fallbackTitle: string,
  locale: string,
  timeZone: string,
): Promise<Row[]> {
  if (!sellerId) return [];

  const snapshot =
    await getDocs(
      query(
        collection(
          db,
          "sellers",
          sellerId,
          "events",
        ),
        orderBy(
          "createdAt",
          "desc",
        ),
        limit(500),
      ),
    );

  return snapshot.docs
    .map((document) =>
      asClosedRow(
        document.id,
        document.data() as FireEvent,
        fallbackTitle,
        locale,
        timeZone,
      ),
    )
    .filter(
      (row): row is Row =>
        row !== null,
    )
    .sort((left, right) => {
      const leftTime =
        left.closedAt?.toMillis?.()
          ? left.closedAt.toMillis()
          : 0;
      const rightTime =
        right.closedAt?.toMillis?.()
          ? right.closedAt.toMillis()
          : 0;

      return rightTime - leftTime;
    });
}

// --- 🚀 Componente Principal ---

export default function SellerReportsPage() {
  const { t, lang } = useI18n();

  const sellerSession = useSellerSession();
  const authUser = sellerSession.user;
  const profile = sellerSession.profile as UserDoc;

  const [loadingReports, setLoadingReports] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);

  const role = profile?.role ?? "seller";
  const sellerId = sellerSession.sellerId;
  const regionId = sellerSession.regionId;
  const inactive = profile?.active === false;

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

  const canLoad = useMemo(() => {
    if (inactive) return false;
    return Boolean(sellerId && regionId);
  }, [inactive, sellerId, regionId]);

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
        const list = await loadClosedEventsForSeller(
          sellerId,
          fallbackTitle,
          profile?.regionalLocale ?? "pt-BR",
          profile?.timeZone || "Asia/Tokyo",
        );
        setRows(list);
      } catch {
        setErrMsg(t("reports.err.reportsLoad"));
        setRows([]);
      } finally {
        setLoadingReports(false);
      }
    };
    run();
  }, [
    canLoad,
    profile?.regionalLocale,
    profile?.timeZone,
    sellerId,
    t,
  ]);

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
    const date = firestoreDateToDate(value);

    out[key] = date
      ? date.toISOString()
      : value;
  });

  return out;
}

const downloadFullBackup = useCallback(async () => {
  if (!sellerId || !authUser) return;

  try {
    setErrMsg("");

    const [userSnap, sellerSnap] = await Promise.all([
      getDoc(doc(db, "users", authUser.uid)),
      getDoc(doc(db, "sellers", sellerId)),
    ]);

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
      user: userSnap.exists()
        ? cleanFirestoreData(userSnap.data())
        : null,
      seller: sellerSnap.exists()
        ? cleanFirestoreData(sellerSnap.data())
        : null,
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
          <Link href="/seller/settings" className="w-full py-3 block rounded-xl bg-black text-white text-xs font-black uppercase tracking-wider">{t("common.settings")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 bg-white p-4 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-white sm:p-6">
      <PageHeader
        eyebrow={t("reports.list.title")}
        title={t("reports.title")}
        description={t("reports.subtitle")}
        action={
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
        }
      />

      {loadingReports && <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem]" />}
      {errMsg && <FeedbackBanner tone="error" role="alert">{errMsg}</FeedbackBanner>}

      {!loadingReports && (
        <>
          <MetricStrip
            items={[
              { label: t("reports.cards.total"), value: money(totalAll), tone: "success" },
              { label: t("reports.cards.count"), value: rows.length },
              { label: t("reports.cards.average"), value: rows.length ? money(totalAll / rows.length) : "—" },
            ]}
          />

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
                        <td className="px-4 py-3 text-right text-neutral-900 dark:text-white font-black">{money(m.total)}</td>
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
                      <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{t("reports.list.revenue")}: <span className="text-xs font-black text-neutral-900 dark:text-white">{money(r.revenueYen)}</span></p>
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


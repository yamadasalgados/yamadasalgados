"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";
import { useI18n } from "@/app/lib/i18n";

type EventStatus = "active" | "closed" | "cancelled";

type FireEvent = {
  title?: string;
  name?: string;
  status?: EventStatus | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  sellerId?: string;
  regionId?: string;
  regionName?: string;
  region?: string;
  revenueYen?: number;
  revenue?: number;
  pickupLink?: string;
  pickupNote?: string;
};

type OrderRow = {
  id: string;
  customerName: string;
  customerPhone: string;
  createdAtText: string;
  status: string;
  totalYen: number;
  itemsCount: number;
  raw: any;
};

function normalizeStatus(s: any): EventStatus {
  const st = String(s || "active");
  if (st === "closed" || st === "cancelled" || st === "active") return st;
  return "active";
}

function getOrderTotalYen(o: any): number {
  const candidates = [
    o?.amountYen,
    o?.totalYen,
    o?.total,
    o?.amount,
    o?.grandTotalYen,
    o?.grandTotal,
    o?.revenueYen,
    o?.revenue,
  ];
  for (const v of candidates) {
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

function getOrderItemsCount(o: any): number {
  if (o?.quantities && typeof o.quantities === "object" && !Array.isArray(o.quantities)) {
    let total = 0;
    for (const key in o.quantities) {
      if (Object.prototype.hasOwnProperty.call(o.quantities, key)) {
        const q = Number(o.quantities[key]);
        if (Number.isFinite(q) && q > 0) {
          total += q;
        }
      }
    }
    if (total > 0) return total;
  }

  if (o?.totalItems !== undefined && o?.totalItems !== null) {
    const t = Number(o.totalItems);
    if (Number.isFinite(t) && t > 0) return t;
  }

  const items = o?.items || o?.cart || o?.products || [];
  if (Array.isArray(items)) {
    const sumQty = items.reduce((acc, it) => {
      const q = Number(it?.qty ?? it?.quantity ?? it?.qtd ?? 0);
      return acc + (Number.isFinite(q) && q > 0 ? q : 0);
    }, 0);
    return sumQty > 0 ? sumQty : items.length;
  }

  const n = Number(o?.itemsCount || o?.qtyTotal || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function AdminEventAuditPage() {
  return (
    <AdminGuard>
      {() => <Inner />}
    </AdminGuard>
  );
}

function Inner() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useParams();
  const eventId = String((params as any)?.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  const [ev, setEv] = useState<FireEvent | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const status = normalizeStatus(ev?.status);

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

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined" || !eventId) return "";
    return `${window.location.origin}/event/${eventId}`;
  }, [eventId]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setErrMsg("");

    try {
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) {
        setEv(null);
        setOrders([]);
        setErrMsg(t("admin.eventAudit.notFound"));
        return;
      }

      const data = snap.data() as FireEvent;
      setEv(data);

      const qOrders = query(
        collection(db, "events", eventId, "orders"),
        orderBy("createdAt", "desc"),
        limit(400)
      );

      const os = await getDocs(qOrders);
      const list: OrderRow[] = os.docs.map((d) => {
        const o = d.data() as any;
        return {
          id: d.id,
          customerName: String(o?.customerName || o?.name || o?.fullName || "—"),
          customerPhone: String(o?.whatsapp || o?.phone || o?.customerPhone || "—"),
          createdAtText: fmtDate(o?.createdAt),
          status: String(o?.status || o?.orderStatus || "—"),
          totalYen: getOrderTotalYen(o),
          itemsCount: getOrderItemsCount(o),
          raw: o,
        };
      });

      setOrders(list);
    } catch {
      setErrMsg(t("events.err.load"));
    } finally {
      setLoading(false);
    }
  }, [eventId, t, fmtDate]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const ordersCount = orders.length;
    const itemsCount = orders.reduce((acc, o) => acc + (o.itemsCount || 0), 0);
    const sumYen = orders.reduce((acc, o) => acc + (o.totalYen || 0), 0);
    return { ordersCount, itemsCount, sumYen };
  }, [orders]);

  const setEventStatus = useCallback(
    async (next: EventStatus) => {
      if (!eventId) return;
      setBusy(true);
      setErrMsg("");

      try {
        await updateDoc(doc(db, "events", eventId), {
          status: next,
          ...(next === "closed" ? { revenueYen: totals.sumYen } : {}),
          updatedAt: serverTimestamp(),
        });
        await load();
      } catch {
        setErrMsg(t("eventPanel.err.saveEvent"));
      } finally {
        setBusy(false);
      }
    },
    [eventId, load, totals.sumYen, t]
  );

  const copyPublic = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      setErrMsg(t("common.copyError"));
    }
  }, [publicUrl, t]);

  if (!eventId) {
    return (
      <main className="max-w-5xl mx-auto p-4 animate-fade-in">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-black uppercase text-red-700">
          {t("admin.eventAudit.invalidId")}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 pb-20 space-y-6 animate-fade-in">
      {/* HEADER */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t("admin.eventAudit.title")}
          </h1>
          <p className="text-xs font-mono text-neutral-400">
            eventId: <span className="font-bold text-neutral-600 dark:text-neutral-300">{eventId}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/events"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-4 py-2.5 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition uppercase tracking-wider"
          >
            {t("common.back")}
          </Link>

          <Link
            href={publicUrl || "#"}
            target="_blank"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-4 py-2.5 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition uppercase tracking-wider"
          >
            {t("eventPanel.btn.openLandpage")}
          </Link>

          <button
            onClick={copyPublic}
            className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-4 py-2.5 shadow-sm transition uppercase tracking-wider"
          >
            {t("common.copied") || "Link"}
          </button>
        </div>
      </header>

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {errMsg}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-44 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem]" />
      ) : !ev ? (
        <div className="rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 p-8 text-center bg-neutral-50/50 dark:bg-neutral-900/20">
          <p className="text-sm font-black text-neutral-700 dark:text-neutral-300">{t("admin.eventAudit.notFound")}</p>
        </div>
      ) : (
        <>
          {/* EVENT CARD */}
          <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-neutral-900 dark:text-white truncate">
                  {String(ev.title || ev.name || t("events.noTitle"))}
                </h2>
                <p className="text-sm text-neutral-500 truncate">
                  {String(ev.regionName || ev.region || "—")}
                </p>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InfoBox label="sellerId" value={String(ev.sellerId || "—")} />
              <InfoBox label="regionId" value={String(ev.regionId || "—")} />
              <InfoBox label={t("admin.events.label.start")} value={fmtDate(ev.createdAt)} />
              <InfoBox label="Sync" value={fmtDate(ev.updatedAt)} />
              <InfoBox label={t("admin.events.badge.all")} value={String(totals.ordersCount)} />
              <InfoBox label={t("eventPanel.production.table.totalQty")} value={String(totals.itemsCount)} />
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">{t("admin.eventAudit.calculatedRevenue")}</p>
                <p className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{yen(totals.sumYen)}</p>
                <p className="text-[11px] font-medium text-neutral-400 leading-tight">
                  {status === "closed" ? t("admin.eventAudit.revenueHintClosed") : t("admin.eventAudit.revenueHintOpen")}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 justify-end">
                <button
                  disabled={busy || status === "active"}
                  onClick={() => setEventStatus("active")}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-black px-4 py-2.5 uppercase tracking-wide transition disabled:opacity-40"
                >
                  {t("products.btn.activate") || "Open"}
                </button>
                <button
                  disabled={busy || status === "closed"}
                  onClick={() => setEventStatus("closed")}
                  className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-4 py-2.5 uppercase tracking-wide shadow-sm transition disabled:opacity-40"
                >
                  {t("eventPanel.btn.closeEvent") || "Close"}
                </button>
                <button
                  disabled={busy || status === "cancelled"}
                  onClick={() => setEventStatus("cancelled")}
                  className="rounded-xl bg-red-600 text-white text-xs font-black px-4 py-2.5 uppercase tracking-wide shadow-sm transition disabled:opacity-40"
                >
                  {t("eventPanel.orderStatus.cancelled") || "Cancel"}
                </button>
              </div>
            </div>

            {(ev.pickupLink || ev.pickupNote) && (
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl space-y-1 font-medium text-xs">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Pickup / Balcão</p>
                {ev.pickupLink && (
                  <a href={String(ev.pickupLink)} target="_blank" rel="noreferrer" className="font-black underline text-neutral-900 dark:text-white break-all block">
                    {String(ev.pickupLink)}
                  </a>
                )}
                {ev.pickupNote && <p className="text-neutral-500 dark:text-neutral-400 mt-1 whitespace-pre-wrap">{String(ev.pickupNote)}</p>}
              </div>
            )}
          </section>

          {/* ORDERS */}
          <section className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-[2.5rem] p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black uppercase tracking-widest text-neutral-400">{t("admin.eventAudit.ordersTitle")}</h3>
                <p className="text-xs text-neutral-400 font-medium">{orders.length ? `Total: ${orders.length}` : ""}</p>
              </div>
              <button onClick={load} disabled={busy} className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-4 py-2 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition">
                {t("common.reload") || "Sync"}
              </button>
            </div>

            {!orders.length ? (
              <div className="rounded-[2.5rem] border border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center bg-neutral-50/50 dark:bg-neutral-900/10">
                <p className="text-sm font-bold text-neutral-400 dark:text-neutral-500 italic">{t("admin.eventAudit.ordersEmpty")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100 dark:border-neutral-800/60">
                      <th className="py-3 px-3">{t("admin.eventAudit.table.customer")}</th>
                      <th className="py-3 px-3">{t("admin.eventAudit.table.when")}</th>
                      <th className="py-3 px-3">{t("admin.eventAudit.table.status")}</th>
                      <th className="py-3 px-3 text-center">{t("admin.eventAudit.table.items")}</th>
                      <th className="py-3 px-3 text-right">{t("admin.eventAudit.table.total")}</th>
                      <th className="py-3 px-3 text-right">{t("admin.eventAudit.table.id")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/40 font-medium">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-neutral-50/40 dark:hover:bg-neutral-900/20 transition">
                        <td className="py-3.5 px-3">
                          <div className="font-black text-neutral-900 dark:text-white tracking-tight">{o.customerName}</div>
                          <div className="text-[11px] font-mono text-neutral-400">{o.customerPhone}</div>
                        </td>
                        <td className="py-3.5 px-3 text-neutral-500 dark:text-neutral-400 font-mono">
                          {o.createdAtText}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 border border-neutral-200 dark:border-neutral-800 rounded-md text-[10px] font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                            {o.status || "—"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-neutral-900 dark:text-white">
                          {o.itemsCount || 0}
                        </td>
                        <td className="py-3.5 px-3 text-right font-black text-neutral-900 dark:text-white">
                          {o.totalYen ? yen(o.totalYen) : "—"}
                        </td>
                        <td className="py-3.5 px-3 text-right text-neutral-400 font-mono text-[11px]">
                          {o.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 rounded-xl shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-xs font-black text-neutral-900 dark:text-white break-all mt-1">{value}</p>
    </div>
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
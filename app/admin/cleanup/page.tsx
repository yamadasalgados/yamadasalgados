"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";

type UserDoc = {
  email?: string;
  displayName?: string;
  role?: "admin" | "seller";
  sellerId?: string;
  subscriptionStatus?: "none" | "pending" | "active" | "past_due" | "cancelled";
  inactiveSince?: Timestamp;
  updatedAt?: Timestamp;
};

type CleanupTarget = {
  uid: string;
  sellerId: string;
  email: string;
  displayName: string;
  subscriptionStatus: string;
  inactiveSinceText: string;
  inactiveSinceMs: number;
};

function tsToText(ts?: Timestamp) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "Asia/Tokyo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(ts.toDate());
}

function cleanData(data: any) {
  const out: Record<string, any> = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    out[k] = v instanceof Timestamp ? v.toDate().toISOString() : v;
  });
  return out;
}

export default function AdminCleanupPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<CleanupTarget[]>([]);
  const [busyId, setBusyId] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const cutoffMs = useMemo(() => {
    return Date.now() - 30 * 24 * 60 * 60 * 1000;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      setAuthUser(u);

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.exists() ? (snap.data() as UserDoc) : null;
        setIsAdmin(data?.role === "admin");
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, [router]);

  const loadTargets = useCallback(async () => {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("role", "==", "seller"), limit(500))
      );

      const list = snap.docs
        .map((d) => {
          const data = d.data() as UserDoc;
          const status = String(data.subscriptionStatus || "none");
          const inactiveSince = data.inactiveSince || data.updatedAt;
          const inactiveMs = inactiveSince?.toMillis?.() || 0;

          if (status === "active") return null;
          if (!inactiveMs || inactiveMs > cutoffMs) return null;

          return {
            uid: d.id,
            sellerId: String(data.sellerId || d.id),
            email: String(data.email || ""),
            displayName: String(data.displayName || ""),
            subscriptionStatus: status,
            inactiveSinceText: tsToText(inactiveSince),
            inactiveSinceMs: inactiveMs,
          };
        })
        .filter(Boolean) as CleanupTarget[];

      list.sort((a, b) => a.inactiveSinceMs - b.inactiveSinceMs);
      setTargets(list);
    } catch (e) {
      console.error(e);
      setErr(t("admin.cleanup.err.load"));
    } finally {
      setLoading(false);
    }
  }, [cutoffMs, t]);

  const exportBackup = useCallback(
    async (target: CleanupTarget) => {
      setErr("");
      setMsg("");
      setBusyId(target.uid);

      try {
        const userSnap = await getDoc(doc(db, "users", target.uid));
        const sellerSnap = await getDoc(doc(db, "sellers", target.sellerId));

        const productsSnap = await getDocs(collection(db, "sellers", target.sellerId, "products"));
        const categoriesSnap = await getDocs(collection(db, "sellers", target.sellerId, "categories"));
        const eventsSnap = await getDocs(collection(db, "sellers", target.sellerId, "events"));

        const events = await Promise.all(
          eventsSnap.docs.map(async (eventDoc) => {
            const ordersSnap = await getDocs(
              collection(db, "sellers", target.sellerId, "events", eventDoc.id, "orders")
            );

            const orders = await Promise.all(
              ordersSnap.docs.map(async (orderDoc) => {
                const messagesSnap = await getDocs(
                  collection(
                    db,
                    "sellers",
                    target.sellerId,
                    "events",
                    eventDoc.id,
                    "orders",
                    orderDoc.id,
                    "messages"
                  )
                );

                return {
                  id: orderDoc.id,
                  ...cleanData(orderDoc.data()),
                  messages: messagesSnap.docs.map((m) => ({
                    id: m.id,
                    ...cleanData(m.data()),
                  })),
                };
              })
            );

            return {
              id: eventDoc.id,
              ...cleanData(eventDoc.data()),
              orders,
            };
          })
        );

        const backup = {
          exportedAt: new Date().toISOString(),
          uid: target.uid,
          sellerId: target.sellerId,
          user: userSnap.exists() ? cleanData(userSnap.data()) : null,
          seller: sellerSnap.exists() ? cleanData(sellerSnap.data()) : null,
          products: productsSnap.docs.map((p) => ({
            id: p.id,
            ...cleanData(p.data()),
          })),
          categories: categoriesSnap.docs.map((c) => ({
            id: c.id,
            ...cleanData(c.data()),
          })),
          events,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = `cleanup-backup-${target.sellerId}-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setMsg(t("admin.cleanup.msg.backupExported"));
      } catch (e) {
        console.error(e);
        setErr(t("admin.cleanup.err.backup"));
      } finally {
        setBusyId("");
      }
    },
    [t]
  );

  const deleteSellerData = useCallback(
    async (target: CleanupTarget) => {
      const ok = window.confirm(
        t("admin.cleanup.confirm.delete").replace("{name}", target.email || target.uid)
      );

      if (!ok) return;

      setErr("");
      setMsg("");
      setBusyId(target.uid);

      try {
        const eventsSnap = await getDocs(collection(db, "sellers", target.sellerId, "events"));

        for (const eventDoc of eventsSnap.docs) {
          const ordersSnap = await getDocs(
            collection(db, "sellers", target.sellerId, "events", eventDoc.id, "orders")
          );

          for (const orderDoc of ordersSnap.docs) {
            const messagesSnap = await getDocs(
              collection(
                db,
                "sellers",
                target.sellerId,
                "events",
                eventDoc.id,
                "orders",
                orderDoc.id,
                "messages"
              )
            );

            for (const m of messagesSnap.docs) {
              await deleteDoc(m.ref);
            }

            await deleteDoc(orderDoc.ref);
          }

          await deleteDoc(eventDoc.ref);
        }

        const productsSnap = await getDocs(collection(db, "sellers", target.sellerId, "products"));
        for (const p of productsSnap.docs) {
          await deleteDoc(p.ref);
        }

        const categoriesSnap = await getDocs(collection(db, "sellers", target.sellerId, "categories"));
        for (const c of categoriesSnap.docs) {
          await deleteDoc(c.ref);
        }

        await deleteDoc(doc(db, "sellers", target.sellerId));
        await deleteDoc(doc(db, "users", target.uid));

        setTargets((prev) => prev.filter((x) => x.uid !== target.uid));
        setMsg(t("admin.cleanup.msg.deleted"));
      } catch (e) {
        console.error(e);
        setErr(t("admin.cleanup.err.delete"));
      } finally {
        setBusyId("");
      }
    },
    [t]
  );

  if (checking) {
    return <div className="p-8 text-sm font-bold">{t("admin.cleanup.loading")}</div>;
  }

  if (!authUser || !isAdmin) {
    return (
      <main className="max-w-md mx-auto p-6 text-center">
        <h1 className="text-xl font-black">{t("admin.cleanup.accessDenied")}</h1>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div>
          <h1 className="text-3xl font-black dark:text-white">
            {t("admin.cleanup.title")}
          </h1>

          <p className="text-sm text-neutral-500 font-medium">
            {t("admin.cleanup.subtitle")}
          </p>
        </div>

        <button
          onClick={loadTargets}
          disabled={loading}
          className="rounded-xl bg-black dark:bg-white text-white dark:text-black px-5 py-3 text-xs font-black uppercase disabled:opacity-40"
        >
          {loading ? t("admin.cleanup.btn.loading") : t("admin.cleanup.btn.search")}
        </button>
      </header>

      {(msg || err) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase ${
            err
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
          }`}
        >
          {err || msg}
        </div>
      )}

      <section className="rounded-[2rem] border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10 p-6 space-y-2">
        <h2 className="text-sm font-black text-red-800 dark:text-red-400 uppercase">
          {t("admin.cleanup.warning.title")}
        </h2>

        <p className="text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">
          {t("admin.cleanup.warning.body")}
        </p>
      </section>

      <section className="space-y-4">
        {targets.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <p className="text-sm font-bold text-neutral-400">
              {t("admin.cleanup.empty")}
            </p>
          </div>
        ) : (
          targets.map((u) => (
            <div
              key={u.uid}
              className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div>
                <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                  {u.displayName || u.email || u.uid}
                </h3>

                <p className="text-xs text-neutral-500 font-bold">
                  {t("admin.cleanup.status")
                    .replace("{status}", u.subscriptionStatus)
                    .replace("{date}", u.inactiveSinceText || "—")}
                </p>

                <p className="text-[10px] text-neutral-400 font-mono">
                  {t("admin.cleanup.sellerId")}: {u.sellerId}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => exportBackup(u)}
                  disabled={busyId === u.uid}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-xs font-black"
                >
                  {busyId === u.uid
                    ? t("admin.cleanup.btn.loading")
                    : t("admin.cleanup.btn.backup")}
                </button>

                <button
                  onClick={() => deleteSellerData(u)}
                  disabled={busyId === u.uid}
                  className="rounded-xl bg-red-600 text-white px-4 py-2 text-xs font-black disabled:opacity-40"
                >
                  {t("admin.cleanup.btn.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
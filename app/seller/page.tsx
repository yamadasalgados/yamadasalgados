"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

type EventStatus = "active" | "closed" | "cancelled";
type PlanId = "starter" | "pro" | "business";
type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  currentPeriodEnd?: Timestamp;
  requestedPlanAt?: Timestamp;
  suspended?: boolean;
};

type FireEvent = {
  sellerId?: string;
  regionId?: string;
  status?: EventStatus | string;
  createdAt?: Timestamp;
  revenueYen?: number;
  revenue?: number;
};

type Stats = {
  sellerId: string;
  regionId: string;
  activeEvents: number;
  closedEvents: number;
  revenueClosedSum: number;
};

export default function SellerDashboardPage() {
  const router = useRouter();
  const { t, lang } = useI18n();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);

  const [autoFixedIds, setAutoFixedIds] = useState(false);
  const didAutoFixRef = useRef(false);

  const sellerId =
    (typeof profile?.sellerId === "string" && profile.sellerId.trim()) ||
    (authUser?.uid ?? "");

  const regionId =
    (typeof profile?.regionId === "string" && profile.regionId.trim()) || "default";

  const inactive = profile?.active === false;
  const suspended = profile?.suspended === true;

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
    if (!authUser || inactive || suspended) return false;
    return true;
  }, [authUser, inactive, suspended]);

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

    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setProfileMissing(true);
      return;
    }

    const data = snap.data() as UserDoc;
    const normalizedRole: "admin" | "seller" = data.role === "admin" ? "admin" : "seller";
    const nextProfile: UserDoc = { ...data, role: normalizedRole };
    setProfile(nextProfile);

    const missingSellerId = !String(data.sellerId || "").trim();
    const missingRegionId = !String(data.regionId || "").trim();

    if (!didAutoFixRef.current && (missingSellerId || missingRegionId)) {
      didAutoFixRef.current = true;
      try {
        await updateDoc(ref, {
          sellerId: missingSellerId ? u.uid : data.sellerId,
          regionId: missingRegionId ? "default" : data.regionId,
          updatedAt: serverTimestamp(),
        });

        setAutoFixedIds(true);
        setProfile((prev) => ({
          ...(prev || {}),
          sellerId: missingSellerId ? u.uid : prev?.sellerId,
          regionId: missingRegionId ? "default" : prev?.regionId,
        }));
      } catch (e) {
        console.warn("Best-effort auto-fix IDs falhou:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser).catch((e: any) =>
      setErrMsg(e?.message || t("guard.err.loadProfile"))
    );
  }, [authUser, loadProfile, t]);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    router.replace("/login");
  }, [router]);

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setErrMsg("");
    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
    } catch (e: any) {
      setErrMsg(e?.message || t("guard.err.createProfile"));
    } finally {
      setLoading(false);
    }
  }, [authUser, loadProfile, t]);

  const planDaysLeft = useMemo(() => {
  const end = profile?.currentPeriodEnd?.toDate?.();
  if (!end) return null;

  const diff = end.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}, [profile?.currentPeriodEnd]);

const showPlanWarning =
  profile?.subscriptionStatus === "past_due" ||
  profile?.subscriptionStatus === "cancelled" ||
  (typeof planDaysLeft === "number" && planDaysLeft <= 7);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setErrMsg("");

      if (!canLoad || !sellerId) {
        setStats(null);
        return;
      }

      setLoading(true);

      try {
        const eventsQ = query(
          collection(db, "sellers", sellerId, "events"),
          orderBy("createdAt", "desc"),
          limit(300)
        );
        const eventsSnap = await getDocs(eventsQ);

        let activeEvents = 0;
        let closedEvents = 0;
        let revenueClosedSum = 0;

        eventsSnap.docs.forEach((d) => {
          const e = d.data() as FireEvent;
          if (e.status === "active") activeEvents++;
          if (e.status === "closed") {
            closedEvents++;
            revenueClosedSum += e.revenueYen || e.revenue || 0;
          }
        });

        setStats({ sellerId, regionId, activeEvents, closedEvents, revenueClosedSum });
      } catch (e1: any) {
        try {
          const eventsQ2 = query(
            collection(db, "events"),
            where("sellerId", "==", sellerId),
            orderBy("createdAt", "desc"),
            limit(300)
          );
          const eventsSnap2 = await getDocs(eventsQ2);

          let activeEvents = 0;
          let closedEvents = 0;
          let revenueClosedSum = 0;

          eventsSnap2.docs.forEach((d) => {
            const e = d.data() as FireEvent;
            if (e.status === "active") activeEvents++;
            if (e.status === "closed") {
              closedEvents++;
              revenueClosedSum += e.revenueYen || e.revenue || 0;
            }
          });

          setStats({ sellerId, regionId, activeEvents, closedEvents, revenueClosedSum });
        } catch (e2: any) {
          setErrMsg(e2?.message || e1?.message || t("dashboard.err.load"));
          setStats(null);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, [canLoad, sellerId, regionId, t]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </main>
    );
  }

  if (!authUser) return null;

  if (profileMissing) {
    return (
      <main className="p-4 sm:p-6 space-y-4 dark:bg-neutral-950 min-h-[80vh] flex flex-col justify-center max-w-md mx-auto text-center">
        <h1 className="text-2xl font-black tracking-tight dark:text-white">{t("guard.profileMissing.title")}</h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
            {t("guard.profileMissing.hint")}
          </p>
          <button
            onClick={handleCreateProfileNow}
            disabled={loading}
            className="w-full rounded-2xl bg-black dark:bg-white dark:text-black text-white text-sm font-black py-4 hover:opacity-90 disabled:opacity-60 shadow-xl transition-all"
          >
            {loading ? t("common.saving") : t("guard.profileMissing.ctaCreate")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{t("dashboard.subtitle")}</p>

          {autoFixedIds && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider">
              ✨ Identidade sincronizada
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link
            href="/seller/events/new"
            className="rounded-2xl bg-black dark:bg-white dark:text-black text-white text-xs font-black px-5 py-3.5 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md uppercase tracking-wider"
          >
            {t("dashboard.create_event")}
          </Link>
        </div>
      </header>

{typeof planDaysLeft === "number" && (
  <section
    className={`rounded-[2rem] border p-5 space-y-1 ${
      showPlanWarning
        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/10 dark:text-red-300"
        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/10 dark:text-amber-300"
    }`}
  >
    <h2 className="text-sm font-black uppercase tracking-widest">
      {showPlanWarning
        ? t("dashboard.plan.warningTitle")
        : t("dashboard.plan.title")}
    </h2>

    <p className="text-xs font-bold leading-relaxed">
      {planDaysLeft > 0
        ? t("dashboard.plan.daysLeft").replace("{days}", String(planDaysLeft))
        : t("dashboard.plan.expired")}
    </p>

    {showPlanWarning && (
      <p className="text-[11px] font-black leading-relaxed">
        {t("dashboard.plan.cleanupWarning")}
      </p>
    )}

    <Link
      href="/seller/rent"
      className="inline-block mt-2 rounded-xl bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-black uppercase"
    >
      {t("dashboard.plan.manage")}
    </Link>
  </section>
)}

      {loading && <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem]" />}

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-200 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {errMsg}
        </div>
      )}

      {/* Seção de Acessos Rápidos (Ações Modulares) */}
      <section className="rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 p-6 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {t("dashboard.quick.title")}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Action title={t("dashboard.quick.events")} desc={t("dashboard.quick.events_desc")} href="/seller/events" icon="📅" />
          <Action title={t("dashboard.quick.products")} desc={t("dashboard.quick.products_desc")} href="/seller/products" icon="📦" />
          <Action title={t("dashboard.quick.reports")} desc={t("dashboard.quick.reports_desc")} href="/seller/reports" icon="📊" />
          <Action title={t("dashboard.quick.settings")} desc={t("dashboard.quick.settings_desc")} href="/seller/settings" icon="⚙️" />
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  value,
  hint,
  tone,
  href,
}: {
  title: string;
  value: string;
  hint: string;
  tone: "good" | "neutral";
  href: string;
}) {
  const toneCls =
    tone === "good"
      ? "border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-950/10"
      : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900";

  return (
    <Link
      href={href}
      className={`rounded-[2rem] border p-6 hover:scale-[1.01] active:scale-[0.99] hover:shadow-lg transition-all block ${toneCls}`}
    >
      <p className="text-[10px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-black mt-2 tracking-tight text-neutral-900 dark:text-white">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-2 leading-relaxed">{hint}</p>
    </Link>
  );
}

function Action({ title, desc, href, icon }: { title: string; desc: string; href: string; icon: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:border-black dark:hover:border-white transition-all flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow-md"
    >
      <div className="text-lg">{icon}</div>
      <div className="mt-4">
        <p className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">{title}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 font-medium mt-1 leading-relaxed">{desc}</p>
      </div>
    </Link>
  );
}
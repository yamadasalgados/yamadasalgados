"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { formatMoneyMajor } from "@/app/lib/money";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";
import { useI18n } from "@/app/lib/i18n";
import StoreOrdersCard from "@/app/store/StoreOrdersCard";
import EventOrdersAlerts from "@/app/seller/events/EventOrdersAlerts";

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
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
  timeZone?: string;
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


const dashboardText =
  lang === "ja"
    ? {
        identitySynced:
          "店舗情報を同期しました",
        statsActive:
          "開催中のイベント",
        statsActiveHint:
          "現在受付中のイベント数",
        statsClosed:
          "終了したイベント",
        statsClosedHint:
          "終了済みイベントの合計",
        statsRevenue:
          "イベント売上",
        statsRevenueHint:
          "終了したイベントの確定売上",
        storeOrdersTitle:
          "店舗注文",
        storeOrdersDesc:
          "常設店舗の注文一覧を開きます。",
        publicStoreTitle:
          "公開店舗",
        publicStoreDesc:
          "お客様向けの店舗ページを開きます。",
        offersTitle:
          "オファーとセット",
        offersDesc:
          "プロモーション、セット、割引を管理します。",
      }
    : lang === "en"
      ? {
          identitySynced:
            "Store identity synchronized",
          statsActive:
            "Active events",
          statsActiveHint:
            "Events currently accepting orders",
          statsClosed:
            "Closed events",
          statsClosedHint:
            "Total completed events",
          statsRevenue:
            "Event revenue",
          statsRevenueHint:
            "Confirmed revenue from closed events",
          storeOrdersTitle:
            "Store orders",
          storeOrdersDesc:
            "Open orders from the permanent store.",
          publicStoreTitle:
            "Public store",
          publicStoreDesc:
            "Open the storefront customers access.",
          offersTitle:
            "Offers and kits",
          offersDesc:
            "Manage promotions, kits, and discounts.",
        }
      : {
          identitySynced:
            "Identidade da loja sincronizada",
          statsActive:
            "Eventos ativos",
          statsActiveHint:
            "Eventos recebendo pedidos agora",
          statsClosed:
            "Eventos encerrados",
          statsClosedHint:
            "Total de eventos já finalizados",
          statsRevenue:
            "Faturamento dos eventos",
          statsRevenueHint:
            "Receita confirmada dos eventos encerrados",
          storeOrdersTitle:
            "Pedidos da Loja",
          storeOrdersDesc:
            "Abra os pedidos do catálogo permanente.",
          publicStoreTitle:
            "Loja pública",
          publicStoreDesc:
            "Abra a vitrine acessada pelos clientes.",
          offersTitle:
            "Ofertas e kits",
          offersDesc:
            "Gerencie promoções, kits e descontos.",
        };

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);

  const [autoFixedIds, setAutoFixedIds] = useState(false);

  const sellerId =
    (typeof profile?.sellerId === "string" && profile.sellerId.trim()) ||
    (authUser?.uid ?? "");

  const regionId =
    (typeof profile?.regionId === "string" && profile.regionId.trim()) || "default";

  const inactive = profile?.active === false;
  const suspended = profile?.suspended === true;

  const money = useCallback(
    (amount: number) => {
      const currency =
        profile?.currency ?? "JPY";
      const locale =
        profile?.regionalLocale ??
        (lang === "pt"
          ? "pt-BR"
          : lang === "en"
            ? "en-US"
            : "ja-JP");

      return formatMoneyMajor(
        amount,
        currency,
        locale,
      );
    },
    [
      lang,
      profile?.currency,
      profile?.regionalLocale,
    ],
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

  const loadProfile = useCallback(
    async (u: User) => {
      setErrMsg("");
      setProfileMissing(false);

      const result =
        await ensureUserProfile(
          u,
          lang,
        );

      const data =
        result.userDoc as UserDoc;

      setProfile({
        ...data,
        role:
          data.role === "admin"
            ? "admin"
            : "seller",
        sellerId:
          String(
            data.sellerId ??
            u.uid,
          ).trim(),
        regionId:
          String(
            data.regionId ??
            "default",
          ).trim() ||
          "default",
      });

      setAutoFixedIds(false);
    },
    [lang],
  );

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
      } catch (error: any) {
        setErrMsg(
          error?.message ||
          t("dashboard.err.load"),
        );
        setStats(null);
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
              ✨ {dashboardText.identitySynced}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">

          <Link
            href="/seller/events/new"
            className="rounded-2xl bg-black px-5 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-black"
          >
            {t("dashboard.create_event")}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl border border-neutral-200 bg-white px-5 py-3.5 text-xs font-black uppercase tracking-wider text-neutral-700 transition-all hover:border-black hover:text-black active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
          >
            {t("common.logout")}
          </button>
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
      href="/seller/settings"
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


{stats && (
  <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Card
      title={dashboardText.statsActive}
      value={String(stats.activeEvents)}
      hint={dashboardText.statsActiveHint}
      tone="good"
      href="/seller/events"
    />

    <Card
      title={dashboardText.statsClosed}
      value={String(stats.closedEvents)}
      hint={dashboardText.statsClosedHint}
      tone="neutral"
      href="/seller/reports"
    />

    <Card
      title={dashboardText.statsRevenue}
      value={money(stats.revenueClosedSum)}
      hint={dashboardText.statsRevenueHint}
      tone="neutral"
      href="/seller/reports"
    />
  </section>
)}


{canLoad && sellerId && (
  <section className="space-y-5">
    <StoreOrdersCard
      sellerId={sellerId}
    />

    <EventOrdersAlerts
      sellerId={sellerId}
    />
  </section>
)}

{/* Seção de Acessos Rápidos (Ações Modulares) */}
<section className="rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 p-6 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {t("dashboard.quick.title")}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Action
            title={t("dashboard.quick.events")}
            desc={t("dashboard.quick.events_desc")}
            href="/seller/events"
            icon="📅"
          />

          <Action
            title={t("dashboard.quick.products")}
            desc={t("dashboard.quick.products_desc")}
            href="/seller/products"
            icon="📦"
          />

          <Action
            title={dashboardText.storeOrdersTitle}
            desc={dashboardText.storeOrdersDesc}
            href="/seller/store-orders"
            icon="🛒"
          />

          <Action
            title={dashboardText.offersTitle}
            desc={dashboardText.offersDesc}
            href="/seller/offers"
            icon="🎁"
          />

          {sellerId && (
            <Action
              title={dashboardText.publicStoreTitle}
              desc={dashboardText.publicStoreDesc}
              href={`/store/${encodeURIComponent(sellerId)}`}
              icon="🏪"
              external
            />
          )}

          <Action
            title={t("dashboard.quick.reports")}
            desc={t("dashboard.quick.reports_desc")}
            href="/seller/reports"
            icon="📊"
          />

          <Action
            title={t("dashboard.quick.settings")}
            desc={t("dashboard.quick.settings_desc")}
            href="/seller/settings"
            icon="⚙️"
          />
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

function Action({
  title,
  desc,
  href,
  icon,
  external = false,
}: {
  title: string;
  desc: string;
  href: string;
  icon: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex min-h-[120px] flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-black hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-white"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg">{icon}</span>

        {external && (
          <span className="text-xs font-black text-neutral-400 transition group-hover:text-neutral-700 dark:group-hover:text-neutral-200">
            ↗
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-400 dark:text-neutral-500">
          {desc}
        </p>
      </div>
    </Link>
  );
}

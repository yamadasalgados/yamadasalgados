"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/app/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { formatMoneyMajor } from "@/app/lib/money";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";
import { useI18n } from "@/app/lib/i18n";
import StoreOrdersCard from "@/app/store/StoreOrdersCard";
import EventOrdersAlerts from "@/app/seller/events/EventOrdersAlerts";
import PageHeader from "@/app/_components/PageHeader";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { CalendarDays, ChartNoAxesCombined, CircleDollarSign, Plus } from "lucide-react";

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
        productionTitle:
          "製造・取り分け",
        productionDesc:
          "製造、予約在庫、準備完了の注文をまとめて管理します。",
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
          productionTitle:
            "Production and picking",
          productionDesc:
            "Manage production, reserved stock, and ready orders.",
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
          productionTitle:
            "Produção e separação",
          productionDesc:
            "Gerencie produção, estoque reservado e pedidos prontos.",
        };

  const sellerSession = useSellerSession();
  const profile = sellerSession.profile as UserDoc;

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);


  const sellerId = sellerSession.sellerId;
  const regionId = sellerSession.regionId;

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
    if (inactive || suspended) return false;
    return true;
  }, [inactive, suspended]);

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl space-y-8 bg-white p-4 transition-colors animate-fade-in dark:bg-neutral-950 sm:p-6">
      <PageHeader
        eyebrow="Yamada Seller"
        title={t("dashboard.title")}
        description={t("dashboard.subtitle")}
        action={
          <Link
            href="/seller/events/new"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            <Plus size={18} />
            {t("dashboard.create_event")}
          </Link>
        }
      />

{typeof planDaysLeft === "number" && (
  <FeedbackBanner tone={showPlanWarning ? "error" : "warning"} role={showPlanWarning ? "alert" : "status"}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-widest">
          {showPlanWarning ? t("dashboard.plan.warningTitle") : t("dashboard.plan.title")}
        </p>
        <p className="mt-1 text-xs">
          {planDaysLeft > 0
            ? t("dashboard.plan.daysLeft").replace("{days}", String(planDaysLeft))
            : t("dashboard.plan.expired")}
        </p>
        {showPlanWarning && <p className="mt-1 text-[11px]">{t("dashboard.plan.cleanupWarning")}</p>}
      </div>
      <Link href="/seller/settings" className="shrink-0 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-neutral-950">
        {t("dashboard.plan.manage")}
      </Link>
    </div>
  </FeedbackBanner>
)}

      {loading && <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem]" />}

      {errMsg && <FeedbackBanner tone="error" role="alert">{errMsg}</FeedbackBanner>}


{stats && (
  <MetricStrip
    items={[
      { label: dashboardText.statsActive, value: stats.activeEvents, icon: <CalendarDays size={16} />, tone: "success", href: "/seller/events" },
      { label: dashboardText.statsClosed, value: stats.closedEvents, icon: <ChartNoAxesCombined size={16} />, href: "/seller/reports" },
      { label: dashboardText.statsRevenue, value: money(stats.revenueClosedSum), icon: <CircleDollarSign size={16} />, href: "/seller/reports" },
    ]}
  />
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

    </main>
  );
}

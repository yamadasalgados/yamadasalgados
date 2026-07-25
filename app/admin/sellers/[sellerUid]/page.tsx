"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";
import {
  effectivePlanLimits,
  getEffectiveSellerAccess,
  normalizeAccountStatus,
} from "@/app/lib/access-control";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

type Detail = {
  sellerId: string;
  ownerUid: string;
  email: string;
  displayName: string;
  storeName: string;
  country: string;
  currency: string;
  timeZone: string;
  accountStatus: string;
  access: string;
  limits: string;
  products: number;
  events: number;
  storeOrders: number;
  planRequests: number;
};

export default function AdminSellerDetailPage() {
  const params =
    useParams<{
      sellerUid: string;
    }>();

  const sellerId =
    String(
      params.sellerUid ?? "",
    );

  const [detail, setDetail] =
    useState<Detail | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      if (!sellerId) return;

      setLoading(true);
      setError("");

      try {
        const sellerReference =
          doc(
            db,
            "sellers",
            sellerId,
          );
        const sellerSnapshot =
          await getDoc(
            sellerReference,
          );

        if (!sellerSnapshot.exists()) {
          throw new Error(
            "SELLER_NOT_FOUND",
          );
        }

        const seller =
          sellerSnapshot.data();
        const ownerUid =
          String(
            seller.ownerUid ?? "",
          );
        const userSnapshot =
          ownerUid
            ? await getDoc(
                doc(
                  db,
                  "users",
                  ownerUid,
                ),
              )
            : null;
        const user =
          userSnapshot?.exists()
            ? userSnapshot.data()
            : {};

        const [
          productCount,
          eventCount,
          orderCount,
          requestCount,
        ] = await Promise.all([
          getCountFromServer(
            collection(
              sellerReference,
              "products",
            ),
          ),
          getCountFromServer(
            collection(
              sellerReference,
              "events",
            ),
          ),
          getCountFromServer(
            collection(
              sellerReference,
              "storeOrders",
            ),
          ),
          getCountFromServer(
            collection(
              sellerReference,
              "planRequests",
            ),
          ),
        ]);

        const regional =
          normalizeSellerRegionalProfile(
            seller,
            {
              fallbackSellerId:
                sellerId,
            },
          );
        const access =
          getEffectiveSellerAccess(
            seller,
          );
        const limits =
          effectivePlanLimits(
            seller,
          );

        setDetail({
          sellerId,
          ownerUid,
          email:
            String(
              user.email ?? "",
            ),
          displayName:
            String(
              user.displayName ?? "",
            ),
          storeName:
            regional.storeName ||
            sellerId,
          country:
            regional.operatingCountry ??
            "—",
          currency:
            regional.currency ??
            "—",
          timeZone:
            regional.timeZone ||
            "—",
          accountStatus:
            normalizeAccountStatus(
              seller.accountStatus,
              {
                active:
                  seller.active,
                suspended:
                  seller.suspended,
              },
            ),
          access:
            `${access.planId} · ${
              access.mode === "lifetime"
                ? "lifetime"
                : access.billingInterval
            } · ${access.status}`,
          limits:
            `${limits.maxEvents} eventos / ${limits.maxProducts} produtos`,
          products:
            productCount.data().count,
          events:
            eventCount.data().count,
          storeOrders:
            orderCount.data().count,
          planRequests:
            requestCount.data().count,
        });
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "SELLER_DETAIL_FAILED",
        );
      } finally {
        setLoading(false);
      }
    },
    [sellerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="p-6 text-sm text-neutral-500">
        Carregando…
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="space-y-4 p-6">
        <FeedbackBanner tone="error" role="alert">
          {error || "Seller não encontrado."}
        </FeedbackBanner>
        <BackLink href="/admin/sellers" label="Voltar aos vendedores" />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Seller"
        title={detail.storeName}
        description={`${detail.email || detail.ownerUid || detail.sellerId} · ${detail.country} · ${detail.currency}`}
        back={<BackLink href="/admin/sellers" label="Voltar aos vendedores" />}
        action={
          <Link
            href={`/admin/sellers/${encodeURIComponent(detail.sellerId)}/products`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-xs font-black text-white dark:bg-white dark:text-black"
          >
            Ver produtos
          </Link>
        }
      />

      <MetricStrip
        items={[
          { label: "Produtos", value: detail.products },
          { label: "Eventos", value: detail.events },
          { label: "Pedidos da loja", value: detail.storeOrders },
          { label: "Solicitações", value: detail.planRequests },
        ]}
      />

      <section className="grid gap-4 rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:grid-cols-2">
        <Info
          label="Seller ID"
          value={detail.sellerId}
        />
        <Info
          label="Owner UID"
          value={detail.ownerUid}
        />
        <Info
          label="Responsável"
          value={detail.displayName || "—"}
        />
        <Info
          label="Conta"
          value={detail.accountStatus}
        />
        <Info
          label="Acesso"
          value={detail.access}
        />
        <Info
          label="Limites efetivos"
          value={detail.limits}
        />
        <Info
          label="Região"
          value={`${detail.country} · ${detail.currency}`}
        />
        <Info
          label="Fuso"
          value={detail.timeZone}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/plans"
          className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-black"
        >
          Gerenciar acesso
        </Link>
      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-bold">
        {value}
      </p>
    </div>
  );
}

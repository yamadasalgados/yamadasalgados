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
        <p className="text-red-600">
          {error ||
            "Seller não encontrado."}
        </p>
        <Link
          href="/admin/sellers"
          className="text-sm font-black underline"
        >
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header>
        <Link
          href="/admin/sellers"
          className="text-xs font-black text-neutral-500 underline"
        >
          ← Vendedores
        </Link>
        <h1 className="mt-3 text-3xl font-black">
          {detail.storeName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {detail.email ||
            detail.ownerUid}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Produtos"
          value={detail.products}
        />
        <Card
          label="Eventos"
          value={detail.events}
        />
        <Card
          label="Pedidos da loja"
          value={detail.storeOrders}
        />
        <Card
          label="Solicitações"
          value={detail.planRequests}
        />
      </section>

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
        <Link
          href={`/admin/sellers/${detail.sellerId}/products`}
          className="rounded-2xl border border-neutral-300 px-5 py-3 text-sm font-black dark:border-neutral-700"
        >
          Ver produtos
        </Link>
      </div>
    </main>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">
        {value}
      </p>
    </div>
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

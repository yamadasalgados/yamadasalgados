"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  collection,
  getDocs,
  type DocumentData,
} from "firebase/firestore";
import {
  RefreshCw,
} from "lucide-react";

import {
  db,
} from "@/app/lib/firebase";
import {
  getEffectiveSellerAccess,
  normalizeAccountStatus,
} from "@/app/lib/access-control";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";
import PageHeader from "@/app/_components/PageHeader";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

type Row = {
  id: string;
  ownerUid: string;
  storeName: string;
  email: string;
  country: string;
  accountStatus: string;
  access: string;
};

export default function AdminSellersPage() {
  const { lang } = useI18n();

  const [rows, setRows] =
    useState<Row[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const [
          sellerSnapshot,
          userSnapshot,
        ] = await Promise.all([
          getDocs(
            collection(
              db,
              "sellers",
            ),
          ),
          getDocs(
            collection(
              db,
              "users",
            ),
          ),
        ]);

        const users =
          new Map<
            string,
            DocumentData
          >();

        userSnapshot.docs.forEach(
          (document) =>
            users.set(
              document.id,
              document.data(),
            ),
        );

        const next =
          sellerSnapshot.docs.map(
            (document) => {
              const data =
                document.data();
              const regional =
                normalizeSellerRegionalProfile(
                  data,
                  {
                    fallbackSellerId:
                      document.id,
                  },
                );
              const access =
                getEffectiveSellerAccess(
                  data,
                );
              const ownerUid =
                String(
                  data.ownerUid ?? "",
                );
              const owner =
                users.get(ownerUid) ?? {};

              return {
                id: document.id,
                ownerUid,
                storeName:
                  regional.storeName ||
                  document.id,
                email:
                  String(
                    owner.email ?? "",
                  ),
                country:
                  regional.operatingCountry ??
                  "—",
                accountStatus:
                  normalizeAccountStatus(
                    data.accountStatus,
                    {
                      active: data.active,
                      suspended:
                        data.suspended,
                    },
                  ),
                access:
                  `${access.planId} · ${
                    access.mode ===
                    "lifetime"
                      ? "lifetime"
                      : access.billingInterval
                  } · ${access.status}`,
              };
            },
          );

        next.sort(
          (left, right) =>
            left.storeName.localeCompare(
              right.storeName,
            ),
        );

        setRows(next);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "SELLER_LIST_FAILED",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const title =
    lang === "ja"
      ? "販売者"
      : lang === "en"
        ? "Sellers"
        : "Vendedores";

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title={title}
        description="A identidade fica em users; comércio, acesso e catálogo ficam em sellers."
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 px-4 text-xs font-black disabled:opacity-50 dark:border-neutral-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}

      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">
            Carregando…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">
            Nenhum seller cadastrado.
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/admin/sellers/${row.id}`}
                className="grid gap-2 p-5 transition hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-black">
                    {row.storeName}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {row.email ||
                      row.ownerUid}
                  </p>
                </div>
                <div className="text-left text-xs font-bold text-neutral-500 sm:text-right">
                  <p>{row.country} · {row.accountStatus}</p>
                  <p>{row.access}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

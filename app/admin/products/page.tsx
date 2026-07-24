"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
} from "firebase/firestore";
import {
  Boxes,
  RefreshCw,
} from "lucide-react";

import {
  db,
} from "@/app/lib/firebase";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";

type Row = {
  sellerId: string;
  storeName: string;
  productCount: number;
};

export default function AdminProductsPage() {
  const { lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy =
    lang === "ja"
      ? {
          title: "商品カタログ",
          subtitle: "商品は各販売者の sellers/{sellerId}/products に保存されます。",
          refresh: "更新",
          loading: "読み込み中…",
          empty: "販売者がいません。",
          products: "商品",
          open: "カタログを開く",
        }
      : lang === "en"
        ? {
            title: "Product catalogs",
            subtitle: "Products are stored only under sellers/{sellerId}/products.",
            refresh: "Refresh",
            loading: "Loading…",
            empty: "No sellers found.",
            products: "products",
            open: "Open catalog",
          }
        : {
            title: "Catálogos de produtos",
            subtitle: "Os produtos ficam exclusivamente em sellers/{sellerId}/products.",
            refresh: "Atualizar",
            loading: "Carregando…",
            empty: "Nenhum seller encontrado.",
            products: "produtos",
            open: "Abrir catálogo",
          };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sellerSnapshot = await getDocs(collection(db, "sellers"));
      const next = await Promise.all(
        sellerSnapshot.docs.map(async (snapshot) => {
          const profile = normalizeSellerRegionalProfile(snapshot.data(), {
            fallbackSellerId: snapshot.id,
          });
          const countSnapshot = await getCountFromServer(
            collection(db, "sellers", snapshot.id, "products"),
          );

          return {
            sellerId: snapshot.id,
            storeName: profile.storeName || snapshot.id,
            productCount: countSnapshot.data().count,
          };
        }),
      );

      next.sort((left, right) =>
        left.storeName.localeCompare(right.storeName),
      );
      setRows(next);
    } catch (loadError: unknown) {
      console.error("[AdminProducts] load:", loadError);
      setError(loadError instanceof Error ? loadError.message : "PRODUCT_CATALOG_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm font-medium text-neutral-500">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-300 px-4 text-sm font-black disabled:opacity-50 dark:border-neutral-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {copy.refresh}
        </button>
      </header>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">{copy.loading}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">{copy.empty}</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((row) => (
              <article
                key={row.sellerId}
                className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-black">{row.storeName}</p>
                  <p className="mt-1 truncate text-xs text-neutral-500">{row.sellerId}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-xs font-black text-neutral-600 dark:text-neutral-300">
                    <Boxes className="h-4 w-4" />
                    {row.productCount} {copy.products}
                  </p>
                </div>

                <Link
                  href={`/admin/sellers/${encodeURIComponent(row.sellerId)}/products`}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-black px-4 text-sm font-black text-white dark:bg-white dark:text-black"
                >
                  {copy.open}
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

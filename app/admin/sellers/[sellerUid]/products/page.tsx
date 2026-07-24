"use client";

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
  getDocs,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  stockQty: number;
};

export default function AdminSellerProductsPage() {
  const params =
    useParams<{
      sellerUid: string;
    }>();

  const sellerId =
    String(
      params.sellerUid ?? "",
    );

  const [products, setProducts] =
    useState<ProductRow[]>([]);
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
        const snapshot =
          await getDocs(
            collection(
              db,
              "sellers",
              sellerId,
              "products",
            ),
          );

        const next =
          snapshot.docs.map(
            (document) => {
              const data =
                document.data();

              return {
                id: document.id,
                name:
                  String(
                    data.name ??
                    document.id,
                  ),
                category:
                  String(
                    data.category ??
                    "",
                  ),
                status:
                  data.status ===
                  "inactive"
                    ? "inactive"
                    : "active",
                stockQty:
                  Number.isFinite(
                    data.stockQty,
                  )
                    ? Number(
                        data.stockQty,
                      )
                    : 0,
              };
            },
          );

        next.sort(
          (left, right) =>
            left.name.localeCompare(
              right.name,
            ),
        );

        setProducts(next);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "PRODUCT_LIST_FAILED",
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

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">
          Produtos do seller
        </h1>
        <p className="mt-1 break-all text-xs text-neutral-500">
          sellers/{sellerId}/products
        </p>
      </header>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">
            Carregando…
          </p>
        ) : products.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">
            Nenhum produto neste catálogo.
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {products.map(
              (product) => (
                <div
                  key={product.id}
                  className="grid gap-2 p-5 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div>
                    <p className="font-black">
                      {product.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {product.category ||
                        "Sem categoria"}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-neutral-500">
                    {product.status} · estoque {product.stockQty}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        A antiga permissão por catálogo global foi removida. Cada seller administra somente os próprios produtos.
      </p>
    </main>
  );
}

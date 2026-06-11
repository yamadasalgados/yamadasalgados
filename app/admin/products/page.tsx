"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";

type ProductStatus = "active" | "inactive";

type FireProduct = {
  name?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  extraImageUrls?: string[];

  sellerId?: string;
  sellerEmail?: string;

  status?: ProductStatus | string;
  stockQty?: number;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type Row = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  status: ProductStatus;
  stockQty: number;
  sellerId: string;
  sellerEmail: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

function norm(s: any) {
  return String(s || "").trim();
}

function yen(n: number) {
  return `¥${Math.round(Number(n || 0)).toLocaleString("ja-JP")}`;
}

function normalizeStatus(s: any): ProductStatus {
  const st = String(s || "active");
  return st === "inactive" ? "inactive" : "active";
}

function badgeTone(status: ProductStatus) {
  if (status === "active") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-700";
  return "bg-neutral-500/10 border-neutral-500/20 text-app";
}

export default function AdminProductsPage() {
  return (
    <AdminGuard>
      {() => <Inner />}
    </AdminGuard>
  );
}

function Inner() {
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [qText, setQText] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrMsg("");
    setLoading(true);

    try {
      // ✅ últimos produtos
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(500));
      const snap = await getDocs(q);

      const list: Row[] = snap.docs.map((d) => {
        const p = d.data() as FireProduct;

        return {
          id: d.id,
          name: norm(p.name),
          category: norm(p.category),
          price: Number(p.price ?? 0),
          imageUrl: norm(p.imageUrl),
          status: normalizeStatus(p.status),
          stockQty: Number(p.stockQty ?? 0),
          sellerId: norm(p.sellerId),
          sellerEmail: norm(p.sellerEmail),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      });

      setRows(list);
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Falha ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (onlyActive && r.status !== "active") return false;
        if (!t) return true;

        const hay = `${r.name} ${r.category} ${r.id} ${r.sellerId} ${r.sellerEmail}`.toLowerCase();
        return hay.includes(t);
      })
      .sort((a, b) => {
        // ativos primeiro
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return 0;
      });
  }, [rows, qText, onlyActive]);

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const inactive = rows.length - active;
    return { total: rows.length, active, inactive };
  }, [rows]);

  const copy = useCallback(async (txt: string, label = "Copiado!") => {
    try {
      await navigator.clipboard.writeText(txt);
      setToast(label);
      setTimeout(() => setToast(null), 2000);
    } catch {
      setErrMsg("Falha ao copiar.");
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-app bg-card-muted p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-app">Produtos</h2>
            <p className="text-sm text-muted">
              Total: <span className="font-bold text-app">{counts.total}</span> • Ativos:{" "}
              <span className="font-bold text-app">{counts.active}</span> • Inativos:{" "}
              <span className="font-bold text-app">{counts.inactive}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/products/new"
              className="rounded-full bg-[rgb(var(--primary))] text-black text-sm font-semibold px-4 py-2 hover:brightness-110"
            >
              + Novo
            </Link>

            <button
              onClick={load}
              className="rounded-full border border-app bg-card text-app text-sm font-semibold px-4 py-2 hover:brightness-[1.03]"
            >
              Recarregar
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Buscar por nome, categoria, productId, sellerId, email..."
            className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
          />

          <label className="flex items-center gap-2 text-sm text-app whitespace-nowrap">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Mostrar só ativos
          </label>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-3 rounded-full text-sm font-black">
          {toast}
        </div>
      )}

      {errMsg && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600">
          {errMsg}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-24 bg-card-muted rounded-2xl border border-app" />
      ) : (
        <section className="rounded-2xl border border-app bg-card p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-app">
                  <th className="py-3 pr-3">Produto</th>
                  <th className="py-3 pr-3">Preço</th>
                  <th className="py-3 pr-3">Stock</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Seller</th>
                  <th className="py-3 pr-3">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-app last:border-b-0 align-top">
                    <td className="py-3 pr-3">
                      <div className="flex gap-3">
                        <div className="h-12 w-12 rounded-2xl border border-app bg-card-muted overflow-hidden shrink-0 flex items-center justify-center">
                          {r.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-black text-muted">IMG</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-app truncate">{r.name || "—"}</div>
                          <div className="text-xs text-muted truncate">{r.category || "—"}</div>
                          <div className="text-[11px] text-muted mt-1">
                            id: <code className="font-bold text-app">{r.id}</code>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="font-semibold text-app">{yen(r.price)}</div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="font-semibold text-app">{Math.max(0, Number(r.stockQty || 0))}</div>
                    </td>

                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-bold ${badgeTone(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="text-xs text-muted">
                        sellerId: <span className="font-bold text-app">{r.sellerId || "—"}</span>
                      </div>
                      <div className="text-xs text-muted">
                        email: <span className="font-bold text-app">{r.sellerEmail || "—"}</span>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/products/${r.id}`}
                          className="rounded-full border border-app bg-card text-app text-xs font-semibold px-3 py-2 hover:brightness-[1.03]"
                        >
                          Editar
                        </Link>

                        {/* Se você tem rota pública de produto, habilita. Se não tiver, pode apagar. */}
                        <Link
                          href={`/product/${r.id}`}
                          target="_blank"
                          className="rounded-full border border-app bg-card text-app text-xs font-semibold px-3 py-2 hover:brightness-[1.03]"
                          title="Abrir página pública do produto"
                        >
                          Público
                        </Link>

                        <button
                          onClick={() => copy(r.id, "ID copiado!")}
                          className="rounded-full bg-neutral-500/10 border border-neutral-500/20 text-app text-xs font-bold px-3 py-2 hover:brightness-110"
                        >
                          Copiar ID
                        </button>

                        <button
                          onClick={() => copy(r.imageUrl || "", "URL copiada!")}
                          disabled={!r.imageUrl}
                          className="rounded-full bg-neutral-500/10 border border-neutral-500/20 text-app text-xs font-bold px-3 py-2 hover:brightness-110 disabled:opacity-50"
                        >
                          Copiar IMG
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!filtered.length && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

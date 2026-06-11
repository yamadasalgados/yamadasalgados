"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";

type ProductStatus = "active" | "inactive";

type FireProduct = {
  name?: string;
  title?: string;
  price?: number;
  priceYen?: number;
  category?: string;
  status?: ProductStatus | string;
  image?: string;
  createdAt?: any;
  updatedAt?: any;
};

type ProductRow = {
  id: string;
  name: string;
  category: string;
  priceYen: number;
  status: ProductStatus;
  image?: string;
};

function yen(n: number) {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

function norm(s: any) {
  return String(s || "").trim();
}

function normalizeStatus(s: any): ProductStatus {
  const st = String(s || "active");
  return st === "inactive" ? "inactive" : "active";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [qText, setQText] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const load = useCallback(async () => {
    setErrMsg("");
    setLoading(true);
    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(400));
      const snap = await getDocs(q);

      const list: ProductRow[] = snap.docs.map((d) => {
        const p = d.data() as FireProduct;
        const price = Number(p.priceYen ?? p.price ?? 0);

        return {
          id: d.id,
          name: norm(p.name || p.title || "—"),
          category: norm(p.category || "—"),
          priceYen: Number.isFinite(price) ? price : 0,
          status: normalizeStatus(p.status),
          image: norm(p.image || "") || undefined,
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

    return rows.filter((r) => {
      if (onlyActive && r.status !== "active") return false;
      if (!t) return true;

      const hay = `${r.name} ${r.category} ${r.id}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, qText, onlyActive]);

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const inactive = rows.filter((r) => r.status === "inactive").length;
    return { active, inactive, total: rows.length };
  }, [rows]);

  async function setStatus(productId: string, status: ProductStatus) {
    setErrMsg("");
    setBusyId(productId);
    try {
      await updateDoc(doc(db, "products", productId), {
        status,
        updatedAt: serverTimestamp(),
      });
      setRows((prev) => prev.map((x) => (x.id === productId ? { ...x, status } : x)));
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Falha ao atualizar status.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER / CONTROLES */}
      <section className="rounded-2xl border border-app bg-card-muted p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-app">Produtos (Catálogo Global)</h2>
            <p className="text-sm text-muted">
              Total: <span className="font-bold text-app">{counts.total}</span> • Ativos:{" "}
              <span className="font-bold text-app">{counts.active}</span> • Inativos:{" "}
              <span className="font-bold text-app">{counts.inactive}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              className="rounded-full bg-[rgb(var(--primary))] text-black text-sm font-semibold px-4 py-2 hover:brightness-110"
            >
              Recarregar
            </button>

            <Link
              href="/admin/products/new"
              className="rounded-full border border-app bg-card text-app text-sm font-semibold px-4 py-2 hover:brightness-[1.03]"
            >
              + Novo Produto
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Buscar por nome, categoria ou id..."
            className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
          />

          <label className="flex items-center gap-2 text-sm text-app whitespace-nowrap">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Mostrar só ativos
          </label>
        </div>
      </section>

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
                  <th className="py-3 pr-3">Categoria</th>
                  <th className="py-3 pr-3">Preço</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => {
                  const statusTone =
                    r.status === "active"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-700";

                  const isBusy = busyId === r.id;

                  return (
                    <tr key={r.id} className="border-b border-app last:border-b-0">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl border border-app bg-card-muted overflow-hidden flex items-center justify-center">
                            {r.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-black text-muted">IMG</span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-app truncate">{r.name}</div>
                            <div className="text-[11px] text-muted mt-1">
                              id: <code className="font-bold">{r.id}</code>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        <span className="text-xs font-bold text-app">{r.category || "—"}</span>
                      </td>

                      <td className="py-3 pr-3">
                        <div className="text-app font-semibold">{yen(r.priceYen)}</div>
                      </td>

                      <td className="py-3 pr-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-bold ${statusTone}`}>
                          {r.status}
                        </span>
                      </td>

                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/products/${r.id}`}
                            className="rounded-full border border-app bg-card text-app text-xs font-semibold px-3 py-2 hover:brightness-[1.03]"
                          >
                            Editar
                          </Link>

                          {r.status === "active" ? (
                            <button
                              disabled={isBusy}
                              onClick={() => setStatus(r.id, "inactive")}
                              className="rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-bold px-3 py-2 hover:brightness-110 disabled:opacity-50"
                            >
                              Inativar
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() => setStatus(r.id, "active")}
                              className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs font-bold px-3 py-2 hover:brightness-110 disabled:opacity-50"
                            >
                              Ativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted">
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

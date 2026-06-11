"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";

type ProductStatus = "active" | "inactive";

type FireProduct = {
  category?: string;
  name?: string;
  price?: number;
  imageUrl?: string;
  extraImageUrls?: string[];
  sellerEmail?: string;
  sellerId?: string;
  status?: ProductStatus | string;
  stockQty?: number;
  createdAt?: any;
  updatedAt?: any;
};

function norm(s: any) {
  return String(s || "").trim();
}

function toNum(v: string) {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(s: any): ProductStatus {
  const st = String(s || "active");
  return st === "inactive" ? "inactive" : "active";
}

export default function AdminEditProductPage() {
  return (
    <AdminGuard>
      {() => <Inner />}
    </AdminGuard>
  );
}

function Inner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [stockQty, setStockQty] = useState("0");

  const [extraDraft, setExtraDraft] = useState("");
  const [extraImageUrls, setExtraImageUrls] = useState<string[]>([]);

  const canSave = useMemo(() => {
    if (!id) return false;
    if (!norm(name)) return false;
    if (!norm(category)) return false;
    if (!norm(imageUrl)) return false;
    return true;
  }, [id, name, category, imageUrl]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrMsg("");
    setOkMsg("");

    try {
      const snap = await getDoc(doc(db, "products", id));
      if (!snap.exists()) {
        setErrMsg("Produto não encontrado.");
        setLoading(false);
        return;
      }

      const p = snap.data() as FireProduct;

      setCategory(norm(p.category));
      setName(norm(p.name));
      setPrice(String(Number(p.price ?? 0)));
      setImageUrl(norm(p.imageUrl));
      setExtraImageUrls(Array.isArray(p.extraImageUrls) ? p.extraImageUrls.map(norm).filter(Boolean) : []);
      setSellerId(norm(p.sellerId));
      setSellerEmail(norm(p.sellerEmail));
      setStatus(normalizeStatus(p.status));
      setStockQty(String(Number(p.stockQty ?? 0)));
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Falha ao carregar produto.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addExtra = useCallback(() => {
    const u = norm(extraDraft);
    if (!u) return;
    setExtraImageUrls((prev) => {
      if (prev.includes(u)) return prev;
      return [...prev, u];
    });
    setExtraDraft("");
  }, [extraDraft]);

  const removeExtra = useCallback((u: string) => {
    setExtraImageUrls((prev) => prev.filter((x) => x !== u));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setErrMsg("");
    setOkMsg("");

    try {
      await updateDoc(doc(db, "products", id), {
        category: norm(category),
        name: norm(name),
        price: toNum(price),
        imageUrl: norm(imageUrl),
        extraImageUrls: extraImageUrls.filter(Boolean),

        sellerId: norm(sellerId),
        sellerEmail: norm(sellerEmail),

        status,
        stockQty: Math.max(0, Math.floor(toNum(stockQty))),
        updatedAt: serverTimestamp(),
      });

      setOkMsg("Salvo com sucesso!");
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }, [canSave, id, category, name, price, imageUrl, extraImageUrls, sellerId, sellerEmail, status, stockQty]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="bg-card p-5 rounded-2xl border border-app">
          <p className="text-sm text-muted">Carregando produto...</p>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-app bg-card-muted p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-app">Editar Produto</h2>
            <p className="text-sm text-muted">
              id: <code className="font-bold text-app">{id}</code>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/admin/products")}
              className="rounded-full border border-app bg-card text-app text-sm font-semibold px-4 py-2 hover:brightness-[1.03]"
            >
              Voltar
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="rounded-full bg-[rgb(var(--primary))] text-black text-sm font-semibold px-5 py-2 hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </section>

      {(errMsg || okMsg) && (
        <div
          className={`rounded-2xl border p-4 text-sm font-semibold ${
            errMsg
              ? "border-red-500/20 bg-red-500/10 text-red-600"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
          }`}
        >
          {errMsg || okMsg}
        </div>
      )}

      <section className="rounded-2xl border border-app bg-card p-4 space-y-6">
        {/* Preview */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl border border-app bg-card-muted overflow-hidden flex items-center justify-center">
            {norm(imageUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-black text-muted">IMG</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted font-black">Pré-visualização</div>
            <div className="font-semibold text-app truncate">{norm(name) || "—"}</div>
            <div className="text-xs text-muted truncate">{norm(category) || "—"}</div>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Categoria">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </Field>

          <Field label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="Preço (¥)">
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="StockQty">
            <input
              inputMode="numeric"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="Imagem principal (imageUrl)">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="SellerId">
            <input
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>

          <Field label="SellerEmail">
            <input
              value={sellerEmail}
              onChange={(e) => setSellerEmail(e.target.value)}
              className="w-full p-3 rounded-xl border border-app bg-card text-app outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]"
            />
          </Field>
        </div>

        {/* Extras */}
        <div className="rounded-2xl border border-app bg-card-muted p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-muted">Extra imagens</div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={extraDraft}
              onChange={(e) => setExtraDraft(e.target.value)}
              placeholder="Cole uma URL extra e clique em Adicionar"
              className="flex-1 p-3 rounded-xl border border-app bg-card text-app outline-none"
            />
            <button
              type="button"
              onClick={addExtra}
              className="rounded-xl border border-app bg-card text-app text-sm font-semibold px-4 py-3 hover:brightness-[1.03]"
            >
              Adicionar
            </button>
          </div>

          {extraImageUrls.length === 0 ? (
            <div className="text-sm text-muted">Sem extras.</div>
          ) : (
            <div className="space-y-2">
              {extraImageUrls.map((u) => (
                <div key={u} className="flex items-center gap-2 rounded-xl border border-app bg-card p-2">
                  <div className="h-10 w-10 rounded-xl border border-app bg-card-muted overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" />
                  </div>
                  <code className="flex-1 text-[11px] font-bold text-app truncate">{u}</code>
                  <button
                    onClick={() => removeExtra(u)}
                    className="px-3 py-2 rounded-xl text-xs font-black text-red-600 hover:bg-red-500/10"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-tighter text-muted ml-1">{label}</label>
      {children}
    </div>
  );
}

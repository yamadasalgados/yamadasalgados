"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import AdminGuard from "@/app/_components/AdminGuard";
import { useI18n } from "@/app/lib/i18n";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

type UserRole = "admin" | "seller";

type UserDoc = {
  role?: UserRole;
  active?: boolean;
  name?: string;
  displayName?: string;
  email?: string;
  allowedProductIds?: string[];
};

type CategoryType =
  | "Comida"
  | "Lanchonete"
  | "Assados"
  | "Sobremesa"
  | "Festa"
  | "Congelados";

type ProductStatus = "active" | "inactive";

type ProductDoc = {
  id: string;
  name: string;
  price: number;
  category: CategoryType;
  status: ProductStatus;
  imageUrl?: string;
  updatedAt?: Timestamp;
};

const CATEGORY_ORDER: CategoryType[] = [
  "Comida",
  "Lanchonete",
  "Assados",
  "Sobremesa",
  "Festa",
  "Congelados",
];

export default function AdminSellerProductsPermissionPage() {
  return <AdminGuard>{() => <AdminSellerProductsPermissionInner />}</AdminGuard>;
}

function AdminSellerProductsPermissionInner() {
  const router = useRouter();
  const params = useParams() as { sellerUid?: string };
  const { t, lang } = useI18n();
  const sellerUid = String(params?.sellerUid || "").trim();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [adminProfile, setAdminProfile] = useState<UserDoc | null>(null);
  const [adminProfileMissing, setAdminProfileMissing] = useState(false);

  const [sellerProfile, setSellerProfile] = useState<UserDoc | null>(null);
  const [loadingSeller, setLoadingSeller] = useState(false);

  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const [qText, setQText] = useState("");
  const [saving, setSaving] = useState(false);

  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const isAdmin = adminProfile?.role === "admin";
  const inactive = adminProfile?.active === false;

  const yen = useCallback(
    (n: number) => {
      const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "ja-JP";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
      }).format(Math.round(n || 0));
    },
    [lang]
  );

  // 1) Auth Observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // 2) Load Admin Profile
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setErrMsg("");
      setOkMsg("");
      setAdminProfile(null);
      setAdminProfileMissing(false);

      const snap = await getDoc(doc(db, "users", authUser.uid));
      if (!snap.exists()) {
        setAdminProfileMissing(true);
        return;
      }

      const data = snap.data() as UserDoc;
      setAdminProfile({
        role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
        active: data.active !== false,
        name: data.name,
        displayName: data.displayName,
        email: data.email,
      });
    })().catch(() => {
      setErrMsg(t("reports.err.profileLoad"));
    });
  }, [authUser, t]);

  // 3) Listen Seller Allowed IDs em tempo real
  useEffect(() => {
    if (!authUser || !isAdmin || inactive || !sellerUid) return;

    setLoadingSeller(true);
    setSellerProfile(null);
    setAllowedIds([]);

    return onSnapshot(
      doc(db, "users", sellerUid),
      (snap) => {
        setLoadingSeller(false);
        if (!snap.exists()) {
          setErrMsg(t("eventPanel.err.eventNotFound"));
          return;
        }

        const data = snap.data() as UserDoc;
        setSellerProfile({
          role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
          active: data.active !== false,
          name: data.name,
          displayName: data.displayName,
          email: data.email,
        });

        setAllowedIds(Array.isArray(data.allowedProductIds) ? data.allowedProductIds.filter(Boolean) : []);
      },
      () => {
        setLoadingSeller(false);
        setErrMsg(t("reports.err.profileLoad"));
      }
    );
  }, [authUser, isAdmin, inactive, sellerUid, t]);

  // 4) Listen Catálogo Global de Produtos
  useEffect(() => {
    if (!authUser || !isAdmin || inactive) {
      setProducts([]);
      return;
    }

    return onSnapshot(
      query(collection(db, "products"), orderBy("updatedAt", "desc")),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data.name || ""),
            price: Number(data.price || 0),
            category: (data.category as CategoryType) || "Comida",
            status: data.status === "inactive" ? "inactive" : "active",
            imageUrl: String(data.imageUrl || ""),
            updatedAt: data.updatedAt,
          } as ProductDoc;
        }).filter((p) => p.name);

        setProducts(list);
      },
      () => setErrMsg(t("products.err.loadOwn"))
    );
  }, [authUser, isAdmin, inactive, t]);

  const filteredProducts = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => 
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [qText, products]);

  const grouped = useMemo(() => {
    const byCat = new Map<CategoryType, ProductDoc[]>();
    CATEGORY_ORDER.forEach((c) => byCat.set(c, []));
    filteredProducts.forEach((p) => {
      const cat = p.category || "Comida";
      if (byCat.has(cat)) byCat.get(cat)!.push(p);
    });
    return CATEGORY_ORDER.map((cat) => ({ cat, items: byCat.get(cat) || [] }));
  }, [filteredProducts]);

  const togglePermission = useCallback(
    async (productId: string, enabled: boolean) => {
      if (!authUser || !isAdmin || inactive || !sellerUid) return;

      setErrMsg("");
      setOkMsg("");
      setSaving(true);

      try {
        const next = enabled
          ? Array.from(new Set([...allowedIds, productId]))
          : allowedIds.filter((id) => id !== productId);

        await updateDoc(doc(db, "users", sellerUid), {
          allowedProductIds: next,
          allowedProductsUpdatedAt: serverTimestamp(),
        });
        setOkMsg(t("eventPanel.msg.saved"));
      } catch {
        setErrMsg(t("eventPanel.err.saveEvent"));
      } finally {
        setSaving(false);
      }
    },
    [authUser, isAdmin, inactive, sellerUid, allowedIds, t]
  );

  const bulkSetCategory = useCallback(
    async (cat: CategoryType, enabled: boolean) => {
      if (!authUser || !isAdmin || inactive || !sellerUid) return;

      setErrMsg("");
      setOkMsg("");
      setSaving(true);

      try {
        const items = filteredProducts.filter((p) => p.category === cat).map((p) => p.id);
        const next = enabled
          ? Array.from(new Set([...allowedIds, ...items]))
          : allowedIds.filter((id) => !items.includes(id));

        await updateDoc(doc(db, "users", sellerUid), {
          allowedProductIds: next,
          allowedProductsUpdatedAt: serverTimestamp(),
        });
        setOkMsg(t("eventPanel.msg.saved"));
      } catch {
        setErrMsg(t("eventPanel.err.saveEvent"));
      } finally {
        setSaving(false);
      }
    },
    [authUser, isAdmin, inactive, sellerUid, filteredProducts, allowedIds, t]
  );

  if (checkingAuth) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (!authUser || adminProfileMissing || !isAdmin || inactive) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("eventPanel.guard.inactive.title")}</h1>
          <p className="text-sm text-neutral-500 mt-2">{t("eventPanel.guard.inactive.desc")}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* HEADER */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
            {t("admin.permissions.products.title")}
          </span>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white truncate max-w-lg">
            {loadingSeller ? "..." : sellerProfile?.name || sellerProfile?.displayName || "Seller"}
          </h1>
          <p className="text-xs font-medium text-neutral-400 leading-tight">
            {t("admin.permissions.products.subtitle")}
          </p>
          <div className="text-[11px] font-mono text-neutral-400 pt-1">
            UID: {sellerUid} • {t("admin.permissions.products.allowedCount")}: <span className="font-bold text-neutral-900 dark:text-white">{allowedIds.length}</span>
          </div>
        </div>

        <Link
          href={`/admin/sellers/${sellerUid}`}
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-5 py-3 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition uppercase tracking-wider"
        >
          {t("common.back")}
        </Link>
      </header>

      {/* FEEDBACK STATUS */}
      {(errMsg || okMsg) && (
        <div className={`rounded-2xl border px-4 py-3.5 text-xs font-black uppercase tracking-wider ${errMsg ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"}`}>
          {errMsg || okMsg}
        </div>
      )}

      {/* FILTROS E LOTE */}
      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">{t("admin.permissions.products.catalogTitle")}</h2>
            <p className="text-xs font-medium text-neutral-400">{t("admin.permissions.products.catalogSubtitle")}</p>
          </div>

          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={t("products.categories.placeholder")}
            className="w-full sm:w-[320px] border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-xs bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="flex items-center gap-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3.5 py-1.5 rounded-xl text-xs font-black tracking-tight shadow-sm">
              <span className="text-neutral-400 uppercase text-[10px] tracking-wider">{cat}</span>
              <div className="flex gap-2 border-l border-neutral-100 dark:border-neutral-800 pl-2">
                <button type="button" disabled={saving} onClick={() => bulkSetCategory(cat, true)} className="text-[11px] font-black underline hover:text-black dark:hover:text-white text-neutral-500 transition disabled:opacity-40">
                  {t("admin.permissions.products.bulkAllow")}
                </button>
                <button type="button" disabled={saving} onClick={() => bulkSetCategory(cat, false)} className="text-[11px] font-black underline text-red-500 transition disabled:opacity-40">
                  {t("admin.permissions.products.bulkDeny")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LISTA GRUPOS */}
      <section className="space-y-8">
        {grouped.map(({ cat, items }) => (
          <div key={cat} className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-900 px-3 py-1 rounded-md">{cat}</h3>
              <span className="text-xs font-bold text-neutral-400">{items.length}</span>
            </div>

            {items.length === 0 ? (
              <p className="text-xs font-bold text-neutral-400 italic py-2 pl-2">{t("admin.permissions.products.emptyCat")}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((p) => {
                  const enabled = allowedIds.includes(p.id);
                  const disabledUI = !sellerUid || !sellerProfile || saving;

                  return (
                    <div key={p.id} className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="h-16 w-20 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-tight">{t("admin.products.seller.noImage")}</span>
                          )}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight truncate">{p.name}</h4>
                          <p className="text-xs font-black text-neutral-900 dark:text-neutral-400">{yen(p.price)}</p>
                          <p className="text-[10px] font-mono text-neutral-400 truncate">ID: {p.id}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-center flex-shrink-0 border-l border-neutral-100 dark:border-neutral-800/60 pl-4 h-12">
                        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={disabledUI}
                            onChange={(e) => togglePermission(p.id, e.target.checked)}
                            className="accent-black dark:accent-white h-4 w-4 rounded-md"
                          />
                          <span>{enabled ? t("admin.permissions.products.allowed") : t("admin.permissions.products.blocked")}</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
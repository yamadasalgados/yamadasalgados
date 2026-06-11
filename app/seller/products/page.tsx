"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
  limit,
  setDoc,
} from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";
import { getApp } from "firebase/app";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

type CategoryId = string;
type ProductStatus = "active" | "inactive";
type PlanId = "starter" | "pro" | "business";
type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  active?: boolean;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  maxProducts?: number;
  suspended?: boolean;
};

type SellerCategoryDoc = {
  id: string;
  ownerUid: string;
  name: string;
  slug: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type ProductDoc = {
  id: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ownerUid: string;
  sellerId: string;
  sellerEmail?: string | null;
  category: CategoryId;
  name: string;
  costPrice: number;
  sellPrice: number;
  quantity: number;
  stockQty: number;
  status: ProductStatus;
  imageUrl: string;
  extraImageUrls?: string[];
};

interface ProductCardProps {
  product: ProductDoc;
  canManage: boolean;
  onEdit: (p: ProductDoc) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, next: ProductStatus) => void;
  badgeLabelActive: string;
  badgeLabelInactive: string;
  btnEdit: string;
  btnDelete: string;
  btnActivate: string;
  btnDeactivate: string;
  yen: (n: number) => string;
  lang: string;
}

interface FormFieldsProps {
  t: (key: string) => string;
  lang: string;
  categories: string[];
  category: string;
  setCategory: (v: string) => void;
  creatingCategory: boolean;
  setCreatingCategory: (v: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  onCreateCategory: () => void;
  sellerHasAnyCategory: boolean;
  name: string;
  setName: (v: string) => void;
  costPrice: string;
  setCostPrice: (v: string) => void;
  sellPrice: string;
  setSellPrice: (v: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  stockQty: string;
  setStockQty: (v: string) => void;
  status: ProductStatus;
  setStatus: (v: ProductStatus) => void;
  existingImageUrl: string;
  existingExtraUrls: string[];
  mainPreview: string;
  extraPreviews: string[];
  onPickMain: (file: File | null) => void;
  onPickExtras: (files: FileList | null) => void;
  removeExistingExtra: (url: string) => void;
  clearSelectedExtras: () => void;
}

// --- 🛠️ Funções Utilitárias Core ---

function toNum(input: any): number {
  const s = String(input ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function safeExtFromType(type: string) {
  const t = String(type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "jpg";
}

async function uploadImageFile(params: { uid: string; productIdLike: string; file: File }): Promise<string> {
  const { uid, productIdLike, file } = params;
  const app = getApp();
  const storage = getStorage(app);
  const ext = safeExtFromType(file.type);
  const ts = Date.now();
  const cleanName = String(file.name || "image")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);

  const path = `sellers/${uid}/products/${productIdLike}/${ts}_${cleanName}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeCategoryLabel(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

// --- 🚀 Componente Principal da Página ---

export default function ProductsCatalogPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const formRef = useRef<HTMLDivElement | null>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const [ownProducts, setOwnProducts] = useState<ProductDoc[]>([]);
  const [sellerCategories, setSellerCategories] = useState<SellerCategoryDoc[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryId>("");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [stockQty, setStockQty] = useState("0");

  const [existingImageUrl, setExistingImageUrl] = useState<string>("");
  const [existingExtraUrls, setExistingExtraUrls] = useState<string[]>([]);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState<string>("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  const inactive = profile?.active === false;
  const maxProducts = Number.isFinite(profile?.maxProducts as any) ? Number(profile?.maxProducts) : 0;
  const plan: PlanId = (profile?.plan as PlanId) || "starter";
  const sellerId = useMemo(() => {
    const fromProfile = typeof profile?.sellerId === "string" ? profile.sellerId.trim() : "";
    return fromProfile || authUser?.uid || "";
  }, [profile?.sellerId, authUser?.uid]);

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  const loadProfile = useCallback(
    async (u: User) => {
      setErrMsg("");
      setSuccessMsg("");
      setProfileMissing(false);

      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists()) {
        setProfileMissing(true);
        return;
      }

      const data = snap.data() as any;
      if (String(data.role || "") !== "seller") {
        router.replace("/");
        return;
      }

      setProfile({
        role: "seller",
        sellerId: typeof data.sellerId === "string" ? data.sellerId : u.uid,
        active: data.active !== false,
        plan: data.plan === "pro" ? "pro" : data.plan === "business" ? "business" : "starter",
        subscriptionStatus: data.subscriptionStatus || "none",
        maxProducts: Number.isFinite(data.maxProducts) ? Number(data.maxProducts) : undefined,
        suspended: data.suspended === true,
      });
    },
    [router]
  );

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser).catch((e: any) => setErrMsg(e?.message || t("guard.err.loadProfile")));
  }, [authUser, loadProfile, t]);

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
    } catch (e: any) {
      setErrMsg(e?.message || t("guard.err.createProfile"));
    } finally {
      setLoading(false);
    }
  }, [authUser, loadProfile, t]);

  const ownCount = ownProducts.length;
  const remaining = useMemo(() => Math.max(0, maxProducts - ownCount), [maxProducts, ownCount]);
  const profileReady = !!profile && !profileMissing;

  useEffect(() => {
    if (!authUser || !sellerId || !profileReady || inactive) return;

    return onSnapshot(
      query(collection(db, "sellers", sellerId, "categories"), orderBy("name", "asc"), limit(500)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerUid: String(data.ownerUid || authUser.uid),
            name: String(data.name || ""),
            slug: String(data.slug || d.id || ""),
          };
        }).filter((c) => c.name);

        setSellerCategories(list);
        if (list.length > 0 && !category) setCategory(list[0].name);
      },
      (err) => console.error(err)
    );
  }, [authUser, sellerId, profileReady, inactive, category]);

  useEffect(() => {
    if (!authUser || !sellerId || !profileReady || inactive) return;

    setListening(true);
    return onSnapshot(
      query(collection(db, "sellers", sellerId, "products"), orderBy("updatedAt", "desc"), limit(500)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            ownerUid: String(data.ownerUid || authUser.uid),
            sellerId: String(data.sellerId || sellerId),
            sellerEmail: data.sellerEmail ?? authUser.email ?? null,
            category: String(data.category || "Sem categoria"),
            name: String(data.name || ""),
            costPrice: Number(data.costPrice ?? data.shadowCost ?? 0),
            sellPrice: Number(data.sellPrice ?? data.price ?? data.shadowSell ?? 0),
            quantity: Number(data.quantity ?? 1),
            stockQty: Number(data.stockQty ?? 0),
            status: (data.status === "inactive" ? "inactive" : "active") as ProductStatus,
            imageUrl: String(data.imageUrl || data.image || ""),
            extraImageUrls: Array.isArray(data.extraImageUrls) ? data.extraImageUrls.filter(Boolean) : [],
          };
        }).filter((p) => p.name);

        setOwnProducts(list);
        setListening(false);
      },
      () => {
        setErrMsg(t("products.err.loadOwn"));
        setListening(false);
      }
    );
  }, [authUser, sellerId, profileReady, inactive, t]);

  const resetImages = () => {
    try {
      if (mainPreview) URL.revokeObjectURL(mainPreview);
      extraPreviews.forEach(URL.revokeObjectURL);
    } catch {}
    setExistingImageUrl("");
    setExistingExtraUrls([]);
    setMainFile(null);
    setMainPreview("");
    setExtraFiles([]);
    setExtraPreviews([]);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCostPrice("");
    setSellPrice("");
    setQuantity("1");
    setStockQty("0");
    setCategory(sellerCategories[0]?.name || "");
    setStatus("active");
    setErrMsg("");
    setSuccessMsg("");
    setCreatingCategory(false);
    setNewCategoryName("");
    resetImages();
  };

  const createSellerCategory = useCallback(
    async (rawName: string) => {
      if (!authUser || !sellerId) return;
      const nameClean = normalizeCategoryLabel(rawName);
      const slug = slugify(nameClean);

      if (!nameClean || !slug) {
        setErrMsg(t("products.categories.err.invalid"));
        return;
      }

      setSaving(true);
      try {
        await setDoc(doc(db, "sellers", sellerId, "categories", slug), {
          ownerUid: authUser.uid,
          name: nameClean,
          slug,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        setCategory(nameClean);
        setSuccessMsg(t("products.categories.msg.created"));
      } catch {
        setErrMsg(t("products.categories.err.create"));
      } finally {
        setSaving(false);
        setCreatingCategory(false);
        setNewCategoryName("");
      }
    },
    [authUser, sellerId, t]
  );

  const handleSave = async () => {
    if (!authUser || !sellerId || inactive) return;

    const cp = costPrice === "" ? 0 : toNum(costPrice);
    const sp = sellPrice === "" ? 0 : toNum(sellPrice);
    const qty = Math.max(1, Math.floor(toNum(quantity)));
    const stock = Math.max(0, Math.floor(toNum(stockQty)));

    if (!name.trim()) return setErrMsg(t("products.err.invalidName"));
    if (Number.isNaN(cp) || cp < 0) return setErrMsg(lang === "ja" ? "無効な原価です。" : lang === "en" ? "Invalid cost price." : "Preço de custo inválido.");
    if (Number.isNaN(sp) || sp <= 0) return setErrMsg(lang === "ja" ? "無効な販売価格です。" : lang === "en" ? "Invalid sale price." : "Preço de venda inválido.");

    const cat = String(category || "").trim();
    if (!cat || cat === "__create__") return setErrMsg(t("products.categories.err.pick"));

    if (!editingId && maxProducts > 0 && ownCount >= maxProducts) {
      return setErrMsg(t("products.err.limitReached").replace("{max}", String(maxProducts)).replace("{plan}", String(plan)));
    }

    setSaving(true);
    try {
      const tempId = editingId || `tmp_${Date.now()}`;
      let nextMainUrl = existingImageUrl;
      let nextExtraUrls = [...existingExtraUrls];

      if (mainFile) {
        setUploading(true);
        nextMainUrl = await uploadImageFile({ uid: authUser.uid, productIdLike: tempId, file: mainFile });
      }

      if (extraFiles.length > 0) {
        setUploading(true);
        const uploadedExtras = [];
        for (const f of extraFiles) {
          uploadedExtras.push(await uploadImageFile({ uid: authUser.uid, productIdLike: tempId, file: f }));
        }
        nextExtraUrls = Array.from(new Set([...nextExtraUrls, ...uploadedExtras]));
      }

      setUploading(false);
      if (!nextMainUrl) return setErrMsg(t("products.select.image"));

      const payload = {
        ownerUid: authUser.uid,
        sellerId,
        sellerEmail: authUser.email ?? null,
        category: cat,
        name: name.trim(),
        costPrice: cp,
        sellPrice: sp,
        shadowCost: cp,
        shadowSell: sp,
        quantity: qty,
        stockQty: stock,
        status,
        imageUrl: nextMainUrl,
        extraImageUrls: nextExtraUrls,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "sellers", sellerId, "products", editingId), payload);
      } else {
        await addDoc(collection(db, "sellers", sellerId, "products"), { ...payload, createdAt: serverTimestamp() });
      }

      resetForm();
      setSuccessMsg(t("products.msg.saved"));
    } catch {
      setErrMsg(t("products.err.save"));
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleEditOwn = (p: ProductDoc) => {
    resetImages();
    setEditingId(p.id);
    setName(p.name);
    setCategory(p.category || sellerCategories[0]?.name || "");
    setStatus(p.status);
    setCostPrice(String(p.costPrice || ""));
    setSellPrice(String(p.sellPrice || ""));
    setQuantity(String(p.quantity || 1));
    setStockQty(String(p.stockQty || 0));
    setExistingImageUrl(p.imageUrl);
    setExistingExtraUrls(p.extraImageUrls || []);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeleteOwn = async (id: string) => {
    if (!confirm(t("products.confirm.delete"))) return;
    try {
      if (!authUser || !sellerId) return;
      await deleteDoc(doc(db, "sellers", sellerId, "products", id));
      setSuccessMsg(t("products.msg.deleted"));
    } catch {
      setErrMsg(t("products.err.delete"));
    }
  };

  const handleToggleStatusOwn = async (id: string, next: ProductStatus) => {
    try {
      if (!authUser || !sellerId) return;
      await updateDoc(doc(db, "sellers", sellerId, "products", id), { status: next, updatedAt: serverTimestamp() });
      setSuccessMsg(next === "active" ? t("products.msg.activated") : t("products.msg.deactivated"));
    } catch {
      setErrMsg(t("products.err.status"));
    }
  };

  const onPickMain = (file: File | null) => {
    try { if (mainPreview) URL.revokeObjectURL(mainPreview); } catch {}
    setMainFile(file);
    setMainPreview(file ? URL.createObjectURL(file) : "");
  };

  const onPickExtras = (files: FileList | null) => {
    try { extraPreviews.forEach(URL.revokeObjectURL); } catch {}
    const arr = files ? Array.from(files) : [];
    setExtraFiles(arr);
    setExtraPreviews(arr.map((f) => URL.createObjectURL(f)));
  };

  const removeExistingExtra = (url: string) => {
    setExistingExtraUrls((prev) => prev.filter((x) => x !== url));
  };

  const clearSelectedExtras = () => {
    try { extraPreviews.forEach(URL.revokeObjectURL); } catch {}
    setExtraFiles([]);
    setExtraPreviews([]);
  };

  const categoriesForSellerSelect = useMemo(() => Array.from(new Set(sellerCategories.map((c) => c.name).filter(Boolean))), [sellerCategories]);
  const categoriesFromProductsOwn = useMemo(() => Array.from(new Set(ownProducts.map((p) => String(p.category || "").trim()).filter(Boolean))).sort(), [ownProducts]);
  const orderedCategoriesForOwnGrid = useMemo(() => [...categoriesForSellerSelect, ...categoriesFromProductsOwn.filter((c) => !categoriesForSellerSelect.includes(c))], [categoriesForSellerSelect, categoriesFromProductsOwn]);

  const groupedOwn = useMemo(() => {
    const used = new Set(orderedCategoriesForOwnGrid);
    const groups = orderedCategoriesForOwnGrid.map((cat) => ({ cat, items: ownProducts.filter((p) => p.category === cat) }));
    const remainingCats = Array.from(new Set(ownProducts.map((p) => String(p.category || "").trim()).filter((c) => c && !used.has(c)))).sort();
    remainingCats.forEach((cat) => groups.push({ cat, items: ownProducts.filter((p) => p.category === cat) }));
    return groups;
  }, [ownProducts, orderedCategoriesForOwnGrid]);

  if (checkingAuth || (authUser && !profile && !profileMissing)) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t("guard.profileMissing.title")}</h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4 mt-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">{t("guard.profileMissing.hint")}</p>
          <button onClick={handleCreateProfileNow} className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-4 shadow-xl text-sm transition-all">
            {loading ? t("common.saving") : t("guard.profileMissing.ctaCreate")}
          </button>
        </div>
      </main>
    );
  }

  if (inactive) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("guard.inactive.title")}</h1>
          <p className="text-sm text-neutral-500 mt-2">{t("guard.inactive.desc")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in">
      <header className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{t("products.title")}</h1>
        <p className="text-xs font-black uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {t("products.planLimitLine")
            .replace("{plan}", String(plan))
            .replace("{max}", String(maxProducts || 0))
            .replace("{used}", String(ownCount))
            .replace("{remain}", String(remaining))}
        </p>
      </header>

      {(errMsg || successMsg) && (
        <div className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 px-4 py-3.5 text-xs font-black uppercase tracking-wider ${errMsg ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"}`}>
          {errMsg || successMsg}
        </div>
      )}

      <section ref={formRef} className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {editingId ? t("products.form.editOwn") : t("products.form.newOwn")}
          </h2>
          {editingId && (
            <button onClick={resetForm} className="rounded-full border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-black text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
              {t("products.form.cancelEdit")}
            </button>
          )}
        </div>

        <FormFields
          t={t}
          lang={lang}
          categories={categoriesForSellerSelect}
          category={category}
          setCategory={setCategory}
          creatingCategory={creatingCategory || categoriesForSellerSelect.length === 0}
          setCreatingCategory={setCreatingCategory}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          onCreateCategory={() => createSellerCategory(newCategoryName)}
          sellerHasAnyCategory={categoriesForSellerSelect.length > 0}
          name={name}
          setName={setName}
          costPrice={costPrice}
          setCostPrice={setCostPrice}
          sellPrice={sellPrice}
          setSellPrice={setSellPrice}
          quantity={quantity}
          setQuantity={setQuantity}
          stockQty={stockQty}
          setStockQty={setStockQty}
          status={status}
          setStatus={setStatus}
          existingImageUrl={existingImageUrl}
          existingExtraUrls={existingExtraUrls}
          mainPreview={mainPreview}
          extraPreviews={extraPreviews}
          onPickMain={onPickMain}
          onPickExtras={onPickExtras}
          removeExistingExtra={removeExistingExtra}
          clearSelectedExtras={clearSelectedExtras}
        />

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <span className="text-xs font-bold text-neutral-400">
            {t("products.limitLine").replace("{used}", String(ownCount)).replace("{max}", String(maxProducts || 0)).replace("{remain}", String(remaining))}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="rounded-2xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-6 py-3.5 hover:opacity-90 shadow-md transition disabled:opacity-40"
          >
            {saving || uploading ? t("common.saving") : editingId ? t("products.form.update") : t("products.form.add")}
          </button>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("products.section.own")}</h2>
          <span className="text-xs font-bold text-neutral-400">{listening ? t("products.updating") : t("products.total").replace("{n}", String(ownProducts.length))}</span>
        </div>

        {ownProducts.length === 0 ? (
          <div className="rounded-[2rem] border border-neutral-200 dark:border-neutral-800 p-8 text-center bg-neutral-50/50 dark:bg-neutral-900/20">
            <p className="text-sm font-black text-neutral-700 dark:text-neutral-300">{t("products.empty.title")}</p>
            <p className="text-xs text-neutral-400 mt-1">{t("products.empty.own")}</p>
          </div>
        ) : (
          groupedOwn.map(({ cat, items }) => items.length > 0 && (
            <div key={cat} className="space-y-4 animate-fade-in">
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400 bg-neutral-100 dark:bg-neutral-900/60 px-3 py-1 rounded-md inline-block">{cat}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    canManage={true}
                    onEdit={handleEditOwn}
                    onDelete={handleDeleteOwn}
                    onToggleStatus={handleToggleStatusOwn}
                    badgeLabelActive={t("products.badge.active")}
                    badgeLabelInactive={t("products.badge.inactive")}
                    btnEdit={t("products.btn.edit")}
                    btnDelete={t("products.btn.delete")}
                    btnActivate={t("products.btn.active") || t("products.btn.activate")}
                    btnDeactivate={t("products.btn.deactivate")}
                    yen={yen}
                    lang={lang}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function ProductCard({
  product,
  canManage,
  onEdit,
  onDelete,
  onToggleStatus,
  badgeLabelActive,
  badgeLabelInactive,
  btnEdit,
  btnDelete,
  btnActivate,
  btnDeactivate,
  yen,
  lang
}: ProductCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const allImages = useMemo(() => [product.imageUrl, ...(product.extraImageUrls || [])].filter(Boolean), [product.imageUrl, product.extraImageUrls]);
  const mainImage = allImages[currentIndex] || "";

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white dark:bg-neutral-900 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 animate-fade-in">
      <div className="w-full bg-neutral-100 dark:bg-neutral-800 relative aspect-[4/3] overflow-hidden group">
        {mainImage ? (
          <img src={mainImage} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400 font-bold">{lang === "ja" ? "画像なし" : lang === "en" ? "No image" : "Sem imagem"}</div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-neutral-200/20 backdrop-blur-md ${product.status === "active" ? "bg-emerald-500 text-white" : "bg-neutral-500 text-white"}`}>
            {product.status === "active" ? badgeLabelActive : badgeLabelInactive}
          </span>
        </div>
      </div>

      {allImages.length > 1 && (
        <div className="flex gap-1.5 px-3 pt-3 overflow-x-auto scrollbar-none">
          {allImages.map((img, idx) => (
            <button
              key={`${product.id}-${idx}`}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-10 w-10 rounded-xl overflow-hidden flex-shrink-0 border-2 transition ${idx === currentIndex ? "border-black dark:border-white scale-95" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              <img src={img} alt="mini" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col gap-2">
        <h4 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight line-clamp-2 min-h-[40px]">{product.name}</h4>
        <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <p className="text-xs font-bold text-neutral-500">{lang === "ja" ? "販売: " : lang === "en" ? "Sale: " : "Venda: "}<span className="text-sm font-black text-neutral-900 dark:text-white">{yen(product.sellPrice)}</span></p>
          <span className={`text-xs font-black ${product.stockQty <= 0 ? "text-red-500" : product.stockQty <= 5 ? "text-amber-500" : "text-emerald-500"}`}>
            {lang === "ja" ? "在庫: " : lang === "en" ? "Stock: " : "Estoque: "}{product.stockQty}
          </span>
        </div>
        <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          {lang === "ja" ? "原価: " : lang === "en" ? "Cost: " : "Custo: "}{yen(product.costPrice)} • {lang === "ja" ? "販売単位: " : lang === "en" ? "Unit/sale: " : "Unid/venda: "}{product.quantity}
        </p>
      </div>

      {canManage && (
        <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-4 border-t border-neutral-100 dark:border-neutral-800/40">
          <button onClick={() => onEdit(product)} className="text-xs font-black text-neutral-900 dark:text-white underline">{btnEdit}</button>
          <button onClick={() => onToggleStatus(product.id, product.status === "active" ? "inactive" : "active")} className="text-xs font-black text-neutral-600 dark:text-neutral-400 underline">
            {product.status === "active" ? btnDeactivate : btnActivate}
          </button>
          <button onClick={() => onDelete(product.id)} className="text-xs font-black text-red-500 underline">{btnDelete}</button>
        </div>
      )}
    </div>
  );
}

function FormFields({
  t,
  lang,
  categories,
  category,
  setCategory,
  creatingCategory,
  setCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  onCreateCategory,
  sellerHasAnyCategory,
  name,
  setName,
  costPrice,
  setCostPrice,
  sellPrice,
  setSellPrice,
  quantity,
  setQuantity,
  stockQty,
  setStockQty,
  status,
  setStatus,
  existingImageUrl,
  existingExtraUrls,
  mainPreview,
  extraPreviews,
  onPickMain,
  onPickExtras,
  removeExistingExtra,
  clearSelectedExtras,
}: FormFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">{t("products.form.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">{t("products.form.category")}</label>
        <select value={creatingCategory ? "__create__" : category} onChange={(e) => e.target.value === "__create__" ? setCreatingCategory(true) : (setCreatingCategory(false), setCategory(e.target.value))} className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white h-[46px]">
          {!sellerHasAnyCategory && <option value="__create__">{t("products.categories.createFirst")}</option>}
          {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
          <option value="__create__">{t("products.categories.createNew")}</option>
        </select>

        {creatingCategory && (
          <div className="mt-2 flex gap-2 animate-fade-in">
            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={t("products.categories.placeholder")} className="flex-1 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" />
            <button type="button" onClick={onCreateCategory} className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-4 py-2">{t("products.categories.btnCreate")}</button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "原価 (¥)" : lang === "en" ? "Cost price (¥)" : "Preço de custo (¥)"}
        </label>
        <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="decimal" className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "販売価格 (¥)" : lang === "en" ? "Sale price (¥)" : "Preço de venda (¥)"}
        </label>
        <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="decimal" className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "販売単位" : lang === "en" ? "Units per sale" : "Unidades por venda"}
        </label>
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "利用可能な総在庫" : lang === "en" ? "Total available stock" : "Estoque total disponível"}
        </label>
        <input value={stockQty} onChange={(e) => setStockQty(e.target.value)} inputMode="numeric" className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" />
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">{t("products.form.status")}</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none h-[46px]">
          <option value="active">{t("products.badge.active")}</option>
          <option value="inactive">{t("products.badge.inactive")}</option>
        </select>
      </div>

      <div className="sm:col-span-2 space-y-3">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "商品のメインメディア" : lang === "en" ? "Main Product Media" : "Mídia Principal do Produto"}
        </label>
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-2xl">
          <div className="h-24 w-32 rounded-xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden border border-neutral-200 dark:border-neutral-700 flex items-center justify-center flex-shrink-0">
            {mainPreview || existingImageUrl ? (
              <img src={mainPreview || existingImageUrl} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">{t("products.select.image")}</span>
            )}
          </div>
          <div className="space-y-1 w-full">
            <input type="file" accept="image/*" onChange={(e) => onPickMain(e.target.files?.[0] || null)} className="text-xs" />
            <p className="text-[10px] font-medium text-neutral-400 leading-tight">{t("products.form.imageHint")}</p>
          </div>
        </div>
      </div>

      <div className="sm:col-span-2 space-y-3">
        <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
          {lang === "ja" ? "追加画像のギャラリー" : lang === "en" ? "Extra Images Gallery" : "Galeria de Imagens Extras"}
        </label>
        <div className="bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
          <input type="file" accept="image/*" multiple onChange={(e) => onPickExtras(e.target.files)} className="text-xs" />
          
          {existingExtraUrls.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                {lang === "ja" ? "現在のメディア (クリックして削除):" : lang === "en" ? "Current Media (Click to remove):" : "Mídias Atuais (Clique para remover):"}
              </p>
              <div className="flex gap-2 flex-wrap">
                {existingExtraUrls.map((u: string) => (
                  <button key={u} type="button" onClick={() => removeExistingExtra(u)} className="h-12 w-12 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:opacity-50 transition">
                    <img src={u} alt="extra" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {extraPreviews.length > 0 && (
            <div className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                  {lang === "ja" ? "アップロードキュー" : lang === "en" ? "Upload Queue" : "Fila de Upload"} ({extraPreviews.length}):
                </p>
                <button type="button" onClick={clearSelectedExtras} className="text-[10px] font-black uppercase text-red-500 underline">{t("common.clear")}</button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {extraPreviews.map((p: string) => (
                  <div key={p} className="h-12 w-12 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    <img src={p} alt="selected" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { Plus } from "lucide-react";

import { auth, db } from "@/app/lib/firebase";
import { normalizeInventory, normalizeProductContent, normalizeProductPriceMajor } from "@/app/lib/product-schema";
import { normalizeProductShipping } from "@/app/lib/shipping-schema";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";
import { formatMoneyMajor } from "@/app/lib/money";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

import ProductModal from "./ProductModal";
import {
  categoryKey,
  mergeCategoryLabels,
  normalizeCategoryLabel,
  slugify,
} from "./product-catalog-utils";
import type {
  PlanId,
  ProductDoc,
  ProductSaveResult,
  ProductStatus,
} from "./product-types";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  active?: boolean;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  maxProducts?: number;
  suspended?: boolean;
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
};

type SellerCategoryDoc = {
  id: string;
  ownerUid: string;
  name: string;
  slug: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

interface ProductCardProps {
  product: ProductDoc;
  canManage: boolean;
  onEdit: (product: ProductDoc) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, next: ProductStatus) => void;
  badgeLabelActive: string;
  badgeLabelInactive: string;
  badgeLabelMadeToOrder: string;
  btnEdit: string;
  btnDelete: string;
  btnActivate: string;
  btnDeactivate: string;
  yen: (value: number) => string;
  lang: string;
}

// --- 🚀 Componente Principal da Página ---

export default function ProductsCatalogPage() {
  const router = useRouter();
  const { t, lang } = useI18n();

  const catalogText = useMemo(
    () =>
      lang === "ja"
        ? {
            subtitle:
              "商品、カテゴリー、価格、在庫を一か所で管理します。",
            statsTotal: "商品数",
            statsActive: "販売中",
            statsOut: "在庫切れ",
            statsCategories: "カテゴリー",
            legacyTitle: "既存カテゴリーを検出しました",
            legacyBody:
              "商品に登録されているカテゴリーを選択欄へ自動的に統合しています。",
            syncCategories: "カテゴリーを同期",
            syncingCategories: "同期中...",
            syncedCategories: "カテゴリーを同期しました。",
            categoryReadWarning:
              "カテゴリー一覧を読み込めませんでしたが、商品に保存済みのカテゴリーは利用できます。",
            catalogTitle: "商品一覧",
            searchPlaceholder: "商品名またはカテゴリーで検索",
            allCategories: "すべてのカテゴリー",
            allStatuses: "すべての状態",
            active: "販売中",
            madeToOrder: "受注生産",
            inactive: "停止中",
            allStock: "すべての在庫",
            inStock: "在庫あり",
            lowStock: "在庫わずか",
            outOfStock: "在庫切れ",
            clearFilters: "フィルター解除",
            noResults: "条件に一致する商品はありません。",
            visibleProducts: "表示中",
          }
        : lang === "en"
          ? {
              subtitle:
                "Manage products, categories, prices, and stock in one place.",
              statsTotal: "Products",
              statsActive: "Active",
              statsOut: "Out of stock",
              statsCategories: "Categories",
              legacyTitle: "Existing categories detected",
              legacyBody:
                "Categories already saved in products are automatically merged into the selector.",
              syncCategories: "Sync categories",
              syncingCategories: "Syncing...",
              syncedCategories: "Categories synchronized.",
              categoryReadWarning:
                "The category collection could not be loaded, but categories saved in products remain available.",
              catalogTitle: "Product catalog",
              searchPlaceholder: "Search by product or category",
              allCategories: "All categories",
              allStatuses: "All statuses",
              active: "Active",
              madeToOrder: "Made to order",
              inactive: "Inactive",
              allStock: "All stock",
              inStock: "In stock",
              lowStock: "Low stock",
              outOfStock: "Out of stock",
              clearFilters: "Clear filters",
              noResults: "No products match the selected filters.",
              visibleProducts: "Showing",
            }
          : {
              subtitle:
                "Gerencie produtos, categorias, preços e estoque em um só lugar.",
              statsTotal: "Produtos",
              statsActive: "Ativos",
              statsOut: "Sem estoque",
              statsCategories: "Categorias",
              legacyTitle: "Categorias existentes detectadas",
              legacyBody:
                "As categorias já salvas nos produtos são incorporadas automaticamente à seleção.",
              syncCategories: "Sincronizar categorias",
              syncingCategories: "Sincronizando...",
              syncedCategories: "Categorias sincronizadas.",
              categoryReadWarning:
                "A coleção de categorias não pôde ser carregada, mas as categorias salvas nos produtos continuam disponíveis.",
              catalogTitle: "Catálogo de produtos",
              searchPlaceholder: "Buscar por produto ou categoria",
              allCategories: "Todas as categorias",
              allStatuses: "Todos os status",
              active: "Ativos",
              madeToOrder: "Sob encomenda",
              inactive: "Inativos",
              allStock: "Todos os estoques",
              inStock: "Com estoque",
              lowStock: "Estoque baixo",
              outOfStock: "Sem estoque",
              clearFilters: "Limpar filtros",
              noResults: "Nenhum produto corresponde aos filtros selecionados.",
              visibleProducts: "Exibindo",
            },
    [lang]
  );

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const [ownProducts, setOwnProducts] = useState<ProductDoc[]>([]);
  const [sellerCategories, setSellerCategories] = useState<SellerCategoryDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "low" | "out">("all");

  const [categoryWarning, setCategoryWarning] = useState("");
  const [syncingCategories, setSyncingCategories] = useState(false);
  const categorySyncRef = useRef("");

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDoc | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const inactive = profile?.active === false;
  const maxProducts = Number.isFinite(profile?.maxProducts as any) ? Number(profile?.maxProducts) : 0;
  const plan: PlanId = (profile?.plan as PlanId) || "starter";
  const sellerId = useMemo(() => {
    const fromProfile = typeof profile?.sellerId === "string" ? profile.sellerId.trim() : "";
    return fromProfile || authUser?.uid || "";
  }, [profile?.sellerId, authUser?.uid]);

  const currency =
    profile?.currency ?? "JPY";
  const locale =
    profile?.regionalLocale ??
    (lang === "pt"
      ? "pt-BR"
      : lang === "en"
        ? "en-US"
        : "ja-JP");

  const yen = useCallback(
    (amount: number) =>
      formatMoneyMajor(
        amount,
        currency,
        locale,
      ),
    [currency, locale],
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

      const result =
        await ensureUserProfile(
          u,
          lang,
        );

      const data =
        result.userDoc as UserDoc;

      if (
        data.role !== "seller" &&
        data.role !== "admin"
      ) {
        router.replace("/");
        return;
      }

      setProfile({
        role:
          data.role === "admin"
            ? "admin"
            : "seller",
        sellerId:
          typeof data.sellerId ===
          "string"
            ? data.sellerId
            : u.uid,
        active:
          data.active !== false,
        plan:
          data.plan === "pro" ||
          data.plan === "business"
            ? data.plan
            : "starter",
        subscriptionStatus:
          data.subscriptionStatus ??
          "none",
        maxProducts:
          Number.isFinite(
            data.maxProducts,
          )
            ? Number(
                data.maxProducts,
              )
            : undefined,
        suspended:
          data.suspended === true,
        currency:
          data.currency ?? "JPY",
        regionalLocale:
          data.regionalLocale ??
          "ja-JP",
      });
    },
    [lang, router],
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
  const canCreateProduct =
    maxProducts <= 0 || ownCount < maxProducts;

  useEffect(() => {
    if (!authUser || !sellerId || !profileReady || inactive) return;

    setCategoryWarning("");

    return onSnapshot(
      query(
        collection(db, "sellers", sellerId, "categories"),
        orderBy("name", "asc"),
        limit(500)
      ),
      (snap) => {
        const list = snap.docs
          .map((categoryDoc) => {
            const data = categoryDoc.data();
            const names = data.names && typeof data.names === "object" ? data.names : {};
            const categoryName = normalizeCategoryLabel(
              names[lang] || names.pt || names.en || names.ja || data.name,
            );

            return {
              id: categoryDoc.id,
              ownerUid: String(data.ownerUid || authUser.uid),
              name: categoryName,
              slug: String(data.slug || categoryDoc.id || ""),
            };
          })
          .filter((item) => item.name);

        setSellerCategories(list);
        setCategoryWarning("");
      },
      (error) => {
        console.error("[ProductsCatalog] Falha ao carregar categorias:", error);
        setSellerCategories([]);
        setCategoryWarning(catalogText.categoryReadWarning);
      }
    );
  }, [
    authUser,
    sellerId,
    profileReady,
    inactive,
    catalogText.categoryReadWarning,
  ]);

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
            schemaVersion: 2 as const,
            categoryId: String(data.categoryId || ""),
            category: String(data.category || "Sem categoria"),
            content: normalizeProductContent(data.content, String(data.name || ""), String(data.description || "")),
            name: String(data.name || ""),
            description: String(data.description || ""),
            priceMinor: Number(data.priceMinor ?? 0),
            costPriceMinor: typeof data.costPriceMinor === "number" ? data.costPriceMinor : null,
            costPrice: Number(data.costPrice ?? data.shadowCost ?? 0),
            sellPrice: normalizeProductPriceMajor(data, currency),
            unitsPerSale: Number(data.unitsPerSale ?? data.quantity ?? 1),
            quantity: Number(data.unitsPerSale ?? data.quantity ?? 1),
            inventory: normalizeInventory(data.inventory, data.stockQty ?? data.stock, data.lowStockThreshold),
            stockQty: normalizeInventory(data.inventory, data.stockQty ?? data.stock, data.lowStockThreshold).quantity,
            lowStockThreshold: normalizeInventory(data.inventory, data.stockQty ?? data.stock, data.lowStockThreshold).lowStockThreshold,
            shipping: normalizeProductShipping(data.shipping, data.postalEligible, data.shippingWeightGrams),
            postalEligible: normalizeProductShipping(data.shipping, data.postalEligible, data.shippingWeightGrams).postalEligible,
            shippingWeightGrams: normalizeProductShipping(data.shipping, data.postalEligible, data.shippingWeightGrams).weightGrams,
            status: (
              data.status === "inactive"
                ? "inactive"
                : data.status === "made_to_order" || data.status === "preorder"
                  ? "made_to_order"
                  : "active"
            ) as ProductStatus,
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
  }, [authUser, sellerId, profileReady, inactive, t, currency]);

  const openCreateProduct = useCallback(() => {
    setSelectedProduct(null);
    setProductModalOpen(true);
    setErrMsg("");
  }, []);

  const openEditProduct = useCallback((product: ProductDoc) => {
    setSelectedProduct(product);
    setProductModalOpen(true);
    setErrMsg("");
  }, []);

  const closeProductModal = useCallback(() => {
    setProductModalOpen(false);
    setSelectedProduct(null);
  }, []);

  const handleProductSaved = useCallback(
    (result: ProductSaveResult) => {
      setOwnProducts((current) => {
        const withoutSaved = current.filter(
          (item) => item.id !== result.product.id,
        );

        return [result.product, ...withoutSaved];
      });

      const message =
        lang === "ja"
          ? result.mode === "created"
            ? "商品を作成しました。"
            : "商品を更新しました。"
          : lang === "en"
            ? result.mode === "created"
              ? "Product created successfully."
              : "Product updated successfully."
            : result.mode === "created"
              ? "Produto criado com sucesso."
              : "Produto atualizado com sucesso.";

      setToastMessage(message);
      setSuccessMsg("");
      setErrMsg("");
    },
    [lang],
  );

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => {
      setToastMessage("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleDeleteOwn = useCallback(
    async (id: string) => {
      if (!window.confirm(t("products.confirm.delete"))) return;

      try {
        if (!authUser || !sellerId) return;
        await deleteDoc(doc(db, "sellers", sellerId, "products", id));
        setSuccessMsg(t("products.msg.deleted"));
        setErrMsg("");
      } catch {
        setErrMsg(t("products.err.delete"));
      }
    },
    [authUser, sellerId, t],
  );

  const handleToggleStatusOwn = useCallback(
    async (id: string, next: ProductStatus) => {
      try {
        if (!authUser || !sellerId) return;
        await updateDoc(doc(db, "sellers", sellerId, "products", id), {
          status: next,
          updatedAt: serverTimestamp(),
        });
        setSuccessMsg(
          next === "active"
            ? t("products.msg.activated")
            : t("products.msg.deactivated"),
        );
        setErrMsg("");
      } catch {
        setErrMsg(t("products.err.status"));
      }
    },
    [authUser, sellerId, t],
  );

  const categoriesFromCollection = useMemo(
    () =>
      mergeCategoryLabels(
        sellerCategories.map((item) => item.name)
      ),
    [sellerCategories]
  );

  const categoriesFromProductsOwn = useMemo(
    () =>
      mergeCategoryLabels(
        ownProducts.map((product) => product.category)
      ),
    [ownProducts]
  );

  /*
   * A seleção não depende apenas da subcoleção categories.
   * Categorias legadas existentes nos documentos de produtos entram
   * automaticamente na lista e depois são sincronizadas em background.
   */
  const categoriesForSellerSelect = useMemo(
    () =>
      mergeCategoryLabels(
        categoriesFromCollection,
        categoriesFromProductsOwn
      ).sort((a, b) => a.localeCompare(b, locale)),
    [
      categoriesFromCollection,
      categoriesFromProductsOwn,
      locale,
    ]
  );

  const missingCategoryNames = useMemo(() => {
    const savedKeys = new Set(
      categoriesFromCollection.map(categoryKey)
    );

    return categoriesFromProductsOwn.filter(
      (name) => !savedKeys.has(categoryKey(name))
    );
  }, [
    categoriesFromCollection,
    categoriesFromProductsOwn,
  ]);

  const syncCategoriesFromProducts = useCallback(
    async (showFeedback = true) => {
      if (
        !authUser ||
        !sellerId ||
        missingCategoryNames.length === 0 ||
        syncingCategories
      ) {
        return;
      }

      setSyncingCategories(true);

      try {
        await Promise.all(
          missingCategoryNames.map((rawName) => {
            const cleanName = normalizeCategoryLabel(rawName);
            const slug = slugify(cleanName);

            return setDoc(
              doc(
                db,
                "sellers",
                sellerId,
                "categories",
                slug
              ),
              {
                ownerUid: authUser.uid,
                name: cleanName,
                slug,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              },
              { merge: true }
            );
          })
        );

        if (showFeedback) {
          setSuccessMsg(catalogText.syncedCategories);
          setErrMsg("");
        }
      } catch (error) {
        console.warn(
          "[ProductsCatalog] Falha ao sincronizar categorias legadas:",
          error
        );

        if (showFeedback) {
          setErrMsg(t("products.categories.err.create"));
        }
      } finally {
        setSyncingCategories(false);
      }
    },
    [
      authUser,
      sellerId,
      missingCategoryNames,
      syncingCategories,
      catalogText.syncedCategories,
      t,
    ]
  );

  useEffect(() => {
    if (
      !sellerId ||
      missingCategoryNames.length === 0
    ) {
      return;
    }

    const syncKey = `${sellerId}:${missingCategoryNames
      .map(categoryKey)
      .sort()
      .join("|")}`;

    if (categorySyncRef.current === syncKey) {
      return;
    }

    categorySyncRef.current = syncKey;
    void syncCategoriesFromProducts(false);
  }, [
    sellerId,
    missingCategoryNames,
    syncCategoriesFromProducts,
  ]);


  const catalogStats = useMemo(
    () => ({
      total: ownProducts.length,
      active: ownProducts.filter(
        (product) =>
          product.status !== "inactive"
      ).length,
      outOfStock: ownProducts.filter(
        (product) =>
          product.status !== "made_to_order" &&
          product.stockQty <= 0
      ).length,
      categories:
        categoriesForSellerSelect.length,
    }),
    [
      ownProducts,
      categoriesForSellerSelect.length,
    ]
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch =
      searchQuery
        .trim()
        .toLocaleLowerCase(locale);

    return ownProducts.filter(
      (product) => {
        if (
          normalizedSearch &&
          ![
            product.name,
            product.category,
          ]
            .join(" ")
            .toLocaleLowerCase(locale)
            .includes(normalizedSearch)
        ) {
          return false;
        }

        if (
          categoryFilter !== "all" &&
          categoryKey(product.category) !==
            categoryKey(categoryFilter)
        ) {
          return false;
        }

        if (
          statusFilter !== "all" &&
          product.status !== statusFilter
        ) {
          return false;
        }

        if (
          stockFilter === "available" &&
          product.status !== "made_to_order" &&
          product.stockQty <= 0
        ) {
          return false;
        }

        if (
          stockFilter === "low" &&
          !(
            product.status !== "made_to_order" &&
            product.stockQty > 0 &&
            product.stockQty <=
              product.lowStockThreshold
          )
        ) {
          return false;
        }

        if (
          stockFilter === "out" &&
          (product.status === "made_to_order" || product.stockQty > 0)
        ) {
          return false;
        }

        return true;
      }
    );
  }, [
    ownProducts,
    searchQuery,
    categoryFilter,
    statusFilter,
    stockFilter,
    locale,
  ]);

  const groupedOwn = useMemo(() => {
    const groups = new Map<
      string,
      ProductDoc[]
    >();

    for (const product of filteredProducts) {
      const categoryName =
        normalizeCategoryLabel(
          product.category
        ) || "Sem categoria";

      const current =
        groups.get(categoryName) ?? [];

      current.push(product);
      groups.set(categoryName, current);
    }

    return Array.from(groups.entries())
      .map(([cat, items]) => ({
        cat,
        items,
      }))
      .sort((a, b) =>
        a.cat.localeCompare(
          b.cat,
          locale
        )
      );
  }, [
    filteredProducts,
    locale,
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    statusFilter !== "all" ||
    stockFilter !== "all";


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
    <main className="min-h-screen bg-neutral-50 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
        <header className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">
                Yamada Seller
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                {t("products.title")}
              </h1>

              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
                {catalogText.subtitle}
              </p>
            </div>

            <div className="w-full space-y-3 sm:max-w-sm">
              <button
                type="button"
                onClick={openCreateProduct}
                disabled={!canCreateProduct}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
              >
                <Plus className="h-5 w-5" />
                {lang === "ja"
                  ? "商品を追加"
                  : lang === "en"
                    ? "Add Product"
                    : "Adicionar Produto"}
              </button>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950/50">
                <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {String(plan).toUpperCase()}
                </span>

                <span className="text-sm font-black">
                  {maxProducts > 0
                    ? `${ownCount}/${maxProducts}`
                    : ownCount}
                </span>
              </div>

              {maxProducts > 0 && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          (ownCount / maxProducts) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}

                <p className="mt-3 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                  {t("products.planLimitLine")
                    .replace("{plan}", String(plan))
                    .replace("{max}", String(maxProducts || 0))
                    .replace("{used}", String(ownCount))
                    .replace("{remain}", String(remaining))}
                </p>
              </div>
            </div>
          </div>
        </header>

        {(errMsg || successMsg) && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3.5 text-sm font-bold ${
              errMsg
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
            }`}
          >
            {errMsg || successMsg}
          </div>
        )}

        {categoryWarning && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            {categoryWarning}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CatalogMetric
            label={catalogText.statsTotal}
            value={catalogStats.total}
            icon="📦"
          />

          <CatalogMetric
            label={catalogText.statsActive}
            value={catalogStats.active}
            icon="✅"
          />

          <CatalogMetric
            label={catalogText.statsOut}
            value={catalogStats.outOfStock}
            icon="⚠️"
            alert={catalogStats.outOfStock > 0}
          />

          <CatalogMetric
            label={catalogText.statsCategories}
            value={catalogStats.categories}
            icon="🗂️"
          />
        </section>

        {missingCategoryNames.length > 0 && (
          <section className="flex flex-col gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-blue-950 dark:text-blue-100">
                {catalogText.legacyTitle}
              </h2>

              <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                {catalogText.legacyBody}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {missingCategoryNames.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-800 shadow-sm dark:bg-blue-950/60 dark:text-blue-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void syncCategoriesFromProducts(true)}
              disabled={syncingCategories}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-200 dark:text-blue-950 dark:hover:bg-blue-100"
            >
              {syncingCategories
                ? catalogText.syncingCategories
                : catalogText.syncCategories}
            </button>
          </section>
        )}

        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">
                {catalogText.catalogTitle}
              </h2>

              <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                {listening
                  ? t("products.updating")
                  : `${catalogText.visibleProducts}: ${filteredProducts.length}/${ownProducts.length}`}
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateProduct}
              disabled={!canCreateProduct}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
            >
              <Plus className="h-4 w-4" />
              {lang === "ja"
                ? "商品を追加"
                : lang === "en"
                  ? "Add Product"
                  : "Adicionar Produto"}
            </button>
          </div>

          <div className="grid gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_180px_180px_auto]">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={catalogText.searchPlaceholder}
              className="min-h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-medium outline-none transition focus:border-black dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
            />

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="all">
                {catalogText.allCategories}
              </option>

              {categoriesForSellerSelect.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "all" | ProductStatus
                )
              }
              className="min-h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="all">
                {catalogText.allStatuses}
              </option>
              <option value="active">
                {catalogText.active}
              </option>
              <option value="made_to_order">
                {catalogText.madeToOrder}
              </option>
              <option value="inactive">
                {catalogText.inactive}
              </option>
            </select>

            <select
              value={stockFilter}
              onChange={(event) =>
                setStockFilter(
                  event.target.value as
                    | "all"
                    | "available"
                    | "low"
                    | "out"
                )
              }
              className="min-h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="all">
                {catalogText.allStock}
              </option>
              <option value="available">
                {catalogText.inStock}
              </option>
              <option value="low">
                {catalogText.lowStock}
              </option>
              <option value="out">
                {catalogText.outOfStock}
              </option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("all");
                setStatusFilter("all");
                setStockFilter("all");
              }}
              disabled={!hasActiveFilters}
              className="min-h-11 rounded-xl border border-neutral-200 px-4 text-sm font-black transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {catalogText.clearFilters}
            </button>
          </div>

          {ownProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
              <p className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                {t("products.empty.title")}
              </p>

              <p className="mt-1 text-xs text-neutral-400">
                {t("products.empty.own")}
              </p>

              <button
                type="button"
                onClick={openCreateProduct}
                disabled={!canCreateProduct}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
              >
                <Plus className="h-4 w-4" />
                {lang === "ja"
                  ? "最初の商品を追加"
                  : lang === "en"
                    ? "Add first product"
                    : "Adicionar primeiro produto"}
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
              <p className="text-sm font-black text-neutral-700 dark:text-neutral-300">
                {catalogText.noResults}
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                  setStockFilter("all");
                }}
                className="mt-4 rounded-xl border border-neutral-200 px-4 py-2 text-xs font-black dark:border-neutral-700"
              >
                {catalogText.clearFilters}
              </button>
            </div>
          ) : (
            groupedOwn.map(({ cat, items }) => (
              <div
                key={cat}
                className="space-y-4 animate-fade-in"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="inline-flex rounded-full bg-neutral-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {cat}
                  </h3>

                  <span className="text-xs font-bold text-neutral-400">
                    {items.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      canManage
                      onEdit={openEditProduct}
                      onDelete={handleDeleteOwn}
                      onToggleStatus={handleToggleStatusOwn}
                      badgeLabelActive={t("products.badge.active")}
                      badgeLabelInactive={t("products.badge.inactive")}
                      badgeLabelMadeToOrder={catalogText.madeToOrder}
                      btnEdit={t("products.btn.edit")}
                      btnDelete={t("products.btn.delete")}
                      btnActivate={
                        t("products.btn.active") ||
                        t("products.btn.activate")
                      }
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
      </div>

      {authUser && sellerId && (
        <ProductModal
          open={productModalOpen}
          product={selectedProduct}
          authUser={authUser}
          sellerId={sellerId}
          categories={categoriesForSellerSelect}
          ownCount={ownCount}
          maxProducts={maxProducts}
          plan={plan}
          currency={currency}
          lang={lang}
          t={t}
          onClose={closeProductModal}
          onSaved={handleProductSaved}
        />
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[90] mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-2xl dark:border-emerald-900/60 dark:bg-neutral-900 dark:text-emerald-300 sm:left-auto sm:right-6"
        >
          {toastMessage}
        </div>
      )}
    </main>
  );
}

function CatalogMetric({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-900 ${
        alert
          ? "border-red-200 dark:border-red-900/50"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xl">{icon}</span>

        <span
          className={`text-2xl font-black ${
            alert
              ? "text-red-600 dark:text-red-300"
              : "text-neutral-950 dark:text-white"
          }`}
        >
          {value}
        </span>
      </div>

      <p className="mt-3 text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
    </div>
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
  badgeLabelMadeToOrder,
  btnEdit,
  btnDelete,
  btnActivate,
  btnDeactivate,
  yen,
  lang,
}: ProductCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const allImages = useMemo(
    () =>
      [
        product.imageUrl,
        ...(product.extraImageUrls || []),
      ].filter(Boolean),
    [
      product.imageUrl,
      product.extraImageUrls,
    ]
  );

  const mainImage =
    allImages[currentIndex] || "";

  const madeToOrder = product.status === "made_to_order";

  const lowStock =
    !madeToOrder &&
    product.stockQty > 0 &&
    product.stockQty <=
      product.lowStockThreshold;

  const stockClass =
    madeToOrder
      ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300"
      : product.stockQty <= 0
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      : lowStock
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300";

  return (
    <article className="flex overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex w-full flex-col">
        <div className="group relative aspect-[4/3] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          {mainImage ? (
            <img
              src={mainImage}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-400">
              {lang === "ja"
                ? "画像なし"
                : lang === "en"
                  ? "No image"
                  : "Sem imagem"}
            </div>
          )}

          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <span
              className={`rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-md ${
                product.status === "active"
                  ? "bg-emerald-600/90"
                  : product.status === "made_to_order"
                    ? "bg-violet-600/90"
                    : "bg-neutral-700/90"
              }`}
            >
              {product.status === "active"
                ? badgeLabelActive
                : product.status === "made_to_order"
                  ? badgeLabelMadeToOrder
                  : badgeLabelInactive}
            </span>

            <span className="max-w-[65%] truncate rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-md">
              {product.category}
            </span>
          </div>
        </div>

        {allImages.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 scrollbar-none">
            {allImages.map(
              (image, index) => (
                <button
                  key={`${product.id}-${index}`}
                  type="button"
                  onClick={() =>
                    setCurrentIndex(index)
                  }
                  className={`h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    index === currentIndex
                      ? "scale-95 border-black dark:border-white"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              )
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h4 className="min-w-0 flex-1 break-words text-sm font-black leading-snug tracking-tight text-neutral-900 dark:text-white">
              {product.name}
            </h4>

            <p className="shrink-0 text-base font-black text-neutral-950 dark:text-white">
              {yen(product.sellPrice)}
            </p>
          </div>

          <div className={`rounded-xl border px-3 py-2 text-xs font-black ${stockClass}`}>
            {madeToOrder
              ? badgeLabelMadeToOrder
              : <>
                  {lang === "ja"
                    ? "在庫: "
                    : lang === "en"
                      ? "Stock: "
                      : "Estoque: "}
                  {product.stockQty}
                </>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
            <div className="rounded-xl bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
              <span className="block text-[9px] uppercase tracking-wider text-neutral-400">
                {lang === "ja"
                  ? "原価"
                  : lang === "en"
                    ? "Cost"
                    : "Custo"}
              </span>

              <span className="mt-1 block text-neutral-800 dark:text-neutral-200">
                {yen(product.costPrice)}
              </span>
            </div>

            <div className="rounded-xl bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
              <span className="block text-[9px] uppercase tracking-wider text-neutral-400">
                {lang === "ja"
                  ? "販売単位"
                  : lang === "en"
                    ? "Units/sale"
                    : "Unid./venda"}
              </span>

              <span className="mt-1 block text-neutral-800 dark:text-neutral-200">
                {product.quantity}
              </span>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="grid grid-cols-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="min-h-11 px-2 text-xs font-black text-neutral-900 transition hover:bg-neutral-50 dark:text-white dark:hover:bg-neutral-800"
            >
              {btnEdit}
            </button>

            <button
              type="button"
              onClick={() =>
                onToggleStatus(
                  product.id,
                  product.status !== "inactive"
                    ? "inactive"
                    : "active"
                )
              }
              className="min-h-11 border-x border-neutral-100 px-2 text-xs font-black text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {product.status !== "inactive"
                ? btnDeactivate
                : btnActivate}
            </button>

            <button
              type="button"
              onClick={() =>
                onDelete(product.id)
              }
              className="min-h-11 px-2 text-xs font-black text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              {btnDelete}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

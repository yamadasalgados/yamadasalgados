"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  X,
} from "lucide-react";

import { db } from "@/app/lib/firebase";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import { majorToMinor, minorToMajor } from "@/app/lib/money";
import {
  emptyProductContent,
  normalizeProductBundleConfig,
  normalizeProductContent,
  normalizeProductStorefrontConfig,
  type ProductContent,
  type ProductLanguage,
} from "@/app/lib/product-schema";
import { normalizeProductShipping } from "@/app/lib/shipping-schema";
import {
  dateTimeLocalToUtcMillis,
  evaluateProductPrice,
  normalizeProductScheduledPriceChange,
  utcMillisToDateTimeLocal,
} from "@/app/lib/scheduled-price";
import {
  MAX_PRODUCTION_LEAD_TIME_DAYS,
  normalizeProductProductionLeadTime,
} from "@/app/lib/production-lead-time";
import type {
  SupportedCurrency,
} from "@/app/types/regional";

import ProductForm from "./ProductForm";
import {
  normalizeCategoryLabel,
  slugify,
  toNum,
  uploadImageFile,
} from "./product-catalog-utils";
import type {
  PlanId,
  ProductDoc,
  ProductFormErrors,
  ProductFormField,
  ProductSaveResult,
  ProductStatus,
} from "./product-types";

type ProductModalProps = {
  open: boolean;
  product: ProductDoc | null;
  authUser: User;
  sellerId: string;
  categories: string[];
  availableProducts: ProductDoc[];
  ownCount: number;
  maxProducts: number;
  plan: PlanId;
  currency: SupportedCurrency;
  timeZone: string;
  lang: string;
  t: (key: string) => string;
  onClose: () => void;
  onSaved: (result: ProductSaveResult) => void;
};

type Snapshot = {
  name: string;
  category: string;
  status: ProductStatus;
  costPrice: string;
  sellPrice: string;
  scheduledPriceEnabled: boolean;
  scheduledPrice: string;
  scheduledPriceStartsAt: string;
  scheduledPriceMessage: string;
  scheduledPriceShowCountdown: boolean;
  quantity: string;
  stockQty: string;
  lowStockThreshold: string;
  inventoryTracked: boolean;
  pickupEligible: boolean;
  localDeliveryEligible: boolean;
  postalEligible: boolean;
  shippingWeightGrams: string;
  productionLeadTimeDays: string;
  content: ProductContent;
  existingImageUrl: string;
  existingExtraUrls: string[];
  newCategoryName: string;
  bundleEnabled: boolean;
  bundleTotalUnits: string;
  bundleOptionProductIds: string[];
  storefrontSubgroup: string;
  storefrontSubgroupOrder: string;
  storefrontProductOrder: string;
};

function buildSnapshot(values: Snapshot): string {
  return JSON.stringify(values);
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export default function ProductModal({
  open,
  product,
  authUser,
  sellerId,
  categories,
  availableProducts,
  ownCount,
  maxProducts,
  plan,
  currency,
  timeZone,
  lang,
  t,
  onClose,
  onSaved,
}: ProductModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const initialSnapshotRef = useRef("");
  const mainPreviewRef = useRef("");
  const extraPreviewsRef = useRef<string[]>([]);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productRef = useRef<ProductDoc | null>(product);
  const categoriesRef = useRef<string[]>(categories);
  const reservedStockRef = useRef(0);


  useEffect(() => {
    productRef.current = product;
    categoriesRef.current = categories;
  }, [categories, product]);

  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [costPrice, setCostPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [scheduledPriceEnabled, setScheduledPriceEnabled] = useState(false);
  const [scheduledPrice, setScheduledPrice] = useState("");
  const [scheduledPriceStartsAt, setScheduledPriceStartsAt] = useState("");
  const [scheduledPriceMessage, setScheduledPriceMessage] = useState("");
  const [scheduledPriceShowCountdown, setScheduledPriceShowCountdown] = useState(true);
  const [quantity, setQuantity] = useState("1");
  const [stockQty, setStockQty] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [inventoryTracked, setInventoryTracked] = useState(true);
  const [pickupEligible, setPickupEligible] = useState(true);
  const [localDeliveryEligible, setLocalDeliveryEligible] = useState(true);
  const [postalEligible, setPostalEligible] = useState(false);
  const [shippingWeightGrams, setShippingWeightGrams] = useState("");
  const [productionLeadTimeDays, setProductionLeadTimeDays] = useState("0");
  const [content, setContent] = useState<ProductContent>(() => emptyProductContent());
  const [bundleEnabled, setBundleEnabled] = useState(false);
  const [bundleTotalUnits, setBundleTotalUnits] = useState("100");
  const [bundleOptionProductIds, setBundleOptionProductIds] = useState<string[]>([]);
  const [storefrontSubgroup, setStorefrontSubgroup] = useState("");
  const [storefrontSubgroupOrder, setStorefrontSubgroupOrder] = useState("");
  const [storefrontProductOrder, setStorefrontProductOrder] = useState("");

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [existingExtraUrls, setExistingExtraUrls] = useState<string[]>([]);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState("");
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);

  const [fieldErrors, setFieldErrors] = useState<ProductFormErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const editing = Boolean(product);
  const busy = saving || uploading || categorySaving;

  const copy = useMemo(
    () =>
      lang === "ja"
        ? {
            newTitle: "新規商品",
            editTitle: "商品を編集",
            close: "閉じる",
            cancel: "キャンセル",
            save: "保存",
            update: "更新",
            saving: "保存中...",
            uploading: "画像をアップロード中...",
            saved: "商品を保存しました。",
            created: "商品を作成しました。",
            updated: "商品を更新しました。",
            unexpected: "商品を保存できませんでした。もう一度お試しください。",
            discard: "保存されていない変更があります。破棄しますか？",
            limit: `このプランでは最大 ${maxProducts} 商品まで登録できます。`,
            invalidCost: "無効な原価です。",
            invalidSale: "無効な販売価格です。",
            invalidScheduledPrice: "改定後の価格は現在価格より高く設定してください。",
            invalidScheduledPriceStartsAt: "有効な適用日時を入力してください。",
            invalidUnits: "販売単位は1以上で入力してください。",
            invalidStock: "在庫数は0以上で入力してください。",
            invalidStockBelowReserved: "予約済み在庫を下回る数量には変更できません。",
            invalidFulfillment: "少なくとも1つの受取方法を選択してください。",
            invalidShippingWeight: "発送重量は1g以上で入力してください。",
            invalidProductionLeadTime: `製造日数は${MAX_PRODUCTION_LEAD_TIME_DAYS}日以内で入力してください。受注生産商品は1日以上必要です。`,
            imageRequired: "メイン画像を選択してください。",
            invalidBundleUnits: "セット数は1以上で入力してください。",
            invalidBundleOptions: "セットに含める商品を2つ以上選択してください。",
            help: "商品情報と画像を入力してください。",
          }
        : lang === "en"
          ? {
              newTitle: "New Product",
              editTitle: "Edit Product",
              close: "Close",
              cancel: "Cancel",
              save: "Save",
              update: "Update",
              saving: "Saving...",
              uploading: "Uploading images...",
              saved: "Product saved.",
              created: "Product created successfully.",
              updated: "Product updated successfully.",
              unexpected: "The product could not be saved. Please try again.",
              discard: "There are unsaved changes. Discard them?",
              limit: `This plan allows up to ${maxProducts} products.`,
              invalidCost: "Invalid cost price.",
              invalidSale: "Invalid sale price.",
              invalidScheduledPrice: "The new price must be higher than the current price.",
              invalidScheduledPriceStartsAt: "Enter a valid effective date and time.",
              invalidUnits: "Units per sale must be at least 1.",
              invalidStock: "Stock must be zero or greater.",
              invalidStockBelowReserved: "Physical stock cannot be lower than the reserved quantity.",
              invalidFulfillment: "Select at least one fulfillment option.",
              invalidShippingWeight: "Shipping weight must be at least 1 gram.",
              invalidProductionLeadTime: `Enter a production lead time between 0 and ${MAX_PRODUCTION_LEAD_TIME_DAYS} days. Made-to-order products require at least 1 day.`,
              imageRequired: "Select a main image.",
              invalidBundleUnits: "Bundle units must be at least 1.",
              invalidBundleOptions: "Select at least two products for this bundle.",
              help: "Fill in the product information and images.",
            }
          : {
              newTitle: "Novo Produto",
              editTitle: "Editar Produto",
              close: "Fechar",
              cancel: "Cancelar",
              save: "Salvar",
              update: "Atualizar",
              saving: "Salvando...",
              uploading: "Enviando imagens...",
              saved: "Produto salvo.",
              created: "Produto criado com sucesso.",
              updated: "Produto atualizado com sucesso.",
              unexpected: "Não foi possível salvar o produto. Tente novamente.",
              discard: "Existem alterações não salvas. Deseja descartá-las?",
              limit: `Este plano permite até ${maxProducts} produtos.`,
              invalidCost: "Preço de custo inválido.",
              invalidSale: "Preço de venda inválido.",
              invalidScheduledPrice: "O novo preço precisa ser maior que o preço atual.",
              invalidScheduledPriceStartsAt: "Informe uma data e hora válidas para a mudança.",
              invalidUnits: "As unidades por venda devem ser pelo menos 1.",
              invalidStock: "O estoque deve ser zero ou maior.",
              invalidStockBelowReserved: "O estoque físico não pode ficar abaixo da quantidade reservada.",
              invalidFulfillment: "Selecione pelo menos uma forma de recebimento.",
              invalidShippingWeight: "O peso para envio deve ser pelo menos 1 grama.",
              invalidProductionLeadTime: `Informe um prazo entre 0 e ${MAX_PRODUCTION_LEAD_TIME_DAYS} dias. Produtos sob encomenda exigem pelo menos 1 dia.`,
              imageRequired: "Selecione uma imagem principal.",
              invalidBundleUnits: "O total do kit deve ser pelo menos 1.",
              invalidBundleOptions: "Selecione pelo menos dois produtos para compor o kit.",
              help: "Preencha as informações e imagens do produto.",
            },
    [lang, maxProducts],
  );

  useEffect(() => {
    mainPreviewRef.current = mainPreview;
    extraPreviewsRef.current = extraPreviews;
  }, [extraPreviews, mainPreview]);

  const revokePreviews = useCallback(() => {
    try {
      if (mainPreviewRef.current) {
        URL.revokeObjectURL(mainPreviewRef.current);
      }
      extraPreviewsRef.current.forEach((preview) =>
        URL.revokeObjectURL(preview),
      );
    } catch {
      // Browser cleanup only.
    }

    mainPreviewRef.current = "";
    extraPreviewsRef.current = [];
  }, []);

  const currentSnapshot = useMemo(
    () =>
      buildSnapshot({
        name,
        category,
        status,
        costPrice,
        sellPrice,
        scheduledPriceEnabled,
        scheduledPrice,
        scheduledPriceStartsAt,
        scheduledPriceMessage,
        scheduledPriceShowCountdown,
        quantity,
        stockQty,
        lowStockThreshold,
        inventoryTracked,
        pickupEligible,
        localDeliveryEligible,
        postalEligible,
        shippingWeightGrams,
        productionLeadTimeDays,
        content,
        existingImageUrl,
        existingExtraUrls,
        newCategoryName,
        bundleEnabled,
        bundleTotalUnits,
        bundleOptionProductIds,
        storefrontSubgroup,
        storefrontSubgroupOrder,
        storefrontProductOrder,
      }),
    [
      category,
      costPrice,
      existingExtraUrls,
      existingImageUrl,
      name,
      newCategoryName,
      quantity,
      sellPrice,
      scheduledPriceEnabled,
      scheduledPrice,
      scheduledPriceStartsAt,
      scheduledPriceMessage,
      scheduledPriceShowCountdown,
      status,
      stockQty,
      lowStockThreshold,
      inventoryTracked,
      pickupEligible,
      localDeliveryEligible,
      postalEligible,
      shippingWeightGrams,
      productionLeadTimeDays,
      content,
      bundleEnabled,
      bundleTotalUnits,
      bundleOptionProductIds,
      storefrontSubgroup,
      storefrontSubgroupOrder,
      storefrontProductOrder,
    ],
  );

  const dirty =
    currentSnapshot !== initialSnapshotRef.current ||
    Boolean(mainFile) ||
    extraFiles.length > 0;

  const clearFieldError = useCallback((field: ProductFormField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const resetForOpen = useCallback(() => {
    revokePreviews();

    const activeProduct = productRef.current;
    const activeCategories = categoriesRef.current;
    const activeInventory = normalizeProductInventory(
      activeProduct?.inventory,
      activeProduct?.stockQty,
      activeProduct?.lowStockThreshold,
    );
    reservedStockRef.current = activeInventory.reserved;
    const nextCategory =
      activeProduct?.category || activeCategories[0] || "";
    const activeBundle = normalizeProductBundleConfig(activeProduct?.bundleConfig);
    const activeStorefront = normalizeProductStorefrontConfig(activeProduct?.storefront);
    const activeScheduledPrice = normalizeProductScheduledPriceChange(
      activeProduct?.scheduledPriceChange,
      currency,
    );
    const activeProductionLeadTime = normalizeProductProductionLeadTime(
      activeProduct?.productionLeadTime,
      activeProduct?.productionLeadTimeDays,
      {
        madeToOrder:
          activeProduct?.status === "made_to_order" || activeBundle.enabled,
      },
    );
    const activeShipping = normalizeProductShipping(
      activeProduct?.shipping,
      activeProduct?.postalEligible,
      activeProduct?.shippingWeightGrams,
      {
        pickup: activeProduct?.pickupEligible,
        localDelivery: activeProduct?.localDeliveryEligible,
        postal: activeProduct?.postalEligible,
      },
    );
    const nextState: Snapshot = {
      name: activeProduct?.name || "",
      category: nextCategory,
      status: activeProduct?.status || "active",
      costPrice:
        activeProduct && activeProduct.costPrice > 0
          ? String(activeProduct.costPrice)
          : "",
      sellPrice:
        activeProduct && (activeProduct.baseSellPrice || activeProduct.sellPrice) > 0
          ? String(activeProduct.baseSellPrice || activeProduct.sellPrice)
          : "",
      scheduledPriceEnabled: activeScheduledPrice.enabled,
      scheduledPrice:
        activeScheduledPrice.nextPriceMinor !== null
          ? String(minorToMajor(activeScheduledPrice.nextPriceMinor, currency))
          : "",
      scheduledPriceStartsAt: utcMillisToDateTimeLocal(
        activeScheduledPrice.startsAtMillis,
        timeZone,
      ),
      scheduledPriceMessage: activeScheduledPrice.message,
      scheduledPriceShowCountdown: activeScheduledPrice.showCountdown,
      quantity: String(activeProduct?.quantity || 1),
      stockQty: String(activeInventory.quantity),
      lowStockThreshold: String(activeInventory.lowStockThreshold),
      inventoryTracked: activeInventory.tracked,
      pickupEligible: activeShipping.fulfillment.pickup,
      localDeliveryEligible: activeShipping.fulfillment.localDelivery,
      postalEligible: activeShipping.fulfillment.postal,
      shippingWeightGrams: String(activeShipping.weightGrams ?? ""),
      productionLeadTimeDays: String(activeProductionLeadTime.days),
      content: normalizeProductContent(activeProduct?.content, activeProduct?.name || "", activeProduct?.description || ""),
      existingImageUrl: activeProduct?.imageUrl || "",
      existingExtraUrls: activeProduct?.extraImageUrls || [],
      newCategoryName: "",
      bundleEnabled: activeBundle.enabled,
      bundleTotalUnits: String(activeBundle.totalUnits || 100),
      bundleOptionProductIds: activeBundle.optionProductIds,
      storefrontSubgroup: activeStorefront.subgroup,
      storefrontSubgroupOrder: activeStorefront.subgroupOrder === null ? "" : String(activeStorefront.subgroupOrder),
      storefrontProductOrder: activeStorefront.productOrder === null ? "" : String(activeStorefront.productOrder),
    };

    setName(nextState.name);
    setCategory(nextState.category);
    setStatus(nextState.status);
    setCostPrice(nextState.costPrice);
    setSellPrice(nextState.sellPrice);
    setScheduledPriceEnabled(nextState.scheduledPriceEnabled);
    setScheduledPrice(nextState.scheduledPrice);
    setScheduledPriceStartsAt(nextState.scheduledPriceStartsAt);
    setScheduledPriceMessage(nextState.scheduledPriceMessage);
    setScheduledPriceShowCountdown(nextState.scheduledPriceShowCountdown);
    setQuantity(nextState.quantity);
    setStockQty(nextState.stockQty);
    setLowStockThreshold(nextState.lowStockThreshold);
    setInventoryTracked(nextState.inventoryTracked);
    setPickupEligible(nextState.pickupEligible);
    setLocalDeliveryEligible(nextState.localDeliveryEligible);
    setPostalEligible(nextState.postalEligible);
    setShippingWeightGrams(nextState.shippingWeightGrams);
    setProductionLeadTimeDays(nextState.productionLeadTimeDays);
    setContent(nextState.content);
    setExistingImageUrl(nextState.existingImageUrl);
    setExistingExtraUrls(nextState.existingExtraUrls);
    setBundleEnabled(nextState.bundleEnabled);
    setBundleTotalUnits(nextState.bundleTotalUnits);
    setBundleOptionProductIds(nextState.bundleOptionProductIds);
    setStorefrontSubgroup(nextState.storefrontSubgroup);
    setStorefrontSubgroupOrder(nextState.storefrontSubgroupOrder);
    setStorefrontProductOrder(nextState.storefrontProductOrder);
    setCreatingCategory(activeCategories.length === 0);
    setNewCategoryName("");
    setMainFile(null);
    setMainPreview("");
    setExtraFiles([]);
    setExtraPreviews([]);
    setFieldErrors({});
    setGeneralError("");
    setSuccessMessage("");
    setSaving(false);
    setUploading(false);
    setCategorySaving(false);

    initialSnapshotRef.current = buildSnapshot(nextState);
  }, [currency, revokePreviews, timeZone]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    productRef.current = product;
    categoriesRef.current = categories;
    resetForOpen();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 40);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, product?.id, resetForOpen]);

  useEffect(() => {
    return () => {
      revokePreviews();
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [revokePreviews]);

  const requestClose = useCallback(() => {
    if (busy) return;

    if (dirty && !window.confirm(copy.discard)) {
      return;
    }

    revokePreviews();
    onClose();
  }, [busy, copy.discard, dirty, onClose, revokePreviews]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = focusableElements(dialogRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const validate = useCallback(() => {
    const errors: ProductFormErrors = {};
    const parsedCost = costPrice === "" ? 0 : toNum(costPrice);
    const parsedSale = sellPrice === "" ? 0 : toNum(sellPrice);
    const parsedScheduledPrice = scheduledPrice === "" ? 0 : toNum(scheduledPrice);
    const parsedScheduledPriceStartsAt = scheduledPriceEnabled
      ? dateTimeLocalToUtcMillis(scheduledPriceStartsAt, timeZone)
      : null;
    const parsedQuantity = toNum(quantity);
    const parsedStock = toNum(stockQty);
    const parsedThreshold = toNum(lowStockThreshold);
    const parsedShippingWeight = shippingWeightGrams.trim() === "" ? null : toNum(shippingWeightGrams);
    const parsedProductionLeadTimeDays = toNum(productionLeadTimeDays);
    const parsedBundleTotalUnits = toNum(bundleTotalUnits);

    const translatedNameExists = Object.values(content).some((entry: ProductContent[ProductLanguage]) => entry.name.trim());
    if (!name.trim() && !translatedNameExists) {
      errors.name = t("products.err.invalidName");
    }

    if (
      creatingCategory ||
      !category.trim() ||
      category === "__create__"
    ) {
      errors.category = t("products.categories.err.pick");
    }

    if (Number.isNaN(parsedCost) || parsedCost < 0) {
      errors.costPrice = copy.invalidCost;
    }

    if (Number.isNaN(parsedSale) || parsedSale <= 0) {
      errors.sellPrice = copy.invalidSale;
    }

    if (scheduledPriceEnabled) {
      if (
        Number.isNaN(parsedScheduledPrice) ||
        parsedScheduledPrice <= parsedSale
      ) {
        errors.scheduledPrice = copy.invalidScheduledPrice;
      }
      if (parsedScheduledPriceStartsAt === null) {
        errors.scheduledPriceStartsAt = copy.invalidScheduledPriceStartsAt;
      }
    }

    if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
      errors.quantity = copy.invalidUnits;
    }

    if (Number.isNaN(parsedStock) || parsedStock < 0) {
      errors.stockQty = copy.invalidStock;
    } else if (
      reservedStockRef.current > 0 &&
      (!inventoryTracked || parsedStock < reservedStockRef.current)
    ) {
      errors.stockQty = `${copy.invalidStockBelowReserved} (${reservedStockRef.current})`;
    }

    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      errors.lowStockThreshold = copy.invalidStock;
    }

    if (!pickupEligible && !localDeliveryEligible && !postalEligible) {
      errors.fulfillmentOptions = copy.invalidFulfillment;
    }

    if (
      postalEligible &&
      parsedShippingWeight !== null &&
      (Number.isNaN(parsedShippingWeight) || parsedShippingWeight < 1)
    ) {
      errors.shippingWeightGrams = copy.invalidShippingWeight;
    }

    const requiresProductionLeadTime = status === "made_to_order" || bundleEnabled;
    if (
      Number.isNaN(parsedProductionLeadTimeDays) ||
      !Number.isInteger(parsedProductionLeadTimeDays) ||
      parsedProductionLeadTimeDays < (requiresProductionLeadTime ? 1 : 0) ||
      parsedProductionLeadTimeDays > MAX_PRODUCTION_LEAD_TIME_DAYS
    ) {
      errors.productionLeadTimeDays = copy.invalidProductionLeadTime;
    }

    if (bundleEnabled) {
      if (Number.isNaN(parsedBundleTotalUnits) || parsedBundleTotalUnits < 1) {
        errors.bundleTotalUnits = copy.invalidBundleUnits;
      }
      const validOptions = bundleOptionProductIds.filter((id) =>
        availableProducts.some(
          (item) =>
            item.id === id &&
            item.id !== product?.id &&
            item.status !== "inactive" &&
            !item.bundleConfig?.enabled,
        ),
      );
      if (validOptions.length < 2) {
        errors.bundleOptions = copy.invalidBundleOptions;
      }
    }

    if (!existingImageUrl && !mainFile) {
      errors.image = copy.imageRequired;
    }

    if (!editing && maxProducts > 0 && ownCount >= maxProducts) {
      setGeneralError(
        t("products.err.limitReached")
          .replace("{max}", String(maxProducts))
          .replace("{plan}", String(plan)),
      );
    } else {
      setGeneralError("");
    }

    setFieldErrors(errors);

    return {
      valid:
        Object.keys(errors).length === 0 &&
        !(!editing && maxProducts > 0 && ownCount >= maxProducts),
      parsedCost,
      parsedSale,
      parsedScheduledPrice,
      parsedScheduledPriceStartsAt,
      parsedQuantity,
      parsedStock,
      parsedThreshold,
      parsedShippingWeight,
      parsedProductionLeadTimeDays,
      parsedBundleTotalUnits,
    };
  }, [
    category,
    copy.imageRequired,
    copy.invalidCost,
    copy.invalidSale,
    copy.invalidScheduledPrice,
    copy.invalidScheduledPriceStartsAt,
    copy.invalidStock,
    copy.invalidStockBelowReserved,
    copy.invalidUnits,
    copy.invalidFulfillment,
    copy.invalidShippingWeight,
    copy.invalidProductionLeadTime,
    copy.invalidBundleUnits,
    copy.invalidBundleOptions,
    costPrice,
    creatingCategory,
    editing,
    existingImageUrl,
    mainFile,
    maxProducts,
    name,
    ownCount,
    plan,
    quantity,
    sellPrice,
    scheduledPriceEnabled,
    scheduledPrice,
    scheduledPriceStartsAt,
    timeZone,
    stockQty,
    lowStockThreshold,
    pickupEligible,
    localDeliveryEligible,
    postalEligible,
    shippingWeightGrams,
    productionLeadTimeDays,
    content,
    bundleEnabled,
    status,
    bundleTotalUnits,
    bundleOptionProductIds,
    availableProducts,
    product?.id,
    t,
  ]);

  const handleCreateCategory = useCallback(async () => {
    if (busy) return;

    const cleanName = normalizeCategoryLabel(newCategoryName);
    const slug = slugify(cleanName);

    if (!cleanName || !slug) {
      setFieldErrors((current) => ({
        ...current,
        category: t("products.categories.err.invalid"),
      }));
      return;
    }

    setCategorySaving(true);
    setGeneralError("");

    try {
      await setDoc(
        doc(db, "sellers", sellerId, "categories", slug),
        {
          ownerUid: authUser.uid,
          name: cleanName,
          slug,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setCategory(cleanName);
      setCreatingCategory(false);
      setNewCategoryName("");
      clearFieldError("category");
    } catch (error) {
      console.error("[ProductModal] create category:", error);
      setGeneralError(t("products.categories.err.create"));
    } finally {
      setCategorySaving(false);
    }
  }, [
    authUser.uid,
    busy,
    clearFieldError,
    newCategoryName,
    sellerId,
    t,
  ]);

  const handleSubmit = useCallback(async () => {
    if (busy) return;

    const validation = validate();
    if (!validation.valid) return;

    const cost = validation.parsedCost;
    const sale = validation.parsedSale;
    const units = Math.floor(validation.parsedQuantity);
    const stock = Math.floor(validation.parsedStock);
    const threshold = Math.floor(validation.parsedThreshold);
    const weightGrams = validation.parsedShippingWeight === null
      ? null
      : Math.max(1, Math.round(validation.parsedShippingWeight));
    const normalizedProductionLeadTime = normalizeProductProductionLeadTime(
      { days: validation.parsedProductionLeadTimeDays },
      validation.parsedProductionLeadTimeDays,
      { madeToOrder: status === "made_to_order" || bundleEnabled },
    );
    const normalizedBundleTotalUnits = Math.max(1, Math.floor(validation.parsedBundleTotalUnits));
    const normalizedBundleOptionIds = Array.from(new Set(bundleOptionProductIds.filter((id) =>
      availableProducts.some(
          (item) =>
            item.id === id &&
            item.id !== product?.id &&
            item.status !== "inactive" &&
            !item.bundleConfig?.enabled,
        ),
    )));
    const normalizedCategory = normalizeCategoryLabel(category);
    const normalizedStorefront = normalizeProductStorefrontConfig({
      subgroup: storefrontSubgroup,
      subgroupOrder: storefrontSubgroupOrder,
      productOrder: storefrontProductOrder,
    });

    setSaving(true);
    setGeneralError("");
    setSuccessMessage("");

    try {
      const productIdLike = product?.id || `tmp_${Date.now()}`;
      let nextMainUrl = existingImageUrl;
      let nextExtraUrls = [...existingExtraUrls];

      if (mainFile) {
        setUploading(true);
        nextMainUrl = await uploadImageFile({
          uid: authUser.uid,
          productIdLike,
          file: mainFile,
        });
      }

      if (extraFiles.length > 0) {
        setUploading(true);
        const uploadedExtras: string[] = [];

        for (const file of extraFiles) {
          uploadedExtras.push(
            await uploadImageFile({
              uid: authUser.uid,
              productIdLike,
              file,
            }),
          );
        }

        nextExtraUrls = Array.from(
          new Set([...nextExtraUrls, ...uploadedExtras]),
        );
      }

      setUploading(false);

      try {
        const categorySlug = slugify(normalizedCategory);
        await setDoc(
          doc(db, "sellers", sellerId, "categories", categorySlug),
          {
            schemaVersion: 2,
            ownerUid: authUser.uid,
            names: { pt: normalizedCategory, en: "", ja: "" },
            name: normalizedCategory,
            slug: categorySlug,
            status: "active",
            sortOrder: 0,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (categoryError) {
        console.warn(
          "[ProductModal] Product saved without category synchronization:",
          categoryError,
        );
      }

      const categoryId = slugify(normalizedCategory);
      const normalizedContent = normalizeProductContent(
        content,
        name.trim(),
        content.pt.shortDescription,
      );
      const preferredLanguage = (lang === "en" || lang === "ja" ? lang : "pt") as ProductLanguage;
      const fallbackName =
        normalizedContent[preferredLanguage].name ||
        normalizedContent.pt.name ||
        normalizedContent.en.name ||
        normalizedContent.ja.name ||
        name.trim();
      const basePriceMinor = majorToMinor(sale, currency);
      const scheduledPriceStartsAtMillis = scheduledPriceEnabled
        ? validation.parsedScheduledPriceStartsAt
        : null;
      const scheduledPriceNextMinor = scheduledPriceEnabled
        ? majorToMinor(validation.parsedScheduledPrice, currency)
        : null;
      const scheduledPricePayload = {
        enabled: scheduledPriceEnabled,
        nextPriceMinor: scheduledPriceNextMinor,
        startsAt:
          scheduledPriceStartsAtMillis === null
            ? null
            : Timestamp.fromMillis(scheduledPriceStartsAtMillis),
        startsAtMillis: scheduledPriceStartsAtMillis,
        message: scheduledPriceMessage.trim().slice(0, 240),
        showCountdown: scheduledPriceShowCountdown,
      };
      const normalizedScheduledPrice = normalizeProductScheduledPriceChange(
        scheduledPricePayload,
        currency,
      );
      const priceEvaluation = evaluateProductPrice({
        basePriceMinor,
        scheduledPriceChange: scheduledPricePayload,
        currency,
      });

      let payload = {
        schemaVersion: 2 as const,
        ownerUid: authUser.uid,
        sellerId,
        sellerEmail: authUser.email ?? null,
        categoryId,
        category: normalizedCategory,
        content: normalizedContent,
        name: fallbackName,
        description:
          normalizedContent[preferredLanguage].shortDescription ||
          normalizedContent.pt.shortDescription ||
          "",
        priceMinor: basePriceMinor,
        scheduledPriceChange: scheduledPricePayload,
        priceScheduleVersion: 1,
        costPriceMinor: majorToMinor(cost, currency),
        unitsPerSale: units,
        inventory: {
          tracked: inventoryTracked,
          quantity: stock,
          reserved: inventoryTracked ? reservedStockRef.current : 0,
          lowStockThreshold: threshold,
        },
        shipping: {
          fulfillment: {
            pickup: pickupEligible,
            localDelivery: localDeliveryEligible,
            postal: postalEligible,
          },
          postalEligible,
          weightGrams,
        },
        fulfillmentOptions: {
          pickup: pickupEligible,
          localDelivery: localDeliveryEligible,
          postal: postalEligible,
        },
        pickupEligible,
        localDeliveryEligible,
        postalEligible,
        shippingWeightGrams: weightGrams,
        productionLeadTime: normalizedProductionLeadTime,
        productionLeadTimeDays: normalizedProductionLeadTime.days,
        costPrice: cost,
        sellPrice: sale,
        shadowCost: cost,
        shadowSell: sale,
        quantity: units,
        stockQty: stock,
        lowStockThreshold: threshold,
        bundleConfig: {
          enabled: bundleEnabled,
          totalUnits: normalizedBundleTotalUnits,
          optionProductIds: bundleEnabled ? normalizedBundleOptionIds : [],
        },
        storefront: normalizedStorefront,
        status: bundleEnabled ? "made_to_order" as const : status,
        imageUrl: nextMainUrl,
        extraImageUrls: nextExtraUrls,
        updatedAt: serverTimestamp(),
      };

      const localTimestamp = Timestamp.now();
      let savedProduct: ProductDoc;
      let mode: ProductSaveResult["mode"];

      if (product) {
        const productReference = doc(
          db,
          "sellers",
          sellerId,
          "products",
          product.id,
        );

        await runTransaction(db, async (transaction) => {
          const currentSnapshot = await transaction.get(productReference);
          if (!currentSnapshot.exists()) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          const currentData = currentSnapshot.data();
          const currentInventory = normalizeProductInventory(
            currentData.inventory,
            currentData.stockQty ?? currentData.stock,
            currentData.lowStockThreshold,
          );

          if (
            inventoryTracked &&
            stock < currentInventory.reserved
          ) {
            throw new Error(
              `STOCK_BELOW_RESERVED:${currentInventory.reserved}`,
            );
          }

          payload = {
            ...payload,
            inventory: {
              tracked: inventoryTracked,
              quantity: stock,
              reserved: inventoryTracked
                ? currentInventory.reserved
                : 0,
              lowStockThreshold: threshold,
            },
          };
          transaction.update(productReference, payload);
        });

        reservedStockRef.current = payload.inventory.reserved;
        mode = "updated";
        savedProduct = {
          ...product,
          ...payload,
          priceMinor: priceEvaluation.effectivePriceMinor,
          basePriceMinor,
          effectivePriceMinor: priceEvaluation.effectivePriceMinor,
          baseSellPrice: sale,
          sellPrice: minorToMajor(priceEvaluation.effectivePriceMinor, currency),
          scheduledPriceChange: normalizedScheduledPrice,
          scheduledPriceStatus: priceEvaluation.status,
          updatedAt: localTimestamp,
        };
      } else {
        const createdReference = await addDoc(
          collection(db, "sellers", sellerId, "products"),
          {
            ...payload,
            createdAt: serverTimestamp(),
          },
        );

        mode = "created";
        savedProduct = {
          id: createdReference.id,
          createdAt: localTimestamp,
          updatedAt: localTimestamp,
          schemaVersion: 2,
          ownerUid: authUser.uid,
          sellerId,
          sellerEmail: authUser.email ?? null,
          categoryId,
          category: normalizedCategory,
          content: normalizedContent,
          name: fallbackName,
          description: payload.description,
          priceMinor: priceEvaluation.effectivePriceMinor,
          basePriceMinor,
          effectivePriceMinor: priceEvaluation.effectivePriceMinor,
          baseSellPrice: sale,
          scheduledPriceChange: normalizedScheduledPrice,
          scheduledPriceStatus: priceEvaluation.status,
          costPriceMinor: payload.costPriceMinor,
          costPrice: cost,
          sellPrice: minorToMajor(priceEvaluation.effectivePriceMinor, currency),
          unitsPerSale: units,
          quantity: units,
          inventory: payload.inventory,
          stockQty: stock,
          lowStockThreshold: threshold,
          shipping: payload.shipping,
          pickupEligible,
          localDeliveryEligible,
          postalEligible,
          shippingWeightGrams: weightGrams,
          productionLeadTime: normalizedProductionLeadTime,
          productionLeadTimeDays: normalizedProductionLeadTime.days,
          bundleConfig: payload.bundleConfig,
          storefront: payload.storefront,
          status: payload.status,
          imageUrl: nextMainUrl,
          extraImageUrls: nextExtraUrls,
        };
      }

      const finalSnapshot = buildSnapshot({
        name: savedProduct.name,
        category: savedProduct.category,
        status: savedProduct.status,
        costPrice: String(savedProduct.costPrice || ""),
        sellPrice: String(savedProduct.baseSellPrice || savedProduct.sellPrice || ""),
        scheduledPriceEnabled: savedProduct.scheduledPriceChange.enabled,
        scheduledPrice:
          savedProduct.scheduledPriceChange.nextPriceMinor !== null
            ? String(minorToMajor(savedProduct.scheduledPriceChange.nextPriceMinor, currency))
            : "",
        scheduledPriceStartsAt: utcMillisToDateTimeLocal(
          savedProduct.scheduledPriceChange.startsAtMillis,
          timeZone,
        ),
        scheduledPriceMessage: savedProduct.scheduledPriceChange.message,
        scheduledPriceShowCountdown: savedProduct.scheduledPriceChange.showCountdown,
        quantity: String(savedProduct.quantity || 1),
        stockQty: String(savedProduct.stockQty || 0),
        lowStockThreshold: String(savedProduct.lowStockThreshold || 0),
        inventoryTracked: savedProduct.inventory.tracked,
        pickupEligible: savedProduct.shipping.fulfillment.pickup,
        localDeliveryEligible: savedProduct.shipping.fulfillment.localDelivery,
        postalEligible: savedProduct.shipping.fulfillment.postal,
        shippingWeightGrams: String(savedProduct.shipping.weightGrams ?? ""),
        productionLeadTimeDays: String(savedProduct.productionLeadTimeDays),
        content: savedProduct.content,
        existingImageUrl: savedProduct.imageUrl,
        existingExtraUrls: savedProduct.extraImageUrls || [],
        newCategoryName: "",
        bundleEnabled: savedProduct.bundleConfig.enabled,
        bundleTotalUnits: String(savedProduct.bundleConfig.totalUnits),
        bundleOptionProductIds: savedProduct.bundleConfig.optionProductIds,
        storefrontSubgroup: savedProduct.storefront.subgroup,
        storefrontSubgroupOrder: savedProduct.storefront.subgroupOrder === null ? "" : String(savedProduct.storefront.subgroupOrder),
        storefrontProductOrder: savedProduct.storefront.productOrder === null ? "" : String(savedProduct.storefront.productOrder),
      });

      initialSnapshotRef.current = finalSnapshot;
      setExistingImageUrl(savedProduct.imageUrl);
      setExistingExtraUrls(savedProduct.extraImageUrls || []);
      setSellPrice(String(savedProduct.baseSellPrice || savedProduct.sellPrice || ""));
      setScheduledPriceEnabled(savedProduct.scheduledPriceChange.enabled);
      setScheduledPrice(
        savedProduct.scheduledPriceChange.nextPriceMinor !== null
          ? String(minorToMajor(savedProduct.scheduledPriceChange.nextPriceMinor, currency))
          : "",
      );
      setScheduledPriceStartsAt(
        utcMillisToDateTimeLocal(
          savedProduct.scheduledPriceChange.startsAtMillis,
          timeZone,
        ),
      );
      setScheduledPriceMessage(savedProduct.scheduledPriceChange.message);
      setScheduledPriceShowCountdown(savedProduct.scheduledPriceChange.showCountdown);
      setPickupEligible(savedProduct.shipping.fulfillment.pickup);
      setLocalDeliveryEligible(savedProduct.shipping.fulfillment.localDelivery);
      setPostalEligible(savedProduct.shipping.fulfillment.postal);
      setProductionLeadTimeDays(String(savedProduct.productionLeadTimeDays));
      setBundleEnabled(savedProduct.bundleConfig.enabled);
      setBundleTotalUnits(String(savedProduct.bundleConfig.totalUnits));
      setBundleOptionProductIds(savedProduct.bundleConfig.optionProductIds);
      setStorefrontSubgroup(savedProduct.storefront.subgroup);
      setStorefrontSubgroupOrder(savedProduct.storefront.subgroupOrder === null ? "" : String(savedProduct.storefront.subgroupOrder));
      setStorefrontProductOrder(savedProduct.storefront.productOrder === null ? "" : String(savedProduct.storefront.productOrder));
      setMainFile(null);
      setExtraFiles([]);
      revokePreviews();
      setMainPreview("");
      setExtraPreviews([]);
      setFieldErrors({});
      setSuccessMessage(mode === "created" ? copy.created : copy.updated);

      onSaved({ mode, product: savedProduct });

      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 650);
    } catch (error) {
      console.error("[ProductModal] save:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("STOCK_BELOW_RESERVED:")) {
        const reserved = message.split(":")[1] || String(reservedStockRef.current);
        reservedStockRef.current = Number(reserved) || reservedStockRef.current;
        setFieldErrors((current) => ({
          ...current,
          stockQty: `${copy.invalidStockBelowReserved} (${reserved})`,
        }));
        setGeneralError(`${copy.invalidStockBelowReserved} (${reserved})`);
      } else {
        setGeneralError(copy.unexpected);
      }
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }, [
    authUser.email,
    authUser.uid,
    busy,
    category,
    content,
    currency,
    copy.created,
    copy.unexpected,
    copy.updated,
    existingExtraUrls,
    existingImageUrl,
    extraFiles,
    inventoryTracked,
    bundleEnabled,
    bundleOptionProductIds,
    availableProducts,
    lang,
    mainFile,
    name,
    onClose,
    onSaved,
    product,
    revokePreviews,
    sellerId,
    status,
    pickupEligible,
    localDeliveryEligible,
    postalEligible,
    productionLeadTimeDays,
    scheduledPriceEnabled,
    scheduledPriceMessage,
    scheduledPriceShowCountdown,
    timeZone,
    storefrontSubgroup,
    storefrontSubgroupOrder,
    storefrontProductOrder,
    validate,
  ]);

  if (!mounted || !open) return null;

  const title = editing ? copy.editTitle : copy.newTitle;
  const saveLabel = uploading
    ? copy.uploading
    : saving
      ? copy.saving
      : editing
        ? copy.update
        : copy.save;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        aria-describedby="product-modal-description"
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-neutral-50 text-neutral-950 shadow-2xl dark:bg-neutral-950 dark:text-white sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-[900px] sm:rounded-[2rem] sm:border sm:border-neutral-200 sm:dark:border-neutral-800"
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
          <div className="min-w-0">
            <h2 id="product-modal-title" className="text-xl font-black tracking-tight sm:text-2xl">
              {title}
            </h2>
            <p id="product-modal-description" className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {copy.help}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label={copy.close}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form
          id="product-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
            <div className="space-y-5">
              {generalError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                >
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{generalError}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <ProductForm
                t={t}
                lang={lang}
                currency={currency}
                disabled={busy || Boolean(successMessage)}
                categorySaving={categorySaving}
                nameInputRef={nameInputRef}
                errors={fieldErrors}
                categories={categories}
                category={category}
                setCategory={(value) => {
                  setCategory(value);
                  clearFieldError("category");
                }}
                creatingCategory={creatingCategory}
                setCreatingCategory={setCreatingCategory}
                newCategoryName={newCategoryName}
                setNewCategoryName={(value) => {
                  setNewCategoryName(value);
                  clearFieldError("category");
                }}
                onCreateCategory={() => void handleCreateCategory()}
                costPrice={costPrice}
                setCostPrice={(value) => {
                  setCostPrice(value);
                  clearFieldError("costPrice");
                }}
                sellPrice={sellPrice}
                setSellPrice={(value) => {
                  setSellPrice(value);
                  clearFieldError("sellPrice");
                  clearFieldError("scheduledPrice");
                }}
                timeZone={timeZone}
                scheduledPriceEnabled={scheduledPriceEnabled}
                setScheduledPriceEnabled={(value) => {
                  setScheduledPriceEnabled(value);
                  clearFieldError("scheduledPrice");
                  clearFieldError("scheduledPriceStartsAt");
                }}
                scheduledPrice={scheduledPrice}
                setScheduledPrice={(value) => {
                  setScheduledPrice(value);
                  clearFieldError("scheduledPrice");
                }}
                scheduledPriceStartsAt={scheduledPriceStartsAt}
                setScheduledPriceStartsAt={(value) => {
                  setScheduledPriceStartsAt(value);
                  clearFieldError("scheduledPriceStartsAt");
                }}
                scheduledPriceMessage={scheduledPriceMessage}
                setScheduledPriceMessage={setScheduledPriceMessage}
                scheduledPriceShowCountdown={scheduledPriceShowCountdown}
                setScheduledPriceShowCountdown={setScheduledPriceShowCountdown}
                quantity={quantity}
                setQuantity={(value) => {
                  setQuantity(value);
                  clearFieldError("quantity");
                }}
                reservedStock={reservedStockRef.current}
                stockQty={stockQty}
                setStockQty={(value) => {
                  setStockQty(value);
                  clearFieldError("stockQty");
                }}
                lowStockThreshold={lowStockThreshold}
                setLowStockThreshold={(value) => {
                  setLowStockThreshold(value);
                  clearFieldError("lowStockThreshold");
                }}
                inventoryTracked={inventoryTracked}
                setInventoryTracked={setInventoryTracked}
                pickupEligible={pickupEligible}
                setPickupEligible={(value) => {
                  setPickupEligible(value);
                  clearFieldError("fulfillmentOptions");
                }}
                localDeliveryEligible={localDeliveryEligible}
                setLocalDeliveryEligible={(value) => {
                  setLocalDeliveryEligible(value);
                  clearFieldError("fulfillmentOptions");
                }}
                postalEligible={postalEligible}
                setPostalEligible={(value) => {
                  setPostalEligible(value);
                  clearFieldError("fulfillmentOptions");
                }}
                shippingWeightGrams={shippingWeightGrams}
                setShippingWeightGrams={(value) => {
                  setShippingWeightGrams(value);
                  clearFieldError("shippingWeightGrams");
                }}
                productionLeadTimeDays={productionLeadTimeDays}
                setProductionLeadTimeDays={(value) => {
                  setProductionLeadTimeDays(value);
                  clearFieldError("productionLeadTimeDays");
                }}
                content={content}
                setContent={setContent}
                legacyName={name}
                setLegacyName={(value) => {
                  setName(value);
                  clearFieldError("name");
                }}
                status={status}
                setStatus={setStatus}
                storefrontSubgroup={storefrontSubgroup}
                setStorefrontSubgroup={setStorefrontSubgroup}
                storefrontSubgroupOrder={storefrontSubgroupOrder}
                setStorefrontSubgroupOrder={setStorefrontSubgroupOrder}
                storefrontProductOrder={storefrontProductOrder}
                setStorefrontProductOrder={setStorefrontProductOrder}
                availableProducts={availableProducts}
                currentProductId={product?.id}
                bundleEnabled={bundleEnabled}
                setBundleEnabled={(value) => {
                  setBundleEnabled(value);
                  if (value) {
                    setStatus("made_to_order");
                    setInventoryTracked(false);
                    if (Number(productionLeadTimeDays || 0) < 1) {
                      setProductionLeadTimeDays("1");
                    }
                  }
                  clearFieldError("productionLeadTimeDays");
                  clearFieldError("bundleTotalUnits");
                  clearFieldError("bundleOptions");
                }}
                bundleTotalUnits={bundleTotalUnits}
                setBundleTotalUnits={(value) => {
                  setBundleTotalUnits(value);
                  clearFieldError("bundleTotalUnits");
                }}
                bundleOptionProductIds={bundleOptionProductIds}
                setBundleOptionProductIds={(value) => {
                  setBundleOptionProductIds(value);
                  clearFieldError("bundleOptions");
                }}
                existingImageUrl={existingImageUrl}
                existingExtraUrls={existingExtraUrls}
                mainPreview={mainPreview}
                extraPreviews={extraPreviews}
                onPickMain={(file) => {
                  try {
                    if (mainPreview) URL.revokeObjectURL(mainPreview);
                  } catch {
                    // Browser cleanup only.
                  }
                  setMainFile(file);
                  setMainPreview(file ? URL.createObjectURL(file) : "");
                  clearFieldError("image");
                }}
                onPickExtras={(files) => {
                  try {
                    extraPreviews.forEach((preview) => URL.revokeObjectURL(preview));
                  } catch {
                    // Browser cleanup only.
                  }
                  const selected = files ? Array.from(files) : [];
                  setExtraFiles(selected);
                  setExtraPreviews(selected.map((file) => URL.createObjectURL(file)));
                }}
                removeExistingExtra={(url) => {
                  setExistingExtraUrls((current) => current.filter((item) => item !== url));
                }}
                clearSelectedExtras={() => {
                  try {
                    extraPreviews.forEach((preview) => URL.revokeObjectURL(preview));
                  } catch {
                    // Browser cleanup only.
                  }
                  setExtraFiles([]);
                  setExtraPreviews([]);
                }}
              />
            </div>
          </div>

          <footer className="sticky bottom-0 z-10 flex shrink-0 flex-col-reverse gap-3 border-t border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs font-bold text-neutral-400">
              {maxProducts > 0
                ? `${ownCount}/${maxProducts} · ${String(plan).toUpperCase()}`
                : `${ownCount} · ${String(plan).toUpperCase()}`}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-5 text-sm font-black transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={busy || Boolean(successMessage)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-black text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveLabel}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}

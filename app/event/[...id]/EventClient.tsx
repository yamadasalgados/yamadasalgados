"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  createPublicOrder,
  getPublicOrderErrorCode,
} from "@/app/lib/public-order-client";
import OpenInBrowserGate from "@/app/_components/OpenInBrowserGate";
import RewardsCheckoutPanel from "@/app/_components/RewardsCheckoutPanel";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import useCustomerRewards from "@/app/hooks/useCustomerRewards";
import { useDocumentBranding } from "@/app/hooks/useDocumentBranding";
import {
  eventDraftKey,
  readLocalDraft,
  readStoredCustomerProfile,
  removeLocalDraft,
  writeLocalDraft,
  writeStoredCustomerProfile,
} from "@/app/lib/customer-storage";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Gift } from "lucide-react";
import {
  evaluateOfferForCart,
  normalizeOffer,
  offerIsCurrentlyActive,
  resolveLocalizedOfferText,
  type OfferDoc,
  type OfferEvaluation,
} from "@/app/lib/offer-schema";
import {
  EMPTY_REWARD_SELECTION,
  evaluateRewardSelection,
  type RewardRedemptionSelection,
} from "@/app/lib/reward-schema";
import {
  formatMoneyMinor,
  legacyMajorValueToMinor,
  minorToMajor,
} from "@/app/lib/money";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import { normalizeSellerOrderSettings } from "@/app/lib/order-settings-schema";
import { fetchPublicSellerProfile } from "@/app/lib/public-seller-client";
import {
  loadPublicEventChat,
  sendPublicEventChatMessage,
} from "@/app/lib/event-chat-client";
import {
  evaluateProductPrice,
  formatScheduledPriceDate,
  scheduledPriceCountdown,
  type ProductScheduledPriceChange,
  type ScheduledPriceStatus,
} from "@/app/lib/scheduled-price";
import {
  compareDateKeys,
  defaultTimeZoneForRegional,
  earliestFulfillmentDate,
  formatDateKey,
  formatLeadTimeDays,
  normalizeProductProductionLeadTime,
  normalizeTimeZone,
} from "@/app/lib/production-lead-time";
import {
  EMPTY_SELLER_IDENTITY,
  normalizeSellerIdentity,
  sellerInitials,
  type SellerIdentity,
} from "@/app/lib/seller-identity";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

type CategoryName = string;
type ProductStatus = "active" | "inactive" | "made_to_order";
type DeliveryMode = "delivery" | "pickup" | "none";
type DateOption = "event-date" | "no-preference";
type TimeOption = "no-preference" | "custom";

type EventData = {
  title: string;
  region: string;
  regionId?: string;
  sellerId: string;
  deliveryDates: string[];
  deliveryDateLabel: string;
  productIds: string[];
  featuredProductIds?: string[];
  offerIds?: string[];
  productNames?: string[];
  featuredProductNames?: string[];
  whatsapp: string;
  messengerId?: string;
  status: string;
  pickupLink?: string;
  pickupNote?: string;
  allowDelivery?: boolean;
  allowPickup?: boolean;
  currency: SupportedCurrency;
  regionalLocale: RegionalLocale;
  defaultLanguage: UiLanguage;
  timeZone: string;
  rewardRecipientMode: "customer" | "event_presenter";
  rewardRecipientUid: string;
  rewardRecipientName: string;
};

type ProductImageData = {
  id: string;
  name: string;
  imageUrl: string;
  extraImageUrls: string[];
  price?: number;
  priceMinor: number;
  basePriceMinor: number;
  scheduledPriceChange: ProductScheduledPriceChange;
  scheduledPriceStatus: ScheduledPriceStatus;
  category?: CategoryName;
  stockQty?: number;
  lowStockThreshold?: number;
  status?: ProductStatus;
  availabilityMode: "normal" | "made_to_order";
  availabilityStatus: "active" | "made_to_order";
  productionMode: "stock" | "made_to_order";
  productionLeadTimeDays: number;
};

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "seller" | "customer";
  createdAt: string;
};

const MAIN_CLASS = "p-4 space-y-6 max-w-3xl mx-auto animate-fade-in";

type UnknownRecord = Record<string, unknown>;
type UiLanguage = "pt" | "en" | "ja";

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSupportedCurrency(
  value: unknown,
  fallback: SupportedCurrency = "JPY",
): SupportedCurrency {
  return value === "BRL" || value === "USD" || value === "JPY"
    ? value
    : fallback;
}

function defaultLocaleForCurrency(
  currency: SupportedCurrency,
): RegionalLocale {
  if (currency === "BRL") return "pt-BR";
  if (currency === "USD") return "en-US";
  return "ja-JP";
}

function normalizeRegionalLocaleValue(
  value: unknown,
  fallback: RegionalLocale,
): RegionalLocale {
  return value === "pt-BR" || value === "en-US" || value === "ja-JP"
    ? value
    : fallback;
}

function normalizeUiLanguage(
  value: unknown,
  fallback: UiLanguage = "pt",
): UiLanguage {
  return value === "pt" || value === "en" || value === "ja"
    ? value
    : fallback;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function pill(active: boolean) {
  return cn(
    "px-4 py-2 rounded-full text-xs font-black tracking-wide border transition-all active:scale-95",
    active
      ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-sm"
      : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800 dark:hover:bg-neutral-800"
  );
}

function eventProductionLeadTimeNotice(
  language: "pt" | "en" | "ja",
  days: number,
): string {
  const leadTime = formatLeadTimeDays(days, language);
  if (language === "ja") return `製造期間：${leadTime}`;
  if (language === "en") return `Production lead time: ${leadTime}`;
  return `Prazo de produção: ${leadTime}`;
}

function eventProductionScheduleNotice(
  language: "pt" | "en" | "ja",
  days: number,
  dateKey: string,
  locale: string,
): string {
  const date = formatDateKey(dateKey, locale);
  const leadTime = formatLeadTimeDays(days, language);
  if (language === "ja") return `製造には最大${leadTime}かかります。最短受取日：${date}`;
  if (language === "en") return `Production may take up to ${leadTime}. Earliest available date: ${date}.`;
  return `A produção pode levar até ${leadTime}. Primeira data disponível: ${date}.`;
}

function eventProductionDateError(
  language: "pt" | "en" | "ja",
  dateKey: string,
  locale: string,
): string {
  const date = formatDateKey(dateKey, locale);
  if (language === "ja") return `選択した日は製造期間より前です。最短受取日は${date}です。`;
  if (language === "en") return `The selected date is earlier than the production lead time. Earliest available date: ${date}.`;
  return `A data escolhida é anterior ao prazo de produção. A primeira data disponível é ${date}.`;
}

function normalizeCategoryDynamic(value: unknown): CategoryName | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  return s ? s : undefined;
}

function mapProductSnapToData(
  snap: any,
  currency: SupportedCurrency,
): Record<string, ProductImageData> {
  const map: Record<string, ProductImageData> = {};

  snap.docs.forEach((d: any) => {
    const docData = d.data() as any;
    const inventory =
      docData.inventory &&
      typeof docData.inventory === "object"
        ? docData.inventory
        : {};
    const tracked =
      typeof inventory.tracked === "boolean"
        ? inventory.tracked
        : true;
    const normalizedInventory = normalizeProductInventory(
      inventory,
      docData.stockQty,
      docData.lowStockThreshold,
    );
    const stockQty = tracked
      ? normalizedInventory.available
      : undefined;
    const lowStockThreshold =
      typeof inventory.lowStockThreshold === "number" &&
      Number.isFinite(inventory.lowStockThreshold)
        ? Math.max(0, Math.floor(inventory.lowStockThreshold))
        : typeof docData.lowStockThreshold === "number" &&
            Number.isFinite(docData.lowStockThreshold)
          ? Math.max(0, Math.floor(docData.lowStockThreshold))
          : undefined;

    const explicitAvailabilityMode =
      docData.availabilityMode === "made_to_order"
        ? "made_to_order"
        : docData.availabilityMode === "normal"
          ? "normal"
          : null;
    const madeToOrder =
      explicitAvailabilityMode === "made_to_order" ||
      (
        explicitAvailabilityMode === null &&
        (
          docData.status === "made_to_order" ||
          docData.availabilityStatus === "made_to_order" ||
          docData.productionMode === "made_to_order"
        )
      );
    const rawStatus: ProductStatus =
      docData.status === "inactive" || docData.enabled === false
        ? "inactive"
        : madeToOrder
          ? "made_to_order"
          : "active";
    const basePriceMinor =
      typeof docData.priceMinor === "number" &&
      Number.isFinite(docData.priceMinor)
        ? Math.max(0, Math.round(docData.priceMinor))
        : legacyMajorValueToMinor(
            docData.price ??
              docData.sellPrice ??
              0,
            currency,
          );
    const priceEvaluation = evaluateProductPrice({
      basePriceMinor,
      scheduledPriceChange: docData.scheduledPriceChange,
      currency,
    });
    const priceMinor = priceEvaluation.effectivePriceMinor;

    map[d.id] = {
      id: d.id,
      name:
        typeof docData.name === "string"
          ? docData.name
          : d.id,
      imageUrl:
        typeof docData.imageUrl === "string"
          ? docData.imageUrl
          : typeof docData.image === "string"
            ? docData.image
            : "",
      extraImageUrls: normalizeStringArray(
        docData.extraImageUrls,
      ),
      price: minorToMajor(
        priceMinor,
        currency,
      ),
      priceMinor,
      basePriceMinor,
      scheduledPriceChange: priceEvaluation.scheduledPriceChange,
      scheduledPriceStatus: priceEvaluation.status,
      category: normalizeCategoryDynamic(
        docData.category,
      ),
      stockQty,
      lowStockThreshold,
      status: rawStatus,
      availabilityMode: madeToOrder ? "made_to_order" : "normal",
      availabilityStatus: madeToOrder
        ? "made_to_order"
        : "active",
      productionMode: madeToOrder
        ? "made_to_order"
        : "stock",
      productionLeadTimeDays: normalizeProductProductionLeadTime(
        docData.productionLeadTime,
        docData.productionLeadTimeDays,
        { madeToOrder },
      ).days,
    };
  });

  return map;
}

async function fetchEventPublishedProducts(
  sellerId: string,
  eventId: string,
  productNames: string[] = [],
  currency: SupportedCurrency,
) {
  const wantedNames = uniq(productNames);
  const result: Record<string, ProductImageData> = {};

  const itemsSnap = await getDocs(
    collection(
      db,
      "sellers",
      sellerId,
      "events",
      eventId,
      "items",
    ),
  );
  Object.assign(
    result,
    mapProductSnapToData(
      itemsSnap,
      currency,
    ),
  );

  const eventProductsSnap = await getDocs(
    collection(
      db,
      "sellers",
      sellerId,
      "events",
      eventId,
      "products",
    ),
  );
  Object.assign(
    result,
    mapProductSnapToData(
      eventProductsSnap,
      currency,
    ),
  );

  // O evento preserva preço e condição comercial, mas o estoque disponível
  // vem sempre do catálogo atual do seller para considerar reservas abertas.
  const catalogSnap = await getDocs(
    query(
      collection(db, "sellers", sellerId, "products"),
      where("status", "in", ["active", "made_to_order"]),
    ),
  );
  catalogSnap.docs.forEach((catalogDoc) => {
    const published = result[catalogDoc.id];
    if (!published) return;
    const data = catalogDoc.data() as Record<string, unknown>;
    const priceEvaluation = evaluateProductPrice({
      basePriceMinor: published.basePriceMinor,
      scheduledPriceChange: data.scheduledPriceChange ?? published.scheduledPriceChange,
      currency,
    });
    published.basePriceMinor = priceEvaluation.basePriceMinor;
    published.priceMinor = priceEvaluation.effectivePriceMinor;
    published.price = minorToMajor(priceEvaluation.effectivePriceMinor, currency);
    published.scheduledPriceChange = priceEvaluation.scheduledPriceChange;
    published.scheduledPriceStatus = priceEvaluation.status;
    const inventory = normalizeProductInventory(
      data.inventory,
      data.stockQty ?? data.stock,
      data.lowStockThreshold,
    );
    published.stockQty = inventory.tracked ? inventory.available : undefined;
    published.lowStockThreshold = inventory.lowStockThreshold;
    published.productionLeadTimeDays = normalizeProductProductionLeadTime(
      data.productionLeadTime,
      data.productionLeadTimeDays,
      { madeToOrder: published.availabilityMode === "made_to_order" },
    ).days;
  });

  wantedNames.forEach((name) => {
    if (!result[name]) {
      result[name] = {
        id: name,
        name,
        imageUrl: "",
        extraImageUrls: [],
        price: 0,
        priceMinor: 0,
        basePriceMinor: 0,
        scheduledPriceChange: {
          enabled: false,
          nextPriceMinor: null,
          startsAtMillis: null,
          message: "",
          showCountdown: true,
        },
        scheduledPriceStatus: "none",
        status: "active",
        availabilityMode: "normal",
        availabilityStatus: "active",
        productionMode: "stock",
        productionLeadTimeDays: 0,
      };
    }
  });

  return result;
}

export default function EventClient({ sellerId, id }: { sellerId: string; id: string }) {

const { t, lang } = useI18n();

const uiLocale =
  lang === "pt"
    ? "pt-BR"
    : lang === "en"
      ? "en-US"
      : "ja-JP";

  const tr = useCallback(
    (key: string, fallback: string) => {
      try {
        const v = t(key as any);
        return !v || v === key ? fallback : v;
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const [event, setEvent] = useState<EventData | null>(null);
  const [sellerIdentity, setSellerIdentity] = useState<SellerIdentity>(
    EMPTY_SELLER_IDENTITY,
  );

  useDocumentBranding({
    title: [event?.title, sellerIdentity.storeName].filter(Boolean).join(" · "),
    themeColor: sellerIdentity.primaryColor,
  });

  const locale = event?.regionalLocale ?? uiLocale;
  const currency = event?.currency ?? "JPY";
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const customerSession = useCustomerSession();
  const customerRewards = useCustomerRewards(sellerId, customerSession.registered);
  const customerId = customerSession.clientId;
  const customerDraftReadyRef = useRef(false);
  const customerDraftKey = useMemo(
    () => eventDraftKey(sellerId, id),
    [id, sellerId],
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const [dateOption, setDateOption] = useState<DateOption>("event-date");
  const [selectedDate, setSelectedDate] = useState("");

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("pickup");
  const [timeOption, setTimeOption] = useState<TimeOption>("no-preference");
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);

  const [locationLink, setLocationLink] = useState("");
  const [gettingLocation, setGettingLocation] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  const [productsData, setProductsData] = useState<Record<string, ProductImageData>>({});

  useEffect(() => {
    const refreshScheduledPrices = () => {
      setProductsData((current) => {
        let changed = false;
        const next: Record<string, ProductImageData> = {};
        for (const [productId, product] of Object.entries(current)) {
          const evaluation = evaluateProductPrice({
            basePriceMinor: product.basePriceMinor,
            scheduledPriceChange: product.scheduledPriceChange,
            currency: event?.currency || "JPY",
          });
          if (
            evaluation.effectivePriceMinor !== product.priceMinor ||
            evaluation.status !== product.scheduledPriceStatus
          ) changed = true;
          next[productId] = {
            ...product,
            price: minorToMajor(evaluation.effectivePriceMinor, event?.currency || "JPY"),
            priceMinor: evaluation.effectivePriceMinor,
            scheduledPriceChange: evaluation.scheduledPriceChange,
            scheduledPriceStatus: evaluation.status,
          };
        }
        return changed ? next : current;
      });
    };
    refreshScheduledPrices();
    const timer = window.setInterval(refreshScheduledPrices, 30_000);
    return () => window.clearInterval(timer);
  }, [event?.currency]);
  const [acceptOrdersWithoutStock, setAcceptOrdersWithoutStock] = useState(true);
  const [offers, setOffers] = useState<OfferDoc[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [activeCategory, setActiveCategory] = useState("__all__");

  const [submitting, setSubmitting] = useState(false);
  const [sentToast, setSentToast] = useState(false);
  const [formError, setFormError] = useState("");
  const formErrorRef = useRef<HTMLDivElement | null>(null);

  const showFormError = useCallback((message: string) => {
    setFormError(message);
    window.requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const [lastOrderId, setLastOrderId] = useState("");
  const [lastChatAccessToken, setLastChatAccessToken] = useState("");
  const [lastCustomerOrderRefId, setLastCustomerOrderRefId] = useState("");
  const [rewardSelection, setRewardSelection] = useState<RewardRedemptionSelection>({ ...EMPTY_REWARD_SELECTION });
  const [lastPointsToEarn, setLastPointsToEarn] = useState(0);
  const [lastPointsAssignedToPresenter, setLastPointsAssignedToPresenter] = useState(0);
  const [lastRewardRecipientName, setLastRewardRecipientName] = useState("");
  const [lastPointsRedeemed, setLastPointsRedeemed] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const orderableIds = useMemo(() => {
    if (!event) return [];
    return uniq([
      ...(event.productIds || []),
      ...(event.productNames || []),
      ...(event.featuredProductIds || []),
      ...(event.featuredProductNames || []),
    ]);
  }, [event]);

  const sortedProductIds = useMemo(() => {
    if (!event) return [];
    return uniq([...(event.productIds || []), ...(event.productNames || [])]).sort((a, b) => {
      const an = (productsData[a]?.name || a).trim();
      const bn = (productsData[b]?.name || b).trim();
      return an.localeCompare(bn, locale);
    });
  }, [event, productsData, locale]);

  const normalProductIds = useMemo(
    () => sortedProductIds.filter((productId) =>
      productsData[productId]?.status !== "inactive" &&
      productsData[productId]?.availabilityMode !== "made_to_order"
    ),
    [productsData, sortedProductIds],
  );

  const madeToOrderProductIds = useMemo(
    () => sortedProductIds.filter((productId) =>
      productsData[productId]?.status !== "inactive" &&
      productsData[productId]?.availabilityMode === "made_to_order"
    ),
    [productsData, sortedProductIds],
  );

  const dynamicCategories = useMemo(() => {
    const set = new Set<string>();
    for (const pid of normalProductIds) {
      const c = productsData[pid]?.category;
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, locale));
  }, [normalProductIds, productsData, locale]);

  const uncategorized = useMemo(
    () => normalProductIds.filter((pid) => !productsData[pid]?.category),
    [normalProductIds, productsData],
  );

  const visibleNormalProductIds = useMemo(() => {
    if (activeCategory === "__all__") return normalProductIds;
    if (activeCategory === "__other__") return uncategorized;
    return normalProductIds.filter((pid) => (productsData[pid]?.category || "") === activeCategory);
  }, [normalProductIds, productsData, activeCategory, uncategorized]);

  const totalItems = useMemo(() => {
    return orderableIds.reduce((sum, pid) => sum + (quantities[pid] || 0), 0);
  }, [orderableIds, quantities]);

  const stockConfirmationItems = useMemo(
    () =>
      acceptOrdersWithoutStock
        ? orderableIds
            .map((productId) => {
              const product = productsData[productId];
              const quantity = quantities[productId] || 0;
              const stock =
                typeof product?.stockQty === "number"
                  ? Math.max(0, Math.floor(product.stockQty))
                  : null;

              if (
                !product ||
                product.availabilityMode === "made_to_order" ||
                stock === null ||
                quantity <= stock
              ) {
                return null;
              }

              return {
                productId,
                name: product.name || productId,
                shortage: quantity - stock,
              };
            })
            .filter(
              (item): item is { productId: string; name: string; shortage: number } =>
                item !== null,
            )
        : [],
    [acceptOrdersWithoutStock, orderableIds, productsData, quantities],
  );

  const productionSchedule = useMemo(() => {
    const requiredProducts = orderableIds
      .map((productId) => {
        const product = productsData[productId];
        const quantity = Math.max(0, Math.floor(quantities[productId] || 0));
        if (!product || quantity <= 0) return null;
        const stock = typeof product.stockQty === "number"
          ? Math.max(0, Math.floor(product.stockQty))
          : null;
        const requiresProduction =
          product.availabilityMode === "made_to_order" ||
          (acceptOrdersWithoutStock && stock !== null && quantity > stock);
        return requiresProduction ? product : null;
      })
      .filter((product): product is ProductImageData => product !== null);
    const maxLeadTimeDays = requiredProducts.reduce(
      (maximum, product) => Math.max(maximum, product.productionLeadTimeDays),
      0,
    );
    const earliestDate = earliestFulfillmentDate({
      timeZone: event?.timeZone || "Asia/Tokyo",
      leadTimeDays: maxLeadTimeDays,
    });
    return {
      required: requiredProducts.length > 0,
      maxLeadTimeDays,
      earliestDate,
      productIds: requiredProducts
        .filter((product) => product.productionLeadTimeDays === maxLeadTimeDays)
        .map((product) => product.id),
    };
  }, [acceptOrdersWithoutStock, event?.timeZone, orderableIds, productsData, quantities]);

  const eligibleDeliveryDates = useMemo(
    () =>
      (event?.deliveryDates || []).filter(
        (date) =>
          !productionSchedule.required ||
          compareDateKeys(date, productionSchedule.earliestDate) >= 0,
      ),
    [event?.deliveryDates, productionSchedule.earliestDate, productionSchedule.required],
  );

  useEffect(() => {
    if (
      dateOption !== "event-date" ||
      !selectedDate ||
      !productionSchedule.required ||
      compareDateKeys(selectedDate, productionSchedule.earliestDate) >= 0
    ) {
      return;
    }
    setSelectedDate(eligibleDeliveryDates[0] || "");
    if (eligibleDeliveryDates.length === 0) setDateOption("no-preference");
  }, [
    dateOption,
    eligibleDeliveryDates,
    productionSchedule.earliestDate,
    productionSchedule.required,
    selectedDate,
  ]);

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  );

  const offerEvaluation = useMemo<OfferEvaluation | null>(() => {
    if (!selectedOffer) return null;

    return evaluateOfferForCart(
      selectedOffer,
      orderableIds.map((productId) => ({
        productId,
        quantity: quantities[productId] || 0,
        priceMinor: productsData[productId]?.priceMinor || 0,
      })),
    );
  }, [orderableIds, productsData, quantities, selectedOffer]);

  const subtotalMinor = useMemo(
    () =>
      orderableIds.reduce((sum, productId) => {
        const quantity = quantities[productId] || 0;
        return sum + quantity * (productsData[productId]?.priceMinor || 0);
      }, 0),
    [orderableIds, productsData, quantities],
  );

  const discountMinor = offerEvaluation?.applicable
    ? offerEvaluation.discountAmountMinor
    : 0;
  const merchandisePayableBeforeRewardsMinor = Math.max(0, subtotalMinor - discountMinor);
  const rewardEvaluation = useMemo(
    () => evaluateRewardSelection({
      selection: rewardSelection,
      walletBalance: customerRewards.wallet?.pointsBalance ?? 0,
      merchandisePayableMinor: merchandisePayableBeforeRewardsMinor,
      currency,
      cartLines: orderableIds
        .map((productId) => ({
          productId,
          name: productsData[productId]?.name || productId,
          quantity: quantities[productId] || 0,
          unitPriceMinor: productsData[productId]?.priceMinor || 0,
        }))
        .filter((line) => line.quantity > 0),
      offerApplied: Boolean(offerEvaluation?.applicable),
    }),
    [
      currency,
      customerRewards.wallet?.pointsBalance,
      merchandisePayableBeforeRewardsMinor,
      offerEvaluation?.applicable,
      orderableIds,
      productsData,
      quantities,
      rewardSelection,
    ],
  );
  const eventPointsAssignedToPresenter =
    event?.rewardRecipientMode === "event_presenter" &&
    Boolean(event.rewardRecipientUid);
  const currentCustomerReceivesEventPoints =
    eventPointsAssignedToPresenter &&
    Boolean(customerSession.user?.uid) &&
    customerSession.user?.uid === event?.rewardRecipientUid;
  const customerVisiblePointsToEarn =
    eventPointsAssignedToPresenter && !currentCustomerReceivesEventPoints
      ? 0
      : rewardEvaluation.pointsToEarn;

  const totalAmountMinor = Math.max(
    0,
    merchandisePayableBeforeRewardsMinor - rewardEvaluation.discountMinor,
  );
  const subtotalAmount = minorToMajor(subtotalMinor, currency);
  const totalAmount = minorToMajor(totalAmountMinor, currency);

  const fmtChatTime = useCallback((value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(locale, {
      timeZone: event?.timeZone || "Asia/Tokyo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }, [event?.timeZone, locale]);

  const resetOrderForm = useCallback(() => {
    setFormError("");
    setQuantities({});
    setNote("");
    setLocationLink("");
    setTimeOption("no-preference");
    setSelectedHour(null);
    setSelectedMinute(null);
    setRewardSelection({ ...EMPTY_REWARD_SELECTION });

    if (eligibleDeliveryDates.length) {
      setDateOption("event-date");
      setSelectedDate(eligibleDeliveryDates[0]);
    } else {
      setDateOption("no-preference");
      setSelectedDate("");
    }

    if (event?.allowPickup !== false) {
      setDeliveryMode("pickup");
    } else if (event?.allowDelivery !== false) {
      setDeliveryMode("delivery");
    } else {
      setDeliveryMode("none");
    }
  }, [eligibleDeliveryDates, event]);

  const showSentToast = useCallback(() => {
    setSentToast(true);
    setTimeout(() => setSentToast(false), 5000);
  }, []);

  const adjustQuantity = useCallback(
    (productId: string, delta: number) => {
      const product = productsData[productId];
      const madeToOrder = product?.availabilityMode === "made_to_order";
      const availableStock =
        typeof product?.stockQty === "number"
          ? Math.max(0, Math.floor(product.stockQty))
          : null;

      setQuantities((prev) => {
        const current = prev[productId] || 0;
        const requested = Math.max(0, current + delta);
        const next =
          acceptOrdersWithoutStock || madeToOrder || availableStock === null
            ? requested
            : Math.min(requested, availableStock);

        if (next === current) return prev;
        return { ...prev, [productId]: next };
      });
    },
    [acceptOrdersWithoutStock, productsData],
  );

  const handleGetLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      alert(tr("event.location.unsupported", "Seu navegador não suporta geolocalização."));
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationLink(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
        setGettingLocation(false);
      },
      () => {
        alert(tr("event.location.error", "Não foi possível obter sua localização."));
        setGettingLocation(false);
      }
    );
  }, [tr]);

  const getChosenDate = useCallback(() => {
    if (!event) return "";
    if (dateOption === "event-date" && selectedDate) return selectedDate;
    return tr("event.common.to_be_arranged", "A combinar");
  }, [event, dateOption, selectedDate, tr]);

  const getChosenTimeLabel = useCallback(() => {
    if (timeOption === "no-preference" || selectedHour == null || selectedMinute == null) {
      return tr("event.common.to_be_arranged", "A combinar");
    }

    return `${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`;
  }, [timeOption, selectedHour, selectedMinute, tr]);

  const getDeliveryModeLabel = useCallback(
    (mode: DeliveryMode) => {
      if (mode === "pickup") return tr("event.delivery.pickup", "Retirada no local");
      if (mode === "delivery") return tr("event.delivery.delivery", "Entrega");
      return tr("event.common.to_be_arranged", "A combinar");
    },
    [tr]
  );

  useEffect(() => {
    if (!event) return;

    customerDraftReadyRef.current = false;
    const storedProfile = readStoredCustomerProfile();
    const draft = readLocalDraft<{
      customerName?: string;
      customerPhone?: string;
      note?: string;
      quantities?: Record<string, number>;
      dateOption?: DateOption;
      selectedDate?: string;
      deliveryMode?: DeliveryMode;
      timeOption?: TimeOption;
      selectedHour?: number | null;
      selectedMinute?: number | null;
      locationLink?: string;
      selectedOfferId?: string;
    }>(customerDraftKey);

    setCustomerName(draft?.customerName || storedProfile.name || "");
    setCustomerPhone(draft?.customerPhone || storedProfile.phone || "");
    if (typeof draft?.note === "string") setNote(draft.note);
    if (draft?.quantities && typeof draft.quantities === "object") {
      setQuantities(draft.quantities);
    }
    if (draft?.dateOption === "event-date" || draft?.dateOption === "no-preference") {
      setDateOption(draft.dateOption);
    }
    if (typeof draft?.selectedDate === "string") setSelectedDate(draft.selectedDate);
    if (draft?.deliveryMode === "pickup" || draft?.deliveryMode === "delivery" || draft?.deliveryMode === "none") {
      setDeliveryMode(draft.deliveryMode);
    }
    if (draft?.timeOption === "custom" || draft?.timeOption === "no-preference") {
      setTimeOption(draft.timeOption);
    }
    if (typeof draft?.selectedHour === "number" || draft?.selectedHour === null) {
      setSelectedHour(draft.selectedHour ?? null);
    }
    if (typeof draft?.selectedMinute === "number" || draft?.selectedMinute === null) {
      setSelectedMinute(draft.selectedMinute ?? null);
    }
    if (typeof draft?.locationLink === "string" && draft.locationLink) {
      setLocationLink(draft.locationLink);
    } else if (storedProfile.address.locationLink) {
      setLocationLink(storedProfile.address.locationLink);
    }
    if (typeof draft?.selectedOfferId === "string") setSelectedOfferId(draft.selectedOfferId);

    customerDraftReadyRef.current = true;
  }, [customerDraftKey, event]);

  useEffect(() => {
    const profile = customerSession.profile;
    if (!profile) return;
    setCustomerName((current) => current || profile.name);
    setCustomerPhone((current) => current || profile.phone);
    setLocationLink((current) => current || profile.address.locationLink);
  }, [customerSession.profile]);

  useEffect(() => {
    if (!customerDraftReadyRef.current) return;

    const timer = window.setTimeout(() => {
      writeStoredCustomerProfile({
        name: customerName,
        phone: customerPhone,
        email: customerSession.profile?.email || "",
        address: {
          ...(customerSession.profile?.address || readStoredCustomerProfile().address),
          locationLink,
        },
      });
      writeLocalDraft(customerDraftKey, {
        customerName,
        customerPhone,
        note,
        quantities,
        dateOption,
        selectedDate,
        deliveryMode,
        timeOption,
        selectedHour,
        selectedMinute,
        locationLink,
        selectedOfferId,
        updatedAt: Date.now(),
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    customerDraftKey,
    customerName,
    customerPhone,
    customerSession.profile?.email,
    dateOption,
    deliveryMode,
    locationLink,
    note,
    quantities,
    selectedDate,
    selectedHour,
    selectedMinute,
    selectedOfferId,
    timeOption,
  ]);

  useEffect(() => {
    if (!event || Object.keys(productsData).length === 0) return;

    setQuantities((current) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const [productId, rawQuantity] of Object.entries(current)) {
        const product = productsData[productId];
        if (!product || product.status === "inactive" || !orderableIds.includes(productId)) {
          changed = true;
          continue;
        }

        const quantity = Math.max(0, Math.floor(Number(rawQuantity) || 0));
        const safeQuantity =
          acceptOrdersWithoutStock ||
          product.availabilityMode === "made_to_order" ||
          typeof product.stockQty !== "number"
            ? quantity
            : Math.min(quantity, Math.max(0, Math.floor(product.stockQty)));

        if (safeQuantity > 0) next[productId] = safeQuantity;
        if (safeQuantity !== rawQuantity) changed = true;
      }

      return changed ? next : current;
    });
  }, [acceptOrdersWithoutStock, event, orderableIds, productsData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!sellerId || !id) return;

    let alive = true;

    const loadEvent = async () => {
      try {
        setLoading(true);
        setNotFound(false);

        const snap = await getDoc(
          doc(db, "sellers", sellerId, "events", id),
        );

        if (!alive) return;

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const data = asRecord(snap.data());
        const sellerData = await fetchPublicSellerProfile(sellerId);

        if (!alive) return;

        setSellerIdentity(normalizeSellerIdentity(sellerData));

        const sellerOrderSettings = asRecord(sellerData.orderSettings);
        setAcceptOrdersWithoutStock(
          normalizeSellerOrderSettings(
            sellerData.orderSettings,
            sellerOrderSettings.acceptOrdersWithoutStock,
          ).acceptOrdersWithoutStock,
        );

        const sellerRegional = asRecord(sellerData.regional);
        const sellerCurrency = normalizeSupportedCurrency(
          sellerRegional.currency,
          "JPY",
        );
        const sellerLocale = normalizeRegionalLocaleValue(
          sellerRegional.locale,
          defaultLocaleForCurrency(sellerCurrency),
        );
        const eventCurrency = normalizeSupportedCurrency(
          data.currency,
          sellerCurrency,
        );
        const eventLocale = normalizeRegionalLocaleValue(
          data.regionalLocale,
          sellerLocale,
        );
        const sellerLanguage = normalizeUiLanguage(
          sellerData.storefrontLanguage,
          "pt",
        );
        const eventDefaultLanguage = normalizeUiLanguage(
          data.defaultLanguage,
          sellerLanguage,
        );
        const operatingCountry =
          asTrimmedString(data.operatingCountry) ||
          asTrimmedString(sellerRegional.operatingCountry);
        const eventTimeZone = normalizeTimeZone(
          asTrimmedString(data.timeZone) ||
            asTrimmedString(sellerRegional.timeZone),
          defaultTimeZoneForRegional(
            eventLocale,
            eventCurrency,
            operatingCountry,
          ),
        );
        const storedSellerId = asTrimmedString(data.sellerId);

        // O caminho é a fonte de verdade. Um sellerId divergente no
        // documento indica dado inconsistente e não deve ser aceito.
        if (storedSellerId && storedSellerId !== sellerId) {
          console.error(
            "[EventClient] Event/seller mismatch",
            { sellerId, storedSellerId, eventId: id },
          );
          setNotFound(true);
          return;
        }

        const deliveryDates = normalizeStringArray(data.deliveryDates);
        const rawRewardAssignment =
          data.rewardAssignment && typeof data.rewardAssignment === "object"
            ? (data.rewardAssignment as Record<string, unknown>)
            : {};
        const rewardRecipientMode =
          rawRewardAssignment.mode === "event_presenter"
            ? "event_presenter"
            : "customer";

        let deliveryDateLabel = String(data.deliveryDateLabel || data.deliveryDate || "");

        if (!deliveryDateLabel) {
          deliveryDateLabel =
            deliveryDates.length > 0
              ? deliveryDates.join(" • ")
              : tr("event.date.undefined", "Data a definir");
        }

        const nextEvent: EventData = {
          title: String(data.title || data.name || ""),
          region: String(data.region || data.regionName || ""),
          sellerId,
          regionId: String(data.regionId || ""),
          deliveryDates,
          deliveryDateLabel,
          productIds: normalizeStringArray(data.productIds),
          featuredProductIds: normalizeStringArray(data.featuredProductIds),
          productNames: normalizeStringArray(data.productNames),
          featuredProductNames: normalizeStringArray(data.featuredProductNames),
          whatsapp: String(data.whatsapp || ""),
          messengerId: String(data.messengerId || data.messenger || ""),
          status: String(data.status || "active"),
          pickupLink: String(data.pickupLink || data.pickupUrl || ""),
          pickupNote: String(data.pickupNote || ""),
          allowDelivery: data.allowDelivery !== false,
          allowPickup: data.allowPickup !== false,
          offerIds: normalizeStringArray(data.offerIds),
          currency: eventCurrency,
          regionalLocale: eventLocale,
          defaultLanguage: eventDefaultLanguage,
          timeZone: eventTimeZone,
          rewardRecipientMode,
          rewardRecipientUid:
            rewardRecipientMode === "event_presenter"
              ? String(rawRewardAssignment.recipientUid || "").trim()
              : "",
          rewardRecipientName:
            rewardRecipientMode === "event_presenter"
              ? String(rawRewardAssignment.recipientName || "").trim()
              : "",
        };

        setEvent(nextEvent);

        try {
          const eventProductNames = uniq([
            ...(nextEvent.productNames || []),
            ...(nextEvent.featuredProductNames || []),
          ]);

          const productsMap = await fetchEventPublishedProducts(
            sellerId,
            id,
            eventProductNames,
            nextEvent.currency,
          );
          setProductsData(productsMap);

          const offerSnapshot = await getDocs(
            collection(db, "sellers", sellerId, "events", id, "offers"),
          );
          const allowedOfferIds = new Set(nextEvent.offerIds || []);
          const eventOffers = offerSnapshot.docs
            .map((document) =>
              normalizeOffer(
                document.id,
                document.data(),
                nextEvent.currency,
              ),
            )
            .filter(
              (offer): offer is OfferDoc =>
                offer !== null &&
                offerIsCurrentlyActive(offer) &&
                (allowedOfferIds.size === 0 || allowedOfferIds.has(offer.id)),
            );
          setOffers(eventOffers);
          setSelectedOfferId((current) =>
            eventOffers.some((offer) => offer.id === current)
              ? current
              : "",
          );
        } catch (productErr) {
          console.error("[EventClient] Evento abriu, mas erro ao carregar produtos:", productErr);
          setProductsData({});
        }

        if (nextEvent.allowPickup !== false) {
          setDeliveryMode("pickup");
        } else if (nextEvent.allowDelivery !== false) {
          setDeliveryMode("delivery");
        } else {
          setDeliveryMode("none");
        }

        if (nextEvent.deliveryDates.length > 0) {
          setDateOption("event-date");
          setSelectedDate(nextEvent.deliveryDates[0]);
        }
      } catch (err) {
        console.error("[EventClient] ERRO REAL AO CARREGAR EVENTO:", err);
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadEvent();

    return () => {
      alive = false;
    };
  }, [sellerId, id, tr]);

  useEffect(() => {
    if (!sellerId || !id || !lastOrderId || !lastChatAccessToken) return;

    let active = true;
    let controller: AbortController | null = null;

    const refreshChat = async (initial = false) => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      if (initial) setChatLoading(true);

      try {
        const nextMessages = await loadPublicEventChat(
          {
            sellerId,
            eventId: id,
            orderId: lastOrderId,
            token: lastChatAccessToken,
          },
          currentController.signal,
        );
        if (!active) return;
        setMessages(nextMessages);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      } catch (error) {
        if (!active || currentController.signal.aborted) return;
        console.error("[EventClient] Chat load error:", error);
      } finally {
        if (active && initial) setChatLoading(false);
      }
    };

    void refreshChat(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshChat(false);
    }, 4_000);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [sellerId, id, lastOrderId, lastChatAccessToken]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!event) return false;
    if (String(event.status || "active") !== "active") return false;
    if (!customerName.trim()) return false;
    if (!customerPhone.trim()) return false;
    if (totalItems <= 0 || totalAmount < 0) return false;
    if (!deliveryMode) return false;
    if (event.deliveryDates.length > 0 && dateOption === "event-date" && !selectedDate) return false;
    if (
      productionSchedule.required &&
      dateOption === "event-date" &&
      compareDateKeys(selectedDate, productionSchedule.earliestDate) < 0
    ) return false;
    if (timeOption === "custom" && (selectedHour == null || selectedMinute == null)) return false;
    return true;
  }, [
    submitting,
    event,
    customerName,
    customerPhone,
    totalItems,
    totalAmount,
    deliveryMode,
    dateOption,
    selectedDate,
    productionSchedule.required,
    productionSchedule.earliestDate,
    timeOption,
    selectedHour,
    selectedMinute,
  ]);

  const registerOrderInFirestore = useCallback(async () => {
    if (!event) return "";

    const quantitiesClean = Object.fromEntries(
      orderableIds
        .map((productId) => [
          productId,
          Math.max(
            0,
            Math.floor(
              quantities[productId] || 0,
            ),
          ),
        ] as const)
        .filter(([, quantity]) => quantity > 0),
    );

    const result = await createPublicOrder({
      source: "event",
      sellerId,
      eventId: id,
      language,
      selectedOfferId:
        selectedOfferId || undefined,
      customerClientId: customerId,
      quantities: quantitiesClean,
      pricing: Object.fromEntries(
        Object.keys(quantitiesClean).map((productId) => [
          productId,
          productsData[productId]?.priceMinor || 0,
        ]),
      ),
      rewards: {
        mode: rewardEvaluation.mode,
        points: rewardEvaluation.pointsRedeemed,
        productId: rewardEvaluation.rewardProductId || undefined,
      },
      customer: {
        name: customerName,
        phone: customerPhone,
      },
      delivery: {
        mode: deliveryMode,
        date: getChosenDate(),
        time: getChosenTimeLabel(),
        locationLink:
          deliveryMode === "delivery"
            ? locationLink
            : undefined,
        note: note || undefined,
      },
    });

    setLastOrderId(result.orderId);
    setLastChatAccessToken(result.chatAccessToken || "");
    setLastCustomerOrderRefId(result.customerOrderRefId || "");
    setLastPointsToEarn(result.pointsToEarn || 0);
    setLastPointsAssignedToPresenter(result.pointsAssignedToPresenter || 0);
    setLastRewardRecipientName(result.rewardRecipientName || "");
    setLastPointsRedeemed(result.pointsRedeemed || 0);
    if (customerSession.registered) void customerRewards.refresh();
    setChatOpen(true);

    return result.orderId;
  }, [
    event,
    sellerId,
    id,
    orderableIds,
    quantities,
    productsData,
    selectedOfferId,
    customerName,
    customerPhone,
    note,
    deliveryMode,
    locationLink,
    customerId,
    getChosenDate,
    getChosenTimeLabel,
    language,
    rewardEvaluation,
    customerRewards,
    customerSession.registered,
  ]);

  const handleFinalize = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showFormError(
        language === "ja"
          ? "オフラインです。接続が戻ってから注文を確定してください。"
          : language === "en"
            ? "You are offline. Wait for the connection to return before placing the order."
            : "Você está sem internet. Aguarde a conexão voltar antes de finalizar o pedido.",
      );
      return;
    }

    if (
      productionSchedule.required &&
      dateOption === "event-date" &&
      selectedDate &&
      compareDateKeys(selectedDate, productionSchedule.earliestDate) < 0
    ) {
      showFormError(
        eventProductionDateError(language, productionSchedule.earliestDate, locale),
      );
      return;
    }

    if (!canSubmit) {
      showFormError(tr("event.error.fill_required", "Escolha produtos, informe nome e telefone e selecione entrega/data/hora antes de finalizar."));
      return;
    }

    try {
      setFormError("");
      setSubmitting(true);
      await registerOrderInFirestore();
      writeStoredCustomerProfile({
        name: customerName,
        phone: customerPhone,
        email: customerSession.profile?.email || "",
        address: {
          ...(customerSession.profile?.address || readStoredCustomerProfile().address),
          locationLink,
        },
      });
      removeLocalDraft(customerDraftKey);
      resetOrderForm();
      showSentToast();
    } catch (err: unknown) {
      const errorCode =
        getPublicOrderErrorCode(err);

      if (errorCode === "PRICE_CHANGED") {
        setProductsData((current) => {
          const next: Record<string, ProductImageData> = {};
          for (const [productId, product] of Object.entries(current)) {
            const evaluation = evaluateProductPrice({
              basePriceMinor: product.basePriceMinor,
              scheduledPriceChange: product.scheduledPriceChange,
              currency,
            });
            next[productId] = {
              ...product,
              price: minorToMajor(evaluation.effectivePriceMinor, currency),
              priceMinor: evaluation.effectivePriceMinor,
              scheduledPriceChange: evaluation.scheduledPriceChange,
              scheduledPriceStatus: evaluation.status,
            };
          }
          return next;
        });
      }

      const message =
        errorCode === "INSUFFICIENT_POINTS"
          ? language === "ja"
            ? "ポイント残高が不足しています。"
            : language === "en"
              ? "Your points balance is insufficient."
              : "Seu saldo de pontos é insuficiente."
          : errorCode === "REWARDS_UNAVAILABLE"
            ? err instanceof Error
              ? err.message
              : tr("event.error.register_order", "Não foi possível usar os pontos.")
          : errorCode === "AUTH_REQUIRED"
          ? tr(
              "event.error.session_expired",
              language === "ja"
                ? "セッションの有効期限が切れました。再度ログインしてください。"
                : language === "en"
                  ? "Your session expired. Sign in again before placing the order."
                  : "Sua sessão expirou. Entre novamente antes de finalizar o pedido.",
            )
          : errorCode === "FULFILLMENT_DATE_UNAVAILABLE"
            ? eventProductionDateError(language, productionSchedule.earliestDate, locale)
          : errorCode === "PRICE_CHANGED"
            ? language === "ja"
              ? "商品の価格が変更されました。金額を確認して、もう一度お試しください。"
              : language === "en"
                ? "One or more product prices changed. Review the total and try again."
                : "O preço de um ou mais produtos mudou. Revise o total e tente novamente."
          : errorCode === "PRODUCT_UNAVAILABLE"
          ? tr(
              "event.error.product_unavailable",
              "Um dos produtos selecionados não está mais disponível.",
            )
          : errorCode === "OFFER_UNAVAILABLE"
            ? tr(
                "event.error.offer_unavailable",
                "A oferta selecionada não está mais disponível.",
              )
            : errorCode === "EVENT_UNAVAILABLE" ||
                errorCode === "SELLER_UNAVAILABLE"
              ? tr(
                  "event.error.unavailable",
                  "Este evento não está aceitando pedidos neste momento.",
                )
              : tr(
                  "event.error.register_order",
                  "Não foi possível registrar o pedido.",
                );

      showFormError(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    customerDraftKey,
    customerName,
    customerPhone,
    customerSession.profile?.email,
    currency,
    language,
    locale,
    dateOption,
    selectedDate,
    productionSchedule.required,
    productionSchedule.earliestDate,
    registerOrderInFirestore,
    resetOrderForm,
    showFormError,
    showSentToast,
    tr,
  ]);

  const handleSendChat = useCallback(async () => {
    if (!event || !lastOrderId || !lastChatAccessToken) return;
    const text = chatText.trim();
    if (!text) return;

    setChatText("");
    try {
      const message = await sendPublicEventChatMessage(
        {
          sellerId,
          eventId: id,
          orderId: lastOrderId,
          token: lastChatAccessToken,
        },
        text,
      );
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (error) {
      console.error("[EventClient] Chat send error:", error);
      setChatText(text);
      showFormError(
        error instanceof Error
          ? error.message
          : tr("event.chat.send_error", "Não foi possível enviar a mensagem."),
      );
    }
  }, [
    event,
    chatText,
    sellerId,
    id,
    lastOrderId,
    lastChatAccessToken,
    showFormError,
    tr,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">
            {tr("event.not_found.title", "Evento não encontrado")}
          </h1>
          <p className="text-sm text-neutral-500">
            {tr("event.not_found.desc", "Confira se o link está correto ou se o evento ainda está ativo.")}
          </p>
        </div>
      </main>
    );
  }

  const canDelivery = event.allowDelivery !== false;
  const canPickup = event.allowPickup !== false;
  const eventClosed = String(event.status || "active") !== "active";

  return (
    <main className={MAIN_CLASS}>
      <OpenInBrowserGate url={currentUrl} />

      {sentToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black px-5 py-3 shadow-xl uppercase tracking-wider text-center">
            {tr("event.order.sent", "Pedido finalizado com sucesso! O vendedor recebeu seu pedido.")}
          </div>
        </div>
      )}

      <header
        className="space-y-3 border-b pb-5"
        style={{ borderColor: `${sellerIdentity.primaryColor}55` }}
      >
        {sellerIdentity.storeName && (
          <Link
            href={`/store/${encodeURIComponent(sellerId)}`}
            className="inline-flex max-w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            {sellerIdentity.logoUrl ? (
              <img
                src={sellerIdentity.logoUrl}
                alt={sellerIdentity.storeName}
                className="h-10 w-10 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white"
                style={{ backgroundColor: sellerIdentity.primaryColor }}
                aria-hidden="true"
              >
                {sellerInitials(sellerIdentity.storeName)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">
                {sellerIdentity.storeName}
              </span>
              <span className="block text-[10px] font-black uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {tr("event.header.visit_store", "Conheça a loja")}
              </span>
            </span>
          </Link>
        )}
        <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{event.title}</h1>

        <p className="text-sm text-neutral-500 font-medium">
          {tr("event.header.region", "Região")}:{" "}
          <span className="font-bold text-neutral-800 dark:text-neutral-200">{event.region}</span>
          <br />
          {tr("event.header.delivery_dates", "Data(s) de entrega")}:{" "}
          <span className="font-bold text-neutral-800 dark:text-neutral-200">{event.deliveryDateLabel}</span>
        </p>

        {eventClosed && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
            {tr("event.closed", "Este evento não está recebendo pedidos no momento.")}
          </div>
        )}
      </header>

      <EventOffersSection
        offers={offers}
        selectedOfferId={selectedOfferId}
        evaluation={offerEvaluation}
        productsData={productsData}
        language={language}
        defaultLanguage={event.defaultLanguage}
        currency={currency}
        locale={locale}
        eventClosed={eventClosed}
        onSelect={setSelectedOfferId}
        tr={tr}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/60 pb-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">
              {tr("event.products.title", "1. Produtos disponíveis")}
            </h2>
            <p className="text-[11px] font-bold text-neutral-400 mt-1">
              {tr("event.products.subtitle", "Escolha os itens de venda normal. Pedidos acima do estoque ficam pendentes.")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button type="button" onClick={() => setActiveCategory("__all__")} className={pill(activeCategory === "__all__")}>
            {tr("event.categories.all", "Todos")}
          </button>

          {dynamicCategories.map((cat) => (
            <button key={cat} type="button" onClick={() => setActiveCategory(cat)} className={pill(activeCategory === cat)}>
              {cat}
            </button>
          ))}

          {uncategorized.length > 0 && (
            <button type="button" onClick={() => setActiveCategory("__other__")} className={pill(activeCategory === "__other__")}>
              {tr("event.categories.other", "Outros")}
            </button>
          )}
        </div>

        <EventProductGrid
          productIds={visibleNormalProductIds}
          productsData={productsData}
          quantities={quantities}
          currency={currency}
          locale={locale}
          timeZone={event?.timeZone || "Asia/Tokyo"}
          eventClosed={eventClosed}
          acceptOrdersWithoutStock={acceptOrdersWithoutStock}
          language={language}
          madeToOrder={false}
          onAdjust={adjustQuantity}
          tr={tr}
          emptyMessage={tr("event.products.empty", "Nenhum produto normal disponível neste evento.")}
        />
      </section>

      {madeToOrderProductIds.length > 0 && (
        <section className="space-y-4 border-t border-violet-200 pt-6 dark:border-violet-900/50">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-violet-600 dark:text-violet-300">
              {tr("event.products.made_to_order_title", "Produtos sob encomenda")}
            </h2>
            <p className="mt-1 text-[11px] font-bold text-neutral-400">
              {tr("event.products.made_to_order_help", "Disponíveis somente para quem reservar antecipadamente.")}
            </p>
          </div>

          <EventProductGrid
            productIds={madeToOrderProductIds}
            productsData={productsData}
            quantities={quantities}
            currency={currency}
            locale={locale}
            timeZone={event?.timeZone || "Asia/Tokyo"}
            eventClosed={eventClosed}
            acceptOrdersWithoutStock={acceptOrdersWithoutStock}
            language={language}
            madeToOrder
            onAdjust={adjustQuantity}
            tr={tr}
            emptyMessage={tr("event.products.made_to_order_empty", "Nenhum produto sob encomenda neste evento.")}
          />
        </section>
      )}

      <section className="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">
          {tr("event.customer.title", "2. Informe seu nome")}
        </h2>

        <div className="space-y-3">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={tr("event.form.customer_name", "Seu nome")}
            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none"
          />

          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder={tr("event.form.customer_phone", "Telefone / WhatsApp")}
            inputMode="tel"
            autoComplete="tel"
            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none"
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("event.form.note", "Observação")}
            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none min-h-[90px]"
          />
        </div>
      </section>

      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-5 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">
          {tr("event.delivery.title", "3. Escolha entrega, data e hora")}
        </h2>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {tr("event.delivery.mode_title", "Tipo de entrega")}
          </p>

          <div className="flex gap-2 flex-wrap">
            {canPickup && (
              <button type="button" onClick={() => setDeliveryMode("pickup")} className={pill(deliveryMode === "pickup")}>
                {tr("event.delivery.pickup", "Retirada no local")}
              </button>
            )}

            {canDelivery && (
              <button type="button" onClick={() => setDeliveryMode("delivery")} className={pill(deliveryMode === "delivery")}>
                {tr("event.delivery.delivery", "Entrega")}
              </button>
            )}

            <button type="button" onClick={() => setDeliveryMode("none")} className={pill(deliveryMode === "none")}>
              {tr("event.common.to_be_arranged", "A combinar")}
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-3">
          {productionSchedule.required && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-relaxed text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
              {eventProductionScheduleNotice(
                language,
                productionSchedule.maxLeadTimeDays,
                productionSchedule.earliestDate,
                locale,
              )}
            </div>
          )}

          {event.deliveryDates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {tr("event.date.title", "Data")}
              </p>

              <div className="flex flex-wrap gap-2">
                {event.deliveryDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    disabled={
                      productionSchedule.required &&
                      compareDateKeys(date, productionSchedule.earliestDate) < 0
                    }
                    onClick={() => {
                      setDateOption("event-date");
                      setSelectedDate(date);
                    }}
                    className={`${pill(dateOption === "event-date" && selectedDate === date)} disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    {date}
                  </button>
                ))}

                <button type="button" onClick={() => setDateOption("no-preference")} className={pill(dateOption === "no-preference")}>
                  {tr("event.common.to_be_arranged", "A combinar")}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {tr("event.time.title", "Hora")}
            </p>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTimeOption("no-preference")} className={pill(timeOption === "no-preference")}>
                {tr("event.common.to_be_arranged", "A combinar")}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTimeOption("custom");
                  if (selectedHour == null) setSelectedHour(12);
                  if (selectedMinute == null) setSelectedMinute(0);
                }}
                className={pill(timeOption === "custom")}
              >
                {tr("event.time.choose", "Escolher hora")}
              </button>
            </div>

            {timeOption === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={selectedHour ?? 12}
                  onChange={(e) => setSelectedHour(Number(e.target.value))}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white"
                >
                  {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
                  <option key={h} value={h}>
                    {lang === "ja"
                      ? `${String(h).padStart(2, "0")}時`
                      : `${String(h).padStart(2, "0")}h`}
                  </option>
                  ))}
                </select>

                <select
                  value={selectedMinute ?? 0}
                  onChange={(e) => setSelectedMinute(Number(e.target.value))}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white"
                >
                  {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {lang === "ja"
                      ? `${String(m).padStart(2, "0")}分`
                      : lang === "en"
                        ? `${String(m).padStart(2, "0")} min`
                        : `${String(m).padStart(2, "0")}min`}
                  </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {deliveryMode === "delivery" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gettingLocation}
              className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white rounded-xl py-3 text-xs font-black uppercase tracking-wider shadow-sm transition active:scale-[0.99]"
            >
              {gettingLocation ? tr("common.loading", "Carregando...") : tr("event.location.get", "Enviar minha localização")}
            </button>

            {locationLink && <p className="text-xs text-neutral-500 break-all">{locationLink}</p>}
          </div>
        )}

        {deliveryMode === "pickup" && (event.pickupLink || event.pickupNote) && (
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
            {event.pickupNote && <p className="text-xs font-bold text-neutral-500">{event.pickupNote}</p>}
            {event.pickupLink && (
              <a href={event.pickupLink} target="_blank" rel="noreferrer" className="text-xs font-black underline text-blue-600 dark:text-blue-400">
                {tr("event.pickup.open_map", "Abrir local de retirada")}
              </a>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <div className="rounded-[2rem] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">
            {tr("event.order.summary", "4. Finalizar pedido")}
          </h2>

          <div className="space-y-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">
            <p>
              {tr("event.form.customer_name", "Seu nome")}:{" "}
              <span className="text-neutral-900 dark:text-white">{customerName.trim() || "—"}</span>
            </p>
            <p>
              {tr("event.form.customer_phone", "Telefone")}: {" "}
              <span className="text-neutral-900 dark:text-white">{customerPhone.trim() || "—"}</span>
            </p>
            <p>
              {tr("event.whatsapp.mode", "Modo")}:{" "}
              <span className="text-neutral-900 dark:text-white">{getDeliveryModeLabel(deliveryMode)}</span>
            </p>
            <p>
              {tr("event.whatsapp.date", "Data")}:{" "}
              <span className="text-neutral-900 dark:text-white">{getChosenDate()}</span>
            </p>
            <p>
              {tr("event.whatsapp.time", "Hora")}:{" "}
              <span className="text-neutral-900 dark:text-white">{getChosenTimeLabel()}</span>
            </p>
            <p>
              {tr("event.order.items_count", "Itens")}:{" "}
              <span className="text-neutral-900 dark:text-white">{totalItems}</span>
            </p>
          </div>

          {stockConfirmationItems.length > 0 && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              {language === "ja"
                ? `在庫確認が必要な商品があります: ${stockConfirmationItems
                    .map((item) => `${item.name} (+${item.shortage})`)
                    .join("、")}。注文は保留となり、販売者が確認します。`
                : language === "en"
                  ? `Some items exceed current stock: ${stockConfirmationItems
                      .map((item) => `${item.name} (+${item.shortage})`)
                      .join(", ")}. The order will remain pending for seller confirmation.`
                  : `Alguns itens ultrapassam o estoque atual: ${stockConfirmationItems
                      .map((item) => `${item.name} (+${item.shortage})`)
                      .join(", ")}. O pedido ficará pendente para confirmação do seller.`}
            </p>
          )}

          {subtotalAmount > 0 && (
            <RewardsCheckoutPanel
              language={language}
              sellerId={sellerId}
              returnTo={`/event/${sellerId}/${id}`}
              registered={customerSession.registered}
              loading={customerRewards.loading}
              wallet={customerRewards.wallet}
              currency={currency}
              locale={locale}
              cartLines={orderableIds
                .map((productId) => ({
                  productId,
                  name: productsData[productId]?.name || productId,
                  quantity: quantities[productId] || 0,
                  unitPriceMinor: productsData[productId]?.priceMinor || 0,
                }))
                .filter((line) => line.quantity > 0)}
              merchandisePayableMinor={merchandisePayableBeforeRewardsMinor}
              offerApplied={Boolean(offerEvaluation?.applicable)}
              selection={rewardSelection}
              maximumDiscountPoints={rewardEvaluation.maximumDiscountPoints}
              pointsToEarn={customerVisiblePointsToEarn}
              onChange={setRewardSelection}
            />
          )}

          {subtotalAmount > 0 && eventPointsAssignedToPresenter && !currentCustomerReceivesEventPoints && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold leading-relaxed text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/25 dark:text-violet-200">
              {language === "ja"
                ? `このイベントで発生する獲得ポイントは${event?.rewardRecipientName || "担当販売者"}に付与されます。お客様自身の保有ポイントは割引に使用できます。`
                : language === "en"
                  ? `Points generated by this event will be credited to ${event?.rewardRecipientName || "the event presenter"}. You can still use your own balance as a discount.`
                  : `Os pontos gerados por este evento serão creditados a ${event?.rewardRecipientName || "quem está apresentando e vendendo no evento"}. Você ainda pode usar seu próprio saldo como desconto.`}
            </div>
          )}

          {subtotalAmount > 0 && (
            <div className="space-y-1 rounded-2xl bg-neutral-50 p-4 text-sm font-bold dark:bg-neutral-950/60">
              <div className="flex items-center justify-between text-neutral-500">
                <span>{tr("event.order.subtotal", "Subtotal")}</span>
                <span>{formatMoneyMinor(subtotalMinor, currency, locale)}</span>
              </div>
              {discountMinor > 0 && (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                  <span>{tr("event.order.discount", "Desconto")}</span>
                  <span>- {formatMoneyMinor(discountMinor, currency, locale)}</span>
                </div>
              )}
              {rewardEvaluation.discountMinor > 0 && (
                <div className="flex items-center justify-between text-violet-600 dark:text-violet-400">
                  <span>{language === "ja" ? "ポイント割引" : language === "en" ? "Points discount" : "Desconto em pontos"}</span>
                  <span>- {formatMoneyMinor(rewardEvaluation.discountMinor, currency, locale)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-black text-neutral-900 dark:border-neutral-800 dark:text-white">
                <span>{tr("event.order.total", "Total")}</span>
                <span className="text-xl text-emerald-600 dark:text-emerald-400">
                  {formatMoneyMinor(totalAmountMinor, currency, locale)}
                </span>
              </div>
            </div>
          )}

          {formError && (
            <div
              ref={formErrorRef}
              role="alert"
              aria-live="assertive"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
            >
              {formError}
            </div>
          )}

          <button
            type="button"
            onClick={handleFinalize}
            disabled={!canSubmit}
            className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition hover:opacity-95 shadow-xl disabled:opacity-30"
          >
            {submitting ? tr("event.order.finalizing", "Finalizando...") : tr("event.order.finalize_pwa", "Finalizar pedido")}
          </button>

          {!canSubmit && (
            <p className="text-[11px] font-bold text-neutral-400 text-center">
              {tr("event.order.fill_required_hint", "Escolha produtos, informe nome e telefone e selecione entrega/data/hora para finalizar.")}
            </p>
          )}
        </div>

        {lastOrderId && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm animate-fade-in dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                  {tr("event.order.confirmation_title", "Pedido recebido")}
                </p>
                <p className="mt-1 text-sm font-black text-emerald-950 dark:text-emerald-100">
                  {tr("event.order.number", "Pedido")} #{lastOrderId}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-800/80 dark:text-emerald-200/70">
                  {lastCustomerOrderRefId
                    ? tr("event.order.saved_account", "O pedido foi salvo na sua conta e poderá ser acompanhado em Meus pedidos.")
                    : tr("event.order.guest_saved", "Guarde o número do pedido para falar com o vendedor.")}
                </p>
                {(lastPointsRedeemed > 0 || lastPointsToEarn > 0 || lastPointsAssignedToPresenter > 0) && (
                  <div className="mt-3 rounded-xl bg-violet-100/80 p-3 text-xs font-bold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                    {lastPointsRedeemed > 0 && (
                      <p>{language === "ja" ? `${lastPointsRedeemed}ポイント使用しました。` : language === "en" ? `${lastPointsRedeemed} points used.` : `${lastPointsRedeemed} pontos utilizados.`}</p>
                    )}
                    {lastPointsToEarn > 0 && (
                      <p className={lastPointsRedeemed > 0 ? "mt-1" : ""}>{language === "ja" ? `受け渡し完了後に${lastPointsToEarn}ポイント獲得します。` : language === "en" ? `You will earn ${lastPointsToEarn} points after delivery.` : `Você ganhará ${lastPointsToEarn} pontos após a entrega.`}</p>
                    )}
                    {lastPointsAssignedToPresenter > 0 && (
                      <p className={lastPointsRedeemed > 0 || lastPointsToEarn > 0 ? "mt-1" : ""}>
                        {language === "ja"
                          ? `${lastPointsAssignedToPresenter}ポイントは受け渡し完了後に${lastRewardRecipientName || "イベント担当者"}へ付与されます。`
                          : language === "en"
                            ? `${lastPointsAssignedToPresenter} points will be credited to ${lastRewardRecipientName || "the event presenter"} after delivery.`
                            : `${lastPointsAssignedToPresenter} pontos serão creditados a ${lastRewardRecipientName || "quem apresentou o evento"} após a entrega.`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {lastCustomerOrderRefId && (
                  <Link
                    href={`/customer/orders/${encodeURIComponent(lastCustomerOrderRefId)}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                  >
                    {tr("event.order.track", "Acompanhar pedido")}
                  </Link>
                )}
                {customerSession.registered && (
                  <Link
                    href="/customer/orders"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300 px-4 py-2 text-xs font-black text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
                  >
                    {tr("event.order.my_orders", "Meus pedidos")}
                  </Link>
                )}
                <Link
                  href={`/store/${encodeURIComponent(sellerId)}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300 px-4 py-2 text-xs font-black text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
                >
                  {tr("event.order.visit_store", "Conheça a loja")}
                </Link>
              </div>
            </div>
          </div>
        )}

        {lastOrderId && (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-neutral-50 dark:bg-neutral-900/30 p-5 space-y-4 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="text-xs font-black uppercase text-neutral-400">{tr("event.chat.title", "Chat")}</span>

              <button type="button" onClick={() => setChatOpen(!chatOpen)} className="text-xs font-black underline text-neutral-800 dark:text-white">
                {chatOpen ? tr("event.chat.close", "Fechar") : tr("event.chat.open", "Abrir")}
              </button>
            </div>

            {chatOpen && (
              <div className="space-y-3">
                <div className="h-[250px] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 flex flex-col scrollbar-none">
                  {chatLoading ? (
                    <p className="text-xs font-bold text-neutral-400 text-center py-6">
                      {tr("event.chat.loading", "Carregando...")}
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="text-xs font-bold text-neutral-400 text-center py-6">
                      {tr("event.chat.empty", "Pedido recebido. Se precisar, envie uma mensagem ao vendedor.")}
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderRole === "customer";

                      return (
                        <div key={m.id} className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3.5 py-2 text-xs font-bold leading-relaxed shadow-sm",
                              mine
                                ? "bg-black text-white dark:bg-white dark:text-black rounded-tr-none"
                                : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 rounded-tl-none"
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            <span className="text-[9px] font-mono block text-right mt-1 opacity-60">
                              {m.createdAt ? fmtChatTime(m.createdAt) : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-1.5 rounded-xl">
                  <input
                    className="flex-1 bg-transparent px-2.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={tr("event.chat.placeholder", "Digite sua mensagem...")}
                  />

                  <button
                    type="button"
                    onClick={handleSendChat}
                    disabled={!chatText.trim()}
                    className="rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider px-4 py-2 disabled:opacity-40"
                  >
                    {tr("event.chat.send", "Enviar")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function EventProductGrid({
  productIds,
  productsData,
  quantities,
  currency,
  locale,
  timeZone,
  eventClosed,
  acceptOrdersWithoutStock,
  language,
  madeToOrder,
  onAdjust,
  tr,
  emptyMessage,
}: {
  productIds: string[];
  productsData: Record<string, ProductImageData>;
  quantities: Record<string, number>;
  currency: SupportedCurrency;
  locale: string;
  timeZone: string;
  eventClosed: boolean;
  acceptOrdersWithoutStock: boolean;
  language: "pt" | "en" | "ja";
  madeToOrder: boolean;
  onAdjust: (productId: string, delta: number) => void;
  tr: (key: string, fallback: string) => string;
  emptyMessage: string;
}) {
  if (productIds.length === 0) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-bold text-neutral-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {productIds.map((productId) => {
        const info = productsData[productId];
        const name = info?.name || productId;
        const quantity = quantities[productId] ?? 0;
        const schedule = info?.scheduledPriceChange;
        const scheduledDate = formatScheduledPriceDate(
          schedule?.startsAtMillis ?? null,
          locale,
          timeZone,
        );
        const countdown = scheduledPriceCountdown(schedule?.startsAtMillis ?? null);
        const countdownLabel = countdown && !countdown.expired
          ? language === "ja"
            ? `${countdown.days}日 ${countdown.hours}時間 ${countdown.minutes}分`
            : language === "en"
              ? `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`
              : `${countdown.days}d ${countdown.hours}h ${countdown.minutes}min`
          : "";
        const stock = typeof info?.stockQty === "number" ? info.stockQty : null;
        const hasNoStock = !madeToOrder && stock !== null && stock <= 0;
        const soldOut = hasNoStock && !acceptOrdersWithoutStock;
        const needsConfirmation = hasNoStock && acceptOrdersWithoutStock;
        const lastUnits =
          !madeToOrder &&
          stock !== null &&
          stock > 0 &&
          stock <= 10;
        const reachedQuantityLimit =
          !acceptOrdersWithoutStock &&
          !madeToOrder &&
          stock !== null &&
          quantity >= stock;

        return (
          <div
            key={productId}
            className={cn(
              "rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-neutral-900",
              madeToOrder
                ? "border-violet-200 dark:border-violet-900/60"
                : soldOut
                  ? "border-red-300 bg-red-50/40 opacity-80 dark:border-red-900/70 dark:bg-red-950/10"
                  : needsConfirmation
                    ? "border-amber-400 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/10"
                  : lastUnits
                    ? "border-amber-400 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/10"
                    : "border-neutral-200 dark:border-neutral-800",
              quantity > 0 && (madeToOrder ? "ring-2 ring-violet-500" : "ring-2 ring-black dark:ring-white"),
            )}
          >
            <div className="space-y-2">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                {info?.imageUrl ? (
                  <img src={info.imageUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-black uppercase text-neutral-400">
                    {tr("event.product.no_image", "Sem imagem")}
                  </span>
                )}

                {info?.scheduledPriceStatus === "upcoming" && (
                  <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg">
                    {language === "ja"
                      ? "まもなく値上げ"
                      : language === "en"
                        ? "Price increases soon"
                        : "Preço sobe em breve"}
                  </span>
                )}

                {madeToOrder && (
                  <span className="absolute left-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                    {tr("event.product.made_to_order", "Sob encomenda")}
                  </span>
                )}

                {!madeToOrder && lastUnits && (
                  <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg">
                    {tr("event.product.last_units", "Últimas unidades").replace(
                      "{count}",
                      String(stock),
                    )}
                  </span>
                )}

                {!madeToOrder && needsConfirmation && (
                  <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg">
                    {tr("event.product.confirmation_required", "Sob confirmação")}
                  </span>
                )}

                {!madeToOrder && soldOut && (
                  <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg">
                    {tr("event.product.sold_out", "Esgotado")}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h4 className="truncate text-sm font-black tracking-tight text-neutral-900 dark:text-white">{name}</h4>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-xs font-black text-neutral-600 dark:text-neutral-400">
                    {formatMoneyMinor(info?.priceMinor || 0, currency, locale)}
                  </p>
                  {info?.scheduledPriceStatus === "active" &&
                    info.basePriceMinor < info.priceMinor && (
                      <span className="text-[10px] font-bold text-neutral-400 line-through">
                        {formatMoneyMinor(info.basePriceMinor, currency, locale)}
                      </span>
                    )}
                </div>

                {info?.scheduledPriceStatus === "upcoming" && schedule?.nextPriceMinor && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
                    <p className="font-black">
                      {language === "ja"
                        ? `${scheduledDate}から${formatMoneyMinor(schedule.nextPriceMinor, currency, locale)}になります。`
                        : language === "en"
                          ? `Price changes to ${formatMoneyMinor(schedule.nextPriceMinor, currency, locale)} on ${scheduledDate}.`
                          : `O preço muda para ${formatMoneyMinor(schedule.nextPriceMinor, currency, locale)} em ${scheduledDate}.`}
                    </p>
                    <p className="mt-1">
                      {schedule.message ||
                        (language === "ja"
                          ? "値上げ前の価格をお早めにご利用ください。"
                          : language === "en"
                            ? "Take advantage of the current price before it increases."
                            : "Aproveite o preço atual antes do aumento.")}
                    </p>
                    {schedule.showCountdown && countdownLabel && (
                      <p className="mt-1 font-black">
                        {language === "ja"
                          ? `残り ${countdownLabel}`
                          : language === "en"
                            ? `Time left: ${countdownLabel}`
                            : `Tempo restante: ${countdownLabel}`}
                      </p>
                    )}
                  </div>
                )}

                {info?.scheduledPriceStatus === "active" && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                    {language === "ja"
                      ? "予定されていた新価格が自動的に適用されました。"
                      : language === "en"
                        ? "The scheduled new price is now active."
                        : "O novo preço programado já está valendo."}
                  </p>
                )}

                {madeToOrder ? (
                  <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">
                    {tr("event.product.made_to_order_notice", "Produzido mediante reserva antecipada. O pedido ficará pendente até ficar pronto.")} {eventProductionLeadTimeNotice(language, info?.productionLeadTimeDays || 1)}
                  </p>
                ) : lastUnits ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    {tr(
                      "event.product.last_units_notice",
                      "Últimas {count} unidades — garanta a sua.",
                    ).replace("{count}", String(stock))}
                  </p>
                ) : needsConfirmation ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    {tr(
                      "event.product.confirmation_notice",
                      "Disponibilidade sujeita à produção após o pedido.",
                    )} {eventProductionLeadTimeNotice(language, info?.productionLeadTimeDays || 0)}
                  </p>
                ) : soldOut ? (
                  <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[10px] font-black text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                    {tr(
                      "event.product.sold_out_notice",
                      "Esgotado — novas vendas estão bloqueadas.",
                    )}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800/40">
              <span className="text-[10px] font-black uppercase text-neutral-400">
                {tr("event.product.quantity", "Quantidade")}
              </span>

              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAdjust(productId, -1)}
                  disabled={eventClosed || quantity <= 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-sm font-bold transition hover:bg-neutral-50 disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  -
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-black text-neutral-900 dark:text-white">{quantity}</span>
                <button
                  type="button"
                  onClick={() => onAdjust(productId, 1)}
                  disabled={eventClosed || soldOut || reachedQuantityLimit}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold transition disabled:opacity-30",
                    madeToOrder
                      ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                      : "border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900",
                  )}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventOffersSection({
  offers,
  selectedOfferId,
  evaluation,
  productsData,
  language,
  defaultLanguage,
  currency,
  locale,
  eventClosed,
  onSelect,
  tr,
}: {
  offers: OfferDoc[];
  selectedOfferId: string;
  evaluation: OfferEvaluation | null;
  productsData: Record<string, ProductImageData>;
  language: "pt" | "en" | "ja";
  defaultLanguage: UiLanguage;
  currency: SupportedCurrency;
  locale: RegionalLocale | string;
  eventClosed: boolean;
  onSelect: (offerId: string) => void;
  tr: (key: string, fallback: string) => string;
}) {
  if (offers.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <Gift className="h-6 w-6 text-orange-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-orange-600 dark:text-orange-300">
            {tr("event.offers.title", "Ofertas e kits")}
          </h2>
          <p className="mt-1 text-[11px] font-bold text-neutral-400">
            {tr(
              "event.offers.subtitle",
              "Selecione uma oferta e combine os produtos participantes. Outros produtos continuam disponíveis normalmente.",
            )}
          </p>
        </div>
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scrollbar-none">
        {offers.map((offer) => {
          const selected = offer.id === selectedOfferId;
          const localized = resolveLocalizedOfferText(
            offer.content,
            language,
            defaultLanguage,
          );
          const eligibleNames = offer.eligibleProductIds
            .map((productId) => productsData[productId]?.name)
            .filter((name): name is string => Boolean(name));
          const currentEvaluation = selected ? evaluation : null;
          const priceLabel =
            offer.pricing.mode === "fixed_total"
              ? `${formatMoneyMinor(
                  offer.pricing.regularTotalMinor ?? 0,
                  currency,
                  locale,
                )} → ${formatMoneyMinor(
                  offer.pricing.promotionalTotalMinor ?? 0,
                  currency,
                  locale,
                )}`
              : offer.pricing.mode === "fixed_discount"
                ? `- ${formatMoneyMinor(
                    offer.pricing.discountMinor ?? 0,
                    currency,
                    locale,
                  )}`
                : `${offer.pricing.percentage ?? 0}%`;

          return (
            <article
              key={offer.id}
              className={cn(
                "min-w-[min(88vw,420px)] snap-start overflow-hidden rounded-3xl border bg-white shadow-sm transition dark:bg-neutral-900",
                selected
                  ? "border-orange-500 ring-2 ring-orange-500/20"
                  : "border-neutral-200 dark:border-neutral-800",
              )}
            >
              <div className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-300">
                  {tr("event.offers.required", "Quantidade necessária")}: {offer.requiredQuantity}
                </p>
                <h3 className="mt-2 text-xl font-black text-neutral-900 dark:text-white">
                  {localized.name}
                </h3>
                {localized.description && (
                  <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-300">
                    {localized.description}
                  </p>
                )}
                <p className="mt-4 text-lg font-black text-neutral-900 dark:text-white">
                  {priceLabel}
                </p>
                {eligibleNames.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs font-semibold text-neutral-500 dark:text-neutral-300">
                    {eligibleNames.join(" · ")}
                  </p>
                )}

                {selected && currentEvaluation && (
                  <div
                    className={cn(
                      "mt-4 rounded-2xl border p-4 text-sm font-bold",
                      currentEvaluation.applicable
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                        : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-200",
                    )}
                  >
                    {currentEvaluation.applicable ? (
                      <>
                        <p>
                          {tr("event.offers.applied", "Oferta aplicada")} · {currentEvaluation.bundleCount} {tr("event.offers.bundles", "kit(s)")}
                        </p>
                        <p className="mt-2 text-xs font-black">
                          {tr("event.offers.savings", "Economia")}: {formatMoneyMinor(
                            currentEvaluation.discountAmountMinor,
                            currency,
                            locale,
                          )}
                        </p>
                      </>
                    ) : (
                      <p>
                        {tr("event.offers.remaining", "Faltam {count} itens").replace(
                          "{count}",
                          String(currentEvaluation.nextBundleRemaining),
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={eventClosed}
                onClick={() => onSelect(selected ? "" : offer.id)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-center border-t px-4 text-sm font-black transition disabled:opacity-40",
                  selected
                    ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-200"
                    : "border-neutral-200 bg-neutral-950 text-white dark:border-neutral-800 dark:bg-white dark:text-neutral-950",
                )}
              >
                {selected
                  ? tr("event.offers.remove", "Remover oferta")
                  : tr("event.offers.use", "Usar oferta")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
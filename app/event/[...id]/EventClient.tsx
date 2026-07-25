"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  createPublicOrder,
  getPublicOrderErrorCode,
} from "@/app/lib/public-order-client";
import OpenInBrowserGate from "@/app/_components/OpenInBrowserGate";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
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
  formatMoneyMinor,
  legacyMajorValueToMinor,
  minorToMajor,
} from "@/app/lib/money";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
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
  defaultLanguage: "pt" | "en" | "ja";
};

type ProductImageData = {
  id: string;
  name: string;
  imageUrl: string;
  extraImageUrls: string[];
  price?: number;
  priceMinor: number;
  category?: CategoryName;
  stockQty?: number;
  lowStockThreshold?: number;
  status?: ProductStatus;
  availabilityMode: "normal" | "made_to_order";
  availabilityStatus: "active" | "made_to_order";
  productionMode: "stock" | "made_to_order";
};

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "seller" | "customer";
  createdAt?: Timestamp;
};

const MAIN_CLASS = "p-4 space-y-6 max-w-3xl mx-auto animate-fade-in";

const normalizeStringArray = (value: any): string[] =>
  Array.isArray(value)
    ? value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const safeNumber = (v: any) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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

function makeId() {
  return `c_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizeCategoryDynamic(v: any): CategoryName | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
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
    const priceMinor =
      typeof docData.priceMinor === "number" &&
      Number.isFinite(docData.priceMinor)
        ? Math.max(0, Math.round(docData.priceMinor))
        : legacyMajorValueToMinor(
            docData.price ??
              docData.sellPrice ??
              0,
            currency,
          );

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
    collection(db, "sellers", sellerId, "products"),
  );
  catalogSnap.docs.forEach((catalogDoc) => {
    const published = result[catalogDoc.id];
    if (!published) return;
    const data = catalogDoc.data() as Record<string, unknown>;
    const inventory = normalizeProductInventory(
      data.inventory,
      data.stockQty ?? data.stock,
      data.lowStockThreshold,
    );
    published.stockQty = inventory.tracked ? inventory.available : undefined;
    published.lowStockThreshold = inventory.lowStockThreshold;
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
        status: "active",
        availabilityMode: "normal",
        availabilityStatus: "active",
        productionMode: "stock",
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
  const locale = event?.regionalLocale ?? uiLocale;
  const currency = event?.currency ?? "JPY";
  const language = lang === "en" || lang === "ja" ? lang : "pt";
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
  const [offers, setOffers] = useState<OfferDoc[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [activeCategory, setActiveCategory] = useState("__all__");

  const [submitting, setSubmitting] = useState(false);
  const [sentToast, setSentToast] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [lastOrderId, setLastOrderId] = useState("");
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
  const totalAmountMinor = Math.max(0, subtotalMinor - discountMinor);
  const subtotalAmount = minorToMajor(subtotalMinor, currency);
  const totalAmount = minorToMajor(totalAmountMinor, currency);

  const fmtChatTime = useCallback((ts?: Timestamp) => {
    if (!ts) return "";
    return new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Tokyo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ts.toDate());
}, [locale]);

  const resetOrderForm = useCallback(() => {
    setCustomerName("");
    setCustomerPhone("");
    setQuantities({});
    setNote("");
    setLocationLink("");
    setTimeOption("no-preference");
    setSelectedHour(null);
    setSelectedMinute(null);

    if (event?.deliveryDates?.length) {
      setDateOption("event-date");
      setSelectedDate(event.deliveryDates[0]);
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
  }, [event]);

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
          madeToOrder || availableStock === null
            ? requested
            : Math.min(requested, availableStock);

        if (next === current) return prev;
        return { ...prev, [productId]: next };
      });
    },
    [productsData],
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
    if (typeof window === "undefined") return;

    setCurrentUrl(window.location.href);

    try {
      const saved = window.localStorage.getItem("yamada_customer_id");
      if (saved && saved.trim()) {
        setCustomerId(saved.trim());
        return;
      }

      const nid = makeId();
      window.localStorage.setItem("yamada_customer_id", nid);
      setCustomerId(nid);
    } catch {
      setCustomerId(makeId());
    }
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

        const data = snap.data() as any;
        const sellerSnapshot = await getDoc(doc(db, "sellers", sellerId));
        const sellerData = sellerSnapshot.exists() ? sellerSnapshot.data() as any : {};
        const sellerRegional =
          sellerData.regional && typeof sellerData.regional === "object"
            ? sellerData.regional
            : {};
        const storedSellerId =
          typeof data.sellerId === "string"
            ? data.sellerId.trim()
            : "";

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
          currency:
            data.currency === "BRL" || data.currency === "USD" || data.currency === "JPY"
              ? data.currency
              : sellerRegional.currency === "BRL" || sellerRegional.currency === "USD"
                ? sellerRegional.currency
                : "JPY",
          regionalLocale:
            data.regionalLocale === "pt-BR" || data.regionalLocale === "en-US" || data.regionalLocale === "ja-JP"
              ? data.regionalLocale
              : sellerRegional.locale === "pt-BR" || sellerRegional.locale === "en-US"
                ? sellerRegional.locale
                : "ja-JP",
          defaultLanguage:
            data.defaultLanguage === "en" || data.defaultLanguage === "ja" || data.defaultLanguage === "pt"
              ? data.defaultLanguage
              : sellerData.storefrontLanguage === "en" || sellerData.storefrontLanguage === "ja"
                ? sellerData.storefrontLanguage
                : "pt",
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
    if (!sellerId || !id || !lastOrderId) return;

    setChatLoading(true);

    return onSnapshot(
      query(
        collection(db, "sellers", sellerId, "events", id, "orders", lastOrderId, "messages"),
        orderBy("createdAt", "asc"),
        limit(200)
      ),
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
        setChatLoading(false);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      },
      (err) => {
        console.error("[EventClient] Chat listener error:", err);
        setChatLoading(false);
      }
    );
  }, [sellerId, id, lastOrderId]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!event) return false;
    if (String(event.status || "active") !== "active") return false;
    if (!customerName.trim()) return false;
    if (!customerPhone.trim()) return false;
    if (totalItems <= 0 || totalAmount <= 0) return false;
    if (!deliveryMode) return false;
    if (event.deliveryDates.length > 0 && dateOption === "event-date" && !selectedDate) return false;
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
    setChatOpen(true);

    return result.orderId;
  }, [
    event,
    sellerId,
    id,
    orderableIds,
    quantities,
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
  ]);

  const handleFinalize = useCallback(async () => {
    if (!canSubmit) {
      alert(tr("event.error.fill_required", "Escolha produtos, informe nome e telefone e selecione entrega/data/hora antes de finalizar."));
      return;
    }

    try {
      setSubmitting(true);
      await registerOrderInFirestore();
      resetOrderForm();
      showSentToast();
    } catch (err: unknown) {
      const errorCode =
        getPublicOrderErrorCode(err);

      const message =
        errorCode === "PRODUCT_UNAVAILABLE"
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

      alert(message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, registerOrderInFirestore, resetOrderForm, showSentToast, tr]);

  const handleSendChat = useCallback(async () => {
    if (!event) return;
    if (!chatText.trim()) return;
    if (!lastOrderId) return;

    const txt = chatText.trim();
    setChatText("");

    await addDoc(collection(db, "sellers", sellerId, "events", id, "orders", lastOrderId, "messages"), {
      text: txt,
      senderId: customerId,
      senderRole: "customer",
      createdAt: serverTimestamp(),
      customerName,
    });
  }, [event, chatText, sellerId, id, lastOrderId, customerId, customerName]);

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

      <header className="space-y-3 border-b border-neutral-200 dark:border-neutral-800 pb-5">
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
          eventClosed={eventClosed}
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
            eventClosed={eventClosed}
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
                    onClick={() => {
                      setDateOption("event-date");
                      setSelectedDate(date);
                    }}
                    className={pill(dateOption === "event-date" && selectedDate === date)}
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
              <div className="flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-black text-neutral-900 dark:border-neutral-800 dark:text-white">
                <span>{tr("event.order.total", "Total")}</span>
                <span className="text-xl text-emerald-600 dark:text-emerald-400">
                  {formatMoneyMinor(totalAmountMinor, currency, locale)}
                </span>
              </div>
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
  eventClosed,
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
  eventClosed: boolean;
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
        const stock = typeof info?.stockQty === "number" ? info.stockQty : null;
        const soldOut = !madeToOrder && stock !== null && stock <= 0;
        const lastUnits =
          !madeToOrder &&
          stock !== null &&
          stock > 0 &&
          stock <= 10;
        const reachedQuantityLimit =
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

                {!madeToOrder && soldOut && (
                  <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-lg">
                    {tr("event.product.sold_out", "Esgotado")}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h4 className="truncate text-sm font-black tracking-tight text-neutral-900 dark:text-white">{name}</h4>
                <p className="text-xs font-black text-neutral-600 dark:text-neutral-400">
                  {formatMoneyMinor(info?.priceMinor || 0, currency, locale)}
                </p>

                {madeToOrder ? (
                  <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">
                    {tr("event.product.made_to_order_notice", "Produzido mediante reserva antecipada. O pedido ficará pendente até ficar pronto.")}
                  </p>
                ) : lastUnits ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    {tr(
                      "event.product.last_units_notice",
                      "Últimas {count} unidades — garanta a sua.",
                    ).replace("{count}", String(stock))}
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
  defaultLanguage: "pt" | "en" | "ja";
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

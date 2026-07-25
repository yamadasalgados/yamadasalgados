"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/app/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  getDocs,
  Timestamp,
  query,
  orderBy,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";
import {
  formatMoneyMajor,
  formatMoneyMinor,
} from "@/app/lib/money";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import { Gift } from "lucide-react";
import {
  normalizeOffer,
  offerIsCurrentlyActive,
  resolveLocalizedOfferText,
  type OfferDoc,
} from "@/app/lib/offer-schema";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";
import {
  FULFILLMENT_ORDER_STATUS,
  getOrderStatusLabel,
  isOpenOrderStatus,
  normalizeOrderStatus,
  type OrderStatus,
} from "@/app/lib/order-status";
import { updateSellerOrderStatus } from "@/app/lib/order-status-client";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";

// --- 📝 Interfaces de Tipagem Estrita ---

type EventStatus = "active" | "closed" | "cancelled";
type EventProductMode = "normal" | "made_to_order";
type ProductSelectionMode = "excluded" | EventProductMode;

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  suspended?: boolean;
  displayName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
  regionName?: string;
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
  timeZone?: string;
};

type EventDoc = {
  title?: string;
  regionName?: string;
  regionId?: string;
  deliveryDates?: string[];
  deliveryDateLabel?: string;
  productIds?: string[];
  productAvailabilityModes?: Record<string, EventProductMode>;
  featuredProductIds?: string[];
  offerIds?: string[];
  whatsapp?: string;
  status?: EventStatus | string;
  pickupLink?: string;
  pickupNote?: string;
  messengerId?: string;
  sellerId?: string;
  revenueYen?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  closedAt?: Timestamp;
};

type OrderDoc = {
  id: string;
  customerName?: string;
  note?: string;
  quantities: Record<string, number>;
  totalItems?: number;
  status?: OrderStatus | string;
  channel?: "whatsapp" | "messenger" | "other" | string;
  deliveryDate?: string;
  deliveryMode?: "delivery" | "pickup" | "none" | string;
  deliveryTimeSlot?: string;
  locationLink?: string;
  totalAmount?: number;
  createdAt?: Timestamp;
  deliveredAt?: Timestamp;
};

type MessageSummary = {
  orderId: string;
  customerName: string;
  lastText: string;
  lastAt?: Timestamp;
  unreadCount: number;
  totalCount: number;
};

type ProductDoc = {
  id: string;
  name: string;
  price?: number;
  imageUrl?: string;
  extraImageUrls?: string[];
  category?: string;
  status?: "active" | "inactive" | "made_to_order" | string;
  stockQty?: number;
  lowStockThreshold?: number;
};

type TabKey = "orders" | "deliveries" | "production" | "messages" | "config";

// --- 🛠️ Funções Utilitárias Core ---

function uniqStrings(arr: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr || []) {
    const s = String(x || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normEventStatus(s: any): EventStatus {
  const st = String(s || "active");
  if (st === "active" || st === "closed" || st === "cancelled") return st;
  return "active";
}



function normalizeStringArray(value: any): string[] {
  return Array.isArray(value)
    ? value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function toNumberOrUndef(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pickImageUrl(p: ProductDoc): string {
  const raw = String(p.imageUrl || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return "";
}

function defaultEventProductMode(product?: ProductDoc): EventProductMode {
  return product?.status === "made_to_order" ? "made_to_order" : "normal";
}

function normalizeEventProductMode(
  value: unknown,
  fallback: EventProductMode = "normal",
): EventProductMode {
  return value === "made_to_order" ? "made_to_order" : value === "normal" ? "normal" : fallback;
}

function buildEventItemPayload(p: ProductDoc, availabilityMode: EventProductMode) {
  return {
    source: "own",
    productId: p.id,
    enabled: true,
    name: p.name,
    price: Number(p.price || 0),
    imageUrl: pickImageUrl(p),
    extraImageUrls: normalizeStringArray(p.extraImageUrls),
    category: String(p.category || ""),
    status: "active",
    sourceProductStatus:
      p.status === "made_to_order" ? "made_to_order" : "active",
    availabilityMode,
    availabilityStatus:
      availabilityMode === "made_to_order" ? "made_to_order" : "active",
    productionMode:
      availabilityMode === "made_to_order" ? "made_to_order" : "stock",
    stockQty: toNumberOrUndef(p.stockQty),
    lowStockThreshold: toNumberOrUndef(p.lowStockThreshold),
    updatedAt: serverTimestamp(),
  };
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

async function loadSellerProductsOnly(sellerUid: string): Promise<ProductDoc[]> {
  if (!sellerUid) return [];

  const snap = await getDocs(query(collection(db, "sellers", sellerUid, "products"), orderBy("createdAt", "desc")));
  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      if (String(data.status || "active") === "inactive") return null;
      const inventory = normalizeProductInventory(
        data.inventory,
        data.stockQty ?? data.stock,
        data.lowStockThreshold,
      );

      return {
        id: d.id,
        name: String(data.name || ""),
        price: typeof data.sellPrice === "number" ? data.sellPrice : Number(data.sellPrice || data.price || 0),
        imageUrl: String(data.imageUrl || data.image || ""),
        extraImageUrls: normalizeStringArray(data.extraImageUrls),
        category: String(data.category || ""),
        status:
          data.status === "made_to_order"
            ? "made_to_order"
            : String(data.status || "active"),
        stockQty: inventory.tracked ? inventory.available : undefined,
        lowStockThreshold: inventory.lowStockThreshold,
      } as ProductDoc;
    })
    .filter(Boolean) as ProductDoc[];
}

async function loadSellerOffersOnly(
  sellerUid: string,
  currency: SupportedCurrency,
): Promise<OfferDoc[]> {
  if (!sellerUid) return [];

  const snapshot = await getDocs(
    query(
      collection(db, "sellers", sellerUid, "offers"),
      orderBy("createdAt", "desc"),
    ),
  );

  return snapshot.docs
    .map((document) =>
      normalizeOffer(
        document.id,
        document.data(),
        currency,
      ),
    )
    .filter(
      (offer): offer is OfferDoc =>
        offer !== null &&
        offerIsCurrentlyActive(offer),
    );
}

async function resolveEventDocSellerOnly(params: {
  eventId: string;
  sellerUid: string;
}): Promise<{ ref: DocumentReference; data: EventDoc } | null> {
  const { eventId, sellerUid } = params;

  const sellerRef = doc(db, "sellers", sellerUid, "events", eventId);
  const sellerSnap = await getDoc(sellerRef);

  if (!sellerSnap.exists()) return null;
  return { ref: sellerRef, data: sellerSnap.data() as EventDoc };
}

// --- 🚀 Componente Principal ---

export default function EventPanelClient(props: { eventId?: string; id?: string }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
const [messageSummaries, setMessageSummaries] = useState<Record<string, MessageSummary>>({});
  const safeId = String(props.eventId || props.id || "").trim();
  const [tab, setTab] = useState<TabKey>("orders");

  const sellerSession = useSellerSession();
  const authUser = sellerSession.user;
  const profile = sellerSession.profile as UserDoc;
  const inactive = profile.active === false || profile.suspended === true;

  const role = profile.role ?? "seller";
  const sellerUid = sellerSession.sellerId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [eventRef, setEventRef] = useState<DocumentReference | null>(null);

  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState<EventStatus>("active");
  const [pickupLink, setPickupLink] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [deliveryDatesText, setDeliveryDatesText] = useState("");

  const [productIds, setProductIds] = useState<string[]>([]);
  const [productAvailabilityModes, setProductAvailabilityModes] = useState<Record<string, EventProductMode>>({});
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([]);
  const [offerIds, setOfferIds] = useState<string[]>([]);

  const [allProducts, setAllProducts] = useState<ProductDoc[]>([]);
  const [allProductsLoading, setAllProductsLoading] = useState(true);
  const [allProductsError, setAllProductsError] = useState<string | null>(null);
  const [allOffers, setAllOffers] = useState<OfferDoc[]>([]);
  const [allOffersLoading, setAllOffersLoading] = useState(true);
  const [allOffersError, setAllOffersError] = useState<string | null>(null);

  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [filterDate, setFilterDate] = useState<string>("todas");

  const yen = useCallback(
    (amount: number) =>
      formatMoneyMajor(
        amount,
        profile?.currency ?? "JPY",
        profile?.regionalLocale ??
          (lang === "pt"
            ? "pt-BR"
            : lang === "en"
              ? "en-US"
              : "ja-JP"),
      ),
    [
      lang,
      profile?.currency,
      profile?.regionalLocale,
    ],
  );

  const fmtDate = useCallback((ts?: Timestamp | null) => {
    if (!ts) return "";
    return new Intl.DateTimeFormat(
      profile?.regionalLocale ?? "pt-BR",
      {
        timeZone:
          profile?.timeZone ||
          "Asia/Tokyo",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(ts.toDate());
  }, [
    profile?.regionalLocale,
    profile?.timeZone,
  ]);

  useEffect(() => {
    const ttab = (search.get("tab") as TabKey) || "orders";
    if (["orders", "deliveries", "production", "messages", "config"].includes(ttab)) setTab(ttab);
    else setTab("orders");
  }, [search]);

  const setTabPush = useCallback(
    (ttab: TabKey) => {
      if (!safeId) return;
      setTab(ttab);
      router.replace(`/seller/events/${encodeURIComponent(safeId)}?tab=${ttab}`);
    },
    [router, safeId]
  );

  const canEnter = useMemo(() => {
    if (!sellerUid || inactive) return false;
    return role === "seller" || role === "admin";
  }, [sellerUid, inactive, role]);

  useEffect(() => {
    const loadEvent = async () => {
      if (!canEnter) return;
      setError(null);
      setSuccess(null);
      setLoading(true);

      try {
        const resolved = await resolveEventDocSellerOnly({ eventId: safeId, sellerUid });

        if (!resolved) {
          setError(t("eventPanel.err.eventNotFound"));
          return;
        }

        const data = resolved.data;
        if (String(data.sellerId || "") && String(data.sellerId) !== sellerUid) {
          setError(t("eventPanel.err.accessDenied"));
          return;
        }

        setEvent(data);
        setEventRef(resolved.ref);

        setTitle(String(data.title || "").trim());
        setRegion(String(data.regionName || "").trim());
        setWhatsapp(String(data.whatsapp || ""));
        setStatus(normEventStatus(data.status));
        setPickupLink(String(data.pickupLink || ""));
        setPickupNote(String(data.pickupNote || ""));
        setMessengerId(String(data.messengerId || ""));
        setDeliveryDatesText(Array.isArray(data.deliveryDates) ? data.deliveryDates.join("\n") : "");

        const eventItemsSnapshot = await getDocs(collection(resolved.ref, "items"));
        const storedModes = data.productAvailabilityModes && typeof data.productAvailabilityModes === "object"
          ? data.productAvailabilityModes as Record<string, unknown>
          : {};
        const loadedModes: Record<string, EventProductMode> = {};

        eventItemsSnapshot.docs.forEach((itemDocument) => {
          const itemData = itemDocument.data() as Record<string, unknown>;
          loadedModes[itemDocument.id] = normalizeEventProductMode(
            itemData.availabilityMode,
            itemData.availabilityStatus === "made_to_order" ||
              itemData.productionMode === "made_to_order" ||
              itemData.status === "made_to_order"
              ? "made_to_order"
              : "normal",
          );
        });

        Object.entries(storedModes).forEach(([productId, mode]) => {
          loadedModes[productId] = normalizeEventProductMode(mode, loadedModes[productId] ?? "normal");
        });

        const loadedProductIds = uniqStrings([
          ...(Array.isArray(data.productIds) ? data.productIds : []),
          ...eventItemsSnapshot.docs.map((itemDocument) => itemDocument.id),
        ]);

        setProductIds(loadedProductIds);
        setProductAvailabilityModes(loadedModes);
        setFeaturedProductIds(Array.isArray(data.featuredProductIds) ? uniqStrings(data.featuredProductIds) : []);
        setOfferIds(Array.isArray(data.offerIds) ? uniqStrings(data.offerIds) : []);
      } catch (e: any) {
        setError(e?.message || t("eventPanel.err.loadEvent"));
      } finally {
        setLoading(false);
      }
    };
    loadEvent();
  }, [safeId, canEnter, sellerUid, t]);

  useEffect(() => {
    if (!event || !sellerUid) return;
    setAllProductsLoading(true);

    loadSellerProductsOnly(sellerUid)
      .then(setAllProducts)
      .catch(() => setAllProductsError(t("eventPanel.err.allowedProductsLoad")))
      .finally(() => setAllProductsLoading(false));
  }, [event, sellerUid, t]);


  useEffect(() => {
    if (!event || !sellerUid) return;

    setAllOffersLoading(true);
    setAllOffersError(null);

    loadSellerOffersOnly(
      sellerUid,
      profile?.currency ?? "JPY",
    )
      .then(setAllOffers)
      .catch(() =>
        setAllOffersError(
          lang === "ja"
            ? "オファーを読み込めませんでした。"
            : lang === "en"
              ? "Could not load offers."
              : "Não foi possível carregar as ofertas.",
        ),
      )
      .finally(() => setAllOffersLoading(false));
  }, [event, lang, profile?.currency, sellerUid]);

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    allProducts.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [allProducts]);

  const resolveItemLabel = useCallback((key: string) => {
    const k = String(key || "").trim();
    return productNameById.get(k) || k;
  }, [productNameById]);

  useEffect(() => {
    if (!eventRef) return;
    setOrdersLoading(true);

    return onSnapshot(
      query(collection(eventRef, "orders"), orderBy("createdAt", "desc")),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            customerName: data.customerName || "",
            note: data.note || "",
            quantities: (data.quantities || {}) as Record<string, number>,
            totalItems: Number(data.totalItems || 0),
            totalAmount: Number(data.totalAmount || 0),
            status: normalizeOrderStatus(data.status),
            channel: data.channel || "other",
            deliveryDate: data.deliveryDate || "",
            deliveryMode: data.deliveryMode || "none",
            deliveryTimeSlot: data.deliveryTimeSlot || "",
            locationLink: data.locationLink || "",
            createdAt: data.createdAt,
            deliveredAt: data.deliveredAt,
          };
        });
        setOrders(list);
        setOrdersLoading(false);
      },
      () => {
        setOrdersError(t("eventPanel.err.ordersLoad"));
        setOrdersLoading(false);
      }
    );
  }, [eventRef, t]);

  const validOrders = useMemo(() => {
  return orders.filter((o) => normalizeOrderStatus(o.status) !== "cancelled");
}, [orders]);

const totalOrders = validOrders.length;

const pendingCount = useMemo(() => {
  return validOrders.filter((o) =>
    isOpenOrderStatus(o.status)
  ).length;
}, [validOrders]);

const deliveredCount = useMemo(() => {
  return validOrders.filter((o) => normalizeOrderStatus(o.status) === "delivered").length;
}, [validOrders]);

const ordersRevenueSum = useMemo(() => {
  return validOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
}, [validOrders]);
  const revenueOfficial = useMemo(() => Number(event?.revenueYen || 0), [event?.revenueYen]);
  const isActive = status === "active";

  const uniqueOrderDates = useMemo(() => {
    const set = new Set<string>();
validOrders.forEach((o) => {
  if (o.deliveryDate) set.add(o.deliveryDate);
});
    return Array.from(set).sort();
}, [validOrders]);

  const filteredOrders = useMemo(() => {
if (!filterDate || filterDate === "todas") return validOrders;
return validOrders.filter((o) => o.deliveryDate === filterDate);
}, [validOrders, filterDate]);

  const productionSummary = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach((order) => {
      Object.entries(order.quantities || {}).forEach(([key, qty]) => {
        const q = Number(qty || 0);
        if (!q) return;
        const label = resolveItemLabel(key);
        if (label) map[label] = (map[label] || 0) + q;
      });
    });
    return Object.entries(map).map(([name, totalQty]) => ({ name, totalQty })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [filteredOrders, resolveItemLabel]);

  const selectedProductSet = useMemo(() => new Set(productIds), [productIds]);
  const selectedOfferSet = useMemo(() => new Set(offerIds), [offerIds]);
  const productById = useMemo(
    () => new Map(allProducts.map((product) => [product.id, product])),
    [allProducts],
  );
  const offerById = useMemo(
    () => new Map(allOffers.map((offer) => [offer.id, offer])),
    [allOffers],
  );
  const requiredProductIds = useMemo(() => {
    const result = new Set<string>();
    offerIds.forEach((offerId) => {
      offerById.get(offerId)?.eligibleProductIds.forEach((productId) => {
        if (productById.has(productId)) result.add(productId);
      });
    });
    return result;
  }, [offerById, offerIds, productById]);

  const selectableOffers = useMemo(
    () =>
      allOffers.filter((offer) =>
        offer.eligibleProductIds.every((productId) => productById.has(productId)),
      ),
    [allOffers, productById],
  );

  const toggleEventOffer = useCallback((offer: OfferDoc) => {
    const selecting = !selectedOfferSet.has(offer.id);

    setOfferIds((current) => {
      const next = new Set(current);
      if (selecting) next.add(offer.id);
      else next.delete(offer.id);
      return Array.from(next);
    });

    if (selecting) {
      const eligibleIds = offer.eligibleProductIds.filter((productId) => productById.has(productId));
      setProductIds((current) => uniqStrings([...current, ...eligibleIds]));
      setProductAvailabilityModes((current) => {
        const next = { ...current };
        eligibleIds.forEach((productId) => {
          if (!next[productId]) next[productId] = defaultEventProductMode(productById.get(productId));
        });
        return next;
      });
    }
  }, [productById, selectedOfferSet]);

  const setEventProductMode = useCallback((productId: string, mode: ProductSelectionMode) => {
    if (mode === "excluded" && requiredProductIds.has(productId)) return;

    setProductIds((current) => {
      const next = new Set(current);
      if (mode === "excluded") next.delete(productId);
      else next.add(productId);
      return Array.from(next);
    });

    setProductAvailabilityModes((current) => {
      const next = { ...current };
      if (mode === "excluded") delete next[productId];
      else next[productId] = mode;
      return next;
    });
  }, [requiredProductIds]);

  const selectAllEventProducts = useCallback(() => {
    setProductIds(allProducts.map((product) => product.id));
    setProductAvailabilityModes(
      Object.fromEntries(
        allProducts.map((product) => [product.id, defaultEventProductMode(product)]),
      ) as Record<string, EventProductMode>,
    );
  }, [allProducts]);

  const clearEventProducts = useCallback(() => {
    const requiredIds = Array.from(requiredProductIds);
    setProductIds(requiredIds);
    setProductAvailabilityModes(
      Object.fromEntries(
        requiredIds.map((productId) => [
          productId,
          productAvailabilityModes[productId] ?? defaultEventProductMode(productById.get(productId)),
        ]),
      ) as Record<string, EventProductMode>,
    );
    setFeaturedProductIds([]);
  }, [productAvailabilityModes, productById, requiredProductIds]);

  const applySellerDefaults = useCallback(() => {
    setError(null);
    setSuccess(null);
    if (!profile) {
      setError(t("eventPanel.err.defaultsNotLoaded"));
      return;
    }
    if (profile.whatsapp) setWhatsapp(profile.whatsapp);
    if (profile.pickupLink) setPickupLink(profile.pickupLink);
    if (profile.pickupNote) setPickupNote(profile.pickupNote);
    if (profile.messengerId) setMessengerId(profile.messengerId);
    if (profile.regionName) setRegion(profile.regionName);
    setSuccess(t("eventPanel.msg.sellerDefaultsApplied"));
  }, [profile, t]);

  const handleSaveConfig = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!eventRef) return;

    if (!title.trim()) {
      setError(t("eventPanel.err.requiredTitle"));
      return;
    }

    const newDeliveryDates = deliveryDatesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const cleanedProductIds = uniqStrings([
      ...productIds,
      ...Array.from(requiredProductIds),
    ]);
    const prodSet = new Set(cleanedProductIds);
    const cleanedAvailabilityModes = Object.fromEntries(
      cleanedProductIds.map((productId) => [
        productId,
        productAvailabilityModes[productId] ?? defaultEventProductMode(productById.get(productId)),
      ]),
    ) as Record<string, EventProductMode>;
    const fixedFeatured = uniqStrings(featuredProductIds).filter((pid) => prodSet.has(pid));

    setSaving(true);
    try {
      const productsById = new Map(allProducts.map((p) => [p.id, p]));
      const itemsSnap = await getDocs(collection(eventRef, "items"));
      const existingItemIds = new Set<string>(itemsSnap.docs.map((d) => d.id));
      const offersSnap = await getDocs(collection(eventRef, "offers"));
      const existingOfferIds = new Set<string>(offersSnap.docs.map((d) => d.id));
      const offersById = new Map(allOffers.map((offer) => [offer.id, offer]));
      const cleanedOfferIds = uniqStrings(offerIds).filter((offerId) => offersById.has(offerId));
      const selectedOfferIdSet = new Set(cleanedOfferIds);

      const batch = writeBatch(db);

      for (const oldItemId of existingItemIds) {
        if (!prodSet.has(oldItemId)) {
          batch.delete(doc(eventRef, "items", oldItemId));
        }
      }

      for (const productId of cleanedProductIds) {
        const product = productsById.get(productId);
        if (!product) continue;

        const itemRef = doc(eventRef, "items", productId);
        const payload = stripUndefined({
          ...buildEventItemPayload(product, cleanedAvailabilityModes[productId]),
          createdAt: existingItemIds.has(productId) ? undefined : serverTimestamp(),
        });

        batch.set(itemRef, payload, { merge: true });
      }

      for (const oldOfferId of existingOfferIds) {
        if (!selectedOfferIdSet.has(oldOfferId)) {
          batch.delete(doc(eventRef, "offers", oldOfferId));
        }
      }

      for (const offerId of cleanedOfferIds) {
        const offer = offersById.get(offerId);
        if (!offer) continue;

        batch.set(
          doc(eventRef, "offers", offerId),
          {
            schemaVersion: 2,
            sourceOfferId: offer.id,
            content: offer.content,
            status: "active",
            eligibleProductIds: offer.eligibleProductIds,
            requiredQuantity: offer.requiredQuantity,
            pricing: offer.pricing,
            startsAt: offer.startsAt ?? null,
            endsAt: offer.endsAt ?? null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: authUser?.uid ?? sellerUid,
            updatedBy: authUser?.uid ?? sellerUid,
          },
          { merge: true },
        );
      }

      batch.update(eventRef, {
        title: title.trim(),
        regionName: region.trim(),
        whatsapp: whatsapp.trim(),
        status,
        pickupLink: pickupLink.trim(),
        pickupNote: pickupNote.trim(),
        messengerId: messengerId.trim(),
        deliveryDates: newDeliveryDates,
        deliveryDateLabel: newDeliveryDates.join(" • "),
        productIds: cleanedProductIds,
        productAvailabilityModes: cleanedAvailabilityModes,
        featuredProductIds: fixedFeatured,
        offerIds: cleanedOfferIds,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setProductIds(cleanedProductIds);
      setProductAvailabilityModes(cleanedAvailabilityModes);
      setFeaturedProductIds(fixedFeatured);
      setOfferIds(cleanedOfferIds);
      setSuccess(t("eventPanel.msg.saved"));
    } catch {
      setError(t("eventPanel.err.saveEvent"));
    } finally {
      setSaving(false);
    }
  }, [eventRef, title, region, whatsapp, status, pickupLink, pickupNote, messengerId, deliveryDatesText, productIds, productAvailabilityModes, productById, requiredProductIds, featuredProductIds, allProducts, allOffers, offerIds, authUser?.uid, sellerUid, t]);

      const deliveryOrders = useMemo(() => {
  return orders.filter((o) => {
    const mode = String(o.deliveryMode || "").toLowerCase();
    const st = normalizeOrderStatus(o.status);
    return mode === "delivery" && isOpenOrderStatus(st);
  });
}, [orders]);

  const handleSetOrderStatus = useCallback(async (orderId: string, nextStatus: OrderStatus) => {
    if (!sellerUid || !safeId) return;
    try {
      await updateSellerOrderStatus({
        source: "event",
        sellerId: sellerUid,
        eventId: safeId,
        orderId,
        status:
          nextStatus === "ready" ||
          nextStatus === "delivered" ||
          nextStatus === "cancelled"
            ? nextStatus
            : "pending",
      });
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : t("eventPanel.err.updateOrderStatus"),
      );
    }
  }, [safeId, sellerUid, t]);

  const handleCloseEvent = useCallback(async () => {
    if (!isActive || !eventRef) return;
    const revenue = Math.round(ordersRevenueSum);

    setSaving(true);
    try {
      await updateDoc(eventRef, { status: "closed", revenueYen: revenue, closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setStatus("closed");
      setSuccess(t("eventPanel.msg.closedWithRevenue").replace("{value}", yen(revenue)));
    } catch {
      setError(t("eventPanel.err.closeEvent"));
    } finally {
      setSaving(false);
    }
  }, [eventRef, isActive, ordersRevenueSum, t, yen]);

  const pendingOrdersList = useMemo(() => {
  return orders.filter((o) =>
    isOpenOrderStatus(o.status)
  );
}, [orders]);

const deliveredOrdersList = useMemo(() => {
  return orders.filter((o) => normalizeOrderStatus(o.status) === "delivered");
}, [orders]);

  const totalUnreadMessages = useMemo(() => {
  return Object.values(messageSummaries).reduce((acc, item) => acc + item.unreadCount, 0);
}, [messageSummaries]);

const messageList = useMemo(() => {
  return Object.values(messageSummaries).sort((a, b) => {
    const at = a.lastAt?.toMillis?.() || 0;
    const bt = b.lastAt?.toMillis?.() || 0;
    return bt - at;
  });
}, [messageSummaries]);

useEffect(() => {
  if (!eventRef || orders.length === 0) {
    setMessageSummaries({});
    return;
  }

  const unsubs = orders.map((order) => {
    return onSnapshot(
      query(collection(eventRef, "orders", order.id, "messages"), orderBy("createdAt", "desc")),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const last = docs[0];

        const unreadCount = docs.filter((m: any) => {
          return m.senderRole === "customer" && !m.sellerReadAt;
        }).length;

        setMessageSummaries((prev) => ({
          ...prev,
          [order.id]: {
            orderId: order.id,
            customerName: order.customerName || t("eventPanel.orders.customerFallback"),
            lastText: String(last?.text || ""),
            lastAt: last?.createdAt,
            unreadCount,
            totalCount: docs.length,
          },
        }));
      }
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}, [eventRef, orders, t]);

const markOrderMessagesAsRead = useCallback(
  async (orderId: string) => {
    if (!eventRef) return;

    const snap = await getDocs(collection(eventRef, "orders", orderId, "messages"));

    await Promise.all(
      snap.docs.map((d) => {
        const data = d.data() as any;

        if (data.senderRole !== "customer" || data.sellerReadAt) {
          return Promise.resolve();
        }

        return updateDoc(doc(eventRef, "orders", orderId, "messages", d.id), {
          sellerReadAt: serverTimestamp(),
        });
      })
    );
  },
  [eventRef]
);

  if (!safeId) return null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 bg-white p-4 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-white sm:p-6">
      <PageHeader
        eyebrow={t("eventPanel.title")}
        title={title || t("eventPanel.title")}
        back={<BackLink href="/seller/events" label={t("eventPanel.btn.back")} />}
        description={`ID: ${safeId}${event?.createdAt ? ` • ${fmtDate(event.createdAt)}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/event/${sellerUid}/${safeId}`}
              target="_blank"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
            >
              {t("eventPanel.btn.openLandpage")}
            </Link>
            <button
              type="button"
              onClick={handleCloseEvent}
              disabled={saving || !isActive}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-5 text-xs font-black text-white shadow-sm transition disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {saving ? t("eventPanel.btn.processing") : t("eventPanel.btn.closeEvent")}
            </button>
          </div>
        }
        meta={<StatusBadge status={status} t={t} />}
      />

      {(error || success) && (
        <FeedbackBanner tone={error ? "error" : "success"} role={error ? "alert" : "status"}>
          {error || success}
        </FeedbackBanner>
      )}

      <MetricStrip
        items={[
          { label: t("eventPanel.cards.officialRevenue.title"), value: revenueOfficial > 0 ? yen(revenueOfficial) : "—", tone: "success" },
          { label: t("eventPanel.cards.estimatedRevenue.title"), value: ordersRevenueSum > 0 ? yen(ordersRevenueSum) : "—" },
          { label: t("eventPanel.cards.orders.title"), value: totalOrders },
          { label: t("eventPanel.cards.delivered.title"), value: deliveredCount, tone: pendingCount > 0 ? "warning" : "success" },
        ]}
      />

      {/* NAVEGAÇÃO INTERNA TABS */}
      <nav className="flex flex-wrap gap-1.5 border-b border-neutral-100 dark:border-neutral-800 pb-2">
        {(["orders", "deliveries", "production", "messages", "config"] as TabKey[]).map((k) => (
<TabButton key={k} active={tab === k} onClick={() => setTabPush(k)}>
  <span className="inline-flex items-center gap-1.5">
    {t(`eventPanel.tabs.${k}`)}
    {k === "messages" && totalUnreadMessages > 0 && (
      <span className="min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center px-1">
        {totalUnreadMessages}
      </span>
    )}
  </span>
</TabButton>        ))}
      </nav>

      {/* RENDER TAB CONTEÚDO */}
{tab === "orders" && (
  <div className="space-y-6 animate-fade-in">
    <OrderGroup
      title={t("eventPanel.orders.pendingTitle") || "Pedidos pendentes"}
      empty={t("eventPanel.orders.emptyPending") || "Nenhum pedido pendente."}
      orders={pendingOrdersList}
      ordersLoading={ordersLoading}
      ordersError={ordersError}
      t={t}
      lang={lang}
      safeId={safeId}
      yen={yen}
      fmtDate={fmtDate}
      resolveItemLabel={resolveItemLabel}
      handleSetOrderStatus={handleSetOrderStatus}
      eventStatus={status}
    />

    <OrderGroup
      title={t("eventPanel.orders.deliveredTitle") || "Pedidos entregues/finalizados"}
      empty={t("eventPanel.orders.emptyDelivered") || "Nenhum pedido entregue ainda."}
      orders={deliveredOrdersList}
      ordersLoading={false}
      ordersError={null}
      t={t}
      lang={lang}
      safeId={safeId}
      yen={yen}
      fmtDate={fmtDate}
      resolveItemLabel={resolveItemLabel}
      handleSetOrderStatus={handleSetOrderStatus}
      eventStatus={status}
    />
  </div>
)}

      {tab === "deliveries" && (
  <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4 animate-fade-in">
    <div className="space-y-0.5">
      <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        {t("eventPanel.deliveries.title")}
      </h2>
      <p className="text-xs text-neutral-400 font-medium">
        {t("eventPanel.deliveries.subtitle")}
      </p>
    </div>

    {ordersLoading ? (
      <p className="text-xs font-bold text-neutral-400">
        {t("eventPanel.deliveries.loading")}
      </p>
    ) : deliveryOrders.length === 0 ? (
      <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">
        {t("eventPanel.deliveries.empty")}
      </p>
    ) : (
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {deliveryOrders.map((o) => (
          <div key={o.id} className="py-4 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-black text-neutral-900 dark:text-white">
                  {o.customerName || t("eventPanel.orders.customerFallback")}
                </p>

                <p className="text-[11px] font-bold text-neutral-400">
                  {o.deliveryDate
                    ? t("eventPanel.deliveries.date").replace("{date}", o.deliveryDate)
                    : t("eventPanel.deliveries.noDate")}
                  {o.deliveryTimeSlot ? ` • ${o.deliveryTimeSlot}` : ""}
                </p>

                {o.note && (
                  <p className="text-xs font-medium text-neutral-500 max-w-md">
                    {t("eventPanel.orders.note").replace("{text}", o.note)}
                  </p>
                )}

                {o.locationLink && (
                  <a
                    href={o.locationLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs font-black underline text-blue-600 dark:text-blue-400"
                  >
                    Google Maps
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSetOrderStatus(o.id, "delivered")}
                className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-5 py-2.5 shadow-md transition"
              >
                {t("eventPanel.deliveries.btn.delivered")}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(o.quantities || {})
                .filter(([, q]) => q > 0)
                .map(([k, q]) => (
                  <span
                    key={k}
                    className="text-[10px] font-black border border-neutral-200 dark:border-neutral-800 rounded-xl px-2.5 py-1 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
                  >
                    {resolveItemLabel(k)}: {q}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
)}

      {tab === "production" && (
        <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("eventPanel.production.title")}</h2>
              <p className="text-xs text-neutral-400 font-medium">{t("eventPanel.production.subtitle")}</p>
            </div>
            <select className="border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs bg-white dark:bg-neutral-900 font-bold h-[38px]" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
              <option value="todas">{t("eventPanel.production.filterAll")}</option>
              {uniqueOrderDates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="overflow-hidden border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900 shadow-sm">
            {productionSummary.length === 0 ? (
              <p className="text-xs font-bold text-neutral-400 italic p-6 text-center">{t("eventPanel.production.empty")}</p>
            ) : (
              <table className="min-w-full text-xs border-collapse">
                <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t("eventPanel.production.table.product")}</th>
                    <th className="text-right px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{t("eventPanel.production.table.totalQty")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/40 font-medium">
                  {productionSummary.map((item) => (
                    <tr key={item.name} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition">
                      <td className="px-4 py-3 text-neutral-900 dark:text-neutral-200 font-bold">{item.name}</td>
                      <td className="px-4 py-3 text-right text-neutral-900 dark:text-white font-black">{item.totalQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === "messages" && (
  <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4 animate-fade-in">
    <div className="space-y-0.5">
      <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        {t("eventPanel.messages.title")}
      </h2>
      <p className="text-xs text-neutral-400 font-medium">
        {t("eventPanel.messages.subtitle")}
      </p>
    </div>

    {messageList.length === 0 ? (
      <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">
        {t("eventPanel.messages.empty")}
      </p>
    ) : (
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {messageList.map((m) => (
          <div key={m.orderId} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-neutral-900 dark:text-white">
                  {m.customerName}
                </p>

                {m.unreadCount > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-[10px] font-black px-2 py-0.5">
                    {m.unreadCount}
                  </span>
                )}
              </div>

              <p className="text-xs text-neutral-500 line-clamp-1">
                {m.lastText || t("eventPanel.messages.noPreview")}
              </p>

              {m.lastAt && (
                <p className="text-[10px] font-mono text-neutral-400">
                  {fmtDate(m.lastAt)}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => markOrderMessagesAsRead(m.orderId)}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-4 py-2 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white"
              >
                {t("eventPanel.messages.markRead")}
              </button>

              <Link
                href={`/seller/events/${safeId}/orders/${m.orderId}`}
                className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-4 py-2"
              >
                {t("eventPanel.messages.open")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
)}

      {tab === "config" && (
        <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("eventPanel.config.title")}</h2>
              <p className="text-xs text-neutral-400 font-medium">{t("eventPanel.config.subtitle")}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={applySellerDefaults} className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-4 py-2 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white hover:bg-neutral-50 transition">{t("eventPanel.config.btn.applySellerDefaults")}</button>
              <button onClick={handleSaveConfig} disabled={saving} className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-5 py-2 hover:opacity-90 shadow-md transition">{t("eventPanel.config.btn.save")}</button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 bg-white dark:bg-neutral-900 p-6 border border-neutral-200 dark:border-neutral-800 rounded-3xl">
            <Field label={t("eventPanel.config.field.title")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label={t("eventPanel.config.field.region")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={region} onChange={(e) => setRegion(e.target.value)} /></Field>
            <Field label={t("eventPanel.config.field.whatsapp")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
            <Field label={t("eventPanel.config.field.status")}>
              <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none h-[46px]" disabled={saving}>
                <option value="active">{t("eventPanel.status.active")}</option>
                <option value="closed">{t("eventPanel.status.closed")}</option>
                <option value="cancelled">{t("eventPanel.status.cancelled")}</option>
              </select>
            </Field>
            <Field label={t("eventPanel.config.field.messengerId")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={messengerId} onChange={(e) => setMessengerId(e.target.value)} /></Field>
            <Field label={t("eventPanel.config.field.pickupLink")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={pickupLink} onChange={(e) => setPickupLink(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label={t("eventPanel.config.field.pickupNote")}><input className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none" value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label={t("eventPanel.config.field.deliveryDates")}><textarea className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm min-h-[100px] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none resize-none" value={deliveryDatesText} onChange={(e) => setDeliveryDatesText(e.target.value)} /></Field></div>
          </div>

          <div className="bg-orange-50/40 dark:bg-orange-950/10 p-6 border border-orange-200 dark:border-orange-900/40 rounded-3xl space-y-4">
            <div className="flex items-center gap-3">
              <Gift className="h-6 w-6 text-orange-500" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">
                  {lang === "ja" ? "イベントのオファーとセット" : lang === "en" ? "Event offers and kits" : "Ofertas e kits do evento"}
                </h3>
                <p className="mt-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                  {lang === "ja"
                    ? "選択すると対象商品も自動でイベントに追加されます。"
                    : lang === "en"
                      ? "Selecting an offer automatically includes all eligible products."
                      : "Ao selecionar uma oferta, todos os produtos participantes entram automaticamente no evento."}
                </p>
              </div>
            </div>

            {allOffersLoading ? (
              <p className="py-4 text-center text-xs font-bold text-neutral-400">{t("products.updating")}</p>
            ) : allOffersError ? (
              <p className="py-4 text-center text-xs font-bold text-red-500">{allOffersError}</p>
            ) : selectableOffers.length === 0 ? (
              <p className="py-4 text-center text-xs font-bold text-neutral-400">
                {lang === "ja" ? "利用できるオファーはありません。" : lang === "en" ? "No eligible offers found." : "Nenhuma oferta disponível."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectableOffers.map((offer) => {
                  const checked = selectedOfferSet.has(offer.id);
                  const localized = resolveLocalizedOfferText(
                    offer.content,
                    lang === "en" || lang === "ja" ? lang : "pt",
                    lang === "en" || lang === "ja" ? lang : "pt",
                  );
                  const priceLabel =
                    offer.pricing.mode === "fixed_total"
                      ? `${formatMoneyMinor(offer.pricing.regularTotalMinor ?? 0, profile?.currency ?? "JPY", profile?.regionalLocale ?? "ja-JP")} → ${formatMoneyMinor(offer.pricing.promotionalTotalMinor ?? 0, profile?.currency ?? "JPY", profile?.regionalLocale ?? "ja-JP")}`
                      : offer.pricing.mode === "fixed_discount"
                        ? `- ${formatMoneyMinor(offer.pricing.discountMinor ?? 0, profile?.currency ?? "JPY", profile?.regionalLocale ?? "ja-JP")}`
                        : `${offer.pricing.percentage ?? 0}%`;

                  return (
                    <label
                      key={offer.id}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${checked ? "border-orange-500 bg-white ring-2 ring-orange-500/20 dark:bg-neutral-900" : "border-orange-200 bg-white/70 dark:border-orange-900/40 dark:bg-neutral-900/60"}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEventOffer(offer)}
                          disabled={saving}
                          className="mt-1 h-4 w-4 accent-orange-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-neutral-900 dark:text-white">{localized.name}</p>
                          <p className="mt-1 text-xs font-black text-orange-600 dark:text-orange-300">{priceLabel}</p>
                          <p className="mt-2 text-[10px] font-bold text-neutral-400">
                            {lang === "ja" ? "必要数" : lang === "en" ? "Required quantity" : "Quantidade necessária"}: {offer.requiredQuantity}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-neutral-900 p-6 border border-neutral-200 dark:border-neutral-800 rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  {lang === "ja" ? "イベント商品" : lang === "en" ? "Event products" : "Produtos do evento"}
                </h3>
                <p className="text-[11px] font-bold text-neutral-400 mt-1">
                  {lang === "ja"
                    ? "イベント作成後でも商品を追加・削除できます。保存を押すと公開ページも更新されます。"
                    : lang === "en"
                      ? "Add or remove products after the event was created. Saving also updates the public page."
                      : "Adicione ou remova produtos mesmo depois do evento criado. Ao salvar, a página pública também atualiza."}
                </p>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={selectAllEventProducts} disabled={allProductsLoading || saving} className="text-xs font-black underline text-neutral-900 dark:text-white disabled:opacity-40">
                  {lang === "ja" ? "すべて選択" : lang === "en" ? "Select all" : "Selecionar todos"}
                </button>
                <button type="button" onClick={clearEventProducts} disabled={saving} className="text-xs font-black underline text-neutral-400 dark:text-neutral-500 disabled:opacity-40">
                  {t("common.clear")}
                </button>
              </div>
            </div>

            {allProductsLoading ? (
              <p className="text-xs font-bold text-neutral-400 py-4 text-center">{t("products.updating")}</p>
            ) : allProductsError ? (
              <p className="text-xs font-bold text-red-500 py-4 text-center">{allProductsError}</p>
            ) : allProducts.length === 0 ? (
              <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">
                {lang === "ja" ? "商品がありません。" : lang === "en" ? "No products found." : "Nenhum produto encontrado."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[520px] overflow-y-auto pr-1 scrollbar-none">
                {allProducts.map((p) => {
                  const selected = selectedProductSet.has(p.id);
                  const mode: ProductSelectionMode = selected
                    ? productAvailabilityModes[p.id] ?? defaultEventProductMode(p)
                    : "excluded";
                  const img = pickImageUrl(p);
                  const required = requiredProductIds.has(p.id);
                  const labels = lang === "ja"
                    ? { excluded: "含めない", normal: "通常販売", madeToOrder: "予約のみ" }
                    : lang === "en"
                      ? { excluded: "Do not include", normal: "Regular sale", madeToOrder: "Made to order" }
                      : { excluded: "Não incluir", normal: "Venda normal", madeToOrder: "Somente encomenda" };

                  return (
                    <div
                      key={p.id}
                      className={`group border rounded-2xl p-3 transition-all flex flex-col justify-between min-h-[245px] relative ${
                        selected
                          ? mode === "made_to_order"
                            ? "border-violet-500 bg-white dark:bg-neutral-900 shadow-md ring-2 ring-violet-500/30"
                            : "border-black bg-white dark:border-white dark:bg-neutral-900 shadow-md ring-2 ring-black dark:ring-white"
                          : "border-neutral-200 bg-white dark:border-neutral-800/40 dark:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-center justify-between z-10">
                        <span className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full uppercase ${
                          mode === "made_to_order"
                            ? "bg-violet-600 text-white"
                            : selected
                              ? "bg-black text-white dark:bg-white dark:text-black"
                              : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                        }`}>
                          {mode === "made_to_order" ? labels.madeToOrder : selected ? labels.normal : labels.excluded}
                        </span>
                      </div>

                      <div className="absolute inset-x-3 top-10 h-[100px] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/10">
                        {img ? (
                          <img src={img} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[9px] font-black text-neutral-400 uppercase">
                            {t("eventPanel.products.noImage")}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 pt-[112px]">
                        <div>
                          <p className="text-xs font-black text-neutral-900 dark:text-white truncate tracking-tight">{p.name}</p>
                          <p className="text-[10px] font-bold text-neutral-400 truncate">
                            {yen(Number(p.price || 0))} {p.category ? `• ${p.category}` : ""}
                          </p>
                          {required && (
                            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-orange-500">
                              {lang === "ja" ? "セット必須" : lang === "en" ? "Required by kit" : "Obrigatório pelo kit"}
                            </p>
                          )}
                          <p className="text-[10px] font-black text-neutral-400">
                            {lang === "ja" ? "在庫: " : lang === "en" ? "Stock: " : "Estoque: "}{p.stockQty ?? "—"}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => setEventProductMode(p.id, "excluded")}
                            disabled={saving || required}
                            className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${mode === "excluded" ? "bg-neutral-800 text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                          >
                            {labels.excluded}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventProductMode(p.id, "normal")}
                            disabled={saving}
                            className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition ${mode === "normal" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                          >
                            {labels.normal}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventProductMode(p.id, "made_to_order")}
                            disabled={saving}
                            className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition ${mode === "made_to_order" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"}`}
                          >
                            {labels.madeToOrder}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

// --- 🛠️ Componentes Locais de Interface ---

function OrderGroup({
  title,
  empty,
  orders,
  ordersLoading,
  ordersError,
  t,
  lang,
  safeId,
  yen,
  fmtDate,
  resolveItemLabel,
  handleSetOrderStatus,
  eventStatus,
}: {
  title: string;
  empty: string;
  orders: OrderDoc[];
  ordersLoading: boolean;
  ordersError: string | null;
  t: (k: string) => string;
  lang: string;
  safeId: string;
  yen: (n: number) => string;
  fmtDate: (ts?: Timestamp | null) => string;
  resolveItemLabel: (key: string) => string;
  handleSetOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  eventStatus: EventStatus;
}) {
  return (
    <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4">
      <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        {title}
      </h2>

      {ordersLoading ? (
        <p className="text-xs font-bold text-neutral-400">{t("eventPanel.orders.loading")}</p>
      ) : ordersError ? (
        <p className="text-xs font-bold text-red-500">{ordersError}</p>
      ) : orders.length === 0 ? (
        <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">{empty}</p>
      ) : (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {orders.map((o) => (
            <div key={o.id} className="py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">
                  {o.customerName || t("eventPanel.orders.customerFallback")}{" "}
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block sm:inline sm:ml-2">
                    {o.deliveryDate
                      ? t("eventPanel.orders.date").replace("{date}", o.deliveryDate)
                      : t("eventPanel.orders.noDate")}
                    {o.createdAt && ` • ${fmtDate(o.createdAt)}`}
                  </span>
                </p>

                {o.note && (
                  <p className="text-xs font-medium text-neutral-500 max-w-md">
                    {t("eventPanel.orders.note").replace("{text}", o.note)}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5 pt-2">
                  {Object.entries(o.quantities || {})
                    .filter(([, q]) => q > 0)
                    .map(([k, q]) => (
                      <span
                        key={k}
                        className="text-[10px] font-black border border-neutral-200 dark:border-neutral-800 rounded-xl px-2.5 py-1 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300"
                      >
                        {resolveItemLabel(k)}: {q}
                      </span>
                    ))}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <Link href={`/seller/events/${safeId}/orders/${o.id}`} className="text-xs font-black underline text-neutral-900 dark:text-white">
                  {lang === "ja" ? "詳細を見る" : lang === "en" ? "View details" : "Ver detalhes"}
                </Link>

                <span className="text-xs font-black text-neutral-900 dark:text-white px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                  {o.totalAmount ? yen(o.totalAmount) : "—"}
                </span>

                <select
                  value={o.status}
                  onChange={(e) => handleSetOrderStatus(o.id, e.target.value as OrderStatus)}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-neutral-900 font-bold text-neutral-900 dark:text-white"
                  disabled={eventStatus === "cancelled"}
                >
                  {FULFILLMENT_ORDER_STATUS.map((statusOption) => (
                    <option
                      key={statusOption}
                      value={statusOption}
                    >
                      {getOrderStatusLabel(
                        statusOption,
                        lang,
                      )}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status, t }: { status: EventStatus; t: (k: string) => string }) {
  const map: Record<EventStatus, string> = {
    active: "bg-emerald-500 text-white",
    closed: "bg-neutral-400 text-neutral-900 dark:text-white dark:bg-neutral-800",
    cancelled: "bg-red-500 text-white",
  };
  return <span className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${map[status]}`}>{t(`eventPanel.status.${status}`)}</span>;
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-5 py-2 text-xs font-black tracking-wide border transition-all ${active ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-sm" : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800 dark:hover:bg-neutral-800"}`}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400 dark:text-neutral-500 ml-1">{label}</label>
      {children}
    </div>
  );
}
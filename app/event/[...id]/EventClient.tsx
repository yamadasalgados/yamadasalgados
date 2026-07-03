"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
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

type CategoryName = string;
type ProductStatus = "active" | "inactive";
type DeliveryMode = "delivery" | "pickup" | "none";
type DateOption = "event-date" | "no-preference";
type TimeOption = "no-preference" | "custom";

type EventData = {
  title: string;
  region: string;
  regionId?: string;
  sellerId?: string;
  deliveryDates: string[];
  deliveryDateLabel: string;
  productIds: string[];
  featuredProductIds?: string[];
  productNames?: string[];
  featuredProductNames?: string[];
  whatsapp: string;
  messengerId?: string;
  status: string;
  pickupLink?: string;
  pickupNote?: string;
  allowDelivery?: boolean;
  allowPickup?: boolean;
};

type ProductImageData = {
  id: string;
  name: string;
  imageUrl: string;
  extraImageUrls: string[];
  price?: number;
  category?: CategoryName;
  stockQty?: number;
  lowStockThreshold?: number;
  status?: ProductStatus;
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
    ? value.filter((v) => typeof v === "string").map((s) => s.trim()).filter(Boolean)
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

function normalizeProductKey(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeCategoryDynamic(v: any): CategoryName | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function mapProductSnapToData(snap: any): Record<string, ProductImageData> {
  const map: Record<string, ProductImageData> = {};

  snap.docs.forEach((d: any) => {
    const docData = d.data() as any;
    const stockQty = typeof docData.stockQty === "number" && Number.isFinite(docData.stockQty) ? docData.stockQty : undefined;
    const lowStockThreshold =
      typeof docData.lowStockThreshold === "number" && Number.isFinite(docData.lowStockThreshold)
        ? docData.lowStockThreshold
        : undefined;

    const rawStatus: ProductStatus = docData.status === "inactive" ? "inactive" : "active";
    const isOutOfStock = typeof stockQty === "number" ? stockQty <= 0 : false;

    map[d.id] = {
      id: d.id,
      name: typeof docData.name === "string" ? docData.name : d.id,
      imageUrl:
        typeof docData.imageUrl === "string"
          ? docData.imageUrl
          : typeof docData.image === "string"
            ? docData.image
            : "",
      extraImageUrls: normalizeStringArray(docData.extraImageUrls),
      price: safeNumber(docData.price),
      category: normalizeCategoryDynamic(docData.category),
      stockQty,
      lowStockThreshold,
      status: isOutOfStock ? "inactive" : rawStatus,
    };
  });

  return map;
}

async function fetchEventPublishedProducts(sellerId: string, eventId: string, productNames: string[] = []) {
  const wantedNames = uniq(productNames);
  const result: Record<string, ProductImageData> = {};

  const itemsSnap = await getDocs(collection(db, "sellers", sellerId, "events", eventId, "items"));
  Object.assign(result, mapProductSnapToData(itemsSnap));

  const eventProductsSnap = await getDocs(collection(db, "sellers", sellerId, "events", eventId, "products"));
  Object.assign(result, mapProductSnapToData(eventProductsSnap));

  const rootProductsSnap = await getDocs(collection(db, "products"));
  const rootProductsMap = mapProductSnapToData(rootProductsSnap);

  const byName: Record<string, ProductImageData> = {};
  Object.values(rootProductsMap).forEach((p) => {
    byName[normalizeProductKey(p.name)] = p;
  });

  wantedNames.forEach((name) => {
    const found = byName[normalizeProductKey(name)];

    if (found) {
      result[name] = { ...found, id: name, name: found.name || name };
    }

    if (!result[name]) {
      result[name] = {
        id: name,
        name,
        imageUrl: "",
        extraImageUrls: [],
        price: 0,
        status: "active",
      };
    }
  });

  return result;
}

export default function EventClient({ sellerId, id }: { sellerId: string; id: string }) {
  const { t } = useI18n();

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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customerName, setCustomerName] = useState("");
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
      return an.localeCompare(bn, "pt-BR");
    });
  }, [event, productsData]);

  const dynamicCategories = useMemo(() => {
    const set = new Set<string>();
    for (const pid of sortedProductIds) {
      const c = productsData[pid]?.category;
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sortedProductIds, productsData]);

  const uncategorized = useMemo(() => sortedProductIds.filter((pid) => !productsData[pid]?.category), [sortedProductIds, productsData]);

  const visibleProductIds = useMemo(() => {
    if (activeCategory === "__all__") return sortedProductIds;
    if (activeCategory === "__other__") return uncategorized;
    return sortedProductIds.filter((pid) => (productsData[pid]?.category || "") === activeCategory);
  }, [sortedProductIds, productsData, activeCategory, uncategorized]);

  const totalAmount = useMemo(() => {
    return orderableIds.reduce((sum, pid) => {
      const q = quantities[pid] || 0;
      const price = productsData[pid]?.price || 0;
      return sum + q * price;
    }, 0);
  }, [orderableIds, quantities, productsData]);

  const fmtChatTime = useCallback((ts?: Timestamp) => {
    if (!ts) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "Asia/Tokyo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ts.toDate());
  }, []);

  const resetOrderForm = useCallback(() => {
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
      setQuantities((prev) => {
        const current = prev[productId] || 0;
        const next = current + delta;

        if (next < 0) return prev;

        const stock = productsData[productId]?.stockQty;
        if (typeof stock === "number" && Number.isFinite(stock) && next > stock) {
          return { ...prev, [productId]: stock };
        }

        return { ...prev, [productId]: next };
      });
    },
    [productsData]
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

  const getWhatsappPhone = useCallback(() => {
    let phone = (event?.whatsapp || "").replace(/\D/g, "");
    if (phone.startsWith("0")) phone = `81${phone.slice(1)}`;
    return phone;
  }, [event]);

  const buildWhatsappMessage = useCallback(() => {
    const items = orderableIds
      .filter((pid) => (quantities[pid] || 0) > 0)
      .map((pid) => {
        const item = productsData[pid];
        const name = item?.name || pid;
        const qty = quantities[pid] || 0;
        const price = item?.price || 0;
        return `• ${name} x${qty} - ¥${(qty * price).toLocaleString("ja-JP")}`;
      })
      .join("\n");

    return [
      tr("event.whatsapp.greeting", "Olá! Quero fazer um pedido:"),
      "",
      `${tr("event.whatsapp.event", "Evento")}: ${event?.title || ""}`,
      `${tr("event.whatsapp.name", "Nome")}: ${customerName || tr("event.whatsapp.not_informed", "Não informado")}`,
      `${tr("event.whatsapp.mode", "Modo")}: ${getDeliveryModeLabel(deliveryMode)}`,
      `${tr("event.whatsapp.date", "Data")}: ${getChosenDate()}`,
      `${tr("event.whatsapp.time", "Hora")}: ${getChosenTimeLabel()}`,
      deliveryMode === "delivery" && locationLink ? `${tr("event.whatsapp.location", "Localização")}: ${locationLink}` : "",
      "",
      `${tr("event.whatsapp.items", "Itens")}:`,
      items,
      "",
      `${tr("event.whatsapp.total", "Total")}: ¥${totalAmount.toLocaleString("ja-JP")}`,
      note ? `${tr("event.whatsapp.note", "Observação")}: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    tr,
    event,
    customerName,
    deliveryMode,
    getDeliveryModeLabel,
    getChosenDate,
    getChosenTimeLabel,
    locationLink,
    orderableIds,
    quantities,
    productsData,
    totalAmount,
    note,
  ]);

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

        let snap = await getDoc(doc(db, "sellers", sellerId, "events", id));
        let eventSource: "seller-events" | "root-events" = "seller-events";

        if (!snap.exists()) {
          snap = await getDoc(doc(db, "events", id));
          eventSource = "root-events";
        }

        if (!alive) return;

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const data = snap.data() as any;

        const effectiveSellerId =
          eventSource === "seller-events" ? sellerId : String(data.sellerId || sellerId);

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
          sellerId: effectiveSellerId,
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
        };

        setEvent(nextEvent);

        try {
          const eventProductNames = uniq([
            ...(nextEvent.productNames || []),
            ...(nextEvent.featuredProductNames || []),
          ]);

          const productsMap = await fetchEventPublishedProducts(effectiveSellerId, id, eventProductNames);
          setProductsData(productsMap);
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
    const effectiveSellerId = event?.sellerId || sellerId;

    if (!effectiveSellerId || !id || !lastOrderId) return;

    setChatLoading(true);

    return onSnapshot(
      query(collection(db, "sellers", effectiveSellerId, "events", id, "orders", lastOrderId, "messages"), orderBy("createdAt", "asc"), limit(200)),
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
  }, [event?.sellerId, sellerId, id, lastOrderId]);

  const registerOrderInFirestore = useCallback(
    async (channel: "whatsapp" | "messenger") => {
      if (!event) return;

      const quantitiesClean: Record<string, number> = {};

      orderableIds.forEach((pid) => {
        if ((quantities[pid] || 0) > 0) quantitiesClean[pid] = quantities[pid];
      });

      const createOrderUrl = process.env.NEXT_PUBLIC_CREATE_ORDER_URL || "";

      if (!createOrderUrl) {
        throw new Error(tr("event.error.create_order_url_missing", "NEXT_PUBLIC_CREATE_ORDER_URL não está configurado."));
      }

      const resp = await fetch(createOrderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: event.sellerId || sellerId,
          eventId: id,
          channel,
          customerName,
          note,
          deliveryMode,
          deliveryDate: getChosenDate(),
          deliveryTimeSlot: getChosenTimeLabel(),
          locationLink: deliveryMode === "delivery" ? locationLink : "",
          quantities: quantitiesClean,
          customerClientId: customerId,
        }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || tr("event.error.register_order", "Não foi possível registrar o pedido."));
      }

      if (data?.orderId) {
        setLastOrderId(data.orderId);
        setChatOpen(true);
      }
    },
    [
      event,
      sellerId,
      id,
      orderableIds,
      quantities,
      customerName,
      note,
      deliveryMode,
      locationLink,
      customerId,
      tr,
      getChosenDate,
      getChosenTimeLabel,
    ]
  );

  const handleFinalize = useCallback(async () => {
    if (submitting) return;

    try {
      setSubmitting(true);

      await registerOrderInFirestore("whatsapp");

      const phone = getWhatsappPhone();
      const message = buildWhatsappMessage();

      if (phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      } else {
        alert(tr("event.whatsapp.missing_phone", "Pedido registrado, mas o WhatsApp do vendedor não está configurado."));
      }

      resetOrderForm();
      showSentToast();
    } catch (err: any) {
      alert(err?.message || tr("event.error.register_order", "Não foi possível registrar o pedido."));
    } finally {
      setSubmitting(false);
    }
  }, [submitting, registerOrderInFirestore, getWhatsappPhone, buildWhatsappMessage, tr, resetOrderForm, showSentToast]);

  const handleSendMessenger = useCallback(async () => {
    if (submitting) return;

    try {
      setSubmitting(true);

      await registerOrderInFirestore("messenger");

      resetOrderForm();
      showSentToast();

      if (event?.messengerId) {
        window.location.href = `https://m.me/${event.messengerId}`;
      }
    } catch (err: any) {
      alert(err?.message || tr("event.error.register_order", "Não foi possível registrar o pedido."));
    } finally {
      setSubmitting(false);
    }
  }, [submitting, event, registerOrderInFirestore, resetOrderForm, showSentToast, tr]);

  const handleSendChat = useCallback(async () => {
    if (!event) return;
    if (!chatText.trim()) return;
    if (!lastOrderId) return;

    const txt = chatText.trim();
    setChatText("");

    await addDoc(collection(db, "sellers", event.sellerId || sellerId, "events", id, "orders", lastOrderId, "messages"), {
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

  return (
    <main className={MAIN_CLASS}>
      <OpenInBrowserGate url={currentUrl} />

      {sentToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
          <div className="rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black px-5 py-3 shadow-xl uppercase tracking-wider text-center">
            {tr("event.order.sent", "Pedido enviado com sucesso! Os campos foram limpos.")}
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
      </header>

      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">
          {tr("event.delivery.title", "Modo de entrega")}
        </h4>

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
                      {String(h).padStart(2, "0")}h
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
                      {String(m).padStart(2, "0")}min
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
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/60 pb-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400">
            {tr("event.products.title", "Produtos disponíveis")}
          </h2>
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

        {visibleProductIds.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center">
            <p className="text-sm font-bold text-neutral-500">
              {tr("event.products.empty", "Nenhum produto disponível neste evento.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {visibleProductIds.map((pid) => {
              const info = productsData[pid];
              const name = info?.name || pid;
              const qty = quantities[pid] ?? 0;
              const stock = typeof info?.stockQty === "number" ? info.stockQty : null;
              const isOutOfStock = stock !== null && stock <= 0;

              return (
                <div key={pid} className="border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white dark:bg-neutral-900 p-4 flex flex-col justify-between min-h-[220px] shadow-sm animate-fade-in hover:shadow-md transition">
                  <div className="space-y-2">
                    <div className="aspect-[4/3] rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 overflow-hidden flex items-center justify-center">
                      {info?.imageUrl ? (
                        <img src={info.imageUrl} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-black uppercase">
                          {tr("event.product.no_image", "Sem imagem")}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight truncate">{name}</h4>

                      <p className="text-xs font-black text-neutral-600 dark:text-neutral-400">
                        ¥{(info?.price || 0).toLocaleString("ja-JP")}
                      </p>

                      {isOutOfStock && (
                        <span className="text-[10px] font-black text-red-500 uppercase">
                          {tr("event.product.sold_out", "Esgotado")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-neutral-100 dark:border-neutral-800/40 pt-3 mt-2">
                    <span className="text-[10px] font-black uppercase text-neutral-400">
                      {tr("event.product.quantity", "Quantidade")}
                    </span>

                    <div className="inline-flex items-center gap-2">
                      <button type="button" onClick={() => adjustQuantity(pid, -1)} className="h-7 w-7 rounded-full border border-neutral-300 dark:border-neutral-700 text-sm flex items-center justify-center font-bold bg-white dark:bg-neutral-900 text-app hover:bg-neutral-50 transition">
                        -
                      </button>

                      <span className="min-w-[1.2rem] text-center font-black text-sm text-neutral-900 dark:text-white">{qty}</span>

                      <button type="button" disabled={isOutOfStock} onClick={() => adjustQuantity(pid, 1)} className="h-7 w-7 rounded-full border border-neutral-300 dark:border-neutral-700 text-sm flex items-center justify-center font-bold bg-white dark:bg-neutral-900 text-app hover:bg-neutral-50 transition disabled:opacity-30">
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <div className="space-y-3">
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={tr("event.form.customer_name", "Seu nome")}
            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none"
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("event.form.note", "Observação")}
            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:outline-none min-h-[90px]"
          />
        </div>

        {totalAmount > 0 && (
          <p className="text-sm font-black text-neutral-800 dark:text-neutral-300">
            {tr("event.order.total", "Total")}:{" "}
            <span className="text-xl text-emerald-600 dark:text-emerald-400">
              ¥{totalAmount.toLocaleString("ja-JP")}
            </span>
          </p>
        )}

        <button
          type="button"
          onClick={handleFinalize}
          disabled={submitting || totalAmount <= 0}
          className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition hover:opacity-95 shadow-xl disabled:opacity-30"
        >
          {submitting ? tr("event.order.finalizing", "Finalizando...") : tr("event.order.send_whatsapp", "Enviar pedido pelo WhatsApp")}
        </button>

        {event.messengerId && (
          <button
            type="button"
            onClick={handleSendMessenger}
            disabled={submitting || totalAmount <= 0}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition hover:opacity-95 shadow-xl disabled:opacity-30"
          >
            {submitting ? tr("event.order.finalizing", "Finalizando...") : tr("event.order.send_messenger", "Enviar pelo Messenger")}
          </button>
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
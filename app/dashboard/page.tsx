"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

/* ------------------ TIPOS ------------------ */

type CategoryType =
  | "Comida"
  | "Lanchonete"
  | "Assados"
  | "Sobremesa"
  | "Festa"
  | "Congelados"
  | "Frutas-verduras";

type EventStatus = "active" | "closed" | "cancelled";
type ProductStatus = "active" | "inactive";
type DeliveryMode = "delivery" | "pickup" | "none";
type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
type OrderChannel = "whatsapp" | "messenger" | "other";
type PaymentMethod = "cash" | "paypay" | "card" | "other";

type DashboardTab = "overview" | "products" | "events" | "orders";

/** ✅ NOVO: vendedor */
interface FirestoreSeller {
  name: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  defaultPickupNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
interface SellerWithId extends FirestoreSeller {
  id: string;
}

interface FirestoreProduct {
  name: string;
  price: number;
  category?: CategoryType;
  imageUrl?: string;
  status?: ProductStatus;

  stockQty?: number;
  lowStockThreshold?: number;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
interface ProductWithId extends FirestoreProduct {
  id: string;
}

interface FirestoreEvent {
  /** ✅ NOVO: evento por vendedor */
  sellerId: string;
  sellerNameSnapshot?: string;

  title: string;
  region: string;
  status: EventStatus;
  deliveryDateLabel?: string;
  deliveryDates?: string[];
  productNames?: string[];
  whatsapp?: string;
  pickupLink?: string;
  pickupNote?: string;
  messengerId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
interface EventWithId extends FirestoreEvent {
  id: string;
}

/** ✅ NOVO: paid + amountYen */
interface FirestoreOrder {
  customerName: string;
  note?: string | null;
  quantities: Record<string, number>;
  totalItems: number;
  status: OrderStatus;
  channel?: OrderChannel;
  deliveryDate?: string | null;
  deliveryMode?: DeliveryMode;
  deliveryTimeSlot?: string | null;
  locationLink?: string | null;

  amountYen?: number | null;
  paid?: boolean;
  paidAt?: Timestamp | null;
  paymentMethod?: PaymentMethod | null;

  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
interface OrderWithMeta extends FirestoreOrder {
  id: string;
  eventId: string;
  eventTitle: string;

  /** ✅ NOVO: pra filtrar caixa por vendedor */
  sellerId: string;
  sellerNameSnapshot?: string;
}

/** Estrutura usada apenas no formulário de edição de pedido */
interface OrderItemEdit {
  key: string;
  name: string;
  qty: string;
}

/* ------------------ HELPERS ------------------ */

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const formatYen = (n: number) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

const safeTsToMillis = (ts?: Timestamp | null) =>
  ts instanceof Timestamp ? ts.toMillis() : 0;

const formatTimestamp = (ts?: Timestamp | null) => {
  if (!ts || !(ts instanceof Timestamp)) return "-";
  const date = ts.toDate();
  return date.toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const downloadTextFile = (filename: string, text: string) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const toCsv = (rows: string[][]) => {
  const esc = (v: string) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
};

const isTestOrder = (o: OrderWithMeta) => {
  const name = (o.customerName || "").toLowerCase();
  const note = (o.note || "").toLowerCase();
  return (
    name.includes("teste") ||
    name.includes("test") ||
    note.includes("teste") ||
    note.includes("test")
  );
};

/* ------------------ COMPONENTE ------------------ */

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [products, setProducts] = useState<ProductWithId[]>([]);
  const [events, setEvents] = useState<EventWithId[]>([]);
  const [orders, setOrders] = useState<OrderWithMeta[]>([]);
  const [sellers, setSellers] = useState<SellerWithId[]>([]); // ✅ NOVO

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* ---------- FORM: PRODUTO ---------- */
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState<string>("");
  const [productCategory, setProductCategory] =
    useState<CategoryType>("Comida");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productStatus, setProductStatus] =
    useState<ProductStatus>("active");

  const [productStockQty, setProductStockQty] = useState<string>("");
  const [productLowStockThreshold, setProductLowStockThreshold] =
    useState<string>("");

  /* ---------- FORM: EVENTO ---------- */
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [eventSellerId, setEventSellerId] = useState<string>(""); // ✅ NOVO

  const [eventTitle, setEventTitle] = useState("");
  const [eventRegion, setEventRegion] = useState("");
  const [eventStatus, setEventStatus] = useState<EventStatus>("active");
  const [eventDeliveryDateLabel, setEventDeliveryDateLabel] = useState("");
  const [eventProductNamesCsv, setEventProductNamesCsv] = useState("");
  const [eventWhatsapp, setEventWhatsapp] = useState("");
  const [eventPickupLink, setEventPickupLink] = useState("");
  const [eventPickupNote, setEventPickupNote] = useState("");
  const [eventMessengerId, setEventMessengerId] = useState("");

  /* ---------- CONTROLES: PEDIDOS / FILTROS ---------- */
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterTimeSlot, setFilterTimeSlot] = useState<string>("");
  const [filterTestOnly, setFilterTestOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | "">("");
  const [searchOrders, setSearchOrders] = useState("");

  const [filterSellerId, setFilterSellerId] = useState<string>(""); // ✅ NOVO

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  /* ---------- FORM: EDIÇÃO DE PEDIDO ---------- */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderEventId, setEditingOrderEventId] =
    useState<string | null>(null);

  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [orderDeliveryDate, setOrderDeliveryDate] = useState("");
  const [orderTimeSlotEdit, setOrderTimeSlotEdit] = useState("");
  const [orderDeliveryModeEdit, setOrderDeliveryModeEdit] =
    useState<DeliveryMode>("pickup");
  const [orderLocationLink, setOrderLocationLink] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItemEdit[]>([]);

  const [orderPaid, setOrderPaid] = useState(false); // ✅ NOVO
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<PaymentMethod>("cash"); // ✅ NOVO

  /* ---------- CONTROLE PRODUÇÃO (local) ---------- */
  const [preparedMap, setPreparedMap] = useState<Record<string, number>>({});

  /* ---------- REFS ---------- */
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const orderCustomerInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------- LOAD ---------- */
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all([loadProducts(), loadSellers(), loadEvents()]);
      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao carregar dados do painel.");
    } finally {
      setLoading(false);
    }
  };

  const loadSellers = async () => {
    const sellersRef = collection(db, "sellers");
    const q = query(sellersRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const loaded: SellerWithId[] = snap.docs.map((d) => {
      const data = d.data() as FirestoreSeller;
      return {
        id: d.id,
        name: data.name,
        whatsapp: data.whatsapp,
        messengerId: data.messengerId,
        pickupLink: data.pickupLink,
        defaultPickupNote: data.defaultPickupNote,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    loaded.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setSellers(loaded);

    // se não tiver selecionado no form e existe vendedor, usa o primeiro
    if (!eventSellerId && loaded.length > 0) setEventSellerId(loaded[0].id);
  };

  const loadProducts = async () => {
    const productsRef = collection(db, "products");
    const q = query(productsRef);
    const snap = await getDocs(q);

    const loaded: ProductWithId[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as FirestoreProduct;

      const rawStock =
        typeof data.stockQty === "number" ? data.stockQty : null;
      const isOutOfStock = rawStock !== null && rawStock <= 0;

      const status: ProductStatus = isOutOfStock
        ? "inactive"
        : data.status ?? "active";

      return {
        id: docSnap.id,
        name: data.name,
        price: data.price ?? 0,
        category: data.category,
        imageUrl: data.imageUrl,
        status,
        stockQty: rawStock ?? undefined,
        lowStockThreshold: data.lowStockThreshold,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    loaded.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setProducts(loaded);
  };

  const loadEvents = async () => {
    const eventsRef = collection(db, "events");
    const q = query(eventsRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const loaded: EventWithId[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as FirestoreEvent;
      return {
        id: docSnap.id,
        sellerId: data.sellerId,
        sellerNameSnapshot: data.sellerNameSnapshot,
        title: data.title,
        region: data.region,
        status: data.status ?? "active",
        deliveryDateLabel: data.deliveryDateLabel,
        deliveryDates: data.deliveryDates ?? [],
        productNames: data.productNames ?? [],
        whatsapp: data.whatsapp,
        pickupLink: data.pickupLink,
        pickupNote: data.pickupNote,
        messengerId: data.messengerId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    setEvents(loaded);
  };

  const fetchEventsOnce = async (): Promise<EventWithId[]> => {
    const eventsRef = collection(db, "events");
    const q = query(eventsRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const loaded: EventWithId[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as FirestoreEvent;
      return {
        id: docSnap.id,
        sellerId: data.sellerId,
        sellerNameSnapshot: data.sellerNameSnapshot,
        title: data.title,
        region: data.region,
        status: data.status ?? "active",
        deliveryDateLabel: data.deliveryDateLabel,
        deliveryDates: data.deliveryDates ?? [],
        productNames: data.productNames ?? [],
        whatsapp: data.whatsapp,
        pickupLink: data.pickupLink,
        pickupNote: data.pickupNote,
        messengerId: data.messengerId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    setEvents(loaded);
    return loaded;
  };

  /** ✅ Calcula valor do pedido pelo catálogo (fallback) */
  const calcOrderAmountYen = (quantities: Record<string, number>) => {
    const priceMap = new Map(products.map((p) => [p.name, p.price]));
    let total = 0;
    Object.entries(quantities || {}).forEach(([name, qty]) => {
      const price = priceMap.get(name) ?? 0;
      total += price * qty;
    });
    return total;
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const eventsToUse = events.length ? events : await fetchEventsOnce();
      const allOrders: OrderWithMeta[] = [];

      await Promise.all(
        eventsToUse.map(async (ev) => {
          try {
            const ordersRef = collection(db, "events", ev.id, "orders");
            const q = query(ordersRef, orderBy("createdAt", "desc"));
            const snap = await getDocs(q);

            const fromThisEvent: OrderWithMeta[] = snap.docs.map((docSnap) => {
              const data = docSnap.data() as any;

              const createdAt =
                data.createdAt instanceof Timestamp ? data.createdAt : null;
              const updatedAt =
                data.updatedAt instanceof Timestamp ? data.updatedAt : null;

              const paidAt = data.paidAt instanceof Timestamp ? data.paidAt : null;

              const quantities: Record<string, number> = data.quantities ?? {};
              const fallbackAmount = calcOrderAmountYen(quantities);
              const amountYen =
                typeof data.amountYen === "number" ? data.amountYen : fallbackAmount;

              const orderData: FirestoreOrder = {
                customerName: data.customerName,
                note: data.note ?? null,
                quantities,
                totalItems: data.totalItems ?? 0,
                status: data.status ?? "pending",
                channel: data.channel ?? "whatsapp",
                deliveryDate: data.deliveryDate ?? null,
                deliveryMode: data.deliveryMode ?? "pickup",
                deliveryTimeSlot: data.deliveryTimeSlot ?? null,
                locationLink: data.locationLink ?? null,

                amountYen,
                paid: Boolean(data.paid),
                paidAt,
                paymentMethod: (data.paymentMethod as PaymentMethod) ?? null,

                createdAt,
                updatedAt,
              };

              return {
                id: docSnap.id,
                eventId: ev.id,
                eventTitle: ev.title,
                sellerId: ev.sellerId,
                sellerNameSnapshot: ev.sellerNameSnapshot,
                ...orderData,
              };
            });

            allOrders.push(...fromThisEvent);
          } catch (innerError) {
            console.error("Erro ao carregar pedidos do evento:", ev.id, innerError);
          }
        })
      );

      allOrders.sort((a, b) => safeTsToMillis(b.createdAt) - safeTsToMillis(a.createdAt));
      setOrders(allOrders);
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao carregar pedidos.");
    } finally {
      setLoadingOrders(false);
    }
  };

  /* ---------- DERIVADOS (MEMO) ---------- */

  const resumoPedidos = useMemo(() => {
    return {
      total: orders.length,
      pendentes: orders.filter((o) => o.status === "pending").length,
      confirmados: orders.filter((o) => o.status === "confirmed").length,
      entregues: orders.filter((o) => o.status === "delivered").length,
      cancelados: orders.filter((o) => o.status === "cancelled").length,
    };
  }, [orders]);

  const uniqueDates = useMemo(() => {
    return Array.from(
      new Set(
        orders
          .map((o) => o.deliveryDate)
          .filter((d): d is string => Boolean(d))
      )
    ).sort();
  }, [orders]);

  const uniqueTimeSlots = useMemo(() => {
    return Array.from(
      new Set(
        orders
          .map((o) => o.deliveryTimeSlot)
          .filter((d): d is string => Boolean(d))
      )
    ).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchOrders.trim().toLowerCase();
    return orders.filter((o) => {
      if (filterSellerId && o.sellerId !== filterSellerId) return false;
      if (filterDate && o.deliveryDate !== filterDate) return false;
      if (filterTimeSlot && o.deliveryTimeSlot !== filterTimeSlot) return false;
      if (filterTestOnly && !isTestOrder(o)) return false;
      if (filterStatus && o.status !== filterStatus) return false;

      if (q) {
        const blob = [
          o.eventTitle,
          o.customerName,
          o.note ?? "",
          o.deliveryDate ?? "",
          o.deliveryTimeSlot ?? "",
          o.deliveryMode ?? "",
          o.channel ?? "",
          Object.keys(o.quantities || {}).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filterSellerId, filterDate, filterTimeSlot, filterTestOnly, filterStatus, searchOrders]);

  /** ✅ Caixa: vendido / recebido / a receber */
  const cashflowSummary = useMemo(() => {
    const totalSold = filteredOrders.reduce((acc, o) => acc + (o.amountYen ?? 0), 0);
    const totalReceived = filteredOrders
      .filter((o) => o.paid)
      .reduce((acc, o) => acc + (o.amountYen ?? 0), 0);
    const totalToReceive = Math.max(totalSold - totalReceived, 0);

    return { totalSold, totalReceived, totalToReceive };
  }, [filteredOrders]);

  const demandByProduct = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((order) => {
      Object.entries(order.quantities || {}).forEach(([name, qty]) => {
        map.set(name, (map.get(name) ?? 0) + qty);
      });
    });
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => {
      if (typeof p.stockQty !== "number") return false;
      const threshold = p.lowStockThreshold ?? 10;
      return p.stockQty > 0 && p.stockQty <= threshold;
    });
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter((p) => {
      const stock = typeof p.stockQty === "number" ? p.stockQty : null;
      return stock !== null && stock <= 0;
    });
  }, [products]);

  /* ---------- SELEÇÃO (PEDIDOS) ---------- */

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAllVisible = () => {
    setSelectedOrderIds((prev) => {
      const visibleIds = filteredOrders.map((o) => o.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const clearSelection = () => setSelectedOrderIds([]);

  /* ---------- CRUD: PRODUTO ---------- */

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductName("");
    setProductPrice("");
    setProductCategory("Comida");
    setProductImageUrl("");
    setProductStatus("active");
    setProductStockQty("");
    setProductLowStockThreshold("");
  };

  const handleEditProduct = (p: ProductWithId) => {
    setEditingProductId(p.id);
    setProductName(p.name);
    setProductPrice(String(p.price ?? ""));
    setProductCategory(p.category ?? "Comida");
    setProductImageUrl(p.imageUrl ?? "");
    setProductStatus(p.status ?? "active");
    setProductStockQty(typeof p.stockQty === "number" ? String(p.stockQty) : "");
    setProductLowStockThreshold(
      typeof p.lowStockThreshold === "number" ? String(p.lowStockThreshold) : ""
    );
    setActiveTab("products");
  };

  const handleSubmitProduct = async (eventSubmit: React.FormEvent) => {
    eventSubmit.preventDefault();
    setErrorMessage(null);

    const priceNumber = Number(productPrice.replace(",", "."));
    if (!productName.trim()) {
      setErrorMessage("Nome do produto é obrigatório.");
      return;
    }
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      setErrorMessage("Preço inválido.");
      return;
    }

    const stockRaw = productStockQty.trim();
    const lowThresholdRaw = productLowStockThreshold.trim();

    const stockNumber = stockRaw === "" ? null : Number(stockRaw.replace(",", "."));
    const lowThresholdNumber =
      lowThresholdRaw === "" ? null : Number(lowThresholdRaw.replace(",", "."));

    if (stockNumber !== null && (Number.isNaN(stockNumber) || stockNumber < 0)) {
      setErrorMessage("Estoque inválido. Use um número maior ou igual a zero.");
      return;
    }

    if (
      lowThresholdNumber !== null &&
      (Number.isNaN(lowThresholdNumber) || lowThresholdNumber < 0)
    ) {
      setErrorMessage("Limite de alerta inválido. Use um número maior ou igual a zero.");
      return;
    }

    let finalStatus: ProductStatus = productStatus;
    if (stockNumber !== null && stockNumber <= 0) finalStatus = "inactive";

    const payload: FirestoreProduct = {
      name: productName.trim(),
      price: priceNumber,
      category: productCategory,
      imageUrl: productImageUrl.trim() || undefined,
      status: finalStatus,
      updatedAt: serverTimestamp() as unknown as Timestamp,
      ...(editingProductId ? {} : { createdAt: serverTimestamp() as unknown as Timestamp }),
      ...(stockNumber !== null ? { stockQty: stockNumber } : {}),
      ...(lowThresholdNumber !== null ? { lowStockThreshold: lowThresholdNumber } : {}),
    };

    try {
      if (editingProductId) {
        const ref = doc(db, "products", editingProductId);
        await updateDoc(ref, payload as DocumentData);
      } else {
        const ref = collection(db, "products");
        await addDoc(ref, payload as DocumentData);
      }

      await loadProducts();
      resetProductForm();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao salvar produto.");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este produto? Ele sairá dos próximos eventos (se não for mais usado)."
    );
    if (!confirmed) return;

    try {
      const ref = doc(db, "products", productId);
      await deleteDoc(ref);
      await loadProducts();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao excluir produto. Verifique as regras do Firestore (permissão).");
    }
  };

  /* ---------- CRUD: EVENTO ---------- */

  const resetEventForm = () => {
    setEditingEventId(null);

    setEventSellerId(sellers[0]?.id ?? ""); // ✅

    setEventTitle("");
    setEventRegion("");
    setEventStatus("active");
    setEventDeliveryDateLabel("");
    setEventProductNamesCsv("");
    setEventWhatsapp("");
    setEventPickupLink("");
    setEventPickupNote("");
    setEventMessengerId("");
  };

  const handleEditEvent = (ev: EventWithId) => {
    setEditingEventId(ev.id);

    setEventSellerId(ev.sellerId); // ✅

    setEventTitle(ev.title);
    setEventRegion(ev.region);
    setEventStatus(ev.status ?? "active");
    setEventDeliveryDateLabel(ev.deliveryDateLabel ?? "");
    setEventProductNamesCsv((ev.productNames ?? []).join(", "));
    setEventWhatsapp(ev.whatsapp ?? "");
    setEventPickupLink(ev.pickupLink ?? "");
    setEventPickupNote(ev.pickupNote ?? "");
    setEventMessengerId(ev.messengerId ?? "");
    setActiveTab("events");
  };

  /** ✅ ao trocar vendedor no form, opcionalmente puxa defaults */
  const applySellerDefaults = (sellerId: string) => {
    const s = sellers.find((x) => x.id === sellerId);
    if (!s) return;

    // só preenche se o campo estiver vazio (pra não sobrescrever o que você digitou)
    if (!eventWhatsapp.trim() && s.whatsapp) setEventWhatsapp(s.whatsapp);
    if (!eventMessengerId.trim() && s.messengerId) setEventMessengerId(s.messengerId);
    if (!eventPickupLink.trim() && s.pickupLink) setEventPickupLink(s.pickupLink);
    if (!eventPickupNote.trim() && s.defaultPickupNote) setEventPickupNote(s.defaultPickupNote);
  };

  const handleSubmitEvent = async (eventSubmit: React.FormEvent) => {
    eventSubmit.preventDefault();
    setErrorMessage(null);

    if (!eventSellerId) {
      setErrorMessage("Selecione um vendedor para o evento.");
      return;
    }
    if (!eventTitle.trim()) {
      setErrorMessage("Título do evento é obrigatório.");
      return;
    }
    if (!eventRegion.trim()) {
      setErrorMessage("Região do evento é obrigatória.");
      return;
    }

    const productNames = eventProductNamesCsv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const seller = sellers.find((s) => s.id === eventSellerId);

    const payload: FirestoreEvent = {
      sellerId: eventSellerId,
      sellerNameSnapshot: seller?.name ?? undefined,

      title: eventTitle.trim(),
      region: eventRegion.trim(),
      status: eventStatus,
      deliveryDateLabel: eventDeliveryDateLabel.trim() || undefined,
      productNames,
      whatsapp: eventWhatsapp.trim() || undefined,
      pickupLink: eventPickupLink.trim() || undefined,
      pickupNote: eventPickupNote.trim() || undefined,
      messengerId: eventMessengerId.trim() || undefined,
      updatedAt: serverTimestamp() as unknown as Timestamp,
      ...(editingEventId ? {} : { createdAt: serverTimestamp() as unknown as Timestamp }),
    };

    try {
      if (editingEventId) {
        const ref = doc(db, "events", editingEventId);
        await updateDoc(ref, payload as DocumentData);
      } else {
        const ref = collection(db, "events");
        await addDoc(ref, payload as DocumentData);
      }

      await loadEvents();
      await loadOrders();
      resetEventForm();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao salvar evento.");
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este evento? Os pedidos associados continuarão no Firestore, mas não aparecerão mais aqui."
    );
    if (!confirmed) return;

    try {
      const ref = doc(db, "events", eventId);
      await deleteDoc(ref);
      await loadEvents();
      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao excluir evento. Verifique as regras do Firestore (permissão).");
    }
  };

  /* ---------- CRUD: PEDIDOS ---------- */

  const handleChangeOrderStatus = async (order: OrderWithMeta, newStatus: OrderStatus) => {
    try {
      const ref = doc(db, "events", order.eventId, "orders", order.id);
      await updateDoc(ref, { status: newStatus, updatedAt: serverTimestamp() } as DocumentData);
      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        "Erro ao atualizar status do pedido. Verifique as regras do Firestore (permissão)."
      );
    }
  };

  /** ✅ NOVO: marcar pago/não pago (e congelar amountYen se não existir) */
  const handleTogglePaid = async (order: OrderWithMeta, paid: boolean) => {
    try {
      const ref = doc(db, "events", order.eventId, "orders", order.id);

      const amountYen =
        typeof order.amountYen === "number" ? order.amountYen : calcOrderAmountYen(order.quantities || {});

      await updateDoc(
        ref,
        {
          paid,
          paidAt: paid ? serverTimestamp() : null,
          amountYen,
          updatedAt: serverTimestamp(),
        } as DocumentData
      );

      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar pago/não pago. Verifique as regras do Firestore.");
    }
  };

  const handleDeleteOrder = async (order: OrderWithMeta) => {
    const confirmed = window.confirm(
      `Excluir pedido de ${order.customerName} do evento "${order.eventTitle}"?`
    );
    if (!confirmed) return;

    try {
      const ref = doc(db, "events", order.eventId, "orders", order.id);
      await deleteDoc(ref);
      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao excluir pedido. Verifique as regras do Firestore (permissão).");
    }
  };

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) return;

    const toDelete = orders.filter((o) => selectedOrderIds.includes(o.id));
    if (toDelete.length === 0) return;

    const confirmed = window.confirm(
      `Excluir ${toDelete.length} pedido(s) selecionado(s)? Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        toDelete.map((o) => deleteDoc(doc(db, "events", o.eventId, "orders", o.id)))
      );
      setSelectedOrderIds([]);
      await loadOrders();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao excluir pedidos selecionados. Verifique as regras do Firestore.");
    }
  };

  const handleBulkSetStatus = async (newStatus: OrderStatus) => {
    if (selectedOrderIds.length === 0) return;
    const selected = orders.filter((o) => selectedOrderIds.includes(o.id));
    if (selected.length === 0) return;

    const confirmed = window.confirm(
      `Marcar ${selected.length} pedido(s) selecionado(s) como "${newStatus}"?`
    );
    if (!confirmed) return;

    try {
      await Promise.all(
        selected.map((o) =>
          updateDoc(
            doc(db, "events", o.eventId, "orders", o.id),
            { status: newStatus, updatedAt: serverTimestamp() } as DocumentData
          )
        )
      );
      await loadOrders();
      setSelectedOrderIds([]);
      setSelectionMode(false);
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar pedidos em lote. Verifique as regras do Firestore.");
    }
  };

  /* ---------- EDIÇÃO DE PEDIDO ---------- */

  const resetOrderEditForm = () => {
    setEditingOrderId(null);
    setEditingOrderEventId(null);
    setOrderCustomerName("");
    setOrderNote("");
    setOrderDeliveryDate("");
    setOrderTimeSlotEdit("");
    setOrderDeliveryModeEdit("pickup");
    setOrderLocationLink("");
    setOrderItems([]);
    setOrderPaid(false);
    setOrderPaymentMethod("cash");
  };

  const startEditOrder = (order: OrderWithMeta) => {
    setEditingOrderId(order.id);
    setEditingOrderEventId(order.eventId);
    setOrderCustomerName(order.customerName || "");
    setOrderNote(order.note || "");
    setOrderDeliveryDate(order.deliveryDate || "");
    setOrderTimeSlotEdit(order.deliveryTimeSlot || "");
    setOrderDeliveryModeEdit(order.deliveryMode ?? "pickup");
    setOrderLocationLink(order.locationLink || "");

    setOrderPaid(Boolean(order.paid));
    setOrderPaymentMethod((order.paymentMethod as PaymentMethod) ?? "cash");

    const items: OrderItemEdit[] = Object.entries(order.quantities || {}).map(
      ([name, qty], index) => ({
        key: `item-${order.id}-${index}`,
        name,
        qty: String(qty),
      })
    );

    setOrderItems(items.length ? items : [{ key: "item-new-0", name: "", qty: "" }]);
    setActiveTab("orders");
  };

  const addOrderItemRow = () => {
    setOrderItems((prev) => [
      ...prev,
      { key: `item-new-${Date.now()}`, name: "", qty: "" },
    ]);
  };

  const removeOrderItemRow = (key: string) => {
    setOrderItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleOrderItemChange = (key: string, field: "name" | "qty", value: string) => {
    setOrderItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmitOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!editingOrderId || !editingOrderEventId) {
      setErrorMessage("Nenhum pedido selecionado para edição.");
      return;
    }
    if (!orderCustomerName.trim()) {
      setErrorMessage("Nome do cliente é obrigatório.");
      return;
    }

    const quantities: Record<string, number> = {};
    let totalItems = 0;

    orderItems.forEach((item) => {
      const name = item.name.trim();
      const qtyNum = Number((item.qty || "0").replace(",", "."));

      if (!name) return;
      if (Number.isNaN(qtyNum) || qtyNum <= 0) return;

      const existing = quantities[name] ?? 0;
      quantities[name] = existing + qtyNum;
      totalItems += qtyNum;
    });

    try {
      const ref = doc(db, "events", editingOrderEventId, "orders", editingOrderId);

      const amountYen = calcOrderAmountYen(quantities);

      const payload: Partial<FirestoreOrder> = {
        customerName: orderCustomerName.trim(),
        note: orderNote.trim() || null,
        deliveryDate: orderDeliveryDate.trim() || null,
        deliveryTimeSlot: orderTimeSlotEdit.trim() || null,
        deliveryMode: orderDeliveryModeEdit,
        locationLink: orderLocationLink.trim() || null,
        quantities,
        totalItems,

        amountYen, // ✅ congela valor
        paid: orderPaid,
        paidAt: orderPaid ? (serverTimestamp() as unknown as Timestamp) : null,
        paymentMethod: orderPaymentMethod,

        updatedAt: serverTimestamp() as unknown as Timestamp,
      };

      await updateDoc(ref, payload as DocumentData);
      await loadOrders();
      resetOrderEditForm();
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao salvar alterações do pedido. Verifique permissões do Firestore.");
    }
  };

  /* ---------- EXPORTS ---------- */

  const exportOrdersCsv = () => {
    const rows: string[][] = [
      [
        "sellerId",
        "eventTitle",
        "orderId",
        "customerName",
        "status",
        "paid",
        "amountYen",
        "channel",
        "deliveryDate",
        "deliveryTimeSlot",
        "deliveryMode",
        "locationLink",
        "note",
        "totalItems",
        "items",
        "createdAt",
      ],
    ];

    filteredOrders.forEach((o) => {
      const itemsStr = Object.entries(o.quantities || {})
        .map(([n, q]) => `${n} x${q}`)
        .join(" | ");

      rows.push([
        o.sellerId ?? "",
        o.eventTitle ?? "",
        o.id ?? "",
        o.customerName ?? "",
        o.status ?? "",
        String(Boolean(o.paid)),
        String(o.amountYen ?? 0),
        o.channel ?? "",
        o.deliveryDate ?? "",
        o.deliveryTimeSlot ?? "",
        o.deliveryMode ?? "",
        o.locationLink ?? "",
        o.note ?? "",
        String(o.totalItems ?? 0),
        itemsStr,
        formatTimestamp(o.createdAt),
      ]);
    });

    downloadTextFile(
      `yamada-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows)
    );
  };

  const exportProductionCsv = () => {
    const rows: string[][] = [["item", "total", "prepared", "remaining"]];

    demandByProduct.forEach((it) => {
      const prepared = preparedMap[it.name] ?? 0;
      const remaining = Math.max(it.total - prepared, 0);
      rows.push([it.name, String(it.total), String(prepared), String(remaining)]);
    });

    downloadTextFile(
      `yamada-production-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows)
    );
  };

  /* ---------- FOCUS AUTOMÁTICO ---------- */

  useEffect(() => {
    if (activeTab === "products" && editingProductId && productNameInputRef.current) {
      productNameInputRef.current.focus();
      productNameInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTab, editingProductId]);

  useEffect(() => {
    if (activeTab === "orders" && editingOrderId && orderCustomerInputRef.current) {
      orderCustomerInputRef.current.focus();
      orderCustomerInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTab, editingOrderId]);

  /* ---------- RENDER ---------- */

  if (loading) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-neutral-600">Carregando painel...</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="sticky top-0 z-20 -mx-4 bg-white/90 px-4 pb-4 pt-4 backdrop-blur md:mx-0 md:rounded-xl md:border md:bg-white/95">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Dashboard – Yamada Salgados</h1>
            <p className="text-sm text-neutral-600">
              Painel para gerenciar <strong>produtos</strong>,{" "}
              <strong>eventos (por vendedor)</strong> e <strong>pedidos</strong>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              Atualizar dados
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setPreparedMap({});
                setFilterSellerId("");
                setFilterDate("");
                setFilterTimeSlot("");
                setFilterTestOnly(false);
                setFilterStatus("");
                setSearchOrders("");
              }}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
              title="Limpa filtros e produção local"
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["overview", "Resumo"],
              ["products", "Produtos"],
              ["events", "Eventos"],
              ["orders", "Pedidos"],
            ] as [DashboardTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-xs transition",
                activeTab === tab
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
              )}
            >
              {label}
              {tab === "orders" && (
                <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700">
                  {orders.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {errorMessage && <p className="mt-2 text-xs text-red-600">{errorMessage}</p>}
      </header>

      {/* ---------------- OVERVIEW ---------------- */}
      {activeTab === "overview" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Resumo geral</h2>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Produtos cadastrados</p>
              <p className="text-2xl font-bold">{products.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Vendedores</p>
              <p className="text-2xl font-bold">{sellers.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Eventos</p>
              <p className="text-2xl font-bold">{events.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Pedidos pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{resumoPedidos.pendentes}</p>
            </div>
          </div>

          {/* ✅ CAIXA */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Total vendido (filtros atuais)</p>
              <p className="text-2xl font-bold">{formatYen(cashflowSummary.totalSold)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Total recebido (pago)</p>
              <p className="text-2xl font-bold text-green-700">{formatYen(cashflowSummary.totalReceived)}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-neutral-500">Total a receber (não pago)</p>
              <p className="text-2xl font-bold text-amber-700">{formatYen(cashflowSummary.totalToReceive)}</p>
            </div>
          </div>

          {/* ALERTAS DE ESTOQUE */}
          {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
              <p className="text-sm font-semibold">Alertas de estoque</p>

              {lowStockProducts.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-900">Estoque baixo:</p>
                  <ul className="list-inside list-disc">
                    {lowStockProducts.map((p) => (
                      <li key={p.id}>
                        {p.name}{" "}
                        <span className="font-semibold">({p.stockQty} unid.)</span>{" "}
                        {p.lowStockThreshold !== undefined && (
                          <span className="text-[11px] text-amber-800">
                            (alerta ≤ {p.lowStockThreshold})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {outOfStockProducts.length > 0 && (
                <div>
                  <p className="font-semibold text-red-900">Sem estoque:</p>
                  <ul className="list-inside list-disc">
                    {outOfStockProducts.map((p) => (
                      <li key={p.id}>
                        {p.name} <span className="font-semibold">(0 unid.)</span>{" "}
                        <span className="text-[11px] text-red-800">(produto marcado como inativo)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-amber-900/80">
                * Próximo passo: usar estoque para travar compras e esconder produtos esgotados na landpage.
              </p>
            </div>
          )}

          {/* RESUMO / TABELA DE PRODUÇÃO */}
          <div className="space-y-3 rounded-xl border bg-white p-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-neutral-800">Resumo de produção</span>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1">
                  <span className="text-[11px] text-neutral-600">Vendedor:</span>
                  <select
                    className="rounded-md border px-2 py-1 text-[11px]"
                    value={filterSellerId}
                    onChange={(e) => setFilterSellerId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1">
                  <span className="text-[11px] text-neutral-600">Data:</span>
                  <select
                    className="rounded-md border px-2 py-1 text-[11px]"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {uniqueDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1">
                  <span className="text-[11px] text-neutral-600">Horário:</span>
                  <select
                    className="rounded-md border px-2 py-1 text-[11px]"
                    value={filterTimeSlot}
                    onChange={(e) => setFilterTimeSlot(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {uniqueTimeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={filterTestOnly}
                    onChange={(e) => setFilterTestOnly(e.target.checked)}
                  />
                  <span className="text-[11px] text-neutral-600">Somente testes</span>
                </label>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportProductionCsv}
                  className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                  title="Exporta a tabela de produção atual (filtrada)"
                >
                  Exportar produção (CSV)
                </button>
              </div>
            </div>

            <p className="text-[11px] text-neutral-600">
              Pedidos filtrados: <strong>{filteredOrders.length}</strong> de{" "}
              <strong>{orders.length}</strong>.
            </p>

            {demandByProduct.length === 0 ? (
              <p className="text-[11px] text-neutral-500">Nenhum pedido encontrado com os filtros atuais.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[260px] w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b bg-neutral-50">
                      <th className="p-2 text-left font-semibold">Item</th>
                      <th className="p-2 text-left font-semibold">Quantidade</th>
                      <th className="p-2 text-left font-semibold">Já preparado</th>
                      <th className="p-2 text-left font-semibold">Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandByProduct.map((item) => {
                      const prepared = preparedMap[item.name] ?? 0;
                      const remaining = Math.max(item.total - prepared, 0);

                      return (
                        <tr key={item.name} className="border-b last:border-0">
                          <td className="p-2">{item.name}</td>
                          <td className="p-2 font-semibold">{item.total}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={item.total}
                              className="w-20 rounded-md border px-2 py-1 text-[11px]"
                              value={Number.isNaN(prepared) ? "" : prepared}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = Number(raw);
                                setPreparedMap((prev) => ({
                                  ...prev,
                                  [item.name]:
                                    !raw || Number.isNaN(num)
                                      ? 0
                                      : Math.min(Math.max(num, 0), item.total),
                                }));
                              }}
                            />
                          </td>
                          <td className={cx("p-2 font-semibold", remaining === 0 && "text-green-700")}>
                            {remaining}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------- PRODUTOS ---------------- */}
      {/* (mantive seu bloco inteiro — sem mudanças relevantes aqui) */}
      {/* ... SEU BLOCO DE PRODUTOS AQUI (igual ao seu) ... */}

      {/* ---------------- EVENTOS ---------------- */}
      {activeTab === "events" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Eventos (por vendedor)</h2>
            <button
              type="button"
              onClick={resetEventForm}
              className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
            >
              + Novo evento
            </button>
          </div>

          <form onSubmit={handleSubmitEvent} className="space-y-3 rounded-xl border bg-white p-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs">Vendedor</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventSellerId}
                  onChange={(e) => {
                    setEventSellerId(e.target.value);
                    applySellerDefaults(e.target.value);
                  }}
                >
                  <option value="">Selecione...</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500">
                  Esse evento ficará “amarrado” ao vendedor, e os pedidos entram no caixa dele.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs">Título do evento</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Ex: Semana da Coxinha na fábrica X"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs">Região</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventRegion}
                  onChange={(e) => setEventRegion(e.target.value)}
                  placeholder="Ex: Hamamatsu, Shizuoka"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs">Status do evento</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value as EventStatus)}
                >
                  <option value="active">Ativo</option>
                  <option value="closed">Encerrado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs">Data(s) de entrega (rótulo para cliente)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventDeliveryDateLabel}
                  onChange={(e) => setEventDeliveryDateLabel(e.target.value)}
                  placeholder="Ex: 20 e 21 de Dezembro"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs">Produtos deste evento (nomes separados por vírgula)</label>
              <textarea
                className="min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
                value={eventProductNamesCsv}
                onChange={(e) => setEventProductNamesCsv(e.target.value)}
                placeholder="Ex: Coxinha de frango, Bolinho de queijo, Kibe recheado"
              />
              <p className="text-[11px] text-neutral-500">
                Dica: use exatamente o mesmo nome cadastrado em <strong>Produtos</strong> para puxar imagem e preço.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs">WhatsApp da vendedora</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventWhatsapp}
                  onChange={(e) => setEventWhatsapp(e.target.value)}
                  placeholder="Ex: +81 90 1234 5678"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs">Messenger (username / ID da página)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventMessengerId}
                  onChange={(e) => setEventMessengerId(e.target.value)}
                  placeholder="Ex: yamadasalgados"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs">Link de retirada (Google Maps da vendedora)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={eventPickupLink}
                  onChange={(e) => setEventPickupLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs">Observações / instruções da vendedora</label>
                <textarea
                  className="min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
                  value={eventPickupNote}
                  onChange={(e) => setEventPickupNote(e.target.value)}
                  placeholder="Ex: Entrega será feita no intervalo das 15h na área de descanso."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editingEventId && (
                <button
                  type="button"
                  onClick={resetEventForm}
                  className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar edição
                </button>
              )}
              <button
                type="submit"
                className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-900"
              >
                {editingEventId ? "Salvar alterações" : "Criar evento"}
              </button>
            </div>
          </form>

          <div className="rounded-xl border bg-white p-3 text-xs">
            {events.length === 0 ? (
              <p className="text-neutral-600">Nenhum evento cadastrado.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {events.map((ev) => {
                  const sellerName =
                    sellers.find((s) => s.id === ev.sellerId)?.name ?? ev.sellerNameSnapshot ?? "—";

                  return (
                    <div key={ev.id} className="flex flex-col justify-between rounded-xl border bg-white p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{ev.title}</p>
                        <p className="text-[11px] text-neutral-500">{ev.region}</p>
                        <p className="text-[11px] text-neutral-700">
                          <span className="font-semibold">Vendedor: </span>
                          {sellerName}
                        </p>

                        <div className="mt-1">
                          {ev.status === "active" && (
                            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-800">
                              Ativo
                            </span>
                          )}
                          {ev.status === "closed" && (
                            <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-800">
                              Encerrado
                            </span>
                          )}
                          {ev.status === "cancelled" && (
                            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-800">
                              Cancelado
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[11px] text-neutral-700">
                          <div>
                            <span className="font-semibold">Entrega: </span>
                            {ev.deliveryDateLabel ?? "-"}
                          </div>
                          <div>
                            <span className="font-semibold">Produtos: </span>
                            {(ev.productNames ?? []).length} produto(s)
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditEvent(ev)}
                          className="flex-1 rounded-full border px-2 py-1 text-[11px] hover:bg-neutral-100"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteEvent(ev.id)}
                          className="flex-1 rounded-full border border-red-300 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------- PEDIDOS ---------------- */}
      {activeTab === "orders" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Pedidos</h2>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-600">
                {loadingOrders
                  ? "Atualizando pedidos..."
                  : `${filteredOrders.length} exibidos de ${orders.length}`}
              </span>

              <button
                type="button"
                onClick={exportOrdersCsv}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-neutral-100"
                title="Exporta os pedidos exibidos (com filtros) em CSV"
              >
                Exportar pedidos (CSV)
              </button>
            </div>
          </div>

          {/* Barra de filtros + busca */}
          <div className="grid gap-2 rounded-xl border bg-white p-3 text-xs md:grid-cols-6">
            <div className="md:col-span-2">
              <label className="text-[11px] text-neutral-600">Buscar</label>
              <input
                className="mt-1 w-full rounded-md border px-2 py-2 text-xs"
                value={searchOrders}
                onChange={(e) => setSearchOrders(e.target.value)}
                placeholder="cliente, evento, item, nota..."
              />
            </div>

            <div>
              <label className="text-[11px] text-neutral-600">Vendedor</label>
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-xs"
                value={filterSellerId}
                onChange={(e) => setFilterSellerId(e.target.value)}
              >
                <option value="">Todos</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-neutral-600">Status</label>
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-xs"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <option value="">Todos</option>
                <option value="pending">Pendente</option>
                <option value="confirmed">Confirmado</option>
                <option value="delivered">Entregue</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-neutral-600">Data</label>
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-xs"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              >
                <option value="">Todas</option>
                {uniqueDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-neutral-600">Horário</label>
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-xs"
                value={filterTimeSlot}
                onChange={(e) => setFilterTimeSlot(e.target.value)}
              >
                <option value="">Todos</option>
                {uniqueTimeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={filterTestOnly}
                  onChange={(e) => setFilterTestOnly(e.target.checked)}
                />
                <span className="text-[11px] text-neutral-600">Mostrar apenas pedidos de teste</span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={selectionMode}
                    onChange={(e) => {
                      setSelectionMode(e.target.checked);
                      if (!e.target.checked) setSelectedOrderIds([]);
                    }}
                  />
                  <span className="text-[11px] text-neutral-600">Modo seleção múltipla</span>
                </label>

                {selectionMode && (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                    >
                      {filteredOrders.length > 0 &&
                      filteredOrders.every((o) => selectedOrderIds.includes(o.id))
                        ? "Desmarcar todos"
                        : "Selecionar todos filtrados"}
                    </button>

                    <button
                      type="button"
                      onClick={clearSelection}
                      className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                    >
                      Limpar seleção
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleBulkSetStatus("confirmed")}
                      disabled={selectedOrderIds.length === 0}
                      className={cx(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        selectedOrderIds.length === 0
                          ? "cursor-not-allowed border-neutral-200 text-neutral-300"
                          : "border-amber-300 text-amber-800 hover:bg-amber-50"
                      )}
                    >
                      Confirmar ({selectedOrderIds.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleBulkSetStatus("delivered")}
                      disabled={selectedOrderIds.length === 0}
                      className={cx(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        selectedOrderIds.length === 0
                          ? "cursor-not-allowed border-neutral-200 text-neutral-300"
                          : "border-green-300 text-green-800 hover:bg-green-50"
                      )}
                    >
                      Entregar ({selectedOrderIds.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDeleteSelectedOrders()}
                      disabled={selectedOrderIds.length === 0}
                      className={cx(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        selectedOrderIds.length === 0
                          ? "cursor-not-allowed border-red-100 text-red-200"
                          : "border-red-300 text-red-700 hover:bg-red-50"
                      )}
                    >
                      Excluir ({selectedOrderIds.length})
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* FORMULÁRIO DE EDIÇÃO */}
          {editingOrderId && (
            <form onSubmit={handleSubmitOrderEdit} className="space-y-3 rounded-xl border bg-white p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Editando pedido #{editingOrderId.slice(0, 6)}...</p>
                <button
                  type="button"
                  onClick={resetOrderEditForm}
                  className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                >
                  Cancelar edição
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px]">Nome do cliente</label>
                  <input
                    ref={orderCustomerInputRef}
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderCustomerName}
                    onChange={(e) => setOrderCustomerName(e.target.value)}
                    placeholder="Nome do cliente"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px]">Observação</label>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Ex: levar até o portão..."
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[11px]">Data de entrega</label>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderDeliveryDate}
                    onChange={(e) => setOrderDeliveryDate(e.target.value)}
                    placeholder="Ex: 20/12/2025"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px]">Horário (faixa)</label>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderTimeSlotEdit}
                    onChange={(e) => setOrderTimeSlotEdit(e.target.value)}
                    placeholder="Ex: 14–16, 18–20..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px]">Modo</label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderDeliveryModeEdit}
                    onChange={(e) => setOrderDeliveryModeEdit(e.target.value as DeliveryMode)}
                  >
                    <option value="delivery">Entrega</option>
                    <option value="pickup">Retirada</option>
                    <option value="none">A combinar</option>
                  </select>
                </div>
              </div>

              {/* ✅ Financeiro */}
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={orderPaid}
                    onChange={(e) => setOrderPaid(e.target.checked)}
                  />
                  <span className="text-[11px] text-neutral-700">
                    Pedido pago (recebido)
                  </span>
                </label>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px]">Forma de pagamento</label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-xs"
                    value={orderPaymentMethod}
                    onChange={(e) => setOrderPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="paypay">PayPay</option>
                    <option value="card">Cartão</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px]">Link de endereço (Google Maps)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-xs"
                  value={orderLocationLink}
                  onChange={(e) => setOrderLocationLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </div>

              {/* Itens */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold">Produtos deste pedido</p>
                  <button
                    type="button"
                    onClick={addOrderItemRow}
                    className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                  >
                    + Adicionar item
                  </button>
                </div>

                <div className="space-y-2">
                  {orderItems.map((item) => (
                    <div
                      key={item.key}
                      className="grid items-center gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                    >
                      <input
                        className="rounded-md border px-2 py-1 text-[11px]"
                        value={item.name}
                        onChange={(e) => handleOrderItemChange(item.key, "name", e.target.value)}
                        placeholder="Nome do produto (igual ao cadastro)"
                      />
                      <input
                        type="number"
                        min={0}
                        className="rounded-md border px-2 py-1 text-[11px]"
                        value={item.qty}
                        onChange={(e) => handleOrderItemChange(item.key, "qty", e.target.value)}
                        placeholder="Qtd"
                      />
                      <button
                        type="button"
                        onClick={() => removeOrderItemRow(item.key)}
                        className="rounded-full border border-red-300 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetOrderEditForm}
                  className="rounded-full border px-3 py-1.5 text-[11px] hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-900"
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          )}

          {/* Tabela */}
          <div className="overflow-x-auto rounded-xl border bg-white p-3 text-xs">
            {filteredOrders.length === 0 ? (
              <p className="text-neutral-600">Ainda não há pedidos para os filtros selecionados.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-neutral-50">
                    {selectionMode && <th className="p-2 text-left font-semibold">Sel.</th>}
                    <th className="p-2 text-left font-semibold">Vendedor</th>
                    <th className="p-2 text-left font-semibold">Evento</th>
                    <th className="p-2 text-left font-semibold">Cliente</th>
                    <th className="p-2 text-left font-semibold">Entrega</th>
                    <th className="p-2 text-left font-semibold">Itens</th>
                    <th className="p-2 text-left font-semibold">Valor</th>
                    <th className="p-2 text-left font-semibold">Pago</th>
                    <th className="p-2 text-left font-semibold">Status</th>
                    <th className="p-2 text-left font-semibold">Criado em</th>
                    <th className="p-2 text-left font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const isSelected = selectedOrderIds.includes(o.id);
                    const sellerName =
                      sellers.find((s) => s.id === o.sellerId)?.name ?? o.sellerNameSnapshot ?? "—";

                    return (
                      <tr
                        key={o.id}
                        className={cx("border-b last:border-0 align-top", isSelected && "bg-red-50/40")}
                      >
                        {selectionMode && (
                          <td className="p-2 align-middle">
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={isSelected}
                              onChange={() => toggleOrderSelection(o.id)}
                            />
                          </td>
                        )}

                        <td className="p-2">{sellerName}</td>
                        <td className="p-2">{o.eventTitle}</td>

                        <td className="p-2">
                          {o.customerName || "(sem nome)"}
                          {o.note && (
                            <div className="mt-1 max-w-[260px] text-[11px] text-neutral-500">
                              Obs: {o.note}
                            </div>
                          )}
                          {isTestOrder(o) && (
                            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                              Possível teste
                            </span>
                          )}
                        </td>

                        <td className="p-2">
                          <div className="max-w-[220px] space-y-1">
                            <div>
                              <span className="font-semibold">Data: </span>
                              {o.deliveryDate ?? "-"}
                            </div>
                            <div>
                              <span className="font-semibold">Horário: </span>
                              {o.deliveryTimeSlot ?? "-"}
                            </div>
                            <div>
                              <span className="font-semibold">Modo: </span>
                              {o.deliveryMode === "delivery" && "Entrega"}
                              {o.deliveryMode === "pickup" && "Retirada"}
                              {o.deliveryMode === "none" && "A combinar"}
                            </div>
                            {o.locationLink && (
                              <a
                                href={o.locationLink}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-blue-600 underline"
                              >
                                Ver localização
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="p-2">
                          <div className="max-w-[260px] space-y-1">
                            {Object.entries(o.quantities).map(([prodName, qty]) => (
                              <div key={prodName}>
                                {prodName}: <strong>{qty}</strong>
                              </div>
                            ))}
                            <div className="mt-1 text-[11px] text-neutral-500">
                              Total de itens: {o.totalItems}
                            </div>
                          </div>
                        </td>

                        <td className="p-2 font-semibold">{formatYen(o.amountYen ?? 0)}</td>

                        <td className="p-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={Boolean(o.paid)}
                              onChange={(e) => void handleTogglePaid(o, e.target.checked)}
                            />
                            <span className={cx("text-[11px]", o.paid ? "text-green-700" : "text-amber-700")}>
                              {o.paid ? "Recebido" : "A receber"}
                            </span>
                          </label>
                        </td>

                        <td className="p-2">
                          <select
                            className="rounded-md border px-2 py-1 text-[11px]"
                            value={o.status}
                            onChange={(e) =>
                              void handleChangeOrderStatus(o, e.target.value as OrderStatus)
                            }
                          >
                            <option value="pending">Pendente</option>
                            <option value="confirmed">Confirmado</option>
                            <option value="delivered">Entregue</option>
                            <option value="cancelled">Cancelado</option>
                          </select>
                        </td>

                        <td className="p-2">{formatTimestamp(o.createdAt)}</td>

                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => startEditOrder(o)}
                              className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOrder(o)}
                              className="rounded-full border border-red-300 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-50"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

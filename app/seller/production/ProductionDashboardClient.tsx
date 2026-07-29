"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
} from "firebase/firestore";
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ClipboardList,
  Factory,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import useSellerId from "@/app/hooks/useSellerId";
import PageHeader from "@/app/_components/PageHeader";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import {
  db,
} from "@/app/lib/firebase";
import {
  EMPTY_SELLER_IDENTITY,
  normalizeSellerIdentity,
  type SellerIdentity,
} from "@/app/lib/seller-identity";
import {
  SellerOrderStatusError,
  updateSellerOrderStatus,
  type SellerOrderStatus,
} from "@/app/lib/order-status-client";
import {
  recordSellerProduction,
  SellerProductionError,
} from "@/app/lib/production-client";
import {
  parseStoreOrder,
  storeOrderDateToMillis,
} from "@/app/lib/store-order";
import {
  getDeliveryModeLabel,
  getStatusLabel,
} from "@/app/lib/store-order-ui";
import {
  useI18n,
} from "@/app/lib/i18n";

import OrderPrintDialog from "./OrderPrintDialog";

import type {
  StoreOrder,
  StoreOrderDeliveryMode,
  StoreOrderItem,
  StoreOrderStatus,
} from "@/app/types/store-order";

type OrderSource = "store" | "event";
type ViewKey =
  | "production"
  | "picking"
  | "ready"
  | "today"
  | "delivered";

type SourceFilter =
  | "all"
  | OrderSource;

type DeliveryFilter =
  | "all"
  | StoreOrderDeliveryMode;

type EventSummary = {
  id: string;
  title: string;
};

type UnifiedOrder = {
  key: string;
  source: OrderSource;
  eventId: string;
  eventTitle: string;
  order: StoreOrder;
};

type WorkOrderLine = {
  orderKey: string;
  source: OrderSource;
  eventId: string;
  eventTitle: string;
  orderId: string;
  customerName: string;
  deliveryMode: StoreOrderDeliveryMode;
  deliveryDate: string;
  status: StoreOrderStatus;
  quantity: number;
  producedQuantity: number;
  totalProductionQuantity: number;
  composition: string[];
  detailHref: string;
};

type WorkGroup = {
  productId: string;
  productName: string;
  totalQuantity: number;
  producedQuantity: number;
  requiredQuantity: number;
  orderCount: number;
  lines: WorkOrderLine[];
};

const OPEN_STATUSES = new Set<StoreOrderStatus>([
  "pending",
  "confirmed",
  "made_to_order",
  "preparing",
  "ready",
]);

const COPY = {
  pt: {
    title: "Produção e separação",
    subtitle:
      "Reúna pedidos da Loja e dos eventos, produza encomendas e separe o estoque reservado.",
    back: "Painel",
    history: "Histórico",
    refresh: "Atualizar",
    loading: "Carregando pedidos...",
    loadError: "Não foi possível carregar todos os pedidos.",
    authError: "Entre novamente na conta do vendedor.",
    production: "Produzir",
    productionHint: "Itens sob encomenda ainda pendentes.",
    picking: "Separar",
    pickingHint: "Produtos normais reservados para pedidos abertos.",
    ready: "Prontos",
    readyHint: "Pedidos disponíveis para retirada, entrega ou postagem.",
    today: "Hoje",
    todayHint: "Pedidos com data prevista para hoje.",
    delivered: "Finalizados",
    deliveredHint: "Pedidos entregues recentemente.",
    filters: "Filtros",
    allSources: "Todas as origens",
    store: "Loja",
    event: "Eventos",
    allDelivery: "Todas as entregas",
    allDates: "Todas as datas",
    searchPlaceholder: "Buscar produto, cliente, pedido ou evento",
    clear: "Limpar",
    noResults: "Nenhum item encontrado com estes filtros.",
    orders: "pedidos",
    units: "unidades",
    unit: "unidade",
    customer: "Cliente",
    source: "Origem",
    delivery: "Entrega",
    date: "Data",
    openOrder: "Abrir pedido",
    printOrder: "Imprimir duas vias",
    markReady: "Marcar pronto",
    markDelivered: "Marcar entregue",
    cancel: "Cancelar",
    confirmCancel: "Cancelar este pedido e liberar as reservas?",
    saving: "Atualizando...",
    actionError: "Não foi possível alterar o pedido.",
    shortage:
      "Ainda há produção ou estoque pendente. O pedido permaneceu pendente.",
    storeLabel: "Loja permanente",
    eventLabel: "Evento",
    noDate: "Sem data",
    productionCompleted: "Pedido marcado como pronto.",
    deliveredCompleted: "Pedido finalizado.",
    cancelledCompleted: "Pedido cancelado.",
    reserved: "reservadas",
    postal: "Correio",
    activeOrders: "Pedidos abertos",
    recentDelivered: "Últimos entregues",
    showOrders: "Mostrar pedidos",
    hideOrders: "Ocultar pedidos",
    eventSelect: "Todos os eventos",
    produced: "Produzido",
    remaining: "Falta produzir",
    progress: "Progresso",
    registerProduction: "Registrar produção",
    completeProduction: "Concluir restante",
    customQuantity: "Outra quantidade",
    quantityPrompt: "Quantas unidades foram produzidas?",
    invalidQuantity: "Informe uma quantidade inteira maior que zero.",
    productionRecorded: "Produção registrada com sucesso.",
    productionAutoReady: "Produção registrada e pedido(s) movido(s) para Prontos.",
    productionActionError: "Não foi possível registrar a produção.",
    productionPending: "Registre toda a produção antes de marcar o pedido como pronto.",
  },
  en: {
    title: "Production and picking",
    subtitle:
      "Bring Store and event orders together, produce made-to-order items, and pick reserved stock.",
    back: "Dashboard",
    history: "History",
    refresh: "Refresh",
    loading: "Loading orders...",
    loadError: "Some orders could not be loaded.",
    authError: "Sign in to the seller account again.",
    production: "Produce",
    productionHint: "Made-to-order items still pending.",
    picking: "Pick",
    pickingHint: "Normal products reserved for open orders.",
    ready: "Ready",
    readyHint: "Orders ready for pickup, delivery, or posting.",
    today: "Today",
    todayHint: "Orders scheduled for today.",
    delivered: "Completed",
    deliveredHint: "Recently delivered orders.",
    filters: "Filters",
    allSources: "All sources",
    store: "Store",
    event: "Events",
    allDelivery: "All delivery methods",
    allDates: "All dates",
    searchPlaceholder: "Search product, customer, order, or event",
    clear: "Clear",
    noResults: "No items match these filters.",
    orders: "orders",
    units: "units",
    unit: "unit",
    customer: "Customer",
    source: "Source",
    delivery: "Delivery",
    date: "Date",
    openOrder: "Open order",
    printOrder: "Print two copies",
    markReady: "Mark ready",
    markDelivered: "Mark delivered",
    cancel: "Cancel",
    confirmCancel: "Cancel this order and release its reservations?",
    saving: "Updating...",
    actionError: "The order could not be updated.",
    shortage: "Production or stock is still pending. The order remained pending.",
    storeLabel: "Permanent store",
    eventLabel: "Event",
    noDate: "No date",
    productionCompleted: "Order marked as ready.",
    deliveredCompleted: "Order completed.",
    cancelledCompleted: "Order cancelled.",
    reserved: "reserved",
    postal: "Postal",
    activeOrders: "Open orders",
    recentDelivered: "Recently delivered",
    showOrders: "Show orders",
    hideOrders: "Hide orders",
    eventSelect: "All events",
    produced: "Produced",
    remaining: "Remaining",
    progress: "Progress",
    registerProduction: "Record production",
    completeProduction: "Complete remaining",
    customQuantity: "Other quantity",
    quantityPrompt: "How many units were produced?",
    invalidQuantity: "Enter a whole number greater than zero.",
    productionRecorded: "Production recorded successfully.",
    productionAutoReady: "Production recorded and order(s) moved to Ready.",
    productionActionError: "Production could not be recorded.",
    productionPending: "Record all production before marking the order ready.",
  },
  ja: {
    title: "製造・取り分け",
    subtitle:
      "常設店舗とイベントの注文をまとめ、受注生産と予約在庫の取り分けを管理します。",
    back: "ダッシュボード",
    history: "履歴",
    refresh: "更新",
    loading: "注文を読み込み中...",
    loadError: "一部の注文を読み込めませんでした。",
    authError: "販売者アカウントに再度ログインしてください。",
    production: "製造",
    productionHint: "未完了の受注生産商品。",
    picking: "取り分け",
    pickingHint: "未完了注文のために予約された通常商品。",
    ready: "準備完了",
    readyHint: "受取、配達、発送が可能な注文。",
    today: "本日",
    todayHint: "本日予定されている注文。",
    delivered: "完了",
    deliveredHint: "最近配達済みになった注文。",
    filters: "絞り込み",
    allSources: "すべて",
    store: "店舗",
    event: "イベント",
    allDelivery: "すべての受取方法",
    allDates: "すべての日付",
    searchPlaceholder: "商品、顧客、注文、イベントを検索",
    clear: "クリア",
    noResults: "条件に一致する項目はありません。",
    orders: "件",
    units: "個",
    unit: "個",
    customer: "お客様",
    source: "出所",
    delivery: "受取方法",
    date: "日付",
    openOrder: "注文を開く",
    printOrder: "2枚印刷",
    markReady: "準備完了にする",
    markDelivered: "配達済みにする",
    cancel: "キャンセル",
    confirmCancel: "注文をキャンセルして予約在庫を解放しますか？",
    saving: "更新中...",
    actionError: "注文を更新できませんでした。",
    shortage: "製造または在庫が未完了です。注文は保留のままです。",
    storeLabel: "常設店舗",
    eventLabel: "イベント",
    noDate: "日付なし",
    productionCompleted: "注文を準備完了にしました。",
    deliveredCompleted: "注文を完了しました。",
    cancelledCompleted: "注文をキャンセルしました。",
    reserved: "予約済み",
    postal: "郵送",
    activeOrders: "未完了注文",
    recentDelivered: "最近の完了",
    showOrders: "注文を表示",
    hideOrders: "注文を隠す",
    eventSelect: "すべてのイベント",
    produced: "製造済み",
    remaining: "残り",
    progress: "進捗",
    registerProduction: "製造を記録",
    completeProduction: "残りを完了",
    customQuantity: "数量を入力",
    quantityPrompt: "製造した数量を入力してください。",
    invalidQuantity: "1以上の整数を入力してください。",
    productionRecorded: "製造数を記録しました。",
    productionAutoReady: "製造数を記録し、注文を準備完了へ移動しました。",
    productionActionError: "製造数を記録できませんでした。",
    productionPending: "すべての製造を記録してから準備完了にしてください。",
  },
} as const;

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isMadeToOrder(item: StoreOrderItem): boolean {
  return (
    item.availabilityMode === "made_to_order" ||
    item.stockState === "made_to_order" ||
    (item.inventoryState?.productionRequired ?? item.productionRequired ?? 0) > 0
  );
}

function productionQuantity(item: StoreOrderItem): number {
  if (!isMadeToOrder(item)) return 0;
  if (item.inventoryState?.productionStatus === "completed") return 0;

  const required =
    item.inventoryState?.productionRequired ??
    item.productionRequired ??
    0;

  return Math.max(
    0,
    Math.floor(required > 0 ? required : item.qty),
  );
}

function itemProducedQuantity(item: StoreOrderItem): number {
  return Math.max(
    0,
    Math.floor(
      item.inventoryState?.producedQuantity ?? 0,
    ),
  );
}

function totalProductionQuantity(item: StoreOrderItem): number {
  return productionQuantity(item) + itemProducedQuantity(item);
}

function reservedQuantity(item: StoreOrderItem): number {
  if (isMadeToOrder(item)) return 0;

  const reserved =
    item.inventoryState?.reservedQuantity ??
    item.stockReserved ??
    0;

  return Math.max(0, Math.floor(reserved));
}

function orderDetailHref(order: UnifiedOrder): string {
  return order.source === "event"
    ? `/seller/events/${encodeURIComponent(order.eventId)}/orders/${encodeURIComponent(order.order.id)}`
    : `/seller/store-orders/${encodeURIComponent(order.order.id)}`;
}

function orderSearchText(order: UnifiedOrder): string {
  return [
    order.order.id,
    order.order.customerName,
    order.order.customerPhone,
    order.eventTitle,
    ...order.order.items.flatMap((item) => [
      item.name,
      ...(item.options ?? []).map((option) => option.name),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function groupWork(
  orders: UnifiedOrder[],
  mode: "production" | "picking",
): WorkGroup[] {
  const groups = new Map<string, WorkGroup>();

  for (const unified of orders) {
    const order = unified.order;
    if (!OPEN_STATUSES.has(order.status)) continue;

    for (const item of order.items) {
      const quantity =
        mode === "production"
          ? productionQuantity(item)
          : reservedQuantity(item);

      if (quantity <= 0) continue;

      const productId =
        item.productId ||
        item.id ||
        item.sku ||
        item.name;
      const key = `${productId}::${item.name}`;
      const current =
        groups.get(key) ?? {
          productId,
          productName: item.name,
          totalQuantity: 0,
          producedQuantity: 0,
          requiredQuantity: 0,
          orderCount: 0,
          lines: [],
        };

      const produced =
        mode === "production"
          ? itemProducedQuantity(item)
          : 0;
      const totalProduction =
        mode === "production"
          ? totalProductionQuantity(item)
          : quantity;

      current.totalQuantity += quantity;
      current.producedQuantity += produced;
      current.requiredQuantity += totalProduction;
      current.orderCount += 1;
      current.lines.push({
        orderKey: unified.key,
        source: unified.source,
        eventId: unified.eventId,
        eventTitle: unified.eventTitle,
        orderId: order.id,
        customerName: order.customerName || "—",
        deliveryMode: order.deliveryMode ?? "none",
        deliveryDate: order.deliveryDate || "",
        status: order.status,
        quantity,
        producedQuantity: produced,
        totalProductionQuantity: totalProduction,
        composition: (item.options ?? [])
          .filter((option) => option.name && (option.quantity ?? 0) > 0)
          .map((option) => `${option.quantity}× ${option.name}`),
        detailHref: orderDetailHref(unified),
      });

      groups.set(key, current);
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      b.totalQuantity - a.totalQuantity ||
      a.productName.localeCompare(b.productName),
  );
}

function createProductionRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `production_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function StatusBadge({
  status,
  lang,
}: {
  status: StoreOrderStatus;
  lang: string;
}) {
  const classes =
    status === "ready"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : status === "delivered"
        ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200"
        : status === "cancelled"
          ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${classes}`}
    >
      {getStatusLabel(status, lang)}
    </span>
  );
}

export default function ProductionDashboardClient() {
  const {
    lang,
  } = useI18n();
  const text =
    COPY[
      lang === "ja"
        ? "ja"
        : lang === "en"
          ? "en"
          : "pt"
    ];
  const {
    loading: sellerLoading,
    sellerId,
    errorCode: sellerError,
    reload: reloadSeller,
  } = useSellerId();

  const [storeOrders, setStoreOrders] =
    useState<UnifiedOrder[]>([]);
  const [eventOrders, setEventOrders] =
    useState<UnifiedOrder[]>([]);
  const [events, setEvents] =
    useState<EventSummary[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState(false);
  const [reloadKey, setReloadKey] =
    useState(0);
  const [view, setView] =
    useState<ViewKey>("production");
  const [sourceFilter, setSourceFilter] =
    useState<SourceFilter>("all");
  const [deliveryFilter, setDeliveryFilter] =
    useState<DeliveryFilter>("all");
  const [dateFilter, setDateFilter] =
    useState("");
  const [eventFilter, setEventFilter] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [expandedGroups, setExpandedGroups] =
    useState<Record<string, boolean>>({});
  const [savingOrderKey, setSavingOrderKey] =
    useState("");
  const [savingProductionKey, setSavingProductionKey] =
    useState("");
  const [actionMessage, setActionMessage] =
    useState("");
  const [actionError, setActionError] =
    useState("");
  const [storeName, setStoreName] =
    useState("");
  const [sellerIdentity, setSellerIdentity] =
    useState<SellerIdentity>(EMPTY_SELLER_IDENTITY);
  const [printOrder, setPrintOrder] =
    useState<UnifiedOrder | null>(null);

  useEffect(() => {
    if (!sellerId) {
      setStoreName("");
      setSellerIdentity(EMPTY_SELLER_IDENTITY);
      return;
    }

    let alive = true;

    void getDoc(
      doc(db, "sellers", sellerId),
    )
      .then((snapshot) => {
        if (!alive || !snapshot.exists()) return;

        const data = snapshot.data();
        const identity = normalizeSellerIdentity(data);
        setSellerIdentity(identity);
        const resolvedName = [
          data.storeName,
          data.businessName,
          data.publicName,
          data.displayName,
        ]
          .find(
            (value) =>
              typeof value === "string" &&
              value.trim(),
          );

        setStoreName(
          typeof resolvedName === "string"
            ? resolvedName.trim()
            : "",
        );
      })
      .catch((error) => {
        console.warn(
          "[ProductionDashboard] Não foi possível carregar o nome da loja:",
          error,
        );
      });

    return () => {
      alive = false;
    };
  }, [sellerId]);

  const eventOrderUnsubscribesRef =
    useRef(new Map<string, () => void>());
  const eventOrdersRef =
    useRef(new Map<string, UnifiedOrder[]>());
  const eventTitlesRef =
    useRef(new Map<string, string>());

  const emitEventOrders = useCallback(() => {
    setEventOrders(
      Array.from(
        eventOrdersRef.current.values(),
      ).flat(),
    );
  }, []);

  useEffect(() => {
    if (sellerLoading) {
      setLoading(true);
      return;
    }

    if (!sellerId) {
      setLoading(false);
      setStoreOrders([]);
      setEventOrders([]);
      return;
    }

    let alive = true;
    setLoading(true);
    setLoadError(false);

    const cleanEventListeners = () => {
      for (const unsubscribe of eventOrderUnsubscribesRef.current.values()) {
        unsubscribe();
      }
      eventOrderUnsubscribesRef.current.clear();
      eventOrdersRef.current.clear();
      eventTitlesRef.current.clear();
    };

    const storeOrdersQuery = query(
      collection(
        db,
        "sellers",
        sellerId,
        "storeOrders",
      ),
      limit(500),
    );

    const unsubscribeStore = onSnapshot(
      storeOrdersQuery,
      (snapshot) => {
        if (!alive) return;

        setStoreOrders(
          snapshot.docs.map((documentSnapshot) => ({
            key: `store:${documentSnapshot.id}`,
            source: "store",
            eventId: "",
            eventTitle: "",
            order: parseStoreOrder(
              documentSnapshot.id,
              documentSnapshot.data(),
            ),
          })),
        );
        setLoading(false);
      },
      (error) => {
        console.error(
          "[ProductionDashboard] Falha ao carregar pedidos da Store:",
          error,
        );
        if (!alive) return;
        setLoadError(true);
        setLoading(false);
      },
    );

    const eventsQuery = query(
      collection(
        db,
        "sellers",
        sellerId,
        "events",
      ),
      limit(100),
    );

    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        if (!alive) return;

        const nextEventIds = new Set<string>();
        const nextEvents: EventSummary[] = [];

        for (const eventSnapshot of snapshot.docs) {
          const eventId = eventSnapshot.id;
          const eventData = eventSnapshot.data();
          const title =
            typeof eventData.title === "string" && eventData.title.trim()
              ? eventData.title.trim()
              : typeof eventData.name === "string" && eventData.name.trim()
                ? eventData.name.trim()
                : eventId;

          nextEventIds.add(eventId);
          nextEvents.push({
            id: eventId,
            title,
          });
          eventTitlesRef.current.set(eventId, title);

          if (!eventOrderUnsubscribesRef.current.has(eventId)) {
            const ordersQuery = query(
              collection(
                db,
                "sellers",
                sellerId,
                "events",
                eventId,
                "orders",
              ),
              limit(500),
            );

            const unsubscribeOrders = onSnapshot(
              ordersQuery,
              (ordersSnapshot) => {
                if (!alive) return;

                const currentTitle =
                  eventTitlesRef.current.get(eventId) ??
                  eventId;
                eventOrdersRef.current.set(
                  eventId,
                  ordersSnapshot.docs.map(
                    (orderSnapshot) => ({
                      key: `event:${eventId}:${orderSnapshot.id}`,
                      source: "event" as const,
                      eventId,
                      eventTitle: currentTitle,
                      order: parseStoreOrder(
                        orderSnapshot.id,
                        orderSnapshot.data(),
                      ),
                    }),
                  ),
                );
                emitEventOrders();
                setLoading(false);
              },
              (error) => {
                console.error(
                  `[ProductionDashboard] Falha ao carregar pedidos do evento ${eventId}:`,
                  error,
                );
                if (!alive) return;
                setLoadError(true);
                setLoading(false);
              },
            );

            eventOrderUnsubscribesRef.current.set(
              eventId,
              unsubscribeOrders,
            );
          }
        }

        for (const [
          eventId,
          unsubscribe,
        ] of eventOrderUnsubscribesRef.current) {
          if (!nextEventIds.has(eventId)) {
            unsubscribe();
            eventOrderUnsubscribesRef.current.delete(eventId);
            eventOrdersRef.current.delete(eventId);
            eventTitlesRef.current.delete(eventId);
          }
        }

        nextEvents.sort((a, b) =>
          a.title.localeCompare(b.title),
        );
        setEvents(nextEvents);
        emitEventOrders();
        setLoading(false);
      },
      (error) => {
        console.error(
          "[ProductionDashboard] Falha ao carregar eventos:",
          error,
        );
        if (!alive) return;
        setLoadError(true);
        setLoading(false);
      },
    );

    return () => {
      alive = false;
      unsubscribeStore();
      unsubscribeEvents();
      cleanEventListeners();
    };
  }, [
    emitEventOrders,
    reloadKey,
    sellerId,
    sellerLoading,
  ]);

  const allOrders = useMemo(
    () => [...storeOrders, ...eventOrders],
    [eventOrders, storeOrders],
  );

  const ordersByKey = useMemo(
    () =>
      new Map(
        allOrders.map((order) => [
          order.key,
          order,
        ]),
      ),
    [allOrders],
  );

  const today = localDateKey();

  const filteredOrders = useMemo(() => {
    const normalizedSearch =
      search.trim().toLocaleLowerCase();

    return allOrders.filter((unified) => {
      const order = unified.order;

      if (
        sourceFilter !== "all" &&
        unified.source !== sourceFilter
      ) {
        return false;
      }

      if (
        deliveryFilter !== "all" &&
        order.deliveryMode !== deliveryFilter
      ) {
        return false;
      }

      if (
        dateFilter &&
        order.deliveryDate !== dateFilter
      ) {
        return false;
      }

      if (
        eventFilter &&
        unified.eventId !== eventFilter
      ) {
        return false;
      }

      if (
        normalizedSearch &&
        !orderSearchText(unified).includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });
  }, [
    allOrders,
    dateFilter,
    deliveryFilter,
    eventFilter,
    search,
    sourceFilter,
  ]);

  const productionGroups = useMemo(
    () => groupWork(filteredOrders, "production"),
    [filteredOrders],
  );

  const pickingGroups = useMemo(
    () => groupWork(filteredOrders, "picking"),
    [filteredOrders],
  );

  const readyOrders = useMemo(
    () =>
      filteredOrders
        .filter(
          (unified) =>
            unified.order.status === "ready",
        )
        .sort(
          (a, b) =>
            storeOrderDateToMillis(
              a.order.deliveryDate || a.order.createdAt,
            ) -
            storeOrderDateToMillis(
              b.order.deliveryDate || b.order.createdAt,
            ),
        ),
    [filteredOrders],
  );

  const todayOrders = useMemo(
    () =>
      filteredOrders
        .filter(
          (unified) =>
            unified.order.status !== "cancelled" &&
            unified.order.status !== "delivered" &&
            unified.order.deliveryDate === today,
        )
        .sort(
          (a, b) =>
            storeOrderDateToMillis(a.order.createdAt) -
            storeOrderDateToMillis(b.order.createdAt),
        ),
    [filteredOrders, today],
  );

  const deliveredOrders = useMemo(
    () =>
      filteredOrders
        .filter(
          (unified) =>
            unified.order.status === "delivered",
        )
        .sort(
          (a, b) =>
            storeOrderDateToMillis(b.order.updatedAt ?? b.order.createdAt) -
            storeOrderDateToMillis(a.order.updatedAt ?? a.order.createdAt),
        )
        .slice(0, 100),
    [filteredOrders],
  );

  const openOrderCount = useMemo(
    () =>
      allOrders.filter((unified) =>
        OPEN_STATUSES.has(unified.order.status),
      ).length,
    [allOrders],
  );

  const productionUnits = useMemo(
    () =>
      productionGroups.reduce(
        (sum, group) => sum + group.totalQuantity,
        0,
      ),
    [productionGroups],
  );

  const pickingUnits = useMemo(
    () =>
      pickingGroups.reduce(
        (sum, group) => sum + group.totalQuantity,
        0,
      ),
    [pickingGroups],
  );

  const resetFilters = () => {
    setSourceFilter("all");
    setDeliveryFilter("all");
    setDateFilter("");
    setEventFilter("");
    setSearch("");
  };

  const runStatusAction = useCallback(
    async (
      unified: UnifiedOrder,
      status: SellerOrderStatus,
    ) => {
      if (!sellerId || savingOrderKey) return;

      if (
        status === "cancelled" &&
        !window.confirm(text.confirmCancel)
      ) {
        return;
      }

      setSavingOrderKey(unified.key);
      setActionMessage("");
      setActionError("");

      try {
        const result =
          await updateSellerOrderStatus({
            source: unified.source,
            sellerId,
            eventId:
              unified.source === "event"
                ? unified.eventId
                : undefined,
            orderId: unified.order.id,
            status,
            note:
              status === "ready"
                ? "production_dashboard_ready"
                : status === "delivered"
                  ? "production_dashboard_delivered"
                  : "production_dashboard_cancelled",
          });

        if (
          result.status === "pending" &&
          result.shortages &&
          result.shortages.length > 0
        ) {
          setActionError(text.shortage);
        } else if (status === "ready") {
          setActionMessage(text.productionCompleted);
        } else if (status === "delivered") {
          setActionMessage(text.deliveredCompleted);
        } else {
          setActionMessage(text.cancelledCompleted);
        }
      } catch (error) {
        console.error(
          "[ProductionDashboard] Falha ao atualizar pedido:",
          error,
        );

        if (
          error instanceof SellerOrderStatusError &&
          error.code === "STOCK_SHORTAGE"
        ) {
          setActionError(text.shortage);
        } else {
          setActionError(
            error instanceof Error
              ? error.message
              : text.actionError,
          );
        }
      } finally {
        setSavingOrderKey("");
      }
    },
    [
      savingOrderKey,
      sellerId,
      text.actionError,
      text.cancelledCompleted,
      text.confirmCancel,
      text.deliveredCompleted,
      text.productionCompleted,
      text.shortage,
    ],
  );

  const runProductionAction = useCallback(
    async (group: WorkGroup, requestedQuantity: number) => {
      if (!sellerId || savingProductionKey) return;

      const quantity = Math.min(
        group.totalQuantity,
        Math.max(0, Math.floor(requestedQuantity)),
      );
      if (quantity <= 0) {
        setActionError(text.invalidQuantity);
        return;
      }

      const groupKey = `${group.productId}:${group.productName}`;
      setSavingProductionKey(groupKey);
      setActionMessage("");
      setActionError("");

      try {
        const sortedLines = [...group.lines].sort(
          (a, b) =>
            (a.deliveryDate || "9999-12-31").localeCompare(
              b.deliveryDate || "9999-12-31",
            ) || a.orderId.localeCompare(b.orderId),
        );
        let quantityToRecord = quantity;
        let autoReadyCount = 0;

        for (let index = 0; index < sortedLines.length && quantityToRecord > 0; index += 150) {
          const chunk = sortedLines.slice(index, index + 150);
          const chunkNeed = chunk.reduce(
            (sum, line) => sum + line.quantity,
            0,
          );
          const result = await recordSellerProduction({
            sellerId,
            productId: group.productId,
            quantity: Math.min(quantityToRecord, chunkNeed),
            requestId: createProductionRequestId(),
            targets: chunk.map((line) => ({
              source: line.source,
              eventId: line.source === "event" ? line.eventId : undefined,
              orderId: line.orderId,
            })),
          });

          quantityToRecord = Math.max(
            0,
            quantityToRecord - result.recordedQuantity,
          );
          autoReadyCount += result.autoReadyOrderIds.length;

          if (result.recordedQuantity <= 0) break;
        }

        setActionMessage(
          autoReadyCount > 0
            ? text.productionAutoReady
            : text.productionRecorded,
        );
      } catch (error) {
        console.error(
          "[ProductionDashboard] Falha ao registrar produção:",
          error,
        );
        setActionError(
          error instanceof SellerProductionError
            ? error.message
            : text.productionActionError,
        );
      } finally {
        setSavingProductionKey("");
      }
    },
    [
      savingProductionKey,
      sellerId,
      text.invalidQuantity,
      text.productionActionError,
      text.productionAutoReady,
      text.productionRecorded,
    ],
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const renderOrderCard = (
    unified: UnifiedOrder,
  ) => {
    const order = unified.order;
    const detailHref =
      orderDetailHref(unified);
    const saving =
      savingOrderKey === unified.key;
    const productionPending =
      (order.inventoryState?.productionRequired ?? 0) > 0 ||
      order.items.some(
        (item) =>
          (item.inventoryState?.productionRequired ??
            item.productionRequired ??
            0) > 0,
      );

    return (
      <article
        key={unified.key}
        className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={order.status}
                lang={lang}
              />
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {unified.source === "store"
                  ? text.storeLabel
                  : `${text.eventLabel}: ${unified.eventTitle}`}
              </span>
              {order.deliveryMode === "postal" && (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  {text.postal}
                </span>
              )}
            </div>

            <h3 className="mt-3 truncate text-lg font-black text-neutral-950 dark:text-white">
              {order.customerName || "—"}
            </h3>
            <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              #{order.id.slice(-8).toUpperCase()}
              {" · "}
              {getDeliveryModeLabel(
                order.deliveryMode,
                lang,
              )}
              {" · "}
              {order.deliveryDate || text.noDate}
            </p>
            <p className="mt-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">
              {order.items.reduce(
                (sum, item) => sum + item.qty,
                0,
              )}{" "}
              {text.units}
              {" · "}
              {order.items
                .slice(0, 3)
                .map((item) => item.name)
                .join(", ")}
              {order.items.length > 3 ? "…" : ""}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPrintOrder(unified)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 px-4 text-xs font-black text-violet-800 transition hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/30"
            >
              <Printer className="h-4 w-4" />
              {text.printOrder}
            </button>
            <Link
              href={detailHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-xs font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {text.openOrder}
            </Link>
          </div>
        </div>

        {order.status !== "delivered" &&
          order.status !== "cancelled" && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              {order.status !== "ready" && productionPending && (
                <p className="w-full rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
                  {text.productionPending}
                </p>
              )}
              {order.status !== "ready" && (
                <button
                  type="button"
                  disabled={saving || productionPending}
                  title={productionPending ? text.productionPending : undefined}
                  onClick={() =>
                    void runStatusAction(
                      unified,
                      "ready",
                    )
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackageCheck className="h-4 w-4" />
                  )}
                  {text.markReady}
                </button>
              )}

              {order.status === "ready" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void runStatusAction(
                      unified,
                      "delivered",
                    )
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {text.markDelivered}
                </button>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void runStatusAction(
                    unified,
                    "cancelled",
                  )
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/20"
              >
                <XCircle className="h-4 w-4" />
                {text.cancel}
              </button>
            </div>
          )}
      </article>
    );
  };

  const renderWorkGroups = (
    groups: WorkGroup[],
    mode: "production" | "picking",
  ) => {
    if (groups.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
          <PackageOpen className="mx-auto h-10 w-10 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-4 text-sm font-bold text-neutral-500 dark:text-neutral-400">
            {text.noResults}
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const key = `${mode}:${group.productId}:${group.productName}`;
          const expanded =
            expandedGroups[key] === true;
          const productionKey = `${group.productId}:${group.productName}`;
          const savingProduction =
            mode === "production" &&
            savingProductionKey === productionKey;
          const progress =
            group.requiredQuantity > 0
              ? Math.min(
                  100,
                  Math.round(
                    (group.producedQuantity / group.requiredQuantity) * 100,
                  ),
                )
              : 0;

          return (
            <article
              key={key}
              className={[
                "overflow-hidden rounded-3xl border bg-white shadow-sm dark:bg-neutral-900",
                mode === "production"
                  ? "border-violet-200 dark:border-violet-900/60"
                  : "border-blue-200 dark:border-blue-900/60",
              ].join(" ")}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                        mode === "production"
                          ? "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
                      ].join(" ")}
                    >
                      {mode === "production"
                        ? text.production
                        : text.picking}
                    </span>
                    <h3 className="mt-3 truncate text-lg font-black text-neutral-950 dark:text-white">
                      {group.productName}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      {group.orderCount} {text.orders}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-3xl font-black tracking-tight text-neutral-950 dark:text-white">
                      {group.totalQuantity}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      {text.units}
                    </p>
                  </div>
                </div>

                {mode === "production" && (
                  <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                    <div className="flex items-center justify-between gap-3 text-xs font-black">
                      <span className="text-violet-900 dark:text-violet-100">
                        {text.progress}: {progress}%
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {text.produced}: {group.producedQuantity} / {group.requiredQuantity}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/60">
                      <div
                        className="h-full rounded-full bg-violet-600 transition-all dark:bg-violet-400"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[1, 5, 10].map((quantity) => (
                        <button
                          key={quantity}
                          type="button"
                          disabled={savingProduction}
                          onClick={() =>
                            void runProductionAction(
                              group,
                              Math.min(quantity, group.totalQuantity),
                            )
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-violet-200 bg-white px-3 text-xs font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900 dark:bg-neutral-900 dark:text-violet-200 dark:hover:bg-violet-950/40"
                        >
                          {savingProduction ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {quantity}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={savingProduction}
                        onClick={() => {
                          const rawQuantity = window.prompt(
                            text.quantityPrompt,
                            "1",
                          );
                          if (rawQuantity === null) return;
                          const normalized = rawQuantity.trim();
                          if (!/^\d+$/.test(normalized)) {
                            setActionMessage("");
                            setActionError(text.invalidQuantity);
                            return;
                          }
                          const quantity = Number(normalized);
                          if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                            setActionMessage("");
                            setActionError(text.invalidQuantity);
                            return;
                          }
                          void runProductionAction(group, quantity);
                        }}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-xs font-black text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        {text.customQuantity}
                      </button>
                      <button
                        type="button"
                        disabled={savingProduction}
                        onClick={() =>
                          void runProductionAction(group, group.totalQuantity)
                        }
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:text-violet-950 dark:hover:bg-violet-400"
                      >
                        {savingProduction && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {text.completeProduction}
                      </button>
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-violet-700/70 dark:text-violet-300/70">
                      {text.remaining}: {group.totalQuantity} {text.units}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 text-xs font-black transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {expanded
                    ? text.hideOrders
                    : text.showOrders}
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {expanded && (
                <div className="border-t border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/30">
                  <div className="space-y-2">
                    {group.lines.map((line) => {
                      const unified =
                        ordersByKey.get(line.orderKey);

                      return (
                        <div
                          key={`${key}:${line.orderKey}`}
                          className="flex items-stretch gap-2 rounded-2xl border border-neutral-200 bg-white p-2 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
                        >
                          <Link
                            href={line.detailHref}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl p-1"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-neutral-900 dark:text-white">
                                {line.customerName}
                              </p>
                              <p className="mt-1 truncate text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                                {line.source === "store"
                                  ? text.storeLabel
                                  : line.eventTitle}
                                {" · "}
                                {getDeliveryModeLabel(
                                  line.deliveryMode,
                                  lang,
                                )}
                                {" · "}
                                {line.deliveryDate || text.noDate}
                              </p>
                              {line.composition.length > 0 && (
                                <p className="mt-1 line-clamp-2 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                                  {line.composition.join(" · ")}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-lg font-black text-neutral-950 dark:text-white">
                                {line.quantity}
                              </p>
                              {mode === "production" && (
                                <p className="mb-1 text-[9px] font-bold text-violet-600 dark:text-violet-300">
                                  {text.produced}: {line.producedQuantity} / {line.totalProductionQuantity}
                                </p>
                              )}
                              <StatusBadge
                                status={line.status}
                                lang={lang}
                              />
                            </div>
                          </Link>

                          {unified && (
                            <button
                              type="button"
                              onClick={() => setPrintOrder(unified)}
                              title={text.printOrder}
                              aria-label={text.printOrder}
                              className="inline-flex w-11 shrink-0 items-center justify-center rounded-xl border border-violet-200 text-violet-700 transition hover:bg-violet-50 dark:border-violet-900 dark:text-violet-200 dark:hover:bg-violet-950/30"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    );
  };

  if (sellerLoading || loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-white p-6 dark:bg-neutral-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-neutral-900 dark:text-white" />
          <p className="mt-4 text-sm font-bold text-neutral-500">
            {text.loading}
          </p>
        </div>
      </main>
    );
  }

  if (!sellerId || sellerError) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          <CircleAlert className="mx-auto h-10 w-10" />
          <p className="mt-4 text-sm font-black">{text.authError}</p>
          <button
            type="button"
            onClick={reloadSeller}
            className="mt-5 rounded-xl bg-black px-5 py-3 text-xs font-black text-white dark:bg-white dark:text-black"
          >
            {text.refresh}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-4 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow={text.production}
          title={text.title}
          description={text.subtitle}
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href="/seller/production/history"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 text-xs font-black text-violet-800 transition hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200"
              >
                <ClipboardList className="h-4 w-4" />
                {text.history}
              </Link>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black text-white transition hover:opacity-85 dark:bg-white dark:text-black"
              >
                <RefreshCw className="h-4 w-4" />
                {text.refresh}
              </button>
            </div>
          }
        />

        {loadError && <FeedbackBanner tone="warning">{text.loadError}</FeedbackBanner>}
        {actionError && <FeedbackBanner tone="error" role="alert">{actionError}</FeedbackBanner>}
        {actionMessage && <FeedbackBanner tone="success">{actionMessage}</FeedbackBanner>}

        <MetricStrip
          items={[
            { label: text.production, value: productionUnits, active: view === "production", onClick: () => setView("production"), tone: "violet" },
            { label: text.picking, value: pickingUnits, active: view === "picking", onClick: () => setView("picking") },
            { label: text.ready, value: readyOrders.length, active: view === "ready", onClick: () => setView("ready"), tone: "success" },
            { label: text.today, value: todayOrders.length, active: view === "today", onClick: () => setView("today"), tone: "warning" },
            { label: text.delivered, value: deliveredOrders.length, active: view === "delivered", onClick: () => setView("delivered") },
          ]}
        />

        <section className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-neutral-500" />
              <h2 className="text-sm font-black">{text.filters}</h2>
            </div>
            <p className="text-xs font-bold text-neutral-400">
              {openOrderCount} {text.activeOrders}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={text.searchPlaceholder}
                className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-black dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
              />
            </label>

            <select
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(
                  event.target.value as SourceFilter,
                )
              }
              className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold outline-none focus:border-black dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
            >
              <option value="all">{text.allSources}</option>
              <option value="store">{text.store}</option>
              <option value="event">{text.event}</option>
            </select>

            <select
              value={deliveryFilter}
              onChange={(event) =>
                setDeliveryFilter(
                  event.target.value as DeliveryFilter,
                )
              }
              className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold outline-none focus:border-black dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
            >
              <option value="all">{text.allDelivery}</option>
              <option value="pickup">
                {getDeliveryModeLabel("pickup", lang)}
              </option>
              <option value="delivery">
                {getDeliveryModeLabel("delivery", lang)}
              </option>
              <option value="postal">
                {getDeliveryModeLabel("postal", lang)}
              </option>
              <option value="none">
                {getDeliveryModeLabel("none", lang)}
              </option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) =>
                setDateFilter(event.target.value)
              }
              className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold outline-none focus:border-black dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
            />

            <select
              value={eventFilter}
              onChange={(event) =>
                setEventFilter(event.target.value)
              }
              disabled={sourceFilter === "store"}
              className="min-h-12 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold outline-none focus:border-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
            >
              <option value="">
                {text.eventSelect}
              </option>
              {events.map((event) => (
                <option
                  key={event.id}
                  value={event.id}
                >
                  {event.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 text-xs font-black text-neutral-500 underline underline-offset-4 transition hover:text-black dark:hover:text-white"
          >
            {text.clear}
          </button>
        </section>

        <section className="pb-12">
          {view === "production" &&
            renderWorkGroups(
              productionGroups,
              "production",
            )}

          {view === "picking" &&
            renderWorkGroups(
              pickingGroups,
              "picking",
            )}

          {view === "ready" &&
            (readyOrders.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {readyOrders.map(renderOrderCard)}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
                <PackageCheck className="mx-auto h-10 w-10 text-neutral-300 dark:text-neutral-600" />
                <p className="mt-4 text-sm font-bold text-neutral-500">
                  {text.noResults}
                </p>
              </div>
            ))}

          {view === "today" &&
            (todayOrders.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {todayOrders.map(renderOrderCard)}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
                <CalendarDays className="mx-auto h-10 w-10 text-neutral-300 dark:text-neutral-600" />
                <p className="mt-4 text-sm font-bold text-neutral-500">
                  {text.noResults}
                </p>
              </div>
            ))}

          {view === "delivered" &&
            (deliveredOrders.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {deliveredOrders.map(renderOrderCard)}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
                <CheckCircle2 className="mx-auto h-10 w-10 text-neutral-300 dark:text-neutral-600" />
                <p className="mt-4 text-sm font-bold text-neutral-500">
                  {text.noResults}
                </p>
              </div>
            ))}
        </section>
      </div>

      <OrderPrintDialog
        open={printOrder !== null}
        order={printOrder?.order ?? null}
        lang={lang}
        sellerId={sellerId || ""}
        storeName={storeName}
        logoUrl={sellerIdentity.logoUrl}
        receiptHeaderText={sellerIdentity.receipt.headerText}
        receiptFooterText={sellerIdentity.receipt.footerText}
        source={printOrder?.source ?? "store"}
        eventId={printOrder?.eventId ?? ""}
        sourceLabel={
          printOrder
            ? printOrder.source === "store"
              ? text.storeLabel
              : `${text.eventLabel}: ${printOrder.eventTitle}`
            : ""
        }
        onClose={() => setPrintOrder(null)}
      />
    </main>
  );
}

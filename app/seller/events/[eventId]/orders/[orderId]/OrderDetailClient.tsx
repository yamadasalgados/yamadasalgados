"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
  type Timestamp,
  limit,
} from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { formatMoneyMajor } from "@/app/lib/money";
import { updateSellerOrderStatus } from "@/app/lib/order-status-client";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";
import type {
  AppliedOfferSnapshot,
} from "@/app/lib/offer-schema";

// --- 📝 Interfaces de Tipagem Estrita (TypeScript) ---

type EventStatus = "active" | "closed" | "cancelled";
type OrderStatus = "pending" | "ready" | "delivered" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  active?: boolean;
  suspended?: boolean;
  regionId?: string;
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
  status?: EventStatus | string;
  sellerId?: string;
  createdAt?: Timestamp;
};

type EventOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  availabilityMode: "normal" | "made_to_order";
  stockReserved: number;
  stockShortage: number;
  productionRequired: number;
};

type OrderDoc = {
  customerName?: string;
  customerPhone?: string;
  note?: string;
  quantities: Record<string, number>;
  items?: EventOrderItem[];
  totalItems?: number;
  subtotal?: number;
  discount?: number;
  totalAmount?: number;
  offersApplied?: AppliedOfferSnapshot[];
  status?: OrderStatus | string;
  channel?: string;
  deliveryMode?: "delivery" | "pickup" | "none" | string;
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  locationLink?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deliveredAt?: Timestamp | null;
};

type ProductDoc = {
  id: string;
  name: string;
  price: number;
  status?: string;
};

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "seller" | "customer";
  createdAt?: Timestamp;
};

// --- 🛠️ Funções Utilitárias Core ---

function normOrderStatus(s: any): OrderStatus {
  const st = String(s || "pending");
  if (st === "ready" || st === "delivered" || st === "cancelled") return st;
  return "pending";
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

async function loadSellerProductsOnly(sellerUid: string): Promise<ProductDoc[]> {
  if (!sellerUid) return [];

  const snap = await getDocs(query(collection(db, "sellers", sellerUid, "products"), orderBy("createdAt", "desc")));
  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      if (String(data.status || "active") === "inactive") return null;

      const name = String(data.name || "").trim();
      if (!name) return null;

      const priceRaw = typeof data.sellPrice === "number" ? data.sellPrice : Number(data.sellPrice || data.price || 0);
      return { id: d.id, name, price: Number.isFinite(priceRaw) ? priceRaw : 0, status: data.status } as ProductDoc;
    })
    .filter(Boolean) as ProductDoc[];
}

// --- 🚀 Componente Principal ---

export default function OrderDetailClient({ eventId, orderId }: { eventId: string; orderId: string }) {
  const { t, lang } = useI18n();
  const router = useRouter();

  const safeEventId = String(eventId || "").trim();
  const safeOrderId = String(orderId || "").trim();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [inactive, setInactive] = useState(false);

  const role = profile?.role ?? null;
  const sellerUid =
    String(
      profile?.sellerId ??
      authUser?.uid ??
      "",
    ).trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [eventRef, setEventRef] = useState<DocumentReference | null>(null);
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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

  const canEnter = useMemo(() => {
    if (
      !authUser ||
      !sellerUid ||
      inactive ||
      (role !== "seller" && role !== "admin")
    ) return false;
    return true;
  }, [authUser, sellerUid, inactive, role]);

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
      setProfileMissing(false);
      setInactive(false);

      const result =
        await ensureUserProfile(
          u,
          lang,
        );

      const userData =
        result.userDoc as UserDoc;
      const sellerData =
        result.sellerDoc ?? {};

      setProfile({
        role:
          userData.role === "admin"
            ? "admin"
            : "seller",
        sellerId:
          String(
            userData.sellerId ??
            u.uid,
          ).trim(),
        active:
          userData.active !== false,
        regionId:
          String(
            sellerData.regionId ??
            userData.regionId ??
            "",
          ),
        displayName:
          String(
            sellerData.storeName ??
            userData.displayName ??
            "",
          ),
        whatsapp:
          String(
            sellerData.whatsapp ??
            "",
          ),
        messengerId:
          String(
            sellerData.messengerId ??
            "",
          ),
        pickupLink:
          String(
            sellerData.pickupLink ??
            "",
          ),
        pickupNote:
          String(
            sellerData.pickupNote ??
            "",
          ),
        regionName:
          String(
            sellerData.regionName ??
            "",
          ),
        currency:
          sellerData?.regional?.currency ??
          userData.currency ??
          "JPY",
        regionalLocale:
          sellerData?.regional?.locale ??
          userData.regionalLocale ??
          "ja-JP",
        timeZone:
          String(
            sellerData?.regional?.timeZone ??
            userData.timeZone ??
            "Asia/Tokyo",
          ),
      });

      setInactive(
        userData.active === false ||
        userData.suspended === true,
      );
    },
    [lang],
  );

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser).catch(() => setError(t("eventPanel.err.profileLoad")));
  }, [authUser, loadProfile, t]);

  useEffect(() => {
    if (!canEnter || !safeEventId) return;
    setLoading(true);

    resolveEventDocSellerOnly({ eventId: safeEventId, sellerUid })
      .then((resolved) => {
        if (!resolved) {
          setError(t("eventPanel.err.eventNotFound"));
          return;
        }
        if (String(resolved.data.sellerId || "") && String(resolved.data.sellerId) !== sellerUid) {
          setError(t("eventPanel.err.accessDenied"));
          return;
        }
        setEvent(resolved.data);
        setEventRef(resolved.ref);
      })
      .catch(() => setError(t("eventPanel.err.loadEvent")))
      .finally(() => setLoading(false));
  }, [canEnter, safeEventId, sellerUid, t]);

  useEffect(() => {
    if (!canEnter || !sellerUid) return;
    setProductsLoading(true);

    loadSellerProductsOnly(sellerUid)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [canEnter, sellerUid]);

  const productById = useMemo(() => {
    const m = new Map<string, ProductDoc>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  useEffect(() => {
    if (!eventRef || !safeOrderId) return;

    return onSnapshot(
      doc(eventRef, "orders", safeOrderId),
      (snap) => {
        if (!snap.exists()) {
          setError(lang === "ja" ? "注文が見つからないか、削除されました。" : lang === "en" ? "Order not found or deleted." : "Pedido removido ou inexistente.");
          return;
        }
        const data = snap.data() as any;
        setOrder({
          customerName: data.customerName || "",
          customerPhone: data.customerPhone || "",
          note: data.note || "",
          quantities: (data.quantities || {}) as Record<string, number>,
          items: Array.isArray(data.items)
            ? data.items.map((item: any) => ({
                productId: String(item.productId || item.id || ""),
                name: String(item.name || item.productName || item.productId || ""),
                quantity: Number(item.quantity ?? item.qty ?? 0),
                unitPrice: Number(item.unitPrice ?? item.price ?? 0),
                subtotal: Number(item.subtotal ?? 0),
                availabilityMode:
                  item.availabilityMode === "made_to_order" ||
                  item.availabilityStatus === "made_to_order" ||
                  item.productionMode === "made_to_order"
                    ? "made_to_order"
                    : "normal",
                stockReserved: Number(
                  item.stockReserved ?? item.inventoryState?.reservedQuantity ?? 0,
                ),
                stockShortage: Number(
                  item.stockShortage ?? item.inventoryState?.shortageQuantity ?? 0,
                ),
                productionRequired: Number(
                  item.productionRequired ?? item.inventoryState?.productionRequired ?? 0,
                ),
              }))
            : [],
          totalItems: Number(data.totalItems || 0),
          subtotal: Number(data.subtotal || data.totalAmount || 0),
          discount: Number(data.discount || 0),
          totalAmount: Number(data.totalAmount || 0),
          offersApplied: Array.isArray(data.offersApplied)
            ? data.offersApplied as AppliedOfferSnapshot[]
            : [],
          status: data.status || "pending",
          channel: data.channel || "other",
          deliveryMode: data.deliveryMode || "pickup",
          deliveryDate: data.deliveryDate || "",
          deliveryTimeSlot: data.deliveryTimeSlot || "",
          locationLink: data.locationLink || "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          deliveredAt: data.deliveredAt ?? null,
        });
        setOrderStatus(normOrderStatus(data.status));
      },
      () => setError(lang === "ja" ? "注文データの同期に失敗しました。" : lang === "en" ? "Failed to sync order data." : "Falha ao sincronizar dados do pedido.")
    );
  }, [eventRef, safeOrderId, lang]);

  useEffect(() => {
    if (!eventRef || !safeOrderId) return;
    setChatLoading(true);

    return onSnapshot(
      query(collection(eventRef, "orders", safeOrderId, "messages"), orderBy("createdAt", "asc"), limit(200)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            text: String(data.text || ""),
            senderId: String(data.senderId || ""),
            senderRole: (data.senderRole === "customer" ? "customer" : "seller") as "seller" | "customer",
            createdAt: data.createdAt,
          };
        });
        setMessages(list);
        setChatLoading(false);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      },
      () => setChatLoading(false)
    );
  }, [eventRef, safeOrderId]);

  const itemsDetailed = useMemo(() => {
    if (!order) return [];

    if (Array.isArray(order.items) && order.items.length > 0) {
      return order.items
        .filter((item) => item.productId && item.quantity > 0)
        .map((item) => ({
          id: item.productId,
          name: item.name || item.productId,
          qty: item.quantity,
          price: item.unitPrice,
          subtotal: item.subtotal || item.unitPrice * item.quantity,
          availabilityMode: item.availabilityMode,
          stockReserved: Math.max(0, item.stockReserved || 0),
          stockShortage: Math.max(0, item.stockShortage || 0),
          productionRequired: Math.max(0, item.productionRequired || 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    return Object.entries(order.quantities || {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([id, qty]) => {
        const product = productById.get(id);
        const price = Number(product?.price ?? 0);
        const quantity = Number(qty || 0);
        return {
          id,
          name: product?.name || id,
          qty: quantity,
          price,
          subtotal: price * quantity,
          availabilityMode: "normal" as const,
          stockReserved: 0,
          stockShortage: 0,
          productionRequired: 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [order, productById]);

  const computedTotal = useMemo(() => itemsDetailed.reduce((acc, it) => acc + (it.subtotal || 0), 0), [itemsDetailed]);

  const handleSetOrderStatus = useCallback(
    async (next: OrderStatus) => {
      if (!sellerUid || !safeEventId || !safeOrderId) return;
      setSaving(true);
      setError(null);
      try {
        const result = await updateSellerOrderStatus({
          source: "event",
          sellerId: sellerUid,
          eventId: safeEventId,
          orderId: safeOrderId,
          status: next,
        });
        setOrderStatus(result.status);
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : t("eventPanel.err.updateOrderStatus"),
        );
      } finally {
        setSaving(false);
      }
    },
    [safeEventId, safeOrderId, sellerUid, t]
  );

  const handleSendMessage = useCallback(async () => {
    if (!eventRef || !sellerUid) return;
    const text = String(chatText || "").trim();
    if (!text) return;

    setChatText("");
    try {
      await addDoc(collection(eventRef, "orders", safeOrderId, "messages"), {
        text,
        senderId: sellerUid,
        senderRole: "seller",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(eventRef, "orders", safeOrderId), {
        lastMessageText: text.slice(0, 120),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  }, [chatText, eventRef, safeOrderId, sellerUid]);

  if (checkingAuth || (authUser && !profile && !profileMissing)) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (!safeEventId || !safeOrderId || loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-neutral-400 dark:text-neutral-500 animate-pulse">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800 dark:border-neutral-700 dark:border-t-white" />
        <span className="text-xs font-bold uppercase tracking-wider">{t("eventPanel.loadingEvent")}</span>
      </div>
    );
  }

  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t("eventPanel.guard.profileMissing.title")}</h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4 mt-4 shadow-xl">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">{t("eventPanel.guard.profileMissing.desc").replace("{uid}", sellerUid)}</p>
          <Link href="/seller" className="w-full block py-3.5 rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase tracking-wider">{t("eventPanel.btn.back")}</Link>
        </div>
      </main>
    );
  }

  if (inactive || !canEnter) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("eventPanel.guard.inactive.title")}</h1>
          <p className="text-sm text-neutral-500">{t("eventPanel.guard.inactive.desc")}</p>
          <Link href="/login" className="w-full py-3.5 block rounded-xl bg-black text-white text-xs font-black uppercase tracking-wider">{t("eventPanel.guard.goLogin")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in max-w-5xl mx-auto">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">
            {lang === "ja" ? "注文の詳細" : lang === "en" ? "Order Details" : "Raio-X de Pedido"}
          </span>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white truncate max-w-lg">{event?.title || (lang === "ja" ? "注文" : lang === "en" ? "Order" : "Pedido")}</h1>
          <p className="text-[11px] font-mono text-neutral-400">
            ID: {safeOrderId} {order?.createdAt && `• ${fmtDate(order.createdAt)}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Link href={`/seller/events/${safeEventId}?tab=orders`} className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-5 py-3 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition">
            {t("eventPanel.btn.back")}
          </Link>
          <select value={orderStatus} onChange={(e) => handleSetOrderStatus(e.target.value as OrderStatus)} disabled={saving} className="border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-black bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none">
            <option value="pending">{t("eventPanel.orderStatus.pending")}</option>
            <option value="ready">{t("eventPanel.orderStatus.ready")}</option>
            <option value="delivered">{t("eventPanel.orderStatus.delivered")}</option>
            <option value="cancelled">{t("eventPanel.orderStatus.cancelled")}</option>
          </select>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {error}
        </div>
      )}

      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PAINEL LOGÍSTICO DA ESQUERDA */}
          <section className="lg:col-span-1 space-y-4">
            <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-5 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                {lang === "ja" ? "顧客情報" : lang === "en" ? "Customer Data" : "Dados do Comprador"}
              </span>
              <p className="text-base font-black text-neutral-900 dark:text-white tracking-tight">{order.customerName || (lang === "ja" ? "名前なしの顧客" : lang === "en" ? "Unnamed Customer" : "Cliente sem Nome")}</p>
              {order.customerPhone && (
                <a
                  href={`tel:${order.customerPhone}`}
                  className="text-xs font-black text-blue-600 underline dark:text-blue-400"
                >
                  {order.customerPhone}
                </a>
              )}
              {order.note && <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 mt-2 leading-relaxed">{lang === "ja" ? "備考: " : lang === "en" ? "Note: " : "Obs: "}{order.note}</p>}
            </div>

            <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-5 space-y-3 font-medium">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                {lang === "ja" ? "配送・受取方法" : lang === "en" ? "Logistics Delivery" : "Logística de Entrega"}
              </span>
              <div className="text-xs text-neutral-600 dark:text-neutral-300">{lang === "ja" ? "方法: " : lang === "en" ? "Mode: " : "Modo: "}<span className="font-black text-neutral-900 dark:text-white uppercase ml-1">{order.deliveryMode === "pickup" ? t("eventPanel.config.deliveryChoice.pickup") : order.deliveryMode === "delivery" ? t("eventPanel.config.deliveryChoice.delivery") : order.deliveryMode}</span></div>
              <div className="text-xs text-neutral-600 dark:text-neutral-300">{lang === "ja" ? "日付: " : lang === "en" ? "Date: " : "Data: "}<span className="font-bold text-neutral-900 dark:text-white ml-1">{order.deliveryDate || (lang === "ja" ? "指定なし" : lang === "en" ? "No Preference" : "Sem Preferência")}</span></div>
              <div className="text-xs text-neutral-600 dark:text-neutral-300">{lang === "ja" ? "時間帯: " : lang === "en" ? "Time slot: " : "Horário: "}<span className="font-bold text-neutral-900 dark:text-white ml-1">{order.deliveryTimeSlot || (lang === "ja" ? "指定なし" : lang === "en" ? "No Preference" : "Sem Preferência")}</span></div>
              
              {order.locationLink && (
                <a href={order.locationLink} target="_blank" rel="noreferrer" className="w-full text-center py-2.5 block text-xs font-black uppercase tracking-wider bg-black dark:bg-white text-white dark:text-black rounded-xl shadow-sm">
                  {lang === "ja" ? "Google マップで開く 🗺️" : lang === "en" ? "Open on Google Maps 🗺️" : "Abrir no Google Maps 🗺️"}
                </a>
              )}
              
              <div className="text-[10px] text-neutral-400 pt-2 border-t border-neutral-200 dark:border-neutral-800/60 font-mono">
                {order.deliveredAt && <p>{lang === "ja" ? "完了日時: " : lang === "en" ? "Completed: " : "Checklist: "}{fmtDate(order.deliveredAt)}</p>}
                {order.updatedAt && <p>Sync: {fmtDate(order.updatedAt)}</p>}
              </div>
            </div>

            {/* INTERFACES DE CONVERSA EM CHAT */}
            <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  {lang === "ja" ? "内部メッセージ" : lang === "en" ? "Internal Messages" : "Mensagens Internas"}
                </span>
                <span className="text-[10px] font-bold text-neutral-400">{chatLoading ? "..." : `${messages.length} msg`}</span>
              </div>

              <div className="rounded-2xl border border-neutral-100 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-3 h-[280px] overflow-y-auto space-y-3 scrollbar-none flex flex-col">
                {chatLoading ? (
                  <p className="text-xs text-neutral-400 text-center py-10 animate-pulse">{lang === "ja" ? "履歴を読み込み中..." : lang === "en" ? "Fetching history..." : "Buscando histórico..."}</p>
                ) : messages.length === 0 ? (
                  <p className="text-xs font-medium text-neutral-400 text-center py-10 leading-relaxed">{lang === "ja" ? "チャットにメッセージはありません。購入者からの連絡を待っています。" : lang === "en" ? "No messages in chat. Channel waiting for the buyer's first contact." : "Nenhuma mensagem no chat. Canal aguardando o primeiro contato do comprador."}</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderRole === "seller";
                    return (
                      <div key={m.id} className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs font-bold leading-relaxed shadow-sm ${mine ? "bg-black text-white dark:bg-white dark:text-black rounded-tr-none" : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 rounded-tl-none"}`}>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          <span className={`text-[9px] font-mono block text-right mt-1 opacity-60`}>
                            {m.createdAt ? fmtDate(m.createdAt).split(" ")[1] : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-1.5 rounded-xl">
                <input
                  className="flex-1 bg-transparent px-2.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={lang === "ja" ? "サポートメッセージを入力..." : lang === "en" ? "Write a support message..." : "Escreva uma mensagem de suporte..."}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button type="button" onClick={handleSendMessage} disabled={!chatText.trim()} className="rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider px-4 py-2 disabled:opacity-40">
                  {lang === "ja" ? "送信" : lang === "en" ? "Send" : "Enviar"}
                </button>
              </div>
            </div>
          </section>

          {/* TABELA DE CONSUMO DE ITENS DA DIREITA */}
          <section className="lg:col-span-2">
            <div className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4 shadow-sm">
              <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 flex-wrap gap-2">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {lang === "ja" ? "購入概要" : lang === "en" ? "Purchase Summary" : "Resumo de Compra"}
                  </span>
                  <p className="text-xs font-bold text-neutral-500">{productsLoading ? (lang === "ja" ? "価格を確認中..." : lang === "en" ? "Mapping prices..." : "Mapeando preços...") : (lang === "ja" ? `${itemsDetailed.length} 個の商品がリストにあります` : lang === "en" ? `${itemsDetailed.length} product(s) listed` : `${itemsDetailed.length} produto(s) listado(s)`)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                    {lang === "ja" ? "獲得総額" : lang === "en" ? "Total Revenue" : "Total Arrecadado"}
                  </span>
                  <span className="text-xl font-black text-neutral-900 dark:text-white">{yen(order.totalAmount || computedTotal || 0)}</span>
                  {(order.discount || 0) > 0 && (
                    <span className="mt-1 block text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                      {lang === "ja" ? "割引" : lang === "en" ? "Discount" : "Desconto"}: -{yen(order.discount || 0)}
                    </span>
                  )}
                </div>
              </div>

              {(order.offersApplied || []).length > 0 && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/40 dark:bg-orange-950/20">
                  {(order.offersApplied || []).map((offer) => (
                    <div key={offer.offerId} className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-300">
                        {lang === "ja" ? "適用オファー" : lang === "en" ? "Applied offer" : "Oferta aplicada"}
                      </p>
                      <p className="text-sm font-black text-neutral-900 dark:text-white">{offer.name}</p>
                      <p className="text-xs font-bold text-neutral-500 dark:text-neutral-300">
                        {offer.bundleCount} {lang === "ja" ? "セット" : lang === "en" ? "bundle(s)" : "kit(s)"} · {lang === "ja" ? "割引" : lang === "en" ? "discount" : "desconto"} {yen(order.discount || 0)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-hidden border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-900">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="text-left px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === "ja" ? "商品 / SKU" : lang === "en" ? "Item / SKU" : "Item / SKU"}</th>
                      <th className="text-center px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === "ja" ? "数量" : lang === "en" ? "Qty" : "Qtd"}</th>
                      <th className="text-right px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === "ja" ? "単価" : lang === "en" ? "Price" : "Preço"}</th>
                      <th className="text-right px-4 py-3 font-black text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{lang === "ja" ? "小計" : lang === "en" ? "Subtotal" : "Subtotal"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/40 font-medium">
                    {itemsDetailed.map((it) => (
                      <tr key={it.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition">
                        <td className="px-4 py-3 text-neutral-900 dark:text-neutral-200 font-bold">
                          <div className="flex flex-col">
                            <span className="text-neutral-900 dark:text-white font-black tracking-tight">{it.name}</span>
                            <span className="text-[10px] font-mono text-neutral-400 block truncate max-w-[160px]">{it.id}</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {it.availabilityMode === "made_to_order" && (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                  {lang === "ja" ? "受注生産" : lang === "en" ? "Made to order" : "Sob encomenda"}
                                </span>
                              )}
                              {it.stockReserved > 0 && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  {lang === "ja" ? `予約 ${it.stockReserved}` : lang === "en" ? `Reserved ${it.stockReserved}` : `Reservado ${it.stockReserved}`}
                                </span>
                              )}
                              {it.stockShortage > 0 && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                  {lang === "ja" ? `不足 ${it.stockShortage}` : lang === "en" ? `Short ${it.stockShortage}` : `Falta ${it.stockShortage}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-neutral-500 dark:text-neutral-400 font-bold">{it.qty}</td>
                        <td className="px-4 py-3 text-right text-neutral-500 dark:text-neutral-400">{it.price > 0 ? yen(it.price) : "—"}</td>
                        <td className="px-4 py-3 text-right text-neutral-900 dark:text-white font-black">{it.subtotal > 0 ? yen(it.subtotal) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {itemsDetailed.length === 0 && (
                <p className="text-xs font-bold text-neutral-400 italic text-center py-6">{lang === "ja" ? "この注文に商品はありません。" : lang === "en" ? "No products attached to this order." : "Nenhum produto anexado a este pedido."}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
import { createHash } from "node:crypto";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import webpush from "web-push";
import { defineSecret, defineString } from "firebase-functions/params";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const vapidPublic = defineString("VAPID_PUBLIC");
const vapidPrivate = defineSecret("VAPID_PRIVATE");
const adminEmail = defineString("ADMIN_EMAIL", {
  default: "mailto:admin@yamada.app",
});

type Language = "pt" | "en" | "ja";
type CustomerNoticeKind = "production" | "ready" | "delivered" | "cancelled";
type OrderSource = "store" | "event";

type StoredPushSubscription = {
  endpoint: string;
  language?: Language;
  vapidFingerprint?: string;
  keys: { p256dh: string; auth: string };
};

type PushSendResult = {
  ok: boolean;
  statusCode: number;
  code: string;
  message: string;
};

type StoredRegionalPushSubscription = StoredPushSubscription & {
  sellerId: string;
  regionId: string;
};

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function languageOf(value: unknown): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function publicKeyFingerprint(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}

function currentServerVapidFingerprint(): string {
  const publicKey = vapidPublic.value().trim();
  return publicKey ? publicKeyFingerprint(publicKey) : "";
}

function isValidPushSubscription(value: unknown): value is StoredPushSubscription {
  const data = value as StoredPushSubscription | null;
  return Boolean(data?.endpoint && data?.keys?.p256dh && data?.keys?.auth);
}

function isValidRegionalSubscription(value: unknown): value is StoredRegionalPushSubscription {
  const data = value as StoredRegionalPushSubscription | null;
  return Boolean(
    isValidPushSubscription(data) && data?.sellerId && data?.regionId,
  );
}

let configuredFingerprint = "";

function ensurePushConfigured(): boolean {
  const publicKey = vapidPublic.value().trim();
  const privateKey = vapidPrivate.value().trim();
  const subject = adminEmail.value().trim() || "mailto:admin@yamada.app";
  if (!publicKey || !privateKey) {
    console.error("[push] VAPID_PUBLIC ou VAPID_PRIVATE não configurado.");
    return false;
  }

  const fingerprint = `${subject}|${publicKey}|${privateKey.slice(0, 8)}`;
  if (configuredFingerprint !== fingerprint) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredFingerprint = fingerprint;
  }
  return true;
}


class PushSendTimeoutError extends Error {
  constructor() {
    super("O serviço push não respondeu dentro do tempo limite.");
    this.name = "PushSendTimeoutError";
  }
}

async function withPushTimeout<T>(promise: Promise<T>, timeoutMs = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new PushSendTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendAndClean(params: {
  subscriptionRef: admin.firestore.DocumentReference;
  endpointMirrorRef?: admin.firestore.DocumentReference;
  subscriptionData: StoredPushSubscription;
  payload: Record<string, unknown>;
}): Promise<PushSendResult> {
  const serverFingerprint = currentServerVapidFingerprint();
  const storedFingerprint = cleanString(params.subscriptionData.vapidFingerprint, 64);
  if (storedFingerprint && serverFingerprint && storedFingerprint !== serverFingerprint) {
    console.error(
      `[push] VAPID mismatch endpoint=${params.subscriptionRef.path} stored=${storedFingerprint} server=${serverFingerprint}`,
    );
    return {
      ok: false,
      statusCode: 0,
      code: "STALE_SUBSCRIPTION",
      message: "A assinatura foi criada com uma chave VAPID diferente.",
    };
  }

  try {
    const response = await withPushTimeout(
      webpush.sendNotification(
        {
          endpoint: params.subscriptionData.endpoint,
          keys: params.subscriptionData.keys,
        } as any,
        JSON.stringify(params.payload),
      ),
    );
    console.info(
      `[push] Enviado endpoint=${params.subscriptionRef.path} status=${response.statusCode}`,
    );
    return {
      ok: true,
      statusCode: response.statusCode,
      code: "SENT",
      message: "O serviço push aceitou a mensagem.",
    };
  } catch (error: any) {
    if (error instanceof PushSendTimeoutError) {
      console.error(`[push] Timeout endpoint=${params.subscriptionRef.path}`);
      return {
        ok: false,
        statusCode: 0,
        code: "PUSH_TIMEOUT",
        message: error.message,
      };
    }

    const statusCode = Number(error?.statusCode) || 0;
    if (statusCode === 404 || statusCode === 410) {
      await Promise.all([
        params.subscriptionRef.delete().catch(() => undefined),
        params.endpointMirrorRef?.delete().catch(() => undefined),
      ]);
      console.warn(
        `[push] Assinatura expirada removida endpoint=${params.subscriptionRef.path} status=${statusCode}`,
      );
      return {
        ok: false,
        statusCode,
        code: "NO_SUBSCRIPTION",
        message: "A assinatura expirou e foi removida.",
      };
    }
    console.error(
      `[push] Falha endpoint=${params.subscriptionRef.path} status=${statusCode}:`,
      error?.body || error?.message || error,
    );
    return {
      ok: false,
      statusCode,
      code: "PUSH_REJECTED",
      message: cleanString(error?.body ?? error?.message, 400) || "O serviço push recusou a mensagem.",
    };
  }
}

function normalizeStatus(value: unknown): "pending" | "ready" | "delivered" | "cancelled" {
  if (value === "ready" || value === "delivered" || value === "cancelled") return value;
  return "pending";
}

function producedTotal(order: Record<string, any>): number {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum: number, raw: any) => {
    const state = raw?.inventoryState && typeof raw.inventoryState === "object"
      ? raw.inventoryState
      : {};
    const value = Number(state.producedQuantity ?? raw?.producedQuantity ?? 0);
    return sum + (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  }, 0);
}

function customerNoticeKind(
  before: Record<string, any>,
  after: Record<string, any>,
): CustomerNoticeKind | null {
  const beforeStatus = normalizeStatus(before.fulfillmentStatus ?? before.status);
  const afterStatus = normalizeStatus(after.fulfillmentStatus ?? after.status);

  if (beforeStatus !== afterStatus) {
    if (afterStatus === "ready") return "ready";
    if (afterStatus === "delivered") return "delivered";
    if (afterStatus === "cancelled") return "cancelled";
  }

  if (afterStatus === "pending" && producedTotal(before) <= 0 && producedTotal(after) > 0) {
    return "production";
  }

  return null;
}

function customerCopy(params: {
  language: Language;
  kind: CustomerNoticeKind;
  orderId: string;
  storeName: string;
}) {
  const number = `#${params.orderId}`;
  const merchant = params.storeName ? ` · ${params.storeName}` : "";
  const copy = {
    pt: {
      production: { title: "Seu pedido está em preparação 👩‍🍳", body: `O pedido ${number}${merchant} começou a ser preparado.` },
      ready: { title: "Seu pedido está pronto ✅", body: `O pedido ${number}${merchant} está pronto para retirada ou entrega.` },
      delivered: { title: "Pedido concluído 🎉", body: `O pedido ${number}${merchant} foi marcado como entregue.` },
      cancelled: { title: "Pedido cancelado", body: `O pedido ${number}${merchant} foi cancelado. Abra o app para ver os detalhes.` },
    },
    en: {
      production: { title: "Your order is being prepared 👩‍🍳", body: `Order ${number}${merchant} has started being prepared.` },
      ready: { title: "Your order is ready ✅", body: `Order ${number}${merchant} is ready for pickup or delivery.` },
      delivered: { title: "Order completed 🎉", body: `Order ${number}${merchant} was marked as delivered.` },
      cancelled: { title: "Order cancelled", body: `Order ${number}${merchant} was cancelled. Open the app for details.` },
    },
    ja: {
      production: { title: "注文の準備を開始しました 👩‍🍳", body: `注文 ${number}${merchant} の準備が始まりました。` },
      ready: { title: "注文の準備ができました ✅", body: `注文 ${number}${merchant} は受け取り・配達の準備ができました。` },
      delivered: { title: "注文が完了しました 🎉", body: `注文 ${number}${merchant} は受け渡し済みになりました。` },
      cancelled: { title: "注文がキャンセルされました", body: `注文 ${number}${merchant} はキャンセルされました。詳細はアプリで確認してください。` },
    },
  } as const;
  return copy[params.language][params.kind];
}

async function sendCustomerOrderNotice(params: {
  before: Record<string, any>;
  after: Record<string, any>;
  orderId: string;
}) {
  const kind = customerNoticeKind(params.before, params.after);
  if (!kind) {
    console.info(`[customer-push] Pedido ${params.orderId} atualizado sem mudança notificável.`);
    return;
  }

  console.info(`[customer-push] Pedido ${params.orderId} gerou aviso kind=${kind}.`);
  const customerUid = cleanString(params.after.customerUid, 160);
  const referenceId = cleanString(params.after.customerOrderRefId, 160);
  if (!customerUid || !referenceId || customerUid.includes("/") || referenceId.includes("/")) {
    console.info(`[customer-push] Pedido ${params.orderId} não pertence a cliente registrado.`);
    return;
  }
  if (!ensurePushConfigured()) return;

  const customerRef = db.collection("customers").doc(customerUid);
  const [customerSnapshot, subscriptionsSnapshot] = await Promise.all([
    customerRef.get(),
    customerRef.collection("pushSubscriptions").get(),
  ]);
  if (subscriptionsSnapshot.empty) {
    console.info(`[customer-push] Cliente ${customerUid} sem assinaturas.`);
    return;
  }
  console.info(
    `[customer-push] Cliente ${customerUid} assinaturas=${subscriptionsSnapshot.size} reference=${referenceId}`,
  );

  const customerLanguage = languageOf(customerSnapshot.data()?.preferredLanguage);
  const storeName = cleanString(
    params.after.storeName ?? params.after.sellerName ?? params.after.eventTitle ?? params.after.title,
    120,
  );

  await Promise.all(
    subscriptionsSnapshot.docs.map(async (subscriptionSnapshot) => {
      const subscriptionData = subscriptionSnapshot.data();
      if (!isValidPushSubscription(subscriptionData)) {
        await subscriptionSnapshot.ref.delete().catch(() => undefined);
        return;
      }
      const language = languageOf(subscriptionData.language ?? customerLanguage);
      const localized = customerCopy({ language, kind, orderId: params.orderId, storeName });
      await sendAndClean({
        subscriptionRef: subscriptionSnapshot.ref,
        endpointMirrorRef: db.collection("customerPushEndpoints").doc(subscriptionSnapshot.id),
        subscriptionData,
        payload: {
          ...localized,
          url: `/customer/orders/${encodeURIComponent(referenceId)}`,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          tag: `customer-order-${referenceId}-${kind}`,
          renotify: true,
          badgeCount: 1,
          kind: `customer-order-${kind}`,
          orderReferenceId: referenceId,
          orderId: params.orderId,
        },
      });
    }),
  );
}

function sellerCopy(params: {
  language: Language;
  source: OrderSource;
  orderId: string;
  customerName: string;
  totalItems: number;
}) {
  const number = `#${params.orderId}`;
  const customer = params.customerName || (params.language === "ja" ? "お客様" : params.language === "en" ? "Customer" : "Cliente");
  const items = params.totalItems;
  if (params.language === "ja") {
    return {
      title: params.source === "event" ? "イベントの新しい注文 🔔" : "新しい注文 🔔",
      body: `${customer} · ${number} · ${items}点`,
    };
  }
  if (params.language === "en") {
    return {
      title: params.source === "event" ? "New event order 🔔" : "New store order 🔔",
      body: `${customer} · ${number} · ${items} ${items === 1 ? "item" : "items"}`,
    };
  }
  return {
    title: params.source === "event" ? "Novo pedido de evento 🔔" : "Novo pedido da loja 🔔",
    body: `${customer} · ${number} · ${items} ${items === 1 ? "item" : "itens"}`,
  };
}

async function sendSellerOrderNotice(params: {
  sellerId: string;
  eventId: string;
  orderId: string;
  source: OrderSource;
  order: Record<string, any>;
}) {
  if (!ensurePushConfigured()) return;
  const sellerRef = db.collection("sellers").doc(params.sellerId);
  const [subscriptionsSnapshot, stateSnapshot] = await Promise.all([
    sellerRef.collection("pushSubscriptions").get(),
    sellerRef.collection("notificationState").doc("orders").get(),
  ]);
  if (subscriptionsSnapshot.empty) {
    console.info(`[seller-push] Seller ${params.sellerId} sem assinaturas.`);
    return;
  }
  console.info(
    `[seller-push] Seller ${params.sellerId} assinaturas=${subscriptionsSnapshot.size} order=${params.orderId}`,
  );

  const badgeCount = Math.max(
    1,
    nonNegativeInteger(stateSnapshot.data()?.unreadCount),
  );
  const customerName = cleanString(
    params.order.customerName ?? params.order.customer?.name,
    120,
  );
  const totalItems = Math.max(
    1,
    nonNegativeInteger(params.order.totalItems) ||
      (Array.isArray(params.order.items)
        ? params.order.items.reduce(
            (sum: number, item: any) => sum + nonNegativeInteger(item?.quantity ?? item?.qty),
            0,
          )
        : 1),
  );
  const url = params.source === "event"
    ? `/seller/events/${encodeURIComponent(params.eventId)}`
    : `/seller/store-orders/${encodeURIComponent(params.orderId)}`;

  await Promise.all(
    subscriptionsSnapshot.docs.map(async (subscriptionSnapshot) => {
      const subscriptionData = subscriptionSnapshot.data();
      if (!isValidPushSubscription(subscriptionData)) {
        await subscriptionSnapshot.ref.delete().catch(() => undefined);
        return;
      }
      const language = languageOf(subscriptionData.language);
      const localized = sellerCopy({
        language,
        source: params.source,
        orderId: params.orderId,
        customerName,
        totalItems,
      });
      await sendAndClean({
        subscriptionRef: subscriptionSnapshot.ref,
        endpointMirrorRef: db.collection("sellerPushEndpoints").doc(subscriptionSnapshot.id),
        subscriptionData,
        payload: {
          ...localized,
          url,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          tag: `seller-order-${params.source}-${params.orderId}`,
          renotify: true,
          requireInteraction: true,
          badgeCount,
          kind: "seller-new-order",
          sellerId: params.sellerId,
          eventId: params.eventId,
          orderId: params.orderId,
        },
      });
    }),
  );
}

export const notifyOnNewEvent = onDocumentCreated(
  {
    document: "sellers/{sellerId}/events/{eventId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const eventData = snapshot.data();
    if (!eventData || eventData.status !== "active") return;
    const sellerId = cleanString(event.params.sellerId, 160);
    const regionId = cleanString(eventData.regionId, 160);
    if (!sellerId || !regionId || !ensurePushConfigured()) return;

    const subscriptionsSnapshot = await db
      .collection("pushSubscriptions")
      .where("sellerId", "==", sellerId)
      .where("regionId", "==", regionId)
      .get();
    const title = cleanString(eventData.title, 160) || "Novo evento disponível 🎉";

    await Promise.all(
      subscriptionsSnapshot.docs.map(async (subscriptionSnapshot) => {
        const subscriptionData = subscriptionSnapshot.data();
        if (!isValidRegionalSubscription(subscriptionData)) {
          await subscriptionSnapshot.ref.delete().catch(() => undefined);
          return;
        }
        await sendAndClean({
          subscriptionRef: subscriptionSnapshot.ref,
          subscriptionData,
          payload: {
            title: "Novo evento disponível 🎉",
            body: title,
            url: `/event/${encodeURIComponent(sellerId)}/${encodeURIComponent(event.params.eventId)}`,
            icon: "/icon-192x192.png",
            badge: "/icon-192x192.png",
            tag: `event-${sellerId}-${event.params.eventId}`,
            kind: "new-event",
          },
        });
      }),
    );
  },
);

export const notifyCustomerStoreOrderStatus = onDocumentUpdated(
  {
    document: "sellers/{sellerId}/storeOrders/{orderId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    await sendCustomerOrderNotice({
      before,
      after,
      orderId: cleanString(event.params.orderId, 160),
    });
  },
);

export const notifyCustomerEventOrderStatus = onDocumentUpdated(
  {
    document: "sellers/{sellerId}/events/{eventId}/orders/{orderId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    await sendCustomerOrderNotice({
      before,
      after,
      orderId: cleanString(event.params.orderId, 160),
    });
  },
);

export const notifySellerStoreOrderCreated = onDocumentCreated(
  {
    document: "sellers/{sellerId}/storeOrders/{orderId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;
    await sendSellerOrderNotice({
      sellerId: cleanString(event.params.sellerId, 160),
      eventId: "",
      orderId: cleanString(event.params.orderId, 160),
      source: "store",
      order,
    });
  },
);

export const notifySellerEventOrderCreated = onDocumentCreated(
  {
    document: "sellers/{sellerId}/events/{eventId}/orders/{orderId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;
    await sendSellerOrderNotice({
      sellerId: cleanString(event.params.sellerId, 160),
      eventId: cleanString(event.params.eventId, 160),
      orderId: cleanString(event.params.orderId, 160),
      source: "event",
      order,
    });
  },
);

function pushTestCopy(language: Language, targetType: "customer" | "seller") {
  if (language === "ja") {
    return {
      title: "Yamada 通知テスト 🔔",
      body:
        targetType === "seller"
          ? "新規注文通知の接続は正常です。"
          : "注文状況通知の接続は正常です。",
    };
  }
  if (language === "en") {
    return {
      title: "Yamada notification test 🔔",
      body:
        targetType === "seller"
          ? "The new-order notification connection is working."
          : "The order-status notification connection is working.",
    };
  }
  return {
    title: "Teste de notificação Yamada 🔔",
    body:
      targetType === "seller"
        ? "A conexão dos avisos de novos pedidos está funcionando."
        : "A conexão dos avisos de andamento do pedido está funcionando.",
  };
}

export const notifyPushTestRequest = onDocumentCreated(
  {
    document: "pushTestRequests/{requestId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    try {
      const requestData = snapshot.data() ?? {};
    const targetType = requestData.targetType === "seller" ? "seller" : requestData.targetType === "customer" ? "customer" : "";
    const targetId = cleanString(requestData.targetId, 160);
    const subscriptionId = cleanString(requestData.subscriptionId, 128);
    const clientFingerprint = cleanString(requestData.clientVapidFingerprint, 64);
    const serverFingerprint = currentServerVapidFingerprint();
    const language = languageOf(requestData.language);

    const finish = async (data: {
      status: "sent" | "partial" | "error";
      code: string;
      message: string;
      sentCount: number;
      failedCount: number;
      pushStatusCode?: number;
    }) => {
      await snapshot.ref.set(
        {
          ...data,
          serverVapidFingerprint: serverFingerprint,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    };

    await snapshot.ref.set(
      {
        status: "processing",
        code: "PROCESSING",
        message: "Teste em processamento.",
        serverVapidFingerprint: serverFingerprint,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (!targetType || !targetId || targetId.includes("/") || !/^[a-f0-9]{64}$/i.test(subscriptionId)) {
      await finish({
        status: "error",
        code: "INVALID_REQUEST",
        message: "Os dados do teste são inválidos.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    if (!ensurePushConfigured() || !serverFingerprint) {
      await finish({
        status: "error",
        code: "PUSH_CONFIGURATION_MISSING",
        message: "As chaves VAPID das Firebase Functions não estão configuradas.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    if (clientFingerprint && clientFingerprint !== serverFingerprint) {
      console.error(
        `[push-test] VAPID mismatch request=${event.params.requestId} client=${clientFingerprint} server=${serverFingerprint}`,
      );
      await finish({
        status: "error",
        code: "VAPID_MISMATCH",
        message: "A chave pública da Vercel é diferente da chave pública das Firebase Functions.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    const ownerRef = db.collection(targetType === "seller" ? "sellers" : "customers").doc(targetId);
    const subscriptionRef = ownerRef.collection("pushSubscriptions").doc(subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) {
      await finish({
        status: "error",
        code: "NO_SUBSCRIPTION",
        message: "A assinatura deste aparelho não foi encontrada no Firebase.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    const subscriptionData = subscriptionSnapshot.data();
    if (!isValidPushSubscription(subscriptionData)) {
      await subscriptionRef.delete().catch(() => undefined);
      await finish({
        status: "error",
        code: "NO_SUBSCRIPTION",
        message: "A assinatura salva é inválida e foi removida.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    const storedFingerprint = cleanString(subscriptionData.vapidFingerprint, 64);
    if (storedFingerprint && storedFingerprint !== serverFingerprint) {
      await finish({
        status: "error",
        code: "STALE_SUBSCRIPTION",
        message: "A assinatura deste aparelho foi criada com uma chave VAPID antiga.",
        sentCount: 0,
        failedCount: 1,
      });
      return;
    }

    const localized = pushTestCopy(language, targetType);
    const result = await sendAndClean({
      subscriptionRef,
      endpointMirrorRef: db
        .collection(targetType === "seller" ? "sellerPushEndpoints" : "customerPushEndpoints")
        .doc(subscriptionId),
      subscriptionData,
      payload: {
        ...localized,
        url: targetType === "seller" ? "/seller/settings" : "/customer/profile",
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        tag: `push-test-${event.params.requestId}`,
        renotify: true,
        requireInteraction: false,
        badgeCount: 1,
        kind: "push-test",
      },
    });

      await finish({
        status: result.ok ? "sent" : "error",
        code: result.code,
        message: result.message,
        sentCount: result.ok ? 1 : 0,
        failedCount: result.ok ? 0 : 1,
        pushStatusCode: result.statusCode,
      });
    } catch (error) {
      console.error(`[push-test] Falha inesperada request=${event.params.requestId}:`, error);
      await snapshot.ref.set(
        {
          status: "error",
          code: "FUNCTION_ERROR",
          message:
            error instanceof Error
              ? cleanString(error.message, 500) || "A função de teste falhou."
              : "A função de teste falhou.",
          sentCount: 0,
          failedCount: 1,
          serverVapidFingerprint: currentServerVapidFingerprint(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

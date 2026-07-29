import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import webpush from "web-push";
import { defineSecret, defineString } from "firebase-functions/params";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/* ---------------- CONFIG ---------------- */

const vapidPublic = defineString("VAPID_PUBLIC");
const vapidPrivate = defineSecret("VAPID_PRIVATE");
const vapidSubject = defineString("VAPID_SUBJECT", { default: "" });
// Compatibilidade com ambientes antigos que usavam ADMIN_EMAIL.
const adminEmail = defineString("ADMIN_EMAIL", { default: "" });

/* ---------------- TYPES ---------------- */

type Language = "pt" | "en" | "ja";
type CustomerNoticeKind = "production" | "ready" | "delivered" | "cancelled";

type StoredRegionalPushSubscription = {
  endpoint: string;
  sellerId: string;
  regionId: string;
  keys: { p256dh: string; auth: string };
};

type StoredCustomerPushSubscription = {
  endpoint: string;
  language?: Language;
  keys: { p256dh: string; auth: string };
};

const isValidRegionalSub = (value: any): value is StoredRegionalPushSubscription =>
  !!(
    value?.endpoint &&
    value?.keys?.p256dh &&
    value?.keys?.auth &&
    value?.sellerId &&
    value?.regionId
  );

const isValidCustomerSub = (value: any): value is StoredCustomerPushSubscription =>
  !!(value?.endpoint && value?.keys?.p256dh && value?.keys?.auth);

/* ---------------- HELPERS ---------------- */

let pushConfigured = false;

function ensurePushConfigured() {
  if (pushConfigured) return;

  const pub = vapidPublic.value();
  const priv = vapidPrivate.value();
  const subject = normalizeVapidSubject(vapidSubject.value() || adminEmail.value());

  if (!pub || !priv) {
    console.warn("[push] Missing VAPID_PUBLIC or VAPID_PRIVATE. Push disabled.");
    return;
  }

  webpush.setVapidDetails(subject, pub, priv);
  pushConfigured = true;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeVapidSubject(value: unknown): string {
  const subject = cleanString(value, 500);
  if (/^https?:\/\//i.test(subject) || /^mailto:/i.test(subject)) {
    return subject;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) {
    return `mailto:${subject}`;
  }
  return "mailto:noreply@example.com";
}

function languageOf(value: unknown): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

function normalizeStatus(value: unknown): "pending" | "ready" | "delivered" | "cancelled" {
  if (value === "ready" || value === "delivered" || value === "cancelled") {
    return value;
  }
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

  if (
    afterStatus === "pending" &&
    producedTotal(before) <= 0 &&
    producedTotal(after) > 0
  ) {
    return "production";
  }

  return null;
}

function noticeCopy(params: {
  language: Language;
  kind: CustomerNoticeKind;
  orderId: string;
  storeName: string;
}) {
  const { language, kind, orderId, storeName } = params;
  const number = `#${orderId}`;
  const merchant = storeName ? ` · ${storeName}` : "";

  const copy = {
    pt: {
      production: {
        title: "Seu pedido está em preparação 👩‍🍳",
        body: `O pedido ${number}${merchant} começou a ser preparado.`,
      },
      ready: {
        title: "Seu pedido está pronto ✅",
        body: `O pedido ${number}${merchant} está pronto para retirada ou entrega.`,
      },
      delivered: {
        title: "Pedido concluído 🎉",
        body: `O pedido ${number}${merchant} foi marcado como entregue.`,
      },
      cancelled: {
        title: "Pedido cancelado",
        body: `O pedido ${number}${merchant} foi cancelado. Abra o app para ver os detalhes.`,
      },
    },
    en: {
      production: {
        title: "Your order is being prepared 👩‍🍳",
        body: `Order ${number}${merchant} has started being prepared.`,
      },
      ready: {
        title: "Your order is ready ✅",
        body: `Order ${number}${merchant} is ready for pickup or delivery.`,
      },
      delivered: {
        title: "Order completed 🎉",
        body: `Order ${number}${merchant} was marked as delivered.`,
      },
      cancelled: {
        title: "Order cancelled",
        body: `Order ${number}${merchant} was cancelled. Open the app for details.`,
      },
    },
    ja: {
      production: {
        title: "注文の準備を開始しました 👩‍🍳",
        body: `注文 ${number}${merchant} の準備が始まりました。`,
      },
      ready: {
        title: "注文の準備ができました ✅",
        body: `注文 ${number}${merchant} は受け取り・配達の準備ができました。`,
      },
      delivered: {
        title: "注文が完了しました 🎉",
        body: `注文 ${number}${merchant} は受け渡し済みになりました。`,
      },
      cancelled: {
        title: "注文がキャンセルされました",
        body: `注文 ${number}${merchant} はキャンセルされました。詳細はアプリで確認してください。`,
      },
    },
  } as const;

  return copy[language][kind];
}

async function sendCustomerOrderNotice(params: {
  before: Record<string, any>;
  after: Record<string, any>;
  orderId: string;
}) {
  const { before, after, orderId } = params;
  const kind = customerNoticeKind(before, after);
  if (!kind) return;

  const customerUid = cleanString(after.customerUid, 160);
  const referenceId = cleanString(after.customerOrderRefId, 160);
  if (!customerUid || !referenceId || customerUid.includes("/") || referenceId.includes("/")) {
    return;
  }

  ensurePushConfigured();
  if (!pushConfigured) return;

  const customerRef = db.collection("customers").doc(customerUid);
  const [customerSnapshot, subscriptionsSnapshot] = await Promise.all([
    customerRef.get(),
    customerRef.collection("pushSubscriptions").get(),
  ]);
  if (subscriptionsSnapshot.empty) return;

  const customerLanguage = languageOf(customerSnapshot.data()?.preferredLanguage);
  const storeName = cleanString(
    after.storeName ?? after.sellerName ?? after.eventTitle ?? after.title,
    120,
  );
  const deletions: Promise<any>[] = [];

  await Promise.all(
    subscriptionsSnapshot.docs.map(async (documentSnapshot) => {
      const subscriptionData = documentSnapshot.data();
      if (!isValidCustomerSub(subscriptionData)) {
        deletions.push(documentSnapshot.ref.delete());
        deletions.push(db.collection("customerPushEndpoints").doc(documentSnapshot.id).delete());
        return;
      }

      const language = languageOf(subscriptionData.language ?? customerLanguage);
      const localized = noticeCopy({ language, kind, orderId, storeName });
      const payload = JSON.stringify({
        ...localized,
        url: `/customer/orders/${encodeURIComponent(referenceId)}`,
        tag: `customer-order-${referenceId}-${kind}`,
        renotify: true,
        kind,
        orderReferenceId: referenceId,
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscriptionData.endpoint,
            keys: subscriptionData.keys,
          } as any,
          payload,
        );
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          deletions.push(documentSnapshot.ref.delete());
          deletions.push(db.collection("customerPushEndpoints").doc(documentSnapshot.id).delete());
        } else {
          console.error(
            `[customer-push] send error customer=${customerUid} sub=${documentSnapshot.id}:`,
            error?.message || error,
          );
        }
      }
    }),
  );

  if (deletions.length) await Promise.all(deletions);
}

/* ---------------- REGIONAL EVENT PUSH ---------------- */

export const notifyOnNewEvent = onDocumentCreated(
  {
    document: "events/{eventId}",
    region: "asia-northeast1",
    secrets: [vapidPrivate],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const eventData = snap.data();
    if (!eventData || eventData.status !== "active") return;
    if (!eventData.broadcast && (!eventData.sellerId || !eventData.regionId)) return;

    ensurePushConfigured();
    if (!pushConfigured) return;

    let query: admin.firestore.Query = db.collection("pushSubscriptions");
    if (!eventData.broadcast) {
      query = query
        .where("sellerId", "==", eventData.sellerId)
        .where("regionId", "==", eventData.regionId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) return;

    const payload = JSON.stringify({
      title: "Novo evento disponível 🎉",
      body: String(eventData.title || "Clique para ver os produtos."),
      url: `/event/${event.params.eventId}`,
      tag: `event-${event.params.eventId}`,
    });
    const deletions: Promise<any>[] = [];

    await Promise.all(
      snapshot.docs.map(async (documentSnapshot) => {
        const data = documentSnapshot.data();
        if (!isValidRegionalSub(data)) {
          deletions.push(documentSnapshot.ref.delete());
          return;
        }

        try {
          await webpush.sendNotification(
            { endpoint: data.endpoint, keys: data.keys } as any,
            payload,
          );
        } catch (error: any) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            deletions.push(documentSnapshot.ref.delete());
          } else {
            console.error(
              `[push] send error doc=${documentSnapshot.id}:`,
              error?.message || error,
            );
          }
        }
      }),
    );

    if (deletions.length) await Promise.all(deletions);
  },
);

/* ---------------- CUSTOMER ORDER PUSH ---------------- */

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

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import webpush from "web-push";
import { defineString, defineSecret } from "firebase-functions/params";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/* ---------------- CONFIG ---------------- */

// Public pode ser string normal
const vapidPublic = defineString("VAPID_PUBLIC");
// Private deve ser secret
const vapidPrivate = defineSecret("VAPID_PRIVATE");
// Subject/email pode ser string
const adminEmail = defineString("ADMIN_EMAIL", { default: "mailto:admin@yamada.app" });

/* ---------------- TYPES ---------------- */

type StoredPushSubscription = {
  endpoint: string;
  sellerId: string;
  regionId: string;
  keys: { p256dh: string; auth: string };
};

const isValidStoredSub = (v: any): v is StoredPushSubscription =>
  !!(v?.endpoint && v?.keys?.p256dh && v?.keys?.auth && v?.sellerId && v?.regionId);

/* ---------------- PUSH SETUP (CACHE) ---------------- */

let pushConfigured = false;

function ensurePushConfigured() {
  if (pushConfigured) return;

  const pub = vapidPublic.value();
  const priv = vapidPrivate.value(); // secret
  const subject = adminEmail.value();

  if (!pub || !priv) {
    console.warn("[push] Missing VAPID_PUBLIC or VAPID_PRIVATE. Push disabled.");
    return;
  }

  webpush.setVapidDetails(subject, pub, priv);
  pushConfigured = true;
}

/* ---------------- FUNCTION ---------------- */

export const notifyOnNewEvent = onDocumentCreated(
  {
    document: "events/{eventId}",
    region: "asia-northeast1",
    // ✅ bind do secret na function (muito importante)
    secrets: [vapidPrivate],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const eventData = snap.data();

    // só notifica evento ativo
    if (!eventData || eventData.status !== "active") return;

    // exige target (ou broadcast)
    if (!eventData.broadcast && (!eventData.sellerId || !eventData.regionId)) return;

    ensurePushConfigured();
    if (!pushConfigured) return;

    let query: admin.firestore.Query = db.collection("pushSubscriptions");

    if (!eventData.broadcast) {
      query = query.where("sellerId", "==", eventData.sellerId).where("regionId", "==", eventData.regionId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) return;

    const payload = JSON.stringify({
      title: "Novo evento disponível 🎉",
      body: String(eventData.title || "Clique para ver os produtos."),
      url: `/event/${event.params.eventId}`,
    });

    const deletions: Promise<any>[] = [];

    await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();

        if (!isValidStoredSub(data)) {
          deletions.push(docSnap.ref.delete());
          return;
        }

        const sub = { endpoint: data.endpoint, keys: data.keys };

        try {
          await webpush.sendNotification(sub as any, payload);
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            deletions.push(docSnap.ref.delete());
          } else {
            console.error(`[push] send error doc=${docSnap.id}:`, err?.message || err);
          }
        }
      })
    );

    if (deletions.length) {
      console.log(`[push] Cleaning ${deletions.length} invalid subscriptions`);
      await Promise.all(deletions);
    }
  }
);

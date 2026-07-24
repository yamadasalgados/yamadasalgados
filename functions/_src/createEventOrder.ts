// functions/src/createEventOrder.ts
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import cors from "cors";
import webpush from "web-push";
import { defineSecret, defineString } from "firebase-functions/params";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const corsMiddleware = cors({ origin: true });

/** ---------- SECRETS (Gen2) ---------- */
const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const PUSH_SUBJECT = defineSecret("PUSH_SUBJECT");

/**
 * NÃO é segredo (é só URL do seu dashboard).
 * Opcional: se não setar, URL vai vazio.
 */
const SELLER_DASHBOARD_BASE_URL = defineString("SELLER_DASHBOARD_BASE_URL", { default: "" });

/** ---------- TYPES ---------- */
type Channel = "whatsapp" | "messenger";

type CreateOrderBody = {
  sellerId: string;
  eventId: string;
  channel: Channel;

  customerName?: string;
  note?: string;

  deliveryMode?: "delivery" | "pickup" | "none";
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  locationLink?: string;

  quantities: Record<string, number>; // itemId -> qty (ou name legado)
};

type PushSubDoc = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  sellerId: string;
  regionId: string;
};

/** ---------- HELPERS ---------- */
const clampInt = (n: any, min: number, max: number) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
};

const cleanStr = (v: any, maxLen: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.slice(0, maxLen);
};

function looksLikeDocId(key: string) {
  const k = key.trim();
  if (k.length < 10) return false;
  if (k.includes(" ")) return false;
  return true;
}

async function safeDeleteDoc(ref: FirebaseFirestore.DocumentReference) {
  try {
    await ref.delete();
  } catch {}
}

/** Erro com status HTTP controlado */
function httpError(status: number, message: string): never {
  const err = new Error(message) as any;
  err.status = status;
  throw err;
}

/** ---------- PUSH (cache por instância) ---------- */
let pushReady: boolean | null = null;

function ensureWebPushConfigured() {
  if (pushReady !== null) return pushReady;

  const publicKey = (VAPID_PUBLIC_KEY.value() || "").trim();
  const privateKey = (VAPID_PRIVATE_KEY.value() || "").trim();
  const subject = (PUSH_SUBJECT.value() || "mailto:admin@yamada.com").trim();

  if (!publicKey || !privateKey) {
    console.warn("[push] Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY. Push disabled.");
    pushReady = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    pushReady = true;
    return true;
  } catch (e) {
    console.warn("[push] setVapidDetails failed. Push disabled.", e);
    pushReady = false;
    return false;
  }
}

async function sendPushToSeller(params: {
  sellerId: string;
  regionId: string;
  title: string;
  body: string;
  url?: string;
}) {
  if (!ensureWebPushConfigured()) return;

  const { sellerId, regionId, title, body, url } = params;
  if (!sellerId || !regionId) return;

  const MAX_SUBS = 200;

  const snap = await db
    .collection("pushSubscriptions")
    .where("sellerId", "==", sellerId)
    .where("regionId", "==", regionId)
    .limit(MAX_SUBS)
    .get();

  if (snap.empty) return;

  const payload = JSON.stringify({ title, body, url: url || "" });

  const jobs = snap.docs.map(async (d) => {
    const data = d.data() as any as PushSubDoc;

    const endpoint = typeof data?.endpoint === "string" ? data.endpoint : "";
    const p256dh = typeof data?.keys?.p256dh === "string" ? data.keys.p256dh : "";
    const auth = typeof data?.keys?.auth === "string" ? data.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      await safeDeleteDoc(d.ref);
      return;
    }

    const subscription = { endpoint, keys: { p256dh, auth } };

    try {
      await webpush.sendNotification(subscription as any, payload);
    } catch (err: any) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await safeDeleteDoc(d.ref);
        return;
      }
      console.warn("[push] sendNotification failed:", { statusCode, message: err?.message });
    }
  });

  await Promise.allSettled(jobs);
}

/**
 * Resolve exclusivamente o caminho canônico do schema V2:
 * sellers/{sellerId}/events/{eventId}.
 */
async function resolveEventRef(
  inputSellerId: string,
  eventId: string,
) {
  const sellerId = cleanStr(inputSellerId, 160);
  const eId = cleanStr(eventId, 120);

  if (!sellerId || !eId) return null;

  const eventRef = db
    .collection("sellers")
    .doc(sellerId)
    .collection("events")
    .doc(eId);

  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) return null;

  return { eventRef, sellerId };
}

/** ---------- FUNCTION ---------- */
export const createEventOrder = onRequest(
  {
    region: "asia-northeast1",
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBJECT],
  },
  (req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== "POST") httpError(405, "Method not allowed");

        const body = (req.body || {}) as Partial<CreateOrderBody>;

        const sellerIdIncoming = cleanStr(body.sellerId, 160);
        const eventId = cleanStr(body.eventId, 120);
        const channel = body.channel as any;

        if (!sellerIdIncoming) httpError(400, "Missing sellerId");
        if (!eventId) httpError(400, "Missing eventId");
        if (channel !== "whatsapp" && channel !== "messenger") httpError(400, "Invalid channel");

        const quantitiesRaw = body.quantities || {};
        if (typeof quantitiesRaw !== "object" || Array.isArray(quantitiesRaw)) {
          httpError(400, "Invalid quantities");
        }

        const MAX_DISTINCT_ITEMS = 80;

        const quantities: Record<string, number> = {};
        for (const [k, q] of Object.entries(quantitiesRaw)) {
          const key = cleanStr(k, 200);
          const qty = clampInt(q, 0, 999);
          if (key && qty > 0) quantities[key] = qty;

          if (Object.keys(quantities).length > MAX_DISTINCT_ITEMS) {
            httpError(400, `Too many different items (max ${MAX_DISTINCT_ITEMS}).`);
          }
        }

        const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0);
        if (totalItems <= 0) httpError(400, "Select at least 1 item");

        const customerName = cleanStr(body.customerName, 80);
        const note = cleanStr(body.note, 800);

        const deliveryMode =
          body.deliveryMode === "delivery" || body.deliveryMode === "pickup" || body.deliveryMode === "none"
            ? body.deliveryMode
            : "pickup";

        const deliveryDate = cleanStr(body.deliveryDate, 40);
        const deliveryTimeSlot = cleanStr(body.deliveryTimeSlot, 20);
        const locationLink = deliveryMode === "delivery" ? cleanStr(body.locationLink, 300) : "";

        // Resolve somente o caminho canônico informado pelo cliente.
        const resolved = await resolveEventRef(sellerIdIncoming, eventId);
        if (!resolved) httpError(404, "Event not found");

        const eventRef = resolved.eventRef; // sellers/{realSellerId}/events/{eventId}
        const sellerId = resolved.sellerId; // ✅ seller real (da árvore)
        const itemsCol = eventRef.collection("items");

        // ✅ grava SOMENTE dentro do evento
        const orderRef = eventRef.collection("orders").doc();

        // ✅ vamos devolver sempre por ID (mais confiável)
        const updatedStocksById: Record<string, number> = {};

        let regionIdForPush = "";
        let eventTitleForPush = "";
        let eventRegionForPush = "";
        let totalAmount = 0;

        // resolve legacy por name -> ref (se vier name)
        const nameKeys = Object.keys(quantities).filter((k) => !looksLikeDocId(k));
        const nameToRef: Record<string, FirebaseFirestore.DocumentReference> = {};

        if (nameKeys.length > 0) {
          const LOOKUP_LIMIT = 80;
          const keysSlice = nameKeys.slice(0, LOOKUP_LIMIT);

          type NameLookup =
            | { name: string; ref: FirebaseFirestore.DocumentReference }
            | { name: string; ref: null };

          const lookups: NameLookup[] = await Promise.all(
            keysSlice.map(async (name): Promise<NameLookup> => {
              const qs = await itemsCol.where("name", "==", name).limit(1).get();
              if (qs.empty) return { name, ref: null };
              return { name, ref: qs.docs[0].ref };
            })
          );

          for (const r of lookups) {
            if (r.ref === null) {
              httpError(400, `Produto não encontrado no evento: ${r.name}`);
            } else {
              nameToRef[r.name] = r.ref;
            }
          }
        }

        await db.runTransaction(async (tx) => {
          const eventSnap = await tx.get(eventRef);
          if (!eventSnap.exists) throw new Error("Event not found");

          const eventData = eventSnap.data() || {};
          const status = String(eventData.status || "active");
          if (status !== "active") throw new Error("Event is not active");

          // ✅ garante coerência
          const sellerIdInEvent = typeof eventData.sellerId === "string" ? eventData.sellerId : "";
          if (sellerIdInEvent && sellerIdInEvent !== sellerId) {
            throw new Error("Event/seller mismatch");
          }

          const regionId = typeof eventData.regionId === "string" ? eventData.regionId : "";
          const eventTitle = typeof eventData.title === "string" ? eventData.title : "";
          const eventRegion =
            typeof eventData.region === "string"
              ? eventData.region
              : typeof (eventData as any).regionName === "string"
              ? (eventData as any).regionName
              : "";

          regionIdForPush = regionId;
          eventTitleForPush = eventTitle;
          eventRegionForPush = eventRegion;

          const allowDelivery = typeof eventData.allowDelivery === "boolean" ? eventData.allowDelivery : true;
          const allowPickup = typeof eventData.allowPickup === "boolean" ? eventData.allowPickup : true;

          if (deliveryMode === "delivery" && !allowDelivery) throw new Error("Delivery disabled for this event");
          if (deliveryMode === "pickup" && !allowPickup) throw new Error("Pickup disabled for this event");

          // ✅ atualiza estoque e calcula total a partir de /items
          for (const [key, qty] of Object.entries(quantities)) {
            let itemRef: FirebaseFirestore.DocumentReference;

            if (looksLikeDocId(key)) {
              itemRef = itemsCol.doc(key);
            } else {
              itemRef = nameToRef[key];
              if (!itemRef) throw new Error(`Product not found in event: ${key}`);
            }

            const itemSnap = await tx.get(itemRef);
            if (!itemSnap.exists) throw new Error(`Item missing in event: ${key}`);

            const itemData = itemSnap.data() || {};

            const price =
              typeof itemData.price === "number" && Number.isFinite(itemData.price) ? itemData.price : 0;
            totalAmount += price * qty;

            const currentStock =
              typeof itemData.stockQty === "number" && Number.isFinite(itemData.stockQty) ? itemData.stockQty : null;

            if (currentStock !== null) {
              if (currentStock < qty) {
                const nameForMsg = typeof itemData.name === "string" ? itemData.name : itemRef.id;
                throw new Error(`Insufficient stock for "${nameForMsg}". Left: ${currentStock}`);
              }

              const newStock = currentStock - qty;
              tx.update(itemRef, { stockQty: newStock });
              updatedStocksById[itemRef.id] = newStock;
            }
          }

          const payload = {
            sellerId,
            eventId: eventRef.id,

            regionId: regionIdForPush || null,
            eventTitle: eventTitleForPush || null,
            eventRegion: eventRegionForPush || null,

            customerName: customerName || null,
            note: note || null,

            quantities,
            totalItems,
            totalAmount,

            status: "pending" as const,
            channel,

            deliveryMode,
            deliveryDate: deliveryDate || "Sem preferência",
            deliveryTimeSlot: deliveryTimeSlot || "Sem preferência",
            locationLink: locationLink || null,

            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          tx.set(orderRef, payload);
        });

        // ✅ responde pro cliente
        res.status(200).json({
          ok: true,
          orderId: orderRef.id,
          updatedStocksById,
        });

        // ✅ push async pro seller
        if (sellerId && regionIdForPush) {
          const dashBase = (SELLER_DASHBOARD_BASE_URL.value() || "").trim();

          const url =
            dashBase && dashBase.startsWith("http")
              ? `${dashBase.replace(/\/$/, "")}/seller/events/${eventRef.id}`
              : "";

          const title = "📦 Novo pedido no evento";
          const bodyText = `${eventTitleForPush || "Evento"} • ${eventRegionForPush || ""} • ${totalItems} item(ns)`;

          sendPushToSeller({
            sellerId,
            regionId: regionIdForPush,
            title,
            body: bodyText.trim(),
            url,
          }).catch((e) => console.warn("[push] sendPushToSeller error:", e));
        }
      } catch (err: any) {
        const status = typeof err?.status === "number" ? err.status : 400;
        console.error("createEventOrder error:", err);
        res.status(status).json({ ok: false, error: err?.message || "Unknown error" });
      }
    });
  }
);

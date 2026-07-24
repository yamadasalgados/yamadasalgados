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
type Channel = "whatsapp" | "messenger" | "pwa";

type CreateOrderBody = {
  sellerId: string;
  eventId: string;
  channel: Channel;

  customerName?: string;
  customerPhone?: string;
  note?: string;
  selectedOfferId?: string;

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

/** ---------- OFFER HELPERS ---------- */
type PricingMode =
  | "fixed_total"
  | "fixed_discount"
  | "percentage_discount";

type EventOffer = {
  id: string;
  content: Record<string, { name?: string }>;
  eligibleProductIds: string[];
  requiredQuantity: number;
  pricing: {
    mode: PricingMode;
    regularTotalMinor: number | null;
    promotionalTotalMinor: number | null;
    discountMinor: number | null;
    percentage: number | null;
  };
};

function asInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed))
    : fallback;
}

function normalizeEventOffer(
  id: string,
  value: FirebaseFirestore.DocumentData,
): EventOffer | null {
  const eligibleProductIds = Array.isArray(value.eligibleProductIds)
    ? Array.from(
        new Set(
          value.eligibleProductIds
            .filter((item: unknown) => typeof item === "string")
            .map((item: string) => item.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const requiredQuantity = asInt(value.requiredQuantity);
  const pricingRaw =
    value.pricing && typeof value.pricing === "object"
      ? value.pricing
      : {};
  const mode: PricingMode =
    pricingRaw.mode === "fixed_discount" ||
    pricingRaw.mode === "percentage_discount"
      ? pricingRaw.mode
      : "fixed_total";

  if (eligibleProductIds.length === 0 || requiredQuantity < 1) {
    return null;
  }

  return {
    id,
    content:
      value.content && typeof value.content === "object"
        ? value.content
        : {},
    eligibleProductIds,
    requiredQuantity,
    pricing: {
      mode,
      regularTotalMinor:
        pricingRaw.regularTotalMinor == null
          ? null
          : asInt(pricingRaw.regularTotalMinor),
      promotionalTotalMinor:
        pricingRaw.promotionalTotalMinor == null
          ? null
          : asInt(pricingRaw.promotionalTotalMinor),
      discountMinor:
        pricingRaw.discountMinor == null
          ? null
          : asInt(pricingRaw.discountMinor),
      percentage:
        pricingRaw.percentage == null
          ? null
          : Math.min(100, Math.max(0, Number(pricingRaw.percentage) || 0)),
    },
  };
}

function currencyMinorFactor(currency: string) {
  return currency === "JPY" ? 1 : 100;
}

function majorToMinor(value: unknown, currency: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * currencyMinorFactor(currency)));
}

function minorToMajorValue(value: number, currency: string) {
  return value / currencyMinorFactor(currency);
}

function resolveOfferName(offer: EventOffer) {
  for (const language of ["pt", "en", "ja"]) {
    const name = offer.content?.[language]?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return offer.id;
}

function evaluateEventOffer(
  offer: EventOffer,
  lines: Array<{ productId: string; quantity: number; priceMinor: number }>,
) {
  const eligible = new Set(offer.eligibleProductIds);
  const eligibleQuantity = lines.reduce(
    (sum, line) =>
      eligible.has(line.productId)
        ? sum + Math.max(0, Math.floor(line.quantity))
        : sum,
    0,
  );
  const bundleCount = Math.floor(eligibleQuantity / offer.requiredQuantity);
  let remaining = bundleCount * offer.requiredQuantity;
  const selectedItems: Array<{
    productId: string;
    quantity: number;
    priceMinor: number;
  }> = [];

  for (const line of [...lines].sort((a, b) => b.priceMinor - a.priceMinor)) {
    if (remaining <= 0) break;
    if (!eligible.has(line.productId)) continue;
    const quantity = Math.min(remaining, Math.max(0, Math.floor(line.quantity)));
    if (quantity <= 0) continue;
    selectedItems.push({ ...line, quantity });
    remaining -= quantity;
  }

  const regularAmountMinor = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.priceMinor,
    0,
  );
  let discountAmountMinor = 0;

  if (bundleCount > 0) {
    if (offer.pricing.mode === "fixed_total") {
      discountAmountMinor = Math.max(
        0,
        regularAmountMinor -
          (offer.pricing.promotionalTotalMinor ?? 0) * bundleCount,
      );
    } else if (offer.pricing.mode === "fixed_discount") {
      discountAmountMinor = Math.min(
        regularAmountMinor,
        (offer.pricing.discountMinor ?? 0) * bundleCount,
      );
    } else {
      discountAmountMinor = Math.min(
        regularAmountMinor,
        Math.round(
          regularAmountMinor *
            Math.min(100, Math.max(0, offer.pricing.percentage ?? 0)) /
            100,
        ),
      );
    }
  }

  if (bundleCount <= 0 || discountAmountMinor <= 0) return null;

  return {
    offerId: offer.id,
    name: resolveOfferName(offer),
    pricingMode: offer.pricing.mode,
    requiredQuantity: offer.requiredQuantity,
    bundleCount,
    configuredRegularTotalMinor: offer.pricing.regularTotalMinor,
    configuredPromotionalTotalMinor: offer.pricing.promotionalTotalMinor,
    configuredDiscountMinor: offer.pricing.discountMinor,
    configuredPercentage: offer.pricing.percentage,
    regularAmountMinor,
    discountAmountMinor,
    finalAmountMinor: Math.max(0, regularAmountMinor - discountAmountMinor),
    selectedItems,
  };
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
        const selectedOfferId = cleanStr(body.selectedOfferId, 120);
        const channel = body.channel as Channel;

        if (!sellerIdIncoming) httpError(400, "Missing sellerId");
        if (!eventId) httpError(400, "Missing eventId");
        if (!["whatsapp", "messenger", "pwa"].includes(channel)) {
          httpError(400, "Invalid channel");
        }

        const quantitiesRaw = body.quantities || {};
        if (typeof quantitiesRaw !== "object" || Array.isArray(quantitiesRaw)) {
          httpError(400, "Invalid quantities");
        }

        const quantities: Record<string, number> = {};
        for (const [keyRaw, quantityRaw] of Object.entries(quantitiesRaw)) {
          const key = cleanStr(keyRaw, 200);
          const quantity = clampInt(quantityRaw, 0, 999);
          if (key && quantity > 0) quantities[key] = quantity;
          if (Object.keys(quantities).length > 80) {
            httpError(400, "Too many different items (max 80).");
          }
        }

        const totalItems = Object.values(quantities).reduce((sum, value) => sum + value, 0);
        if (totalItems <= 0) httpError(400, "Select at least 1 item");

        const customerName = cleanStr(body.customerName, 120);
        const customerPhone = cleanStr(body.customerPhone, 50);
        const note = cleanStr(body.note, 1500);
        const deliveryMode =
          body.deliveryMode === "delivery" ||
          body.deliveryMode === "pickup" ||
          body.deliveryMode === "none"
            ? body.deliveryMode
            : "pickup";
        const deliveryDate = cleanStr(body.deliveryDate, 50);
        const deliveryTimeSlot = cleanStr(body.deliveryTimeSlot, 100);
        const locationLink =
          deliveryMode === "delivery"
            ? cleanStr(body.locationLink, 2000)
            : "";

        const resolved = await resolveEventRef(sellerIdIncoming, eventId);
        if (!resolved) httpError(404, "Event not found");

        const eventRef = resolved.eventRef;
        const sellerId = resolved.sellerId;
        const itemsCol = eventRef.collection("items");
        const orderRef = eventRef.collection("orders").doc();
        const updatedStocksById: Record<string, number> = {};
        let regionIdForPush = "";
        let eventTitleForPush = "";
        let eventRegionForPush = "";

        const nameKeys = Object.keys(quantities).filter((key) => !looksLikeDocId(key));
        const nameToRef: Record<string, FirebaseFirestore.DocumentReference> = {};

        if (nameKeys.length > 0) {
          const lookups = await Promise.all(
            nameKeys.slice(0, 80).map(async (name) => {
              const snapshot = await itemsCol.where("name", "==", name).limit(1).get();
              return { name, ref: snapshot.empty ? null : snapshot.docs[0].ref };
            }),
          );
          for (const lookup of lookups) {
            if (!lookup.ref) httpError(400, `Produto não encontrado no evento: ${lookup.name}`);
            nameToRef[lookup.name] = lookup.ref;
          }
        }

        await db.runTransaction(async (tx) => {
          const eventSnap = await tx.get(eventRef);
          if (!eventSnap.exists) throw new Error("Event not found");
          const eventData = eventSnap.data() || {};
          if (String(eventData.status || "active") !== "active") {
            throw new Error("Event is not active");
          }
          const sellerIdInEvent =
            typeof eventData.sellerId === "string" ? eventData.sellerId : "";
          if (sellerIdInEvent && sellerIdInEvent !== sellerId) {
            throw new Error("Event/seller mismatch");
          }

          regionIdForPush = typeof eventData.regionId === "string" ? eventData.regionId : "";
          eventTitleForPush = typeof eventData.title === "string" ? eventData.title : "";
          eventRegionForPush =
            typeof eventData.region === "string"
              ? eventData.region
              : typeof eventData.regionName === "string"
                ? eventData.regionName
                : "";

          const allowDelivery =
            typeof eventData.allowDelivery === "boolean" ? eventData.allowDelivery : true;
          const allowPickup =
            typeof eventData.allowPickup === "boolean" ? eventData.allowPickup : true;
          if (deliveryMode === "delivery" && !allowDelivery) {
            throw new Error("Delivery disabled for this event");
          }
          if (deliveryMode === "pickup" && !allowPickup) {
            throw new Error("Pickup disabled for this event");
          }

          const currency =
            eventData.currency === "BRL" || eventData.currency === "USD"
              ? eventData.currency
              : "JPY";
          const entries = Object.entries(quantities).map(([key, quantity]) => ({
            key,
            quantity,
            ref: looksLikeDocId(key) ? itemsCol.doc(key) : nameToRef[key],
          }));
          const itemSnapshots = await Promise.all(entries.map((entry) => tx.get(entry.ref)));
          const offerSnap = selectedOfferId
            ? await tx.get(eventRef.collection("offers").doc(selectedOfferId))
            : null;

          const items: Array<Record<string, unknown>> = [];
          const offerLines: Array<{
            productId: string;
            quantity: number;
            priceMinor: number;
          }> = [];
          const pendingStockUpdates: Array<{
            ref: FirebaseFirestore.DocumentReference;
            stockQty: number;
          }> = [];
          let subtotalMinor = 0;

          for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            const itemSnap = itemSnapshots[index];
            if (!itemSnap.exists) throw new Error(`Item missing in event: ${entry.key}`);
            const itemData = itemSnap.data() || {};
            const madeToOrder =
              itemData.status === "made_to_order" ||
              itemData.availabilityStatus === "made_to_order" ||
              itemData.productionMode === "made_to_order";
            const priceMinor =
              typeof itemData.priceMinor === "number" && Number.isFinite(itemData.priceMinor)
                ? Math.max(0, Math.round(itemData.priceMinor))
                : majorToMinor(itemData.price ?? itemData.sellPrice ?? 0, currency);
            const currentStock =
              typeof itemData.stockQty === "number" && Number.isFinite(itemData.stockQty)
                ? itemData.stockQty
                : null;

            if (!madeToOrder && currentStock !== null) {
              if (currentStock < entry.quantity) {
                const nameForMessage =
                  typeof itemData.name === "string" ? itemData.name : entry.ref.id;
                throw new Error(
                  `Insufficient stock for "${nameForMessage}". Left: ${currentStock}`,
                );
              }
              const nextStock = currentStock - entry.quantity;
              pendingStockUpdates.push({ ref: entry.ref, stockQty: nextStock });
              updatedStocksById[entry.ref.id] = nextStock;
            }

            subtotalMinor += priceMinor * entry.quantity;
            offerLines.push({
              productId: entry.ref.id,
              quantity: entry.quantity,
              priceMinor,
            });
            items.push({
              productId: entry.ref.id,
              name: typeof itemData.name === "string" ? itemData.name : entry.ref.id,
              qty: entry.quantity,
              quantity: entry.quantity,
              unitPrice: minorToMajorValue(priceMinor, currency),
              unitPriceMinor: priceMinor,
              subtotal: minorToMajorValue(priceMinor * entry.quantity, currency),
              subtotalMinor: priceMinor * entry.quantity,
              imageUrl: typeof itemData.imageUrl === "string" ? itemData.imageUrl : "",
              category: typeof itemData.category === "string" ? itemData.category : "",
              availabilityStatus: madeToOrder ? "made_to_order" : "active",
              productionMode: madeToOrder ? "made_to_order" : "stock",
            });
          }

          let offersApplied: Array<Record<string, unknown>> = [];
          let discountMinor = 0;
          if (selectedOfferId) {
            if (!offerSnap || !offerSnap.exists) throw new Error("Offer unavailable");
            const offer = normalizeEventOffer(offerSnap.id, offerSnap.data() || {});
            if (!offer) throw new Error("Offer unavailable");
            const applied = evaluateEventOffer(offer, offerLines);
            if (applied) {
              offersApplied = [applied];
              discountMinor = applied.discountAmountMinor;
            }
          }

          for (const update of pendingStockUpdates) {
            tx.update(update.ref, { stockQty: update.stockQty });
          }

          const subtotal = minorToMajorValue(subtotalMinor, currency);
          const discount = minorToMajorValue(discountMinor, currency);
          const totalAmount = Math.max(0, subtotal - discount);

          tx.set(orderRef, {
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            note: note || null,
            quantities,
            items,
            totalItems,
            subtotal,
            discount,
            totalAmount,
            offersApplied,
            status: "pending" as const,
            channel,
            deliveryMode,
            deliveryDate: deliveryDate || "Sem preferência",
            deliveryTimeSlot: deliveryTimeSlot || "Sem preferência",
            locationLink: locationLink || null,
            sellerUnread: true,
            sellerReadAt: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        res.status(200).json({
          ok: true,
          orderId: orderRef.id,
          updatedStocksById,
        });

        if (sellerId && regionIdForPush) {
          const dashboardBase = (SELLER_DASHBOARD_BASE_URL.value() || "").trim();
          const url =
            dashboardBase && dashboardBase.startsWith("http")
              ? `${dashboardBase.replace(/\/$/, "")}/seller/events/${eventRef.id}`
              : "";
          sendPushToSeller({
            sellerId,
            regionId: regionIdForPush,
            title: "📦 Novo pedido no evento",
            body: `${eventTitleForPush || "Evento"} • ${eventRegionForPush || ""} • ${totalItems} item(ns)`.trim(),
            url,
          }).catch((error) => console.warn("[push] sendPushToSeller error:", error));
        }
      } catch (error: any) {
        const status = typeof error?.status === "number" ? error.status : 400;
        console.error("createEventOrder error:", error);
        res.status(status).json({ ok: false, error: error?.message || "Unknown error" });
      }
    });
  },
);

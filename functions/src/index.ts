import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import cors from "cors";

admin.initializeApp();

const db = admin.firestore();
const corsMiddleware = cors({ origin: true });

type Channel = "whatsapp" | "messenger";

type CreateOrderBody = {
  eventId: string;
  channel: Channel;

  customerName?: string;
  note?: string;

  deliveryMode?: "delivery" | "pickup" | "none";
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  locationLink?: string;

  quantities: Record<string, number>;
};

const clampInt = (n: any, min: number, max: number) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
};

const cleanStr = (v: any, maxLen: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.slice(0, maxLen);
};

export const createEventOrder = onRequest(
  { region: "asia-northeast1" },
  (req, res) => {
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== "POST") {
          res.status(405).json({ ok: false, error: "Method not allowed" });
          return;
        }

        const body = (req.body || {}) as CreateOrderBody;

        const eventId = cleanStr(body.eventId, 120);
        const channel = body.channel;

        if (!eventId) {
          res.status(400).json({ ok: false, error: "Missing eventId" });
          return;
        }

        if (channel !== "whatsapp" && channel !== "messenger") {
          res.status(400).json({ ok: false, error: "Invalid channel" });
          return;
        }

        const quantitiesRaw = body.quantities || {};
        if (typeof quantitiesRaw !== "object" || Array.isArray(quantitiesRaw)) {
          res.status(400).json({ ok: false, error: "Invalid quantities" });
          return;
        }

        const quantities: Record<string, number> = {};
        for (const [name, q] of Object.entries(quantitiesRaw)) {
          const productName = cleanStr(name, 120);
          const qty = clampInt(q, 0, 999);
          if (productName && qty > 0) quantities[productName] = qty;
        }

        const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0);
        if (totalItems <= 0) {
          res.status(400).json({ ok: false, error: "Select at least 1 item" });
          return;
        }

        const customerName = cleanStr(body.customerName, 80);
        const note = cleanStr(body.note, 800);

        const deliveryMode =
          body.deliveryMode === "delivery" || body.deliveryMode === "pickup" || body.deliveryMode === "none"
            ? body.deliveryMode
            : "pickup";

        const deliveryDate = cleanStr(body.deliveryDate, 40);
        const deliveryTimeSlot = cleanStr(body.deliveryTimeSlot, 20);
        const locationLink = cleanStr(body.locationLink, 300);

        const eventRef = db.collection("events").doc(eventId);
        const productsCol = db.collection("products");
        const orderRef = eventRef.collection("orders").doc();

        const updatedStocks: Record<string, number> = {};

        await db.runTransaction(async (tx) => {
          const eventSnap = await tx.get(eventRef);
          if (!eventSnap.exists) throw new Error("Event not found");

          const eventData = eventSnap.data() || {};
          const status = String(eventData.status || "active");
          if (status !== "active") throw new Error("Event is not active");

          const stockPlans: Array<{ productDocId: string; productName: string; newStock: number }> = [];

          for (const [productName, qty] of Object.entries(quantities)) {
            const qs = await productsCol.where("name", "==", productName).limit(1).get();
            if (qs.empty) throw new Error(`Product not found: ${productName}`);

            const prodDoc = qs.docs[0];
            const prodRef = productsCol.doc(prodDoc.id);

            const prodSnap = await tx.get(prodRef);
            if (!prodSnap.exists) throw new Error(`Product missing: ${productName}`);

            const prodData = prodSnap.data() || {};
            const currentStock = typeof prodData.stockQty === "number" ? prodData.stockQty : null;

            if (currentStock === null) continue;

            if (currentStock < qty) {
              throw new Error(`Insufficient stock for "${productName}". Left: ${currentStock}`);
            }

            const newStock = currentStock - qty;
            stockPlans.push({ productDocId: prodDoc.id, productName, newStock });
          }

          for (const plan of stockPlans) {
            const prodRef = productsCol.doc(plan.productDocId);
            updatedStocks[plan.productName] = plan.newStock;
            tx.update(prodRef, { stockQty: plan.newStock });
          }

          tx.set(orderRef, {
            customerName,
            note,
            quantities,
            totalItems,
            status: "pending",
            channel,
            deliveryMode,
            deliveryDate: deliveryDate || "Sem preferência",
            deliveryTimeSlot: deliveryTimeSlot || "Sem preferência",
            locationLink: deliveryMode === "delivery" ? (locationLink || "") : "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });

        res.status(200).json({ ok: true, orderId: orderRef.id, updatedStocks });
      } catch (err: any) {
        console.error("createEventOrder error:", err);
        res.status(400).json({ ok: false, error: err?.message || "Unknown error" });
      }
    });
  }
);

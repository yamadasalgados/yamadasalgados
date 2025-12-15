"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventOrder = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const cors_1 = __importDefault(require("cors"));
admin.initializeApp();
const db = admin.firestore();
const corsMiddleware = (0, cors_1.default)({ origin: true });
const clampInt = (n, min, max) => {
    const x = Number(n);
    if (!Number.isFinite(x))
        return min;
    return Math.min(max, Math.max(min, Math.floor(x)));
};
const cleanStr = (v, maxLen) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.slice(0, maxLen);
};
exports.createEventOrder = (0, https_1.onRequest)({ region: "asia-northeast1" }, (req, res) => {
    corsMiddleware(req, res, async () => {
        try {
            if (req.method !== "POST") {
                res.status(405).json({ ok: false, error: "Method not allowed" });
                return;
            }
            const body = (req.body || {});
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
            const quantities = {};
            for (const [name, q] of Object.entries(quantitiesRaw)) {
                const productName = cleanStr(name, 120);
                const qty = clampInt(q, 0, 999);
                if (productName && qty > 0)
                    quantities[productName] = qty;
            }
            const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0);
            if (totalItems <= 0) {
                res.status(400).json({ ok: false, error: "Select at least 1 item" });
                return;
            }
            const customerName = cleanStr(body.customerName, 80);
            const note = cleanStr(body.note, 800);
            const deliveryMode = body.deliveryMode === "delivery" || body.deliveryMode === "pickup" || body.deliveryMode === "none"
                ? body.deliveryMode
                : "pickup";
            const deliveryDate = cleanStr(body.deliveryDate, 40);
            const deliveryTimeSlot = cleanStr(body.deliveryTimeSlot, 20);
            const locationLink = cleanStr(body.locationLink, 300);
            const eventRef = db.collection("events").doc(eventId);
            const productsCol = db.collection("products");
            const orderRef = eventRef.collection("orders").doc();
            const updatedStocks = {};
            await db.runTransaction(async (tx) => {
                const eventSnap = await tx.get(eventRef);
                if (!eventSnap.exists)
                    throw new Error("Event not found");
                const eventData = eventSnap.data() || {};
                const status = String(eventData.status || "active");
                if (status !== "active")
                    throw new Error("Event is not active");
                const stockPlans = [];
                for (const [productName, qty] of Object.entries(quantities)) {
                    const qs = await productsCol.where("name", "==", productName).limit(1).get();
                    if (qs.empty)
                        throw new Error(`Product not found: ${productName}`);
                    const prodDoc = qs.docs[0];
                    const prodRef = productsCol.doc(prodDoc.id);
                    const prodSnap = await tx.get(prodRef);
                    if (!prodSnap.exists)
                        throw new Error(`Product missing: ${productName}`);
                    const prodData = prodSnap.data() || {};
                    const currentStock = typeof prodData.stockQty === "number" ? prodData.stockQty : null;
                    if (currentStock === null)
                        continue;
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
        }
        catch (err) {
            console.error("createEventOrder error:", err);
            res.status(400).json({ ok: false, error: (err === null || err === void 0 ? void 0 : err.message) || "Unknown error" });
        }
    });
});
//# sourceMappingURL=index.js.map
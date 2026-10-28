import { createHash } from "node:crypto";
import * as admin from "firebase-admin";

// This is a seller-specific private projection of completed purchases.
// Never trust submitted customer interest tags. They come from order lines
// computed by the authenticated order backend.
export function normalizeInterestKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function prepareCustomerInterest(params: {
  db: admin.firestore.Firestore; tx: admin.firestore.Transaction;
  orderData: Record<string, unknown>; sellerId: string;
  orderPath: string; now: admin.firestore.Timestamp;
}): Promise<() => void> {
  const { db, tx, orderData, sellerId, orderPath, now } = params;
  const uid = typeof orderData.customerUid === "string" ? orderData.customerUid : "";
  if (!uid || uid.includes("/") || orderData.customerRegistered !== true) return () => undefined;
  const items = (Array.isArray(orderData.items) ? orderData.items : []) as Array<Record<string, unknown>>;
  const productIds = new Set<string>();
  const interestKeys = new Set<string>();
  for (const item of items) {
    const id = typeof item.productId === "string" ? item.productId.slice(0, 160) : "";
    if (id && !id.includes("/")) productIds.add(id);
    for (const value of [item.name, item.category]) {
      const normalized = normalizeInterestKey(value);
      if (normalized.length >= 3) {
        interestKeys.add(normalized);
        for (const word of normalized.split(" ")) if (word.length >= 4) interestKeys.add(word);
      }
    }
  }
  if (productIds.size === 0 && interestKeys.size === 0) return () => undefined;
  const sellerRef = db.collection("sellers").doc(sellerId);
  const marker = sellerRef.collection("customerInsightOrders").doc(createHash("sha256").update(orderPath).digest("hex"));
  const profileRef = sellerRef.collection("customerInsights").doc(uid);
  const [existing, profile] = await tx.getAll(marker, profileRef);
  if (existing.exists) return () => undefined;
  return () => {
    tx.create(marker, { sellerId, customerUid: uid, orderPath, createdAt: now });
    tx.set(profileRef, {
      schemaVersion: 1, sellerId, customerUid: uid,
      name: typeof orderData.customerName === "string" ? orderData.customerName.slice(0,120) : "Cliente",
      ...(productIds.size ? { productIds: admin.firestore.FieldValue.arrayUnion(...Array.from(productIds).slice(0, 100)) } : {}),
      ...(interestKeys.size ? { interestKeys: admin.firestore.FieldValue.arrayUnion(...Array.from(interestKeys).slice(0, 150)) } : {}),
      purchaseCount: admin.firestore.FieldValue.increment(1),
      lastPurchaseAt: now, updatedAt: now,
      ...(profile.exists ? {} : { createdAt: now }),
    }, { merge: true });
  };
}

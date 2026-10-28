import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { validReferralSellerId } from "@/app/lib/referral-campaign";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function identify(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("AUTH");
  const user = await getAdminAuth().verifyIdToken(token, true);
  const db = getAdminDb();
  const [customer, identity] = await db.getAll(db.collection("customers").doc(user.uid), db.collection("users").doc(user.uid));
  if (identity.exists && (identity.data()?.role === "seller" || identity.data()?.role === "admin")) throw new Error("AUTH");
  if (customer.data()?.accountStatus !== "active") throw new Error("AUTH");
  return user.uid;
}
export async function GET(request: NextRequest) {
  try {
    const uid = await identify(request);
    const sellerId = validReferralSellerId(request.nextUrl.searchParams.get("sellerId"));
    const db = getAdminDb();
    if (sellerId) {
      const doc = await db.collection("customers").doc(uid).collection("marketingPreferences").doc(sellerId).get();
      return NextResponse.json({ ok: true, sellerId, enabled: doc.data()?.enabled === true }, { headers: { "Cache-Control": "private,no-store" } });
    }
    // List known stores from the user's own customer order indexes.
    const orders = await db.collection("customers").doc(uid).collection("orders").limit(100).get();
    const nameById = new Map<string, string>();
    for (const order of orders.docs) {
      const id = validReferralSellerId(order.data().sellerId);
      if (id && !nameById.has(id)) nameById.set(id,
        typeof order.data().storeName === "string" ? order.data().storeName.slice(0, 120) : "Loja");
    }
    const ids = Array.from(nameById.keys()).slice(0, 30);
    const snapshots = ids.length ? await db.getAll(...ids.map(id => db.collection("customers").doc(uid).collection("marketingPreferences").doc(id))) : [];
    return NextResponse.json({ ok: true, stores: ids.map((id, idx) => ({ sellerId: id, storeName: nameById.get(id) || "Loja", enabled: snapshots[idx]?.data()?.enabled === true })) }, { headers: { "Cache-Control": "private,no-store" } });
  } catch { return NextResponse.json({ error: "Sessão inválida." }, { status: 401 }); }
}
export async function POST(request: NextRequest) {
  try {
    const uid = await identify(request);
    const body = await request.json().catch(() => ({}));
    const sellerId = validReferralSellerId(body.sellerId);
    if (!sellerId || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    // Never infer marketing consent from order push subscriptions.
    const now = admin.firestore.Timestamp.now();
    await getAdminDb().collection("customers").doc(uid).collection("marketingPreferences").doc(sellerId)
      .set({ sellerId, customerUid: uid, enabled: body.enabled,
        consentSource: "customer_settings_checkbox", updatedAt: now,
        ...(body.enabled ? { consentedAt: now } : { revokedAt: now }) }, { merge: true });
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch { return NextResponse.json({ error: "Sessão inválida." }, { status: 401 }); }
}

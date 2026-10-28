import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";
import { validReferralSellerId } from "@/app/lib/referral-campaign";
import { normalizeInterestKey } from "@/app/lib/customer-interests-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function authorize(request: NextRequest, sellerId: string) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  let decoded: admin.auth.DecodedIdToken;
  try { decoded = await getAdminAuth().verifyIdToken(token, true); } catch { return null; }
  const db = getAdminDb();
  const [user, seller] = await db.getAll(db.collection("users").doc(decoded.uid), db.collection("sellers").doc(sellerId));
  return seller.exists && isAdminOrOperationalSellerOwnerRecord({ uid: decoded.uid, sellerId, userData: user.data() ?? {}, sellerData: seller.data() ?? {} }) ? { db, uid: decoded.uid } : null;
}
export async function GET(request: NextRequest) {
  const sellerId = validReferralSellerId(request.nextUrl.searchParams.get("sellerId"));
  if (!sellerId) return NextResponse.json({ error: "Loja inválida" }, { status: 400 });
  const actor = await authorize(request, sellerId);
  if (!actor) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const key = normalizeInterestKey(request.nextUrl.searchParams.get("interest") || "");
  try {
    const insightCollection = actor.db.collection("sellers").doc(sellerId).collection("customerInsights");
    const snap = await (key ? insightCollection.where("interestKeys", "array-contains", key) : insightCollection.orderBy("lastPurchaseAt", "desc")).limit(60).get();
    const profiles = await Promise.all(snap.docs.map(async doc => {
      const preference = await actor.db.collection("customers").doc(doc.id).collection("marketingPreferences").doc(sellerId).get();
      const data = doc.data();
      return { id: doc.id, name: typeof data.name === "string" ? data.name : "Cliente", purchaseCount: data.purchaseCount || 0,
        interestKeys: (Array.isArray(data.interestKeys) ? data.interestKeys.slice(0, 18) : []),
        marketingConsent: preference.data()?.enabled === true,
        lastPurchaseAt: data.lastPurchaseAt?.toDate?.()?.toISOString?.() || null };
    }));
    return NextResponse.json({ ok: true, customers: profiles, interest: key }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("[seller/customer-insights]", error);
    return NextResponse.json({ error: "Falha ao consultar clientes" }, { status: 500 });
  }
}

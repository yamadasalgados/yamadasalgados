import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";
import { validReferralSellerId } from "@/app/lib/referral-campaign";
import { normalizeInterestKey } from "@/app/lib/customer-interests-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => ({}));
  const sellerId = validReferralSellerId(data.sellerId);
  const interestKey = normalizeInterestKey(data.interest);
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (!sellerId || interestKey.length < 3 || !/^[a-z0-9 ]{3,60}$/.test(interestKey) || title.length < 3 || title.length > 80 || body.length < 5 || body.length > 240) {
    return NextResponse.json({ error: "Informe interesse (ex.: feijoada), título e mensagem válidos." }, { status: 400 });
  }
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Login obrigatório." }, { status: 401 });
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const [user, seller] = await db.getAll(db.collection("users").doc(decoded.uid), sellerRef);
    if (!seller.exists || !isAdminOrOperationalSellerOwnerRecord({ uid: decoded.uid, sellerId, userData: user.data() ?? {}, sellerData: seller.data() ?? {} })) {
      return NextResponse.json({ error: "Sem autorização." }, { status: 403 });
    }
    const throttleRef = sellerRef.collection("settings").doc("marketingThrottle");
    const campaignRef = sellerRef.collection("marketingCampaigns").doc();
    const nowMs = Date.now();
    await db.runTransaction(async tx => {
      const throttle = await tx.get(throttleRef);
      // One campaign per seller per 24 hours, to curb spam and abuse.
      if (typeof throttle.data()?.lastDispatchMs === "number" && nowMs - throttle.data()!.lastDispatchMs < 86_400_000) {
        throw new Error("RATE_LIMIT");
      }
      const now = admin.firestore.Timestamp.fromMillis(nowMs);
      tx.set(throttleRef, { lastDispatchMs: nowMs, lastCampaignId: campaignRef.id, updatedAt: now }, { merge: true });
      tx.create(campaignRef, { schemaVersion: 1, sellerId, campaignId: campaignRef.id,
        createdByUid: decoded.uid, interestKey, title, body,
        status: "queued", createdAt: now, sentCount: 0, skippedCount: 0, failedCount: 0 });
    });
    return NextResponse.json({ ok: true, campaignId: campaignRef.id, status: "queued", info: "Envio aguardando a função Firebase. Apenas clientes com consentimento receberão." });
  } catch (error) {
    if ((error as Error)?.message === "RATE_LIMIT") return NextResponse.json({ error: "Limite de 1 campanha por loja a cada 24 horas." }, { status: 429 });
    console.error("[seller/marketing-campaigns]", error);
    return NextResponse.json({ error: "Falha ao agendar campanha." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sellerId = validReferralSellerId(request.nextUrl.searchParams.get("sellerId"));
  if (!sellerId) return NextResponse.json({ error: "Loja inválida" }, { status: 400 });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const [user, seller] = await db.getAll(db.collection("users").doc(decoded.uid), sellerRef);
    if (!seller.exists || !isAdminOrOperationalSellerOwnerRecord({ uid: decoded.uid, sellerId, userData: user.data() ?? {}, sellerData: seller.data() ?? {} })) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    const latest = await sellerRef.collection("marketingCampaigns").orderBy("createdAt", "desc").limit(12).get();
    return NextResponse.json({ ok: true, campaigns: latest.docs.map(doc => ({ id: doc.id,
      interest: doc.data().interestKey, title: doc.data().title, status: doc.data().status,
      sentCount: doc.data().sentCount || 0, skippedCount: doc.data().skippedCount || 0,
      failedCount: doc.data().failedCount || 0,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() || null })) }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("[seller/marketing-campaigns]", error);
    return NextResponse.json({ error: "Não foi possível listar campanhas" }, { status: 500 });
  }
}

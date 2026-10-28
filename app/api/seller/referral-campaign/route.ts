import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";
import { REFERRAL_CAMPAIGN, sellerReferralAccepting, sellerReferralSettings, REFERRAL_MAX_INVITES_HARD_LIMIT, validReferralSellerId } from "@/app/lib/referral-campaign";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(request: NextRequest, sellerId: string) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  let decoded: admin.auth.DecodedIdToken;
  try { decoded = await getAdminAuth().verifyIdToken(token, true); } catch { return null; }
  const db = getAdminDb();
  const [user, seller] = await db.getAll(db.collection("users").doc(decoded.uid), db.collection("sellers").doc(sellerId));
  if (!seller.exists || !isAdminOrOperationalSellerOwnerRecord({ uid: decoded.uid, sellerId, userData: user.data() ?? {}, sellerData: seller.data() ?? {} })) return null;
  return { db, uid: decoded.uid, currency: seller.data()?.regional?.currency };
}

async function handle(request: NextRequest, write: boolean) {
  try {
    const data: Record<string, unknown> = write ? await request.json().catch(() => ({})) : {};
    const sellerId = validReferralSellerId(write ? data.sellerId : request.nextUrl.searchParams.get("sellerId"));
    if (!sellerId) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    const actor = await authorized(request, sellerId);
    if (!actor) return NextResponse.json({ error: "Sem autorização." }, { status: 403 });
    const ref = actor.db.collection("sellers").doc(sellerId).collection("settings").doc("referralCampaign");
    if (write) {
      if (data.enabled === true && actor.currency !== "JPY") {
        return NextResponse.json({ error: "A campanha fixa de 100 pontos é exclusiva de lojas em JPY nesta edição; outras moedas exigem configuração econômica própria." }, { status: 400 });
      }
      if (typeof data.enabled !== "boolean") return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
      const limit = data.maxRewardsPerInviter;
      const end = data.registrationEndsAtMs;
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > REFERRAL_MAX_INVITES_HARD_LIMIT ||
          typeof end !== "number" || !Number.isSafeInteger(end) ||
          end < REFERRAL_CAMPAIGN.startsAtMs || end > REFERRAL_CAMPAIGN.endsAtMs) {
        return NextResponse.json({ error: "Limite (1–1000) ou data final inválidos." }, { status: 400 });
      }
      await ref.set({ campaignId: REFERRAL_CAMPAIGN.id, enabled: data.enabled,
        registrationEndsAtMs: end, maxRewardsPerInviter: limit,
        pointsEach: REFERRAL_CAMPAIGN.pointsPerPerson,
        updatedAt: admin.firestore.Timestamp.now(), updatedBy: actor.uid }, { merge: true });
    }
    const snapshot = await ref.get();
    return NextResponse.json({ ok: true, ...sellerReferralSettings(snapshot.data()), acceptingNew: sellerReferralAccepting(snapshot.data(), Date.now()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[seller/referral-campaign]", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
export async function GET(request: NextRequest) { return handle(request, false); }
export async function POST(request: NextRequest) { return handle(request, true); }

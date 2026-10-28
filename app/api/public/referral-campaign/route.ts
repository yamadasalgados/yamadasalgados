import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { accessIsActive } from "@/app/lib/access-control";
import { sellerReferralAccepting, sellerReferralSettings, validReferralSellerId } from "@/app/lib/referral-campaign";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const sellerId = validReferralSellerId(request.nextUrl.searchParams.get("sellerId"));
  if (!sellerId) return NextResponse.json({ enabled: false }, { status: 400 });
  try {
    const sellerRef = getAdminDb().collection("sellers").doc(sellerId);
    const [seller, doc] = await getAdminDb().getAll(sellerRef, sellerRef.collection("settings").doc("referralCampaign"));
    const sellerData = seller.data() ?? {};
    const operational = seller.exists && sellerData.accountStatus === "active" && sellerData.regional?.currency === "JPY" &&
      (sellerData.onboarding as { complete?: unknown } | undefined)?.complete === true &&
      accessIsActive(sellerData);
    const settings = sellerReferralSettings(doc.data());
    return NextResponse.json({ enabled: operational && sellerReferralAccepting(doc.data(), Date.now()),
      registrationEndsAtMs: settings.registrationEndsAtMs,
      pointsEach: 100, maxRewardsPerInviter: settings.maxRewardsPerInviter }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[public/referral-campaign]", error);
    return NextResponse.json({ enabled: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

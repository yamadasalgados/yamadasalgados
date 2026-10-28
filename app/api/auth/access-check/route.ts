import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const userSnapshot = await db.collection("users").doc(decoded.uid).get();
    const identity = userSnapshot.data();
    if (!userSnapshot.exists || !identity) {
      return NextResponse.json({ ok: true, diagnosis: "MISSING_USERS_PROFILE" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (identity.role !== "seller") {
      return NextResponse.json({ ok: true, diagnosis: identity.role === "admin" ? "ADMIN_NOT_SELLER" : "USER_NOT_SELLER" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (identity.accountStatus !== "active") {
      return NextResponse.json({ ok: true, diagnosis: "USER_NOT_ACTIVE" }, { headers: { "Cache-Control": "no-store" } });
    }
    const sellerId = typeof identity.sellerId === "string" && identity.sellerId.trim() ? identity.sellerId.trim() : decoded.uid;
    const sellerSnapshot = await db.collection("sellers").doc(sellerId).get();
    if (!sellerSnapshot.exists) return NextResponse.json({ ok: true, diagnosis: "SELLER_NOT_FOUND" }, { headers: { "Cache-Control": "no-store" } });
    const seller = sellerSnapshot.data() ?? {};
    if (seller.accountStatus !== "active") {
      return NextResponse.json({ ok: true, diagnosis: "SELLER_NOT_ACTIVE" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (seller.ownerUid !== decoded.uid && identity.sellerId !== sellerId) {
      return NextResponse.json({ ok: true, diagnosis: "SELLER_OWNER_MISMATCH" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true, diagnosis: "PROFILE_VALID_CHECK_PUBLISHED_RULES" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth/access-check] Failed:", error);
    return NextResponse.json({ ok: false, error: "Não foi possível verificar os documentos de acesso." }, { status: 500 });
  }
}

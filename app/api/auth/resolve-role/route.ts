import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { accessIsActive } from "@/app/lib/access-control";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { hasCompleteSellerOnboarding } from "@/app/lib/seller-regional-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRole = "admin" | "seller" | "customer" | "unknown";

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function safeNext(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/customer/orders";
  }
  return normalized;
}

async function authenticate(request: NextRequest): Promise<admin.auth.DecodedIdToken> {
  const token = bearerToken(request);
  if (!token) throw new Error("AUTH_REQUIRED");
  return getAdminAuth().verifyIdToken(token, true);
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as { next?: unknown };
    const customerNext = safeNext(body.next);
    const db = getAdminDb();

    const userReference = db.collection("users").doc(decoded.uid);
    const customerReference = db.collection("customers").doc(decoded.uid);
    const [userSnapshot, customerSnapshot] = await Promise.all([
      userReference.get(),
      customerReference.get(),
    ]);

    const userData = userSnapshot.data() ?? {};
    const storedRole = userData.role;

    if (storedRole === "admin") {
      return NextResponse.json({
        ok: true,
        role: "admin" satisfies AccountRole,
        destination: "/admin",
      });
    }

    if (storedRole === "seller" || typeof userData.sellerId === "string") {
      const sellerId =
        typeof userData.sellerId === "string" && userData.sellerId.trim()
          ? userData.sellerId.trim()
          : decoded.uid;
      const sellerSnapshot = await db.collection("sellers").doc(sellerId).get();
      const sellerData = sellerSnapshot.data() ?? null;

      const destination = !hasCompleteSellerOnboarding(sellerData)
        ? "/seller/onboarding"
        : accessIsActive(sellerData, userData)
          ? "/seller"
          : "/seller/rent";

      return NextResponse.json({
        ok: true,
        role: "seller" satisfies AccountRole,
        sellerId,
        destination,
      });
    }

    if (customerSnapshot.exists) {
      return NextResponse.json({
        ok: true,
        role: "customer" satisfies AccountRole,
        destination: customerNext,
      });
    }

    return NextResponse.json({
      ok: true,
      role: "unknown" satisfies AccountRole,
      destination: "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTH_RESOLUTION_FAILED";
    const status = message === "AUTH_REQUIRED" ? 401 : 500;

    if (status === 500) {
      console.error("[api/auth/resolve-role] Unexpected error:", error);
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class RewardError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RewardError";
    this.status = status;
  }
}


function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function timestampIso(value: unknown): string {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authenticate(request: NextRequest): Promise<admin.auth.DecodedIdToken> {
  const token = bearerToken(request);
  if (!token) throw new RewardError("Entre para consultar seus pontos.", 401);

  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new RewardError("Sua sessão expirou. Entre novamente.", 401);
  }
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
    if (!sellerId || sellerId.includes("/")) {
      throw new RewardError("Loja inválida.");
    }

    const db = getAdminDb();
    const customerRef = db.collection("customers").doc(decoded.uid);
    const walletRef = customerRef.collection("rewardWallets").doc(sellerId);
    const sellerRef = db.collection("sellers").doc(sellerId);
    const [customerSnapshot, walletSnapshot, sellerSnapshot, transactionsSnapshot] =
      await Promise.all([
        customerRef.get(),
        walletRef.get(),
        sellerRef.get(),
        walletRef.collection("transactions").orderBy("createdAt", "desc").limit(100).get(),
      ]);

    if (!customerSnapshot.exists || customerSnapshot.data()?.accountStatus === "disabled") {
      throw new RewardError("Sua conta de cliente não está disponível.", 403);
    }

    const wallet = walletSnapshot.data() ?? {};
    const seller = sellerSnapshot.data() ?? {};
    const sellerRegional = asRecord(seller.regional);
    const walletCurrency = cleanString(wallet.currency, 8);
    const sellerCurrency = cleanString(sellerRegional.currency, 8);
    const currency = walletCurrency === "BRL" || walletCurrency === "USD"
      ? walletCurrency
      : sellerCurrency === "BRL" || sellerCurrency === "USD"
        ? sellerCurrency
        : "JPY";

    const transactions = transactionsSnapshot.docs.map((document) => {
      const data = document.data() ?? {};
      const type =
        data.type === "redeem" ||
        data.type === "refund" ||
        data.type === "adjustment" ||
        data.type === "gift" ||
        data.type === "event_earn"
          ? data.type
          : "earn";
      return {
        id: document.id,
        type,
        points: nonNegativeInteger(data.points),
        balanceAfter: nonNegativeInteger(data.balanceAfter),
        orderId: cleanString(data.orderId, 160),
        orderSource:
          data.orderSource === "event"
            ? "event"
            : data.orderSource === "store"
              ? "store"
              : "",
        eventId: cleanString(data.eventId, 160),
        label: cleanString(data.label, 240),
        createdAt: timestampIso(data.createdAt),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        wallet: {
          sellerId,
          storeName:
            cleanString(wallet.storeName, 160) ||
            cleanString(seller.storeName ?? seller.displayName, 160) ||
            "Loja",
          currency,
          pointsBalance: nonNegativeInteger(wallet.pointsBalance),
          lifetimeEarned: nonNegativeInteger(wallet.lifetimeEarned),
          lifetimeGifted: nonNegativeInteger(wallet.lifetimeGifted),
          lifetimeRedeemed: nonNegativeInteger(wallet.lifetimeRedeemed),
          lifetimeRefunded: nonNegativeInteger(wallet.lifetimeRefunded),
          transactions,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof RewardError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Não foi possível carregar seus pontos.";
    if (!(error instanceof RewardError)) {
      console.error("[api/customer/rewards] Unexpected error:", error);
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

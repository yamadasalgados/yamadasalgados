import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrActiveSellerOwnerRecord } from "@/app/lib/seller-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class NotificationSummaryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "NotificationSummaryError";
    this.code = code;
    this.status = status;
  }
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) throw new NotificationSummaryError("AUTH_REQUIRED", "Entre novamente.", 401);

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new NotificationSummaryError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
  }

  const db = getAdminDb();
  const [userSnapshot, sellerSnapshot] = await db.getAll(
    db.collection("users").doc(decoded.uid),
    db.collection("sellers").doc(sellerId),
  );
  const userData = userSnapshot.data() ?? {};
  const sellerData = sellerSnapshot.data() ?? {};
  const authorized = isAdminOrActiveSellerOwnerRecord({
    uid: decoded.uid,
    sellerId,
    userData,
    sellerData,
  });
  if (!authorized) throw new NotificationSummaryError("FORBIDDEN", "Acesso negado.", 403);

  return db;
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
    if (!sellerId || sellerId.includes("/")) {
      throw new NotificationSummaryError("INVALID_SELLER", "Loja inválida.");
    }

    const db = await authorizeSeller(request, sellerId);
    const snapshot = await db
      .collection("sellers")
      .doc(sellerId)
      .collection("notificationState")
      .doc("orders")
      .get();
    const data = snapshot.data() ?? {};
    const storeUnreadCount = nonNegativeInteger(data.storeUnreadCount);
    const eventUnreadCount = nonNegativeInteger(data.eventUnreadCount);
    const unreadCount = Math.max(
      nonNegativeInteger(data.unreadCount),
      storeUnreadCount + eventUnreadCount,
    );

    return NextResponse.json(
      {
        ok: true,
        unreadCount,
        storeUnreadCount,
        eventUnreadCount,
        lastOrderId: cleanString(data.lastOrderId, 160),
        lastOrderSource: data.lastOrderSource === "event" ? "event" : "store",
        lastEventId: cleanString(data.lastEventId, 160),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof NotificationSummaryError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[seller-notifications] summary failed", error);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível carregar os avisos." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

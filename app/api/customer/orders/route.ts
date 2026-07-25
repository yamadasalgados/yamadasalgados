import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerOrderStatus = "pending" | "ready" | "delivered" | "cancelled";
type CustomerOrderSource = "store" | "event";
type CustomerOrderCurrency = "JPY" | "BRL" | "USD";

class CustomerOrdersError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerOrdersError";
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

function normalizeStatus(value: unknown): CustomerOrderStatus {
  if (value === "ready" || value === "delivered" || value === "cancelled") return value;
  return "pending";
}

function normalizeSource(value: unknown): CustomerOrderSource {
  return value === "event" ? "event" : "store";
}

function normalizeCurrency(value: unknown): CustomerOrderCurrency {
  return value === "BRL" || value === "USD" ? value : "JPY";
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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, 80))
    .filter(Boolean)
    .slice(0, 20);
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authenticate(request: NextRequest): Promise<admin.auth.DecodedIdToken> {
  const token = bearerToken(request);
  if (!token) throw new CustomerOrdersError("Entre para acessar seus pedidos.", 401);

  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new CustomerOrdersError("Sua sessão expirou. Entre novamente.", 401);
  }
}

function serializeSummary(
  referenceId: string,
  data: Record<string, unknown>,
) {
  const source = normalizeSource(data.orderSource);
  const sellerId = cleanString(data.sellerId, 160);
  const eventId = source === "event" ? cleanString(data.eventId, 160) : "";

  return {
    referenceId,
    orderId: cleanString(data.orderId, 160),
    sellerId,
    eventId,
    source,
    status: normalizeStatus(data.fulfillmentStatus ?? data.status),
    storeName: cleanString(data.storeName, 160),
    eventTitle: cleanString(data.eventTitle, 200),
    currency: normalizeCurrency(data.currency),
    totalAmountMinor: nonNegativeInteger(data.totalAmountMinor),
    totalItems: nonNegativeInteger(data.totalItems),
    deliveryMode: cleanString(data.deliveryMode, 40),
    deliveryDate: cleanString(data.deliveryDate, 80),
    deliveryTimeSlot: cleanString(data.deliveryTimeSlot, 80),
    readinessReasonCodes: stringList(data.readinessReasonCodes),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt ?? data.createdAt),
    storeHref: sellerId ? `/store/${encodeURIComponent(sellerId)}` : "",
    eventHref:
      source === "event" && sellerId && eventId
        ? `/event/${encodeURIComponent(sellerId)}/${encodeURIComponent(eventId)}`
        : "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const db = getAdminDb();
    const customerRef = db.collection("customers").doc(decoded.uid);
    const customerSnapshot = await customerRef.get();

    if (!customerSnapshot.exists || customerSnapshot.data()?.accountStatus === "disabled") {
      throw new CustomerOrdersError("Sua conta de cliente não está disponível.", 403);
    }

    const snapshot = await customerRef
      .collection("orders")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const orders = snapshot.docs.map((document) =>
      serializeSummary(document.id, document.data()),
    );

    return NextResponse.json(
      { ok: true, orders },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof CustomerOrdersError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar seus pedidos.";

    if (!(error instanceof CustomerOrdersError)) {
      console.error("[api/customer/orders] Unexpected error:", error);
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

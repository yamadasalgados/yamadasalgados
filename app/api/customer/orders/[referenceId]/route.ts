import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerOrderStatus = "pending" | "ready" | "delivered" | "cancelled";
type CustomerOrderSource = "store" | "event";
type CustomerOrderCurrency = "JPY" | "BRL" | "USD";

class CustomerOrderError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerOrderError";
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
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
  if (!token) throw new CustomerOrderError("Entre para acessar este pedido.", 401);

  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new CustomerOrderError("Sua sessão expirou. Entre novamente.", 401);
  }
}

function validReferenceId(value: string): string {
  const cleaned = cleanString(value, 160);
  if (!cleaned || !/^[a-f0-9]{64}$/i.test(cleaned)) {
    throw new CustomerOrderError("Pedido inválido.", 400);
  }
  return cleaned;
}

function validateOrderPath(params: {
  path: string;
  source: CustomerOrderSource;
  sellerId: string;
  eventId: string;
  orderId: string;
}): boolean {
  const { path, source, sellerId, eventId, orderId } = params;
  if (!sellerId || !orderId) return false;

  const expected =
    source === "event"
      ? `sellers/${sellerId}/events/${eventId}/orders/${orderId}`
      : `sellers/${sellerId}/storeOrders/${orderId}`;

  return path === expected;
}

function serializeItem(value: unknown) {
  const raw = record(value);
  const state = record(raw.inventoryState);
  const quantity = nonNegativeInteger(raw.quantity ?? raw.qty);
  const unitPriceMinor = nonNegativeInteger(raw.unitPriceMinor);

  return {
    productId: cleanString(raw.productId ?? raw.id, 160),
    name: cleanString(raw.name, 240) || "Produto",
    quantity,
    unitPriceMinor,
    subtotalMinor: nonNegativeInteger(raw.subtotalMinor) || quantity * unitPriceMinor,
    imageUrl: cleanString(raw.imageUrl, 2000),
    category: cleanString(raw.category, 120),
    productionRequired: nonNegativeInteger(
      state.productionRequired ?? raw.productionRequired,
    ),
    producedQuantity: nonNegativeInteger(
      state.producedQuantity ?? raw.producedQuantity,
    ),
  };
}

function serializeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const raw = record(entry);
      return {
        status: normalizeStatus(raw.status),
        createdAt: timestampIso(raw.createdAt),
        note: cleanString(raw.note, 1000),
      };
    })
    .filter((entry) => entry.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ referenceId: string }> },
) {
  try {
    const decoded = await authenticate(request);
    const { referenceId: rawReferenceId } = await context.params;
    const referenceId = validReferenceId(decodeURIComponent(rawReferenceId));
    const db = getAdminDb();
    const customerRef = db.collection("customers").doc(decoded.uid);
    const customerOrderRef = customerRef.collection("orders").doc(referenceId);
    const [customerSnapshot, indexSnapshot] = await db.getAll(
      customerRef,
      customerOrderRef,
    );

    if (!customerSnapshot.exists || customerSnapshot.data()?.accountStatus === "disabled") {
      throw new CustomerOrderError("Sua conta de cliente não está disponível.", 403);
    }
    if (!indexSnapshot.exists) {
      throw new CustomerOrderError("Pedido não encontrado na sua conta.", 404);
    }

    const index = indexSnapshot.data() ?? {};
    const source = normalizeSource(index.orderSource);
    const sellerId = cleanString(index.sellerId, 160);
    const eventId = source === "event" ? cleanString(index.eventId, 160) : "";
    const orderId = cleanString(index.orderId, 160);
    const orderPath = cleanString(index.orderPath, 1000);

    if (
      cleanString(index.customerUid, 160) !== decoded.uid ||
      !validateOrderPath({ path: orderPath, source, sellerId, eventId, orderId })
    ) {
      throw new CustomerOrderError("Este pedido não pertence à sua conta.", 403);
    }

    const sellerRef = db.collection("sellers").doc(sellerId);
    const orderRef = db.doc(orderPath);
    const eventRef = source === "event"
      ? sellerRef.collection("events").doc(eventId)
      : null;
    const refs: admin.firestore.DocumentReference[] = [orderRef, sellerRef];
    if (eventRef) refs.push(eventRef);
    const snapshots = await db.getAll(...refs);
    const orderSnapshot = snapshots[0];
    const sellerSnapshot = snapshots[1];
    const eventSnapshot = eventRef ? snapshots[2] : null;

    if (!orderSnapshot.exists) {
      throw new CustomerOrderError("O pedido original não está mais disponível.", 404);
    }

    const order = orderSnapshot.data() ?? {};
    if (cleanString(order.customerUid, 160) !== decoded.uid) {
      throw new CustomerOrderError("Este pedido não pertence à sua conta.", 403);
    }

    const seller = sellerSnapshot.data() ?? {};
    const event = eventSnapshot?.data() ?? {};
    const status = normalizeStatus(order.fulfillmentStatus ?? order.status);
    const currency = normalizeCurrency(order.currency ?? index.currency);
    const readiness = record(order.readiness);
    const items = Array.isArray(order.items) ? order.items.map(serializeItem) : [];
    const createdAt = timestampIso(order.createdAt ?? index.createdAt);
    const updatedAt = timestampIso(order.updatedAt ?? index.updatedAt ?? order.createdAt);
    const storeName =
      cleanString(index.storeName, 160) ||
      cleanString(seller.storeName ?? seller.displayName, 160);
    const eventTitle =
      source === "event"
        ? cleanString(index.eventTitle, 200) || cleanString(event.title ?? event.name, 200)
        : "";

    const rewards = record(order.rewards);
    const summaryUpdate = {
      status,
      fulfillmentStatus: status,
      storeName: storeName || null,
      eventTitle: eventTitle || null,
      totalAmountMinor: nonNegativeInteger(order.totalAmountMinor),
      totalItems: nonNegativeInteger(order.totalItems),
      deliveryMode: cleanString(order.deliveryMode, 40) || null,
      deliveryDate: cleanString(order.deliveryDate, 80) || null,
      deliveryTimeSlot: cleanString(order.deliveryTimeSlot, 80) || null,
      readinessReasonCodes: stringList(readiness.reasonCodes),
      pointsRedeemed: nonNegativeInteger(rewards.pointsRedeemed),
      pointsToEarn: nonNegativeInteger(rewards.pointsToEarn),
      rewardMode: cleanString(rewards.mode, 40) || "none",
      rewardStatus: cleanString(rewards.earnStatus, 40) || "not_eligible",
      rewardRedemptionStatus: cleanString(rewards.redemptionStatus, 40) || "none",
      updatedAt: order.updatedAt ?? admin.firestore.Timestamp.now(),
    };

    await customerOrderRef.set(summaryUpdate, { merge: true });

    return NextResponse.json(
      {
        ok: true,
        order: {
          referenceId,
          orderId,
          sellerId,
          eventId,
          source,
          status,
          storeName,
          eventTitle,
          currency,
          totalAmountMinor: nonNegativeInteger(order.totalAmountMinor),
          totalItems: nonNegativeInteger(order.totalItems),
          deliveryMode: cleanString(order.deliveryMode, 40),
          deliveryDate: cleanString(order.deliveryDate, 80),
          deliveryTimeSlot: cleanString(order.deliveryTimeSlot, 80),
          readinessReasonCodes: stringList(readiness.reasonCodes),
          createdAt,
          updatedAt,
          storeHref: sellerId ? `/store/${encodeURIComponent(sellerId)}` : "",
          eventHref:
            source === "event" && sellerId && eventId
              ? `/event/${encodeURIComponent(sellerId)}/${encodeURIComponent(eventId)}`
              : "",
          customerName: cleanString(order.customerName, 120),
          customerPhone: cleanString(order.customerPhone, 50),
          customerEmail: cleanString(order.customerEmail, 200),
          subtotalMinor: nonNegativeInteger(order.subtotalMinor),
          discountMinor: nonNegativeInteger(order.discountMinor),
          offerDiscountMinor: nonNegativeInteger(order.offerDiscountMinor),
          rewardsDiscountMinor: nonNegativeInteger(order.rewardsDiscountMinor ?? rewards.discountMinor),
          pointsRedeemed: nonNegativeInteger(rewards.pointsRedeemed),
          pointsToEarn: nonNegativeInteger(rewards.pointsToEarn),
          rewardMode: cleanString(rewards.mode, 40) || "none",
          rewardStatus: cleanString(rewards.earnStatus, 40) || "not_eligible",
          rewardRedemptionStatus: cleanString(rewards.redemptionStatus, 40) || "none",
          rewardProductName: cleanString(rewards.rewardProductName, 240),
          shippingFeeMinor: nonNegativeInteger(order.shippingFeeMinor),
          address: cleanString(order.address, 1000),
          locationLink: cleanString(order.locationLink, 2000),
          note: cleanString(order.note, 1000),
          items,
          history: serializeHistory(order.history),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof CustomerOrderError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar o pedido.";

    if (!(error instanceof CustomerOrderError)) {
      console.error("[api/customer/orders/reference] Unexpected error:", error);
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderSource = "store" | "event";
type FulfillmentStatus = "pending" | "ready" | "delivered" | "cancelled";
type ReservationStatus = "none" | "partial" | "reserved" | "consumed" | "released";

type ProductionTarget = {
  source: OrderSource;
  eventId: string;
  orderId: string;
};

type CleanRequest = {
  sellerId: string;
  productId: string;
  quantity: number;
  requestId: string;
  targets: ProductionTarget[];
};

type ManagedItem = {
  raw: Record<string, unknown>;
  productId: string;
  quantity: number;
  madeToOrder: boolean;
  inventoryTracked: boolean;
  reservedQuantity: number;
  shortageQuantity: number;
  productionRequired: number;
  producedQuantity: number;
  consumedQuantity: number;
  releasedQuantity: number;
  productionStatus: "pending" | "completed" | "not_required";
};

type TargetOrder = {
  target: ProductionTarget;
  ref: admin.firestore.DocumentReference;
  data: Record<string, unknown>;
  items: ManagedItem[];
  matchingIndexes: number[];
  sortKey: string;
};

class ProductionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProductionError";
    this.code = code;
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

function cleanSource(value: unknown): OrderSource {
  if (value === "store" || value === "event") return value;
  throw new ProductionError("INVALID_REQUEST", "Origem do pedido inválida.");
}

function cleanTarget(value: unknown): ProductionTarget {
  const raw = record(value);
  const source = cleanSource(raw.source);
  const eventId = cleanString(raw.eventId, 160);
  const orderId = cleanString(raw.orderId, 160);

  if (!orderId || orderId.includes("/")) {
    throw new ProductionError("INVALID_REQUEST", "Pedido inválido.");
  }
  if (source === "event" && (!eventId || eventId.includes("/"))) {
    throw new ProductionError("INVALID_REQUEST", "Evento inválido.");
  }

  return {
    source,
    eventId: source === "event" ? eventId : "",
    orderId,
  };
}

function cleanRequest(value: unknown): CleanRequest {
  const raw = record(value);
  const sellerId = cleanString(raw.sellerId, 160);
  const productId = cleanString(raw.productId, 160);
  const requestId = cleanString(raw.requestId, 160);
  const quantity = nonNegativeInteger(raw.quantity);
  const rawTargets = Array.isArray(raw.targets) ? raw.targets : [];

  if (!sellerId || sellerId.includes("/")) {
    throw new ProductionError("INVALID_REQUEST", "Vendedor inválido.");
  }
  if (!productId || productId.includes("/")) {
    throw new ProductionError("INVALID_REQUEST", "Produto inválido.");
  }
  if (!requestId || requestId.includes("/")) {
    throw new ProductionError("INVALID_REQUEST", "Identificador da operação inválido.");
  }
  if (quantity <= 0 || quantity > 100_000) {
    throw new ProductionError("INVALID_QUANTITY", "Informe uma quantidade válida.");
  }
  if (rawTargets.length === 0 || rawTargets.length > 150) {
    throw new ProductionError("INVALID_REQUEST", "A lista de pedidos é inválida.");
  }

  const uniqueTargets = new Map<string, ProductionTarget>();
  for (const rawTarget of rawTargets) {
    const target = cleanTarget(rawTarget);
    const key = `${target.source}:${target.eventId}:${target.orderId}`;
    uniqueTargets.set(key, target);
  }

  return {
    sellerId,
    productId,
    requestId,
    quantity,
    targets: Array.from(uniqueTargets.values()),
  };
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function authorizeSeller(params: { token: string; sellerId: string }) {
  const { token, sellerId } = params;
  if (!token) {
    throw new ProductionError("AUTH_REQUIRED", "Entre novamente para registrar a produção.", 401);
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new ProductionError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
  }

  const db = getAdminDb();
  const [userSnapshot, sellerSnapshot] = await db.getAll(
    db.collection("users").doc(decoded.uid),
    db.collection("sellers").doc(sellerId),
  );
  const userData = userSnapshot.data() ?? {};
  const sellerData = sellerSnapshot.data() ?? {};
  const authorized = isAdminOrOperationalSellerOwnerRecord({
    uid: decoded.uid,
    sellerId,
    userData,
    sellerData,
  });

  if (!authorized) {
    throw new ProductionError("FORBIDDEN", "Você não pode registrar produção para este vendedor.", 403);
  }

  return {
    uid: decoded.uid,
    actor: cleanString(decoded.email, 240) || decoded.uid,
  };
}

function normalizeCurrentStatus(value: unknown): FulfillmentStatus {
  if (value === "ready" || value === "delivered" || value === "cancelled") {
    return value;
  }
  return "pending";
}

function parseManagedItem(rawValue: unknown): ManagedItem | null {
  const raw = record(rawValue);
  const productId = cleanString(raw.productId ?? raw.id, 160);
  const quantity = nonNegativeInteger(raw.quantity ?? raw.qty);
  if (!productId || productId.includes("/") || quantity <= 0) return null;

  const state = record(raw.inventoryState);
  const madeToOrder =
    raw.availabilityMode === "made_to_order" ||
    raw.availabilityStatus === "made_to_order" ||
    raw.productionMode === "made_to_order";
  const productionRequired = nonNegativeInteger(
    state.productionRequired ?? raw.productionRequired,
  );
  const producedQuantity = nonNegativeInteger(
    state.producedQuantity ?? raw.producedQuantity,
  );

  return {
    raw,
    productId,
    quantity,
    madeToOrder,
    inventoryTracked: raw.inventoryTracked !== false,
    reservedQuantity: nonNegativeInteger(state.reservedQuantity ?? raw.stockReserved),
    shortageQuantity: nonNegativeInteger(state.shortageQuantity ?? raw.stockShortage),
    productionRequired,
    producedQuantity,
    consumedQuantity: nonNegativeInteger(state.consumedQuantity),
    releasedQuantity: nonNegativeInteger(state.releasedQuantity),
    productionStatus:
      productionRequired > 0
        ? "pending"
        : state.productionStatus === "completed" || producedQuantity > 0
          ? "completed"
          : "not_required",
  };
}

function serializeItem(item: ManagedItem): Record<string, unknown> {
  const reservationStatus: ReservationStatus =
    item.consumedQuantity > 0
      ? "consumed"
      : item.releasedQuantity > 0
        ? "released"
        : item.reservedQuantity >= item.quantity
          ? "reserved"
          : item.reservedQuantity > 0
            ? "partial"
            : "none";

  const stockState = item.madeToOrder
    ? "made_to_order"
    : !item.inventoryTracked
      ? "not_tracked"
      : item.shortageQuantity > 0
        ? "insufficient"
        : "available";

  return {
    ...item.raw,
    inventoryTracked: item.inventoryTracked,
    stockReserved: item.reservedQuantity,
    stockShortage: item.shortageQuantity,
    productionRequired: item.productionRequired,
    producedQuantity: item.producedQuantity,
    stockState,
    inventoryState: {
      reservationStatus,
      reservedQuantity: item.reservedQuantity,
      shortageQuantity: item.shortageQuantity,
      productionRequired: item.productionRequired,
      producedQuantity: item.producedQuantity,
      consumedQuantity: item.consumedQuantity,
      releasedQuantity: item.releasedQuantity,
      productionStatus: item.productionStatus,
    },
  };
}

function aggregateInventory(items: ManagedItem[]) {
  const reservedQuantity = items.reduce((sum, item) => sum + item.reservedQuantity, 0);
  const shortageQuantity = items.reduce((sum, item) => sum + item.shortageQuantity, 0);
  const productionRequired = items.reduce((sum, item) => sum + item.productionRequired, 0);
  const producedQuantity = items.reduce((sum, item) => sum + item.producedQuantity, 0);
  const consumedQuantity = items.reduce((sum, item) => sum + item.consumedQuantity, 0);
  const releasedQuantity = items.reduce((sum, item) => sum + item.releasedQuantity, 0);
  const reservationStatus: ReservationStatus =
    consumedQuantity > 0
      ? "consumed"
      : releasedQuantity > 0
        ? "released"
        : shortageQuantity > 0
          ? reservedQuantity > 0
            ? "partial"
            : "none"
          : reservedQuantity > 0
            ? "reserved"
            : "none";

  return {
    reservationStatus,
    reservedQuantity,
    shortageQuantity,
    productionRequired,
    producedQuantity,
    consumedQuantity,
    releasedQuantity,
  };
}

function orderIsReady(items: ManagedItem[]): boolean {
  return items.every((item) => {
    if (item.madeToOrder) {
      return item.productionRequired <= 0 && item.productionStatus === "completed";
    }
    if (!item.inventoryTracked) return true;
    return item.shortageQuantity <= 0 && item.reservedQuantity >= item.quantity;
  });
}

function timestampMillis(value: unknown): number {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const raw = record(value);
  const seconds = Number(raw.seconds ?? raw._seconds);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

function targetOrderRef(
  sellerRef: admin.firestore.DocumentReference,
  target: ProductionTarget,
): admin.firestore.DocumentReference {
  return target.source === "event"
    ? sellerRef.collection("events").doc(target.eventId).collection("orders").doc(target.orderId)
    : sellerRef.collection("storeOrders").doc(target.orderId);
}

function movementSnapshot(inventory: { quantity: number; reserved: number }) {
  return {
    quantity: inventory.quantity,
    reserved: inventory.reserved,
    available: Math.max(0, inventory.quantity - inventory.reserved),
  };
}

function customerOrderIndexRef(
  db: admin.firestore.Firestore,
  orderData: Record<string, unknown>,
): admin.firestore.DocumentReference | null {
  const customerUid = cleanString(orderData.customerUid, 160);
  const referenceId = cleanString(orderData.customerOrderRefId, 160);

  if (!customerUid || !referenceId || customerUid.includes("/") || referenceId.includes("/")) {
    return null;
  }

  return db.collection("customers").doc(customerUid).collection("orders").doc(referenceId);
}

function productSnapshotName(data: Record<string, unknown>): string {
  const legacyName = cleanString(data.name ?? data.title, 240);
  const content = record(data.content);
  for (const language of ["pt", "en", "ja"]) {
    const localized = record(content[language]);
    const name = cleanString(localized.name, 240);
    if (name) return name;
  }
  return legacyName;
}

function orderCustomerName(data: Record<string, unknown>): string {
  const customer = record(data.customer);
  return cleanString(
    data.customerName ?? data.name ?? customer.name ?? customer.fullName,
    240,
  );
}

export async function POST(request: NextRequest) {
  try {
    const clean = cleanRequest(await request.json().catch(() => null));
    const actor = await authorizeSeller({
      token: bearerToken(request),
      sellerId: clean.sellerId,
    });
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(clean.sellerId);
    const productRef = sellerRef.collection("products").doc(clean.productId);
    const markerRef = sellerRef.collection("productionRequests").doc(clean.requestId);
    const orderRefs = clean.targets.map((target) => targetOrderRef(sellerRef, target));
    const now = admin.firestore.Timestamp.now();

    const result = await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(markerRef, productRef, ...orderRefs);
      const markerSnapshot = snapshots[0];
      const productSnapshot = snapshots[1];

      if (markerSnapshot.exists) {
        const markerData = markerSnapshot.data() ?? {};
        if (markerData.productId !== clean.productId) {
          throw new ProductionError(
            "IDEMPOTENCY_CONFLICT",
            "Esta operação já foi utilizada para outro produto.",
            409,
          );
        }
        return {
          ok: true as const,
          recordedQuantity: nonNegativeInteger(markerData.recordedQuantity),
          remainingQuantity: nonNegativeInteger(markerData.remainingQuantity),
          autoReadyOrderIds: Array.isArray(markerData.autoReadyOrderIds)
            ? markerData.autoReadyOrderIds.filter((value): value is string => typeof value === "string")
            : [],
          replayed: true,
        };
      }

      const targetOrders: TargetOrder[] = [];
      for (let index = 0; index < clean.targets.length; index += 1) {
        const target = clean.targets[index];
        const snapshot = snapshots[index + 2];
        if (!snapshot.exists) continue;

        const data = snapshot.data() ?? {};
        const status = normalizeCurrentStatus(data.fulfillmentStatus ?? data.status);
        if (status === "delivered" || status === "cancelled") continue;

        const items = (Array.isArray(data.items) ? data.items : [])
          .map(parseManagedItem)
          .filter((item): item is ManagedItem => item !== null);
        const matchingIndexes = items
          .map((item, itemIndex) => (item.productId === clean.productId && item.productionRequired > 0 ? itemIndex : -1))
          .filter((itemIndex) => itemIndex >= 0);
        if (matchingIndexes.length === 0) continue;

        const deliveryDate = cleanString(data.deliveryDate, 40) || "9999-12-31";
        const createdAt = String(timestampMillis(data.createdAt)).padStart(16, "0");
        targetOrders.push({
          target,
          ref: orderRefs[index],
          data,
          items,
          matchingIndexes,
          sortKey: `${deliveryDate}:${createdAt}:${target.orderId}`,
        });
      }

      targetOrders.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const totalNeedBefore = targetOrders.reduce(
        (sum, order) =>
          sum + order.matchingIndexes.reduce(
            (itemSum, itemIndex) => itemSum + order.items[itemIndex].productionRequired,
            0,
          ),
        0,
      );

      if (totalNeedBefore <= 0) {
        throw new ProductionError("NOTHING_TO_PRODUCE", "Não há produção pendente para este produto.", 409);
      }

      let remainingToRecord = Math.min(clean.quantity, totalNeedBefore);
      let recordedQuantity = 0;
      let stockProducedQuantity = 0;
      const autoReadyOrderIds: string[] = [];
      const productData = productSnapshot.data() ?? {};
      const productName = productSnapshotName(productData);
      const normalizedInventory = normalizeProductInventory(
        productData.inventory,
        productData.stockQty ?? productData.stock,
        productData.lowStockThreshold,
      );
      const inventoryBefore = {
        tracked: normalizedInventory.tracked,
        quantity: normalizedInventory.quantity,
        reserved: normalizedInventory.reserved,
        lowStockThreshold: normalizedInventory.lowStockThreshold,
      };
      const inventoryAfter = { ...inventoryBefore };

      for (const targetOrder of targetOrders) {
        if (remainingToRecord <= 0) break;
        let orderRecorded = 0;

        for (const itemIndex of targetOrder.matchingIndexes) {
          if (remainingToRecord <= 0) break;
          const item = targetOrder.items[itemIndex];
          const allocation = Math.min(remainingToRecord, item.productionRequired);
          if (allocation <= 0) continue;

          item.producedQuantity += allocation;
          item.productionRequired = Math.max(0, item.productionRequired - allocation);
          item.productionStatus = item.productionRequired > 0 ? "pending" : "completed";

          if (!item.madeToOrder && item.inventoryTracked) {
            if (!productSnapshot.exists) {
              throw new ProductionError(
                "PRODUCT_UNAVAILABLE",
                "O produto não existe mais no catálogo.",
                409,
              );
            }
            inventoryAfter.tracked = true;
            inventoryAfter.quantity += allocation;
            inventoryAfter.reserved += allocation;
            item.reservedQuantity += allocation;
            item.shortageQuantity = Math.max(0, item.quantity - item.reservedQuantity);
            item.productionRequired = item.shortageQuantity;
            item.productionStatus = item.productionRequired > 0 ? "pending" : "completed";
            stockProducedQuantity += allocation;
          }

          orderRecorded += allocation;
          recordedQuantity += allocation;
          remainingToRecord -= allocation;
        }

        if (orderRecorded <= 0) continue;

        const serializedItems = targetOrder.items.map(serializeItem);
        const inventoryState = aggregateInventory(targetOrder.items);
        const ready = orderIsReady(targetOrder.items);
        const currentStatus = normalizeCurrentStatus(
          targetOrder.data.fulfillmentStatus ?? targetOrder.data.status,
        );
        const nextStatus: FulfillmentStatus = ready ? "ready" : "pending";
        const hasMadeToOrderItems = targetOrder.items.some(
          (item) => item.madeToOrder,
        );
        const hasPendingMadeToOrder = targetOrder.items.some(
          (item) => item.madeToOrder && item.productionRequired > 0,
        );
        const hasPendingProduction = targetOrder.items.some(
          (item) => item.productionRequired > 0,
        );
        const hasStockShortage = targetOrder.items.some((item) => item.shortageQuantity > 0);

        if (ready && currentStatus !== "ready") {
          autoReadyOrderIds.push(targetOrder.target.orderId);
        }

        transaction.update(targetOrder.ref, {
          items: serializedItems,
          status: nextStatus,
          fulfillmentStatus: nextStatus,
          inventoryState,
          readiness: {
            hasMadeToOrderItems,
            hasPendingProduction,
            hasStockShortage,
            reasonCodes: [
              ...(hasPendingMadeToOrder ? ["made_to_order"] : []),
              ...(hasStockShortage ? ["stock_shortage"] : []),
            ],
          },
          readyAt: ready ? now : targetOrder.data.readyAt ?? null,
          history: admin.firestore.FieldValue.arrayUnion({
            status: nextStatus,
            createdAt: now,
            updatedBy: actor.actor,
            note: `production_recorded:${clean.productId}:${orderRecorded}`,
          }),
          sellerUnread: false,
          sellerReadAt: now,
          updatedAt: now,
          updatedBy: actor.actor,
        });

        const customerOrderRef = customerOrderIndexRef(db, targetOrder.data);
        if (customerOrderRef) {
          transaction.set(
            customerOrderRef,
            {
              status: nextStatus,
              fulfillmentStatus: nextStatus,
              readinessReasonCodes: [
                ...(hasPendingMadeToOrder ? ["made_to_order"] : []),
                ...(hasStockShortage ? ["stock_shortage"] : []),
              ],
              readyAt: ready ? now : null,
              updatedAt: now,
            },
            { merge: true },
          );
        }

        const productionMovementRef = sellerRef
          .collection("productionMovements")
          .doc(`${clean.requestId}_${targetOrder.target.source}_${targetOrder.target.eventId || "store"}_${targetOrder.target.orderId}`);
        transaction.create(productionMovementRef, {
          schemaVersion: 1,
          type: "production_recorded",
          sellerId: clean.sellerId,
          productId: clean.productId,
          productName: productName || null,
          orderId: targetOrder.target.orderId,
          orderSource: targetOrder.target.source,
          eventId: targetOrder.target.eventId || null,
          customerName: orderCustomerName(targetOrder.data) || null,
          deliveryDate: cleanString(targetOrder.data.deliveryDate, 40) || null,
          quantity: orderRecorded,
          orderBecameReady: ready && currentStatus !== "ready",
          requestId: clean.requestId,
          createdAt: now,
          createdBy: actor.actor,
          createdByUid: actor.uid,
        });
      }

      if (recordedQuantity <= 0) {
        throw new ProductionError("NOTHING_TO_PRODUCE", "Não há produção pendente para este produto.", 409);
      }

      if (stockProducedQuantity > 0) {
        transaction.set(
          productRef,
          {
            inventory: inventoryAfter,
            stockQty: inventoryAfter.quantity,
            updatedAt: now,
          },
          { merge: true },
        );
        const inventoryMovementRef = sellerRef
          .collection("inventoryMovements")
          .doc(`${clean.requestId}_production_stock`);
        transaction.create(inventoryMovementRef, {
          schemaVersion: 2,
          type: "production_stock_in_reserved",
          sellerId: clean.sellerId,
          productId: clean.productId,
          quantity: stockProducedQuantity,
          before: movementSnapshot(inventoryBefore),
          after: movementSnapshot(inventoryAfter),
          requestId: clean.requestId,
          createdAt: now,
          createdBy: actor.actor,
        });
      }

      const remainingQuantity = Math.max(0, totalNeedBefore - recordedQuantity);
      transaction.create(markerRef, {
        schemaVersion: 1,
        sellerId: clean.sellerId,
        productId: clean.productId,
        requestedQuantity: clean.quantity,
        recordedQuantity,
        remainingQuantity,
        autoReadyOrderIds,
        createdAt: now,
        createdBy: actor.actor,
      });

      return {
        ok: true as const,
        recordedQuantity,
        remainingQuantity,
        autoReadyOrderIds,
        replayed: false,
      };
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ProductionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    console.error("[api/orders/production] Falha inesperada:", error);
    return NextResponse.json(
      {
        ok: false,
        code: "PRODUCTION_UPDATE_FAILED",
        error: "Não foi possível registrar a produção.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

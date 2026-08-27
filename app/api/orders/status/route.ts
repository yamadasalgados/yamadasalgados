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

type CleanRequest = {
  source: OrderSource;
  sellerId: string;
  eventId: string;
  orderId: string;
  status: FulfillmentStatus;
  note: string;
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

class StatusError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StatusError";
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
  throw new StatusError("INVALID_REQUEST", "Origem do pedido inválida.");
}

function cleanStatus(value: unknown): FulfillmentStatus {
  if (
    value === "pending" ||
    value === "ready" ||
    value === "delivered" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new StatusError("INVALID_REQUEST", "Status do pedido inválido.");
}

function normalizeCurrentStatus(value: unknown): FulfillmentStatus {
  if (value === "ready" || value === "delivered" || value === "cancelled") {
    return value;
  }
  return "pending";
}

function cleanRequest(value: unknown): CleanRequest {
  const raw = record(value);
  const source = cleanSource(raw.source);
  const sellerId = cleanString(raw.sellerId, 160);
  const eventId = cleanString(raw.eventId, 160);
  const orderId = cleanString(raw.orderId, 160);

  if (!sellerId || sellerId.includes("/")) {
    throw new StatusError("INVALID_REQUEST", "Vendedor inválido.");
  }
  if (!orderId || orderId.includes("/")) {
    throw new StatusError("INVALID_REQUEST", "Pedido inválido.");
  }
  if (source === "event" && (!eventId || eventId.includes("/"))) {
    throw new StatusError("INVALID_REQUEST", "Evento inválido.");
  }

  return {
    source,
    sellerId,
    eventId: source === "event" ? eventId : "",
    orderId,
    status: cleanStatus(raw.status),
    note: cleanString(raw.note, 1000),
  };
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function authorizeSeller(params: {
  token: string;
  sellerId: string;
}) {
  const { token, sellerId } = params;
  if (!token) {
    throw new StatusError("AUTH_REQUIRED", "Entre novamente para alterar o pedido.", 401);
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new StatusError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
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
    throw new StatusError("FORBIDDEN", "Você não pode alterar este pedido.", 403);
  }

  return {
    uid: decoded.uid,
    email: cleanString(decoded.email, 240),
    actor: cleanString(decoded.email, 240) || decoded.uid,
  };
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

  return {
    raw,
    productId,
    quantity,
    madeToOrder,
    inventoryTracked: raw.inventoryTracked !== false,
    reservedQuantity: nonNegativeInteger(
      state.reservedQuantity ?? raw.stockReserved,
    ),
    shortageQuantity: nonNegativeInteger(
      state.shortageQuantity ?? raw.stockShortage,
    ),
    productionRequired: nonNegativeInteger(
      state.productionRequired ?? raw.productionRequired,
    ),
    producedQuantity: nonNegativeInteger(
      state.producedQuantity ?? raw.producedQuantity,
    ),
    consumedQuantity: nonNegativeInteger(state.consumedQuantity),
    releasedQuantity: nonNegativeInteger(state.releasedQuantity),
    productionStatus:
      nonNegativeInteger(state.productionRequired ?? raw.productionRequired) > 0
        ? "pending"
        : state.productionStatus === "completed" ||
            nonNegativeInteger(state.producedQuantity ?? raw.producedQuantity) > 0
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
  const reservedQuantity = items.reduce(
    (sum, item) => sum + item.reservedQuantity,
    0,
  );
  const shortageQuantity = items.reduce(
    (sum, item) => sum + item.shortageQuantity,
    0,
  );
  const productionRequired = items.reduce(
    (sum, item) => sum + item.productionRequired,
    0,
  );
  const producedQuantity = items.reduce(
    (sum, item) => sum + item.producedQuantity,
    0,
  );
  const consumedQuantity = items.reduce(
    (sum, item) => sum + item.consumedQuantity,
    0,
  );
  const releasedQuantity = items.reduce(
    (sum, item) => sum + item.releasedQuantity,
    0,
  );
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

function movementSnapshot(inventory: {
  quantity: number;
  reserved: number;
}) {
  return {
    quantity: inventory.quantity,
    reserved: inventory.reserved,
    available: Math.max(0, inventory.quantity - inventory.reserved),
  };
}


type RewardTransitionContext = {
  rewards: Record<string, unknown>;
  customerUid: string;
  walletRef: admin.firestore.DocumentReference | null;
  movementRef: admin.firestore.DocumentReference | null;
  walletSnapshot: admin.firestore.DocumentSnapshot | null;
  movementSnapshot: admin.firestore.DocumentSnapshot | null;
};

function rewardTransitionRefs(params: {
  db: admin.firestore.Firestore;
  orderData: Record<string, unknown>;
  sellerId: string;
  orderId: string;
  requestedStatus: FulfillmentStatus;
}) {
  const rewards = record(params.orderData.rewards);
  const buyerCustomerUid = cleanString(
    rewards.buyerCustomerUid ?? params.orderData.customerUid,
    160,
  );
  const earnRecipientUid = cleanString(
    rewards.earnRecipientUid ?? buyerCustomerUid,
    160,
  );
  const customerUid =
    params.requestedStatus === "delivered"
      ? earnRecipientUid
      : buyerCustomerUid;
  const rewardSellerId = cleanString(rewards.sellerId ?? params.sellerId, 160);
  if (
    !customerUid ||
    customerUid.includes("/") ||
    !rewardSellerId ||
    rewardSellerId.includes("/") ||
    (params.requestedStatus !== "delivered" && params.requestedStatus !== "cancelled")
  ) {
    return { rewards, customerUid, walletRef: null, movementRef: null };
  }

  const walletRef = params.db
    .collection("customers")
    .doc(customerUid)
    .collection("rewardWallets")
    .doc(rewardSellerId);
  const movementId = params.requestedStatus === "delivered"
    ? `earn_${params.orderId}`
    : `refund_${params.orderId}`;

  return {
    rewards,
    customerUid,
    walletRef,
    movementRef: walletRef.collection("transactions").doc(movementId),
  };
}

function applyRewardTransition(params: {
  transaction: admin.firestore.Transaction;
  context: RewardTransitionContext;
  requestedStatus: FulfillmentStatus;
  orderData: Record<string, unknown>;
  sellerId: string;
  orderId: string;
  orderPath: string;
  orderSource: OrderSource;
  eventId: string;
  now: admin.firestore.Timestamp;
}): Record<string, unknown> {
  const {
    transaction,
    context,
    requestedStatus,
    orderData,
    sellerId,
    orderId,
    orderPath,
    orderSource,
    eventId,
    now,
  } = params;
  const rewards = { ...context.rewards };
  if (!context.walletRef || !context.movementRef || !context.customerUid) {
    if (requestedStatus === "cancelled" && rewards.earnStatus === "pending") {
      rewards.earnStatus = "void";
    }
    return rewards;
  }

  const walletData = context.walletSnapshot?.data() ?? {};
  const currentBalance = nonNegativeInteger(walletData.pointsBalance);
  const storeName = cleanString(walletData.storeName, 160) || "Loja";
  const currency = orderData.currency === "BRL" || orderData.currency === "USD"
    ? orderData.currency
    : "JPY";

  if (requestedStatus === "delivered") {
    const pointsToEarn = nonNegativeInteger(rewards.pointsToEarn);
    if (pointsToEarn <= 0) {
      rewards.earnStatus = "not_eligible";
      return rewards;
    }

    if (!context.movementSnapshot?.exists && rewards.earnStatus !== "credited") {
      const nextBalance = currentBalance + pointsToEarn;
      transaction.set(
        context.walletRef,
        {
          schemaVersion: 2,
          customerUid: context.customerUid,
          sellerId,
          storeName,
          currency,
          pointsBalance: nextBalance,
          lifetimeEarned:
            nonNegativeInteger(walletData.lifetimeEarned) + pointsToEarn,
          lifetimeRedeemed: nonNegativeInteger(walletData.lifetimeRedeemed),
          lifetimeRefunded: nonNegativeInteger(walletData.lifetimeRefunded),
          updatedAt: now,
          ...(context.walletSnapshot?.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );
      const earnRecipientType =
        cleanString(rewards.earnRecipientType, 40) === "event_presenter"
          ? "event_presenter"
          : "customer";
      transaction.create(context.movementRef, {
        schemaVersion: 2,
        type: earnRecipientType === "event_presenter" ? "event_earn" : "earn",
        points: pointsToEarn,
        balanceBefore: currentBalance,
        balanceAfter: nextBalance,
        sellerId,
        customerUid: context.customerUid,
        sourceCustomerUid: cleanString(
          rewards.buyerCustomerUid ?? orderData.customerUid,
          160,
        ) || null,
        rewardRecipientType: earnRecipientType,
        rewardRecipientName: cleanString(rewards.earnRecipientName, 120) || null,
        orderId,
        orderPath,
        orderSource,
        eventId: eventId || null,
        label:
          earnRecipientType === "event_presenter"
            ? "Pontos das vendas do evento"
            : "Pontos da compra entregue",
        createdAt: now,
      });
    }

    rewards.earnStatus = "credited";
    rewards.creditedAt = now;
    rewards.creditedToUid = context.customerUid;
    rewards.creditedRecipientType =
      cleanString(rewards.earnRecipientType, 40) || "customer";
    return rewards;
  }

  if (requestedStatus === "cancelled") {
    const pointsRedeemed = nonNegativeInteger(rewards.pointsRedeemed);
    if (
      pointsRedeemed > 0 &&
      rewards.redemptionStatus !== "refunded" &&
      !context.movementSnapshot?.exists
    ) {
      const nextBalance = currentBalance + pointsRedeemed;
      transaction.set(
        context.walletRef,
        {
          schemaVersion: 2,
          customerUid: context.customerUid,
          sellerId,
          storeName,
          currency,
          pointsBalance: nextBalance,
          lifetimeEarned: nonNegativeInteger(walletData.lifetimeEarned),
          lifetimeRedeemed: nonNegativeInteger(walletData.lifetimeRedeemed),
          lifetimeRefunded:
            nonNegativeInteger(walletData.lifetimeRefunded) + pointsRedeemed,
          updatedAt: now,
          ...(context.walletSnapshot?.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );
      transaction.create(context.movementRef, {
        schemaVersion: 1,
        type: "refund",
        points: pointsRedeemed,
        balanceBefore: currentBalance,
        balanceAfter: nextBalance,
        sellerId,
        customerUid: context.customerUid,
        orderId,
        orderPath,
        orderSource,
        eventId: eventId || null,
        label: "Estorno de pedido cancelado",
        createdAt: now,
      });
    }

    if (pointsRedeemed > 0) {
      rewards.redemptionStatus = "refunded";
      rewards.refundedAt = now;
    }
    if (rewards.earnStatus === "pending") rewards.earnStatus = "void";
  }

  return rewards;
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

function customerOrderIndexPayload(params: {
  status: FulfillmentStatus;
  readinessReasonCodes?: string[];
  rewards?: Record<string, unknown>;
  now: admin.firestore.Timestamp;
}) {
  const buyerCustomerUid = cleanString(params.rewards?.buyerCustomerUid, 160);
  const earnRecipientUid = cleanString(params.rewards?.earnRecipientUid, 160);
  const eventPointsAssigned = nonNegativeInteger(
    params.rewards?.pointsAssignedToPresenter,
  );
  const customerVisibleEventPoints =
    eventPointsAssigned > 0 &&
    (!buyerCustomerUid || !earnRecipientUid || buyerCustomerUid !== earnRecipientUid)
      ? eventPointsAssigned
      : 0;

  return {
    status: params.status,
    fulfillmentStatus: params.status,
    readinessReasonCodes: params.readinessReasonCodes ?? [],
    readyAt: params.status === "ready" ? params.now : null,
    deliveredAt: params.status === "delivered" ? params.now : null,
    cancelledAt: params.status === "cancelled" ? params.now : null,
    ...(params.rewards
      ? {
          pointsRedeemed: nonNegativeInteger(params.rewards.pointsRedeemed),
          pointsToEarn: nonNegativeInteger(
            params.rewards.customerPointsToEarn ?? params.rewards.pointsToEarn,
          ),
          eventPointsAssigned: customerVisibleEventPoints,
          rewardMode: cleanString(params.rewards.mode, 40) || "none",
          rewardStatus:
            nonNegativeInteger(
              params.rewards.customerPointsToEarn ?? params.rewards.pointsToEarn,
            ) > 0
              ? cleanString(params.rewards.earnStatus, 40) || "not_eligible"
              : "not_eligible",
          eventRewardStatus:
            customerVisibleEventPoints > 0
              ? cleanString(params.rewards.earnStatus, 40) || "not_eligible"
              : "not_eligible",
          rewardRecipientType:
            cleanString(params.rewards.earnRecipientType, 40) || "customer",
          rewardRecipientUid:
            cleanString(params.rewards.earnRecipientUid, 160) || null,
          rewardRecipientName:
            cleanString(params.rewards.earnRecipientName, 120) || null,
          rewardRedemptionStatus:
            cleanString(params.rewards.redemptionStatus, 40) || "none",
        }
      : {}),
    updatedAt: params.now,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const clean = cleanRequest(body);
    const actor = await authorizeSeller({
      token: bearerToken(request),
      sellerId: clean.sellerId,
    });
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(clean.sellerId);
    const eventRef = clean.source === "event"
      ? sellerRef.collection("events").doc(clean.eventId)
      : null;
    const orderRef = clean.source === "event"
      ? eventRef!.collection("orders").doc(clean.orderId)
      : sellerRef.collection("storeOrders").doc(clean.orderId);
    const now = admin.firestore.Timestamp.now();

    const result = await db.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) {
        throw new StatusError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
      }

      const orderData = orderSnapshot.data() ?? {};
      const customerOrderRef = customerOrderIndexRef(db, orderData);
      const currentStatus = normalizeCurrentStatus(
        orderData.fulfillmentStatus ?? orderData.status,
      );

      if (currentStatus === clean.status) {
        if (customerOrderRef) {
          transaction.set(
            customerOrderRef,
            customerOrderIndexPayload({
              status: currentStatus,
              rewards: record(orderData.rewards),
              readinessReasonCodes: Array.isArray(record(orderData.readiness).reasonCodes)
                ? (record(orderData.readiness).reasonCodes as unknown[])
                    .map((value) => cleanString(value, 80))
                    .filter(Boolean)
                : [],
              now,
            }),
            { merge: true },
          );
        }

        return {
          ok: true as const,
          status: currentStatus,
          replayed: true,
          inventoryState: record(orderData.inventoryState),
          shortages: [] as Array<{ productId: string; quantity: number }>,
        };
      }

      if (currentStatus === "delivered") {
        throw new StatusError(
          "TERMINAL_ORDER",
          "Um pedido entregue não pode voltar para outro status.",
          409,
        );
      }
      if (currentStatus === "cancelled") {
        throw new StatusError(
          "TERMINAL_ORDER",
          "Um pedido cancelado não pode ser reaberto.",
          409,
        );
      }

      const rewardRefs = rewardTransitionRefs({
        db,
        orderData,
        sellerId: clean.sellerId,
        orderId: clean.orderId,
        requestedStatus: clean.status,
      });
      let rewardWalletSnapshot: admin.firestore.DocumentSnapshot | null = null;
      let rewardMovementSnapshot: admin.firestore.DocumentSnapshot | null = null;
      if (rewardRefs.walletRef && rewardRefs.movementRef) {
        const rewardSnapshots = await transaction.getAll(
          rewardRefs.walletRef,
          rewardRefs.movementRef,
        );
        rewardWalletSnapshot = rewardSnapshots[0];
        rewardMovementSnapshot = rewardSnapshots[1];
      }
      const rewardContext: RewardTransitionContext = {
        ...rewardRefs,
        walletSnapshot: rewardWalletSnapshot,
        movementSnapshot: rewardMovementSnapshot,
      };

      const usesInventoryItems = Array.isArray(orderData.inventoryItems) && orderData.inventoryItems.length > 0;
      const rawItems = usesInventoryItems
        ? orderData.inventoryItems as unknown[]
        : Array.isArray(orderData.items) ? orderData.items : [];
      const items = rawItems
        .map(parseManagedItem)
        .filter((item): item is ManagedItem => item !== null);
      const inventoryManaged = orderData.inventoryManaged === true;

      // Pedidos anteriores ao 03B.3 continuam operáveis sem movimentar estoque.
      if (!inventoryManaged || items.length === 0) {
        const nextRewards = applyRewardTransition({
          transaction,
          context: rewardContext,
          requestedStatus: clean.status,
          orderData,
          sellerId: clean.sellerId,
          orderId: clean.orderId,
          orderPath: orderRef.path,
          orderSource: clean.source,
          eventId: clean.eventId,
          now,
        });
        transaction.update(orderRef, {
          rewards: nextRewards,
          status: clean.status,
          fulfillmentStatus: clean.status,
          deliveredAt: clean.status === "delivered" ? now : null,
          cancelledAt: clean.status === "cancelled" ? now : null,
          history: admin.firestore.FieldValue.arrayUnion({
            status: clean.status,
            createdAt: now,
            updatedBy: actor.actor,
            note: clean.note || "legacy_inventory_unmanaged",
          }),
          sellerUnread: false,
          sellerReadAt: now,
          updatedAt: now,
          updatedBy: actor.actor,
        });

        if (customerOrderRef) {
          transaction.set(
            customerOrderRef,
            customerOrderIndexPayload({ status: clean.status, rewards: nextRewards, now }),
            { merge: true },
          );
        }

        return {
          ok: true as const,
          status: clean.status,
          replayed: false,
          inventoryState: record(orderData.inventoryState),
          shortages: [] as Array<{ productId: string; quantity: number }>,
        };
      }

      const productRefs = items.map((item) =>
        sellerRef.collection("products").doc(item.productId),
      );
      const productSnapshots = await transaction.getAll(...productRefs);
      const shortages: Array<{ productId: string; quantity: number }> = [];

      if (clean.status === "ready") {
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];

          if (item.madeToOrder) {
            if (
              item.productionRequired > 0 ||
              item.productionStatus !== "completed"
            ) {
              shortages.push({
                productId: item.productId,
                quantity: Math.max(
                  1,
                  item.productionRequired ||
                    Math.max(0, item.quantity - item.producedQuantity),
                ),
              });
            }
            continue;
          }

          if (!item.inventoryTracked) {
            item.shortageQuantity = 0;
            continue;
          }

          const productSnapshot = productSnapshots[index];
          if (!productSnapshot.exists) {
            shortages.push({
              productId: item.productId,
              quantity: Math.max(0, item.quantity - item.reservedQuantity),
            });
            continue;
          }

          const productData = productSnapshot.data() ?? {};
          const inventory = normalizeProductInventory(
            productData.inventory,
            productData.stockQty ?? productData.stock,
            productData.lowStockThreshold,
          );
          const remaining = Math.max(0, item.quantity - item.reservedQuantity);
          const reserveNow = Math.min(remaining, inventory.available);

          if (reserveNow > 0) {
            const nextInventory = {
              tracked: true,
              quantity: inventory.quantity,
              reserved: inventory.reserved + reserveNow,
              lowStockThreshold: inventory.lowStockThreshold,
            };
            transaction.set(
              productRefs[index],
              {
                inventory: nextInventory,
                stockQty: inventory.quantity,
                updatedAt: now,
              },
              { merge: true },
            );
            const movementRef = sellerRef
              .collection("inventoryMovements")
              .doc(
                `${clean.orderId}_${item.productId}_reserve_completion_${item.reservedQuantity}_${reserveNow}`,
              );
            transaction.create(movementRef, {
              schemaVersion: 2,
              type: "reserve_completion",
              sellerId: clean.sellerId,
              productId: item.productId,
              orderId: clean.orderId,
              orderSource: clean.source,
              eventId: clean.eventId || null,
              quantity: reserveNow,
              before: movementSnapshot(inventory),
              after: movementSnapshot(nextInventory),
              createdAt: now,
              createdBy: actor.actor,
            });
            item.reservedQuantity += reserveNow;
          }

          item.shortageQuantity = Math.max(
            0,
            item.quantity - item.reservedQuantity,
          );
          item.productionRequired = item.shortageQuantity;
          if (item.shortageQuantity > 0) {
            shortages.push({
              productId: item.productId,
              quantity: item.shortageQuantity,
            });
          }
        }
      } else if (clean.status === "delivered") {
        if (currentStatus !== "ready") {
          throw new StatusError(
            "ORDER_NOT_READY",
            "Marque o pedido como pronto antes de entregá-lo.",
            409,
          );
        }

        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (item.madeToOrder || !item.inventoryTracked) continue;

          if (item.reservedQuantity < item.quantity) {
            throw new StatusError(
              "ORDER_NOT_READY",
              "O pedido ainda não possui todo o estoque reservado.",
              409,
            );
          }

          const productSnapshot = productSnapshots[index];
          if (!productSnapshot.exists) {
            throw new StatusError(
              "PRODUCT_UNAVAILABLE",
              "Um produto reservado não existe mais.",
              409,
            );
          }
          const productData = productSnapshot.data() ?? {};
          const inventory = normalizeProductInventory(
            productData.inventory,
            productData.stockQty ?? productData.stock,
            productData.lowStockThreshold,
          );
          const consumeQuantity = item.quantity;
          if (
            inventory.quantity < consumeQuantity ||
            inventory.reserved < consumeQuantity
          ) {
            throw new StatusError(
              "INVENTORY_CONFLICT",
              "O estoque reservado foi alterado. Revise o produto antes de entregar.",
              409,
            );
          }

          const nextInventory = {
            tracked: true,
            quantity: inventory.quantity - consumeQuantity,
            reserved: inventory.reserved - consumeQuantity,
            lowStockThreshold: inventory.lowStockThreshold,
          };
          transaction.set(
            productRefs[index],
            {
              inventory: nextInventory,
              stockQty: nextInventory.quantity,
              updatedAt: now,
            },
            { merge: true },
          );
          const movementRef = sellerRef
            .collection("inventoryMovements")
            .doc(`${clean.orderId}_${item.productId}_consume`);
          transaction.create(movementRef, {
            schemaVersion: 2,
            type: "consume",
            sellerId: clean.sellerId,
            productId: item.productId,
            orderId: clean.orderId,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            quantity: consumeQuantity,
            before: movementSnapshot(inventory),
            after: movementSnapshot(nextInventory),
            createdAt: now,
            createdBy: actor.actor,
          });
          item.consumedQuantity = consumeQuantity;
          item.reservedQuantity = 0;
          item.shortageQuantity = 0;
        }
      } else if (clean.status === "cancelled") {
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (
            item.madeToOrder ||
            !item.inventoryTracked ||
            item.reservedQuantity <= 0
          ) {
            continue;
          }

          const productSnapshot = productSnapshots[index];
          if (!productSnapshot.exists) continue;
          const productData = productSnapshot.data() ?? {};
          const inventory = normalizeProductInventory(
            productData.inventory,
            productData.stockQty ?? productData.stock,
            productData.lowStockThreshold,
          );
          const releaseQuantity = Math.min(
            item.reservedQuantity,
            inventory.reserved,
          );
          if (releaseQuantity <= 0) continue;

          const nextInventory = {
            tracked: true,
            quantity: inventory.quantity,
            reserved: inventory.reserved - releaseQuantity,
            lowStockThreshold: inventory.lowStockThreshold,
          };
          transaction.set(
            productRefs[index],
            {
              inventory: nextInventory,
              stockQty: inventory.quantity,
              updatedAt: now,
            },
            { merge: true },
          );
          const movementRef = sellerRef
            .collection("inventoryMovements")
            .doc(`${clean.orderId}_${item.productId}_release`);
          transaction.create(movementRef, {
            schemaVersion: 2,
            type: "release",
            sellerId: clean.sellerId,
            productId: item.productId,
            orderId: clean.orderId,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            quantity: releaseQuantity,
            before: movementSnapshot(inventory),
            after: movementSnapshot(nextInventory),
            createdAt: now,
            createdBy: actor.actor,
          });
          item.releasedQuantity += releaseQuantity;
          item.reservedQuantity = Math.max(
            0,
            item.reservedQuantity - releaseQuantity,
          );
        }
      }

      const nextStatus: FulfillmentStatus =
        clean.status === "ready" && shortages.length > 0
          ? "pending"
          : clean.status;
      const nextRewards = applyRewardTransition({
        transaction,
        context: rewardContext,
        requestedStatus: nextStatus,
        orderData,
        sellerId: clean.sellerId,
        orderId: clean.orderId,
        orderPath: orderRef.path,
        orderSource: clean.source,
        eventId: clean.eventId,
        now,
      });
      const serializedItems = items.map(serializeItem);
      const inventoryState = aggregateInventory(items);
      const hasMadeToOrderItems = items.some((item) => item.madeToOrder);
      const hasPendingProduction = items.some(
        (item) => item.productionRequired > 0,
      );
      const hasStockShortage = items.some((item) => item.shortageQuantity > 0);

      transaction.update(orderRef, {
        rewards: nextRewards,
        ...(usesInventoryItems ? { inventoryItems: serializedItems } : { items: serializedItems }),
        status: nextStatus,
        fulfillmentStatus: nextStatus,
        inventoryState,
        readiness: {
          hasMadeToOrderItems,
          hasPendingProduction,
          hasStockShortage,
          reasonCodes: [
            ...(hasMadeToOrderItems && hasPendingProduction && nextStatus === "pending"
              ? ["made_to_order"]
              : []),
            ...(hasStockShortage && nextStatus === "pending"
              ? ["stock_shortage"]
              : []),
          ],
        },
        deliveredAt: nextStatus === "delivered" ? now : null,
        cancelledAt: nextStatus === "cancelled" ? now : null,
        history: admin.firestore.FieldValue.arrayUnion({
          status: nextStatus,
          createdAt: now,
          updatedBy: actor.actor,
          note:
            clean.note ||
            (shortages.length > 0
              ? `stock_shortage:${shortages
                  .map((item) => `${item.productId}:${item.quantity}`)
                  .join(",")}`
              : `inventory_${nextStatus}`),
        }),
        sellerUnread: false,
        sellerReadAt: now,
        updatedAt: now,
        updatedBy: actor.actor,
      });

      if (customerOrderRef) {
        transaction.set(
          customerOrderRef,
          customerOrderIndexPayload({
            status: nextStatus,
            rewards: nextRewards,
            readinessReasonCodes: [
              ...(hasMadeToOrderItems && hasPendingProduction && nextStatus === "pending"
                ? ["made_to_order"]
                : []),
              ...(hasStockShortage && nextStatus === "pending"
                ? ["stock_shortage"]
                : []),
            ],
            now,
          }),
          { merge: true },
        );
      }

      return {
        ok: shortages.length === 0,
        status: nextStatus,
        replayed: false,
        inventoryState,
        shortages,
      };
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ...result,
          ok: false,
          code: "STOCK_SHORTAGE",
          error: "Ainda há produção ou estoque pendente para deixar o pedido pronto.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StatusError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    console.error("[api/orders/status] Falha inesperada:", error);
    return NextResponse.json(
      {
        ok: false,
        code: "STATUS_UPDATE_FAILED",
        error: "Não foi possível alterar o status do pedido.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

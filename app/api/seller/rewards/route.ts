import { createHash } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class SellerRewardsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SellerRewardsError";
    this.code = code;
    this.status = status;
  }
}

type AuthorizedSeller = {
  db: admin.firestore.Firestore;
  decoded: admin.auth.DecodedIdToken;
  actor: string;
  sellerData: Record<string, unknown>;
};

type ResolvedRewardAccount = {
  authUser: admin.auth.UserRecord;
  customerRef: admin.firestore.DocumentReference;
  customerData: Record<string, unknown>;
};

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

function positiveInteger(value: unknown, maximum = 1_000_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(parsed)));
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

function validSellerId(value: unknown): string {
  const sellerId = cleanString(value, 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new SellerRewardsError("INVALID_SELLER", "Seller inválido.");
  }
  return sellerId;
}

async function authorizeSeller(
  request: NextRequest,
  sellerId: string,
): Promise<AuthorizedSeller> {
  const token = bearerToken(request);
  if (!token) {
    throw new SellerRewardsError(
      "AUTH_REQUIRED",
      "Entre novamente para gerenciar os pontos.",
      401,
    );
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new SellerRewardsError(
      "AUTH_REQUIRED",
      "Sua sessão expirou. Entre novamente.",
      401,
    );
  }

  const db = getAdminDb();
  const [userSnapshot, sellerSnapshot] = await db.getAll(
    db.collection("users").doc(decoded.uid),
    db.collection("sellers").doc(sellerId),
  );
  const userData = userSnapshot.data() ?? {};
  const sellerData = sellerSnapshot.data() ?? {};
  const adminUser = userData.role === "admin" && userData.accountStatus === "active";
  const owner =
    decoded.uid === sellerId ||
    userData.sellerId === sellerId ||
    sellerData.ownerUid === decoded.uid;

  if (!sellerSnapshot.exists) {
    throw new SellerRewardsError("SELLER_NOT_FOUND", "Seller não encontrado.", 404);
  }
  if (!adminUser && !owner) {
    throw new SellerRewardsError(
      "FORBIDDEN",
      "Você não pode gerenciar os pontos desta loja.",
      403,
    );
  }

  return {
    db,
    decoded,
    actor: cleanString(decoded.email, 240) || decoded.uid,
    sellerData,
  };
}

async function findCustomerUidByStoredIdentifier(
  db: admin.firestore.Firestore,
  identifier: string,
): Promise<string> {
  const normalizedEmail = identifier.toLowerCase();
  const candidateQueries: admin.firestore.Query[] = [];

  if (identifier.includes("@")) {
    candidateQueries.push(
      db.collection("customers").where("email", "==", normalizedEmail).limit(2),
    );
  } else {
    candidateQueries.push(
      db.collection("customers").where("phone", "==", identifier).limit(2),
    );
  }

  for (const query of candidateQueries) {
    const snapshot = await query.get();
    if (snapshot.size === 1) return snapshot.docs[0].id;
    if (snapshot.size > 1) {
      throw new SellerRewardsError(
        "AMBIGUOUS_ACCOUNT",
        "Mais de uma conta corresponde a esse dado. Use o e-mail exato ou o UID.",
        409,
      );
    }
  }

  return "";
}

async function resolveRewardAccount(
  db: admin.firestore.Firestore,
  rawIdentifier: unknown,
): Promise<ResolvedRewardAccount> {
  const identifier = cleanString(rawIdentifier, 240);
  if (!identifier) {
    throw new SellerRewardsError(
      "IDENTIFIER_REQUIRED",
      "Informe o e-mail, telefone internacional ou UID da conta.",
    );
  }

  const auth = getAdminAuth();
  let authUser: admin.auth.UserRecord | null = null;

  try {
    if (identifier.includes("@")) {
      authUser = await auth.getUserByEmail(identifier.toLowerCase());
    } else if (identifier.startsWith("+")) {
      authUser = await auth.getUserByPhoneNumber(identifier);
    } else {
      authUser = await auth.getUser(identifier);
    }
  } catch {
    const storedUid = await findCustomerUidByStoredIdentifier(db, identifier);
    if (storedUid) {
      try {
        authUser = await auth.getUser(storedUid);
      } catch {
        authUser = null;
      }
    }
  }

  if (!authUser || authUser.disabled) {
    throw new SellerRewardsError(
      "ACCOUNT_NOT_FOUND",
      "Conta não encontrada ou desativada. Confirme o e-mail usado no login.",
      404,
    );
  }

  const customerRef = db.collection("customers").doc(authUser.uid);
  const customerSnapshot = await customerRef.get();
  const customerData = customerSnapshot.data() ?? {};
  if (customerData.accountStatus === "disabled") {
    throw new SellerRewardsError(
      "ACCOUNT_DISABLED",
      "A conta de cliente está desativada.",
      409,
    );
  }

  return { authUser, customerRef, customerData };
}

function sellerCurrency(sellerData: Record<string, unknown>): "JPY" | "BRL" | "USD" {
  const regional = record(sellerData.regional);
  const currency = cleanString(regional.currency ?? sellerData.currency, 8);
  return currency === "BRL" || currency === "USD" ? currency : "JPY";
}

function accountPayload(params: {
  account: ResolvedRewardAccount;
  walletData: Record<string, unknown>;
  sellerId: string;
}) {
  const { account, walletData, sellerId } = params;
  const name =
    cleanString(account.customerData.name ?? account.customerData.displayName, 120) ||
    cleanString(account.authUser.displayName, 120);
  const email =
    cleanString(account.customerData.email, 240).toLowerCase() ||
    cleanString(account.authUser.email, 240).toLowerCase();
  const phone =
    cleanString(account.customerData.phone, 50) ||
    cleanString(account.authUser.phoneNumber, 50);

  return {
    uid: account.authUser.uid,
    name,
    email,
    phone,
    photoURL:
      cleanString(account.customerData.photoURL, 2000) ||
      cleanString(account.authUser.photoURL, 2000),
    accountStatus:
      account.customerData.accountStatus === "disabled" ? "disabled" : "active",
    sellerId,
    pointsBalance: nonNegativeInteger(walletData.pointsBalance),
    lifetimeEarned: nonNegativeInteger(walletData.lifetimeEarned),
    lifetimeGifted: nonNegativeInteger(walletData.lifetimeGifted),
    lifetimeRedeemed: nonNegativeInteger(walletData.lifetimeRedeemed),
  };
}

function serializeGift(document: admin.firestore.QueryDocumentSnapshot) {
  const data = document.data() ?? {};
  return {
    id: document.id,
    type: "gift" as const,
    customerUid: cleanString(data.customerUid, 160),
    customerName: cleanString(data.customerName, 120),
    customerEmail: cleanString(data.customerEmail, 240),
    customerPhone: cleanString(data.customerPhone, 50),
    points: nonNegativeInteger(data.points),
    balanceBefore: nonNegativeInteger(data.balanceBefore),
    balanceAfter: nonNegativeInteger(data.balanceAfter),
    reason: cleanString(data.reason, 500),
    createdBy: cleanString(data.createdBy, 240),
    createdByUid: cleanString(data.createdByUid, 160),
    createdAt: timestampIso(data.createdAt),
  };
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = validSellerId(request.nextUrl.searchParams.get("sellerId"));
    const authorized = await authorizeSeller(request, sellerId);
    const identifier = cleanString(
      request.nextUrl.searchParams.get("identifier"),
      240,
    );
    const historyLimit = Math.min(
      100,
      Math.max(1, nonNegativeInteger(request.nextUrl.searchParams.get("limit")) || 50),
    );

    const historyPromise = authorized.db
      .collection("sellers")
      .doc(sellerId)
      .collection("rewardAdjustments")
      .orderBy("createdAt", "desc")
      .limit(historyLimit)
      .get();

    let account = null;
    if (identifier) {
      const resolved = await resolveRewardAccount(authorized.db, identifier);
      const now = admin.firestore.Timestamp.now();
      await resolved.customerRef.set(
        {
          schemaVersion: 2,
          uid: resolved.authUser.uid,
          name:
            cleanString(resolved.customerData.name ?? resolved.customerData.displayName, 120) ||
            cleanString(resolved.authUser.displayName, 120) ||
            null,
          email:
            cleanString(resolved.customerData.email, 240).toLowerCase() ||
            cleanString(resolved.authUser.email, 240).toLowerCase() ||
            null,
          phone:
            cleanString(resolved.customerData.phone, 50) ||
            cleanString(resolved.authUser.phoneNumber, 50) ||
            null,
          photoURL:
            cleanString(resolved.customerData.photoURL, 2000) ||
            cleanString(resolved.authUser.photoURL, 2000) ||
            null,
          accountStatus: "active",
          updatedAt: now,
          ...(Object.keys(resolved.customerData).length === 0
            ? { createdAt: now, orderCount: 0 }
            : {}),
        },
        { merge: true },
      );
      const walletSnapshot = await resolved.customerRef
        .collection("rewardWallets")
        .doc(sellerId)
        .get();
      account = accountPayload({
        account: resolved,
        walletData: walletSnapshot.data() ?? {},
        sellerId,
      });
    }

    const historySnapshot = await historyPromise;
    return NextResponse.json(
      {
        ok: true,
        account,
        history: historySnapshot.docs.map(serializeGift),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof SellerRewardsError ? error.status : 500;
    const code = error instanceof SellerRewardsError ? error.code : "REWARDS_LOOKUP_FAILED";
    const message =
      error instanceof Error ? error.message : "Não foi possível consultar a conta.";
    if (!(error instanceof SellerRewardsError)) {
      console.error("[api/seller/rewards][GET] Unexpected error:", error);
    }
    return NextResponse.json(
      { ok: false, code, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = record(await request.json().catch(() => null));
    const sellerId = validSellerId(body.sellerId);
    const authorized = await authorizeSeller(request, sellerId);
    const points = positiveInteger(body.points);
    const reason = cleanString(body.reason, 500) || "Presente do seller";
    const clientRequestId = cleanString(body.clientRequestId, 160);

    if (points <= 0) {
      throw new SellerRewardsError(
        "INVALID_POINTS",
        "Informe uma quantidade de pontos maior que zero.",
      );
    }
    if (!clientRequestId || !/^[A-Za-z0-9_-]{8,160}$/.test(clientRequestId)) {
      throw new SellerRewardsError(
        "INVALID_REQUEST_ID",
        "Não foi possível identificar esta operação. Atualize a página e tente novamente.",
      );
    }

    const resolved = await resolveRewardAccount(
      authorized.db,
      body.customerUid ?? body.identifier,
    );
    const now = admin.firestore.Timestamp.now();
    const sellerRef = authorized.db.collection("sellers").doc(sellerId);
    const walletRef = resolved.customerRef.collection("rewardWallets").doc(sellerId);
    const movementId = `gift_${createHash("sha256")
      .update(`${sellerId}:${clientRequestId}`)
      .digest("hex")
      .slice(0, 40)}`;
    const walletMovementRef = walletRef.collection("transactions").doc(movementId);
    const auditRef = sellerRef.collection("rewardAdjustments").doc(movementId);
    const directoryRef = sellerRef.collection("customerDirectory").doc(resolved.authUser.uid);

    const result = await authorized.db.runTransaction(async (transaction) => {
      const [customerSnapshot, walletSnapshot, auditSnapshot] = await transaction.getAll(
        resolved.customerRef,
        walletRef,
        auditRef,
      );
      const existingAudit = auditSnapshot.data() ?? {};
      if (auditSnapshot.exists) {
        if (
          cleanString(existingAudit.customerUid, 160) !== resolved.authUser.uid ||
          nonNegativeInteger(existingAudit.points) !== points ||
          cleanString(existingAudit.reason, 500) !== reason
        ) {
          throw new SellerRewardsError(
            "IDEMPOTENCY_CONFLICT",
            "Esta operação já foi usada com outros dados.",
            409,
          );
        }
        return {
          replayed: true,
          movementId,
          balanceBefore: nonNegativeInteger(existingAudit.balanceBefore),
          balanceAfter: nonNegativeInteger(existingAudit.balanceAfter),
        };
      }

      const customerData = customerSnapshot.data() ?? resolved.customerData;
      if (customerData.accountStatus === "disabled") {
        throw new SellerRewardsError(
          "ACCOUNT_DISABLED",
          "A conta de cliente está desativada.",
          409,
        );
      }
      const walletData = walletSnapshot.data() ?? {};
      const balanceBefore = nonNegativeInteger(walletData.pointsBalance);
      const balanceAfter = balanceBefore + points;
      if (balanceAfter > 2_000_000_000) {
        throw new SellerRewardsError(
          "BALANCE_LIMIT",
          "O saldo da conta ultrapassaria o limite permitido.",
          409,
        );
      }

      const name =
        cleanString(customerData.name ?? customerData.displayName, 120) ||
        cleanString(resolved.authUser.displayName, 120);
      const email =
        cleanString(customerData.email, 240).toLowerCase() ||
        cleanString(resolved.authUser.email, 240).toLowerCase();
      const phone =
        cleanString(customerData.phone, 50) ||
        cleanString(resolved.authUser.phoneNumber, 50);
      const storeName =
        cleanString(authorized.sellerData.storeName ?? authorized.sellerData.displayName, 160) ||
        "Loja";
      const currency = sellerCurrency(authorized.sellerData);

      transaction.set(
        resolved.customerRef,
        {
          schemaVersion: 2,
          uid: resolved.authUser.uid,
          name: name || null,
          email: email || null,
          phone: phone || null,
          photoURL:
            cleanString(customerData.photoURL, 2000) ||
            cleanString(resolved.authUser.photoURL, 2000) ||
            null,
          accountStatus: "active",
          updatedAt: now,
          ...(customerSnapshot.exists ? {} : { createdAt: now, orderCount: 0 }),
        },
        { merge: true },
      );

      transaction.set(
        walletRef,
        {
          schemaVersion: 2,
          customerUid: resolved.authUser.uid,
          sellerId,
          storeName,
          currency,
          pointsBalance: balanceAfter,
          lifetimeEarned: nonNegativeInteger(walletData.lifetimeEarned),
          lifetimeGifted: nonNegativeInteger(walletData.lifetimeGifted) + points,
          lifetimeRedeemed: nonNegativeInteger(walletData.lifetimeRedeemed),
          lifetimeRefunded: nonNegativeInteger(walletData.lifetimeRefunded),
          updatedAt: now,
          ...(walletSnapshot.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );

      transaction.create(walletMovementRef, {
        schemaVersion: 2,
        type: "gift",
        points,
        balanceBefore,
        balanceAfter,
        sellerId,
        customerUid: resolved.authUser.uid,
        orderId: null,
        orderPath: null,
        orderSource: null,
        eventId: null,
        label: reason,
        reason,
        createdBy: authorized.actor,
        createdByUid: authorized.decoded.uid,
        createdAt: now,
      });

      transaction.create(auditRef, {
        schemaVersion: 2,
        type: "gift",
        movementId,
        sellerId,
        customerUid: resolved.authUser.uid,
        customerName: name || null,
        customerEmail: email || null,
        customerPhone: phone || null,
        points,
        balanceBefore,
        balanceAfter,
        reason,
        createdBy: authorized.actor,
        createdByUid: authorized.decoded.uid,
        createdAt: now,
      });

      transaction.set(
        directoryRef,
        {
          schemaVersion: 1,
          customerUid: resolved.authUser.uid,
          name: name || null,
          email: email || null,
          phone: phone || null,
          pointsBalance: balanceAfter,
          lastRewardGiftAt: now,
          updatedAt: now,
          ...(customerSnapshot.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );

      return { replayed: false, movementId, balanceBefore, balanceAfter };
    });

    return NextResponse.json(
      {
        ok: true,
        ...result,
        account: {
          uid: resolved.authUser.uid,
          name:
            cleanString(resolved.customerData.name ?? resolved.customerData.displayName, 120) ||
            cleanString(resolved.authUser.displayName, 120),
          email:
            cleanString(resolved.customerData.email, 240).toLowerCase() ||
            cleanString(resolved.authUser.email, 240).toLowerCase(),
          phone:
            cleanString(resolved.customerData.phone, 50) ||
            cleanString(resolved.authUser.phoneNumber, 50),
          pointsBalance: result.balanceAfter,
        },
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const status = error instanceof SellerRewardsError ? error.status : 500;
    const code = error instanceof SellerRewardsError ? error.code : "REWARD_GIFT_FAILED";
    const message =
      error instanceof Error ? error.message : "Não foi possível presentear os pontos.";
    if (!(error instanceof SellerRewardsError)) {
      console.error("[api/seller/rewards][POST] Unexpected error:", error);
    }
    return NextResponse.json(
      { ok: false, code, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

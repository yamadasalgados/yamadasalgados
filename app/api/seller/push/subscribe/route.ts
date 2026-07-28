import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Language = "pt" | "en" | "ja";

class SellerPushError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SellerPushError";
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

function languageOf(value: unknown): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function endpointId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) {
    throw new SellerPushError("AUTH_REQUIRED", "Entre novamente para ativar as notificações.", 401);
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new SellerPushError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
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

  if (!adminUser && !owner) {
    throw new SellerPushError("FORBIDDEN", "Você não pode ativar notificações para esta loja.", 403);
  }

  return { decoded, db };
}

export async function POST(request: NextRequest) {
  try {
    const body = record(await request.json().catch(() => null));
    const sellerId = cleanString(body.sellerId, 160);
    const subscription = record(body.subscription);
    const keys = record(subscription.keys);
    const endpoint = cleanString(subscription.endpoint, 4096);
    const p256dh = cleanString(keys.p256dh, 2048);
    const auth = cleanString(keys.auth, 2048);
    const language = languageOf(body.language);
    const vapidFingerprint = cleanString(body.vapidFingerprint, 64);

    if (!sellerId || sellerId.includes("/")) {
      throw new SellerPushError("INVALID_SELLER", "Loja inválida.");
    }
    if (!endpoint || !p256dh || !auth || !/^https:\/\//i.test(endpoint)) {
      throw new SellerPushError("INVALID_SUBSCRIPTION", "A assinatura de notificações é inválida.");
    }
    if (vapidFingerprint && !/^[a-f0-9]{16,64}$/i.test(vapidFingerprint)) {
      throw new SellerPushError("INVALID_FINGERPRINT", "A identificação da chave pública é inválida.");
    }

    const { decoded, db } = await authorizeSeller(request, sellerId);
    const id = endpointId(endpoint);
    const sellerRef = db.collection("sellers").doc(sellerId);
    const subscriptionRef = sellerRef.collection("pushSubscriptions").doc(id);
    const endpointRef = db.collection("sellerPushEndpoints").doc(id);
    const now = admin.firestore.Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const [endpointSnapshot, subscriptionSnapshot] = await transaction.getAll(
        endpointRef,
        subscriptionRef,
      );
      const previousSellerId = cleanString(endpointSnapshot.data()?.sellerId, 160);
      if (previousSellerId && previousSellerId !== sellerId && !previousSellerId.includes("/")) {
        transaction.delete(
          db.collection("sellers").doc(previousSellerId).collection("pushSubscriptions").doc(id),
        );
      }

      transaction.set(
        subscriptionRef,
        {
          schemaVersion: 1,
          sellerId,
          ownerUid: decoded.uid,
          endpoint,
          keys: { p256dh, auth },
          language,
          vapidFingerprint,
          userAgent: cleanString(request.headers.get("user-agent"), 600),
          createdAt: subscriptionSnapshot.exists
            ? subscriptionSnapshot.data()?.createdAt ?? now
            : now,
          updatedAt: now,
        },
        { merge: true },
      );

      transaction.set(
        endpointRef,
        {
          schemaVersion: 1,
          sellerId,
          endpoint,
          updatedAt: now,
        },
        { merge: true },
      );

      transaction.set(
        sellerRef,
        {
          notifications: {
            newOrdersEnabled: true,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true, subscriptionId: id });
  } catch (error) {
    if (error instanceof SellerPushError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }

    console.error("[seller-push] subscribe failed", error);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível ativar as notificações agora." },
      { status: 500 },
    );
  }
}

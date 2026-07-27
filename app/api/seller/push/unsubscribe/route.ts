import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) throw new SellerPushError("AUTH_REQUIRED", "Entre novamente.", 401);

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
  const owner = decoded.uid === sellerId || userData.sellerId === sellerId || sellerData.ownerUid === decoded.uid;
  if (!adminUser && !owner) throw new SellerPushError("FORBIDDEN", "Acesso negado.", 403);

  return { db };
}

export async function POST(request: NextRequest) {
  try {
    const body = record(await request.json().catch(() => null));
    const sellerId = cleanString(body.sellerId, 160);
    const endpoint = cleanString(body.endpoint, 4096);
    if (!sellerId || sellerId.includes("/")) {
      throw new SellerPushError("INVALID_SELLER", "Loja inválida.");
    }

    const { db } = await authorizeSeller(request, sellerId);
    if (!endpoint) return NextResponse.json({ ok: true, removed: false });

    const id = createHash("sha256").update(endpoint).digest("hex");
    const sellerRef = db.collection("sellers").doc(sellerId);
    const subscriptionRef = sellerRef.collection("pushSubscriptions").doc(id);
    const endpointRef = db.collection("sellerPushEndpoints").doc(id);
    const now = admin.firestore.Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const endpointSnapshot = await transaction.get(endpointRef);
      transaction.delete(subscriptionRef);
      if (endpointSnapshot.data()?.sellerId === sellerId) transaction.delete(endpointRef);
      transaction.set(
        sellerRef,
        { notificationsLastChangedAt: now, updatedAt: now },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    if (error instanceof SellerPushError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    console.error("[seller-push] unsubscribe failed", error);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível desativar as notificações." },
      { status: 500 },
    );
  }
}

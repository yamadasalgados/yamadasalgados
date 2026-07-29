import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrActiveSellerOwnerRecord } from "@/app/lib/seller-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Language = "pt" | "en" | "ja";

class PushTestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PushTestError";
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

async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) throw new PushTestError("AUTH_REQUIRED", "Entre novamente.", 401);

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new PushTestError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
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

  if (!authorized) {
    throw new PushTestError("FORBIDDEN", "Acesso negado.", 403);
  }

  return { decoded, db };
}

function responseFromError(error: unknown) {
  if (error instanceof PushTestError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }
  console.error("[seller-push-test] failed", error);
  return NextResponse.json(
    { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível executar o teste." },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = record(await request.json().catch(() => null));
    const sellerId = cleanString(body.sellerId, 160);
    const subscriptionId = cleanString(body.subscriptionId, 128);
    const clientVapidFingerprint = cleanString(body.clientVapidFingerprint, 64);
    const language = languageOf(body.language);

    if (!sellerId || sellerId.includes("/")) {
      throw new PushTestError("INVALID_SELLER", "Loja inválida.");
    }
    if (!/^[a-f0-9]{64}$/i.test(subscriptionId)) {
      throw new PushTestError("INVALID_SUBSCRIPTION", "Assinatura inválida.");
    }
    if (clientVapidFingerprint && !/^[a-f0-9]{16,64}$/i.test(clientVapidFingerprint)) {
      throw new PushTestError("INVALID_FINGERPRINT", "Identificação VAPID inválida.");
    }

    const { decoded, db } = await authorizeSeller(request, sellerId);
    const subscriptionRef = db
      .collection("sellers")
      .doc(sellerId)
      .collection("pushSubscriptions")
      .doc(subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) {
      throw new PushTestError(
        "NO_SUBSCRIPTION",
        "A assinatura deste aparelho não foi encontrada.",
        404,
      );
    }

    const requestRef = db.collection("pushTestRequests").doc();
    const now = admin.firestore.Timestamp.now();
    await requestRef.set({
      schemaVersion: 1,
      targetType: "seller",
      targetId: sellerId,
      requestedByUid: decoded.uid,
      subscriptionId,
      language,
      clientVapidFingerprint,
      status: "queued",
      code: "QUEUED",
      message: "Teste aguardando processamento.",
      sentCount: 0,
      failedCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    });

    return NextResponse.json({ ok: true, requestId: requestRef.id });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
    const requestId = cleanString(request.nextUrl.searchParams.get("requestId"), 128);
    if (!sellerId || sellerId.includes("/")) {
      throw new PushTestError("INVALID_SELLER", "Loja inválida.");
    }
    if (!requestId || requestId.includes("/")) {
      throw new PushTestError("INVALID_REQUEST", "Teste inválido.");
    }

    const { decoded, db } = await authorizeSeller(request, sellerId);
    const snapshot = await db.collection("pushTestRequests").doc(requestId).get();
    if (!snapshot.exists) {
      throw new PushTestError("TEST_NOT_FOUND", "Teste não encontrado.", 404);
    }
    const data = snapshot.data() ?? {};
    if (
      data.targetType !== "seller" ||
      data.targetId !== sellerId ||
      data.requestedByUid !== decoded.uid
    ) {
      throw new PushTestError("FORBIDDEN", "Acesso negado.", 403);
    }

    return NextResponse.json({
      ok: true,
      status: cleanString(data.status, 32) || "queued",
      code: cleanString(data.code, 80),
      message: cleanString(data.message, 500),
      sentCount: Number(data.sentCount) || 0,
      failedCount: Number(data.failedCount) || 0,
      serverVapidFingerprint: cleanString(data.serverVapidFingerprint, 64),
    });
  } catch (error) {
    return responseFromError(error);
  }
}

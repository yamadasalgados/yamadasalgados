import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Language = "pt" | "en" | "ja";

class PushSubscriptionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PushSubscriptionError";
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
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function endpointId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

async function authenticatedCustomer(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    throw new PushSubscriptionError(
      "AUTH_REQUIRED",
      "Entre novamente para ativar as notificações.",
      401,
    );
  }

  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new PushSubscriptionError(
      "AUTH_REQUIRED",
      "Sua sessão expirou. Entre novamente.",
      401,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticatedCustomer(request);
    const body = record(await request.json().catch(() => null));
    const subscription = record(body.subscription);
    const keys = record(subscription.keys);
    const endpoint = cleanString(subscription.endpoint, 4096);
    const p256dh = cleanString(keys.p256dh, 2048);
    const auth = cleanString(keys.auth, 2048);
    const language = languageOf(body.language);

    if (!endpoint || !p256dh || !auth || !/^https:\/\//i.test(endpoint)) {
      throw new PushSubscriptionError(
        "INVALID_SUBSCRIPTION",
        "A assinatura de notificações é inválida.",
      );
    }

    const db = getAdminDb();
    const id = endpointId(endpoint);
    const customerRef = db.collection("customers").doc(decoded.uid);
    const subscriptionRef = customerRef.collection("pushSubscriptions").doc(id);
    const endpointRef = db.collection("customerPushEndpoints").doc(id);
    const now = admin.firestore.Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const [customerSnapshot, endpointSnapshot, subscriptionSnapshot] =
        await transaction.getAll(customerRef, endpointRef, subscriptionRef);

      if (!customerSnapshot.exists) {
        throw new PushSubscriptionError(
          "CUSTOMER_NOT_FOUND",
          "A conta do cliente não foi encontrada.",
          404,
        );
      }

      const previousUid = cleanString(endpointSnapshot.data()?.customerUid, 160);
      if (previousUid && previousUid !== decoded.uid && !previousUid.includes("/")) {
        transaction.delete(
          db.collection("customers").doc(previousUid).collection("pushSubscriptions").doc(id),
        );
      }

      transaction.set(
        subscriptionRef,
        {
          schemaVersion: 1,
          customerUid: decoded.uid,
          endpoint,
          keys: { p256dh, auth },
          language,
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
          customerUid: decoded.uid,
          endpoint,
          updatedAt: now,
        },
        { merge: true },
      );

      transaction.set(
        customerRef,
        {
          notifications: {
            orderStatusEnabled: true,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true, subscriptionId: id });
  } catch (error) {
    if (error instanceof PushSubscriptionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }

    console.error("[customer-push] subscribe failed", error);
    return NextResponse.json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Não foi possível ativar as notificações agora.",
      },
      { status: 500 },
    );
  }
}

import * as admin from "firebase-admin";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function authenticatedCustomer(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    throw new PushSubscriptionError("AUTH_REQUIRED", "Entre novamente.", 401);
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
    const endpoint = cleanString(body.endpoint, 4096);

    if (!endpoint) {
      return NextResponse.json({ ok: true, removed: false });
    }

    const id = createHash("sha256").update(endpoint).digest("hex");
    const db = getAdminDb();
    const customerRef = db.collection("customers").doc(decoded.uid);
    const subscriptionRef = customerRef.collection("pushSubscriptions").doc(id);
    const endpointRef = db.collection("customerPushEndpoints").doc(id);
    const now = admin.firestore.Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const endpointSnapshot = await transaction.get(endpointRef);
      transaction.delete(subscriptionRef);

      if (endpointSnapshot.data()?.customerUid === decoded.uid) {
        transaction.delete(endpointRef);
      }

      transaction.set(
        customerRef,
        {
          notificationsLastChangedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    if (error instanceof PushSubscriptionError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }

    console.error("[customer-push] unsubscribe failed", error);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível desativar as notificações." },
      { status: 500 },
    );
  }
}

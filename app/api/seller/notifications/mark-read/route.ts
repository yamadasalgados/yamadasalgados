import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrActiveSellerOwnerRecord } from "@/app/lib/seller-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Scope = "store" | "event";

class MarkReadError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MarkReadError";
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

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) throw new MarkReadError("AUTH_REQUIRED", "Entre novamente.", 401);

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new MarkReadError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
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
  if (!authorized) throw new MarkReadError("FORBIDDEN", "Acesso negado.", 403);

  return { db, actor: cleanString(decoded.email, 240) || decoded.uid };
}

async function markDocumentsRead(params: {
  db: admin.firestore.Firestore;
  query: admin.firestore.Query;
  actor: string;
}): Promise<number> {
  let cleared = 0;

  while (true) {
    const snapshot = await params.query.limit(400).get();
    if (snapshot.empty) break;
    const batch = params.db.batch();
    const now = admin.firestore.Timestamp.now();
    for (const documentSnapshot of snapshot.docs) {
      batch.set(
        documentSnapshot.ref,
        {
          sellerUnread: false,
          sellerReadAt: now,
          updatedAt: now,
          updatedBy: params.actor,
        },
        { merge: true },
      );
      cleared += 1;
    }
    await batch.commit();
    if (snapshot.size < 400) break;
  }

  return cleared;
}

export async function POST(request: NextRequest) {
  try {
    const body = record(await request.json().catch(() => null));
    const sellerId = cleanString(body.sellerId, 160);
    const eventId = cleanString(body.eventId, 160);
    const scope: Scope = body.scope === "event" ? "event" : "store";

    if (!sellerId || sellerId.includes("/")) {
      throw new MarkReadError("INVALID_SELLER", "Loja inválida.");
    }
    if (scope === "event" && (!eventId || eventId.includes("/"))) {
      throw new MarkReadError("INVALID_EVENT", "Evento inválido.");
    }

    const { db, actor } = await authorizeSeller(request, sellerId);
    const sellerRef = db.collection("sellers").doc(sellerId);
    const unreadQuery = scope === "event"
      ? sellerRef.collection("events").doc(eventId).collection("orders").where("sellerUnread", "==", true)
      : sellerRef.collection("storeOrders").where("sellerUnread", "==", true);
    const cleared = await markDocumentsRead({ db, query: unreadQuery, actor });
    const stateRef = sellerRef.collection("notificationState").doc("orders");
    const now = admin.firestore.Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      const data = snapshot.data() ?? {};
      const currentStore = nonNegativeInteger(data.storeUnreadCount);
      const currentEvent = nonNegativeInteger(data.eventUnreadCount);
      const storeUnreadCount = scope === "store" ? Math.max(0, currentStore - cleared) : currentStore;
      const eventUnreadCount = scope === "event" ? Math.max(0, currentEvent - cleared) : currentEvent;
      transaction.set(
        stateRef,
        {
          schemaVersion: 1,
          unreadCount: storeUnreadCount + eventUnreadCount,
          storeUnreadCount,
          eventUnreadCount,
          updatedAt: now,
        },
        { merge: true },
      );
    });

    return NextResponse.json({ ok: true, cleared });
  } catch (error) {
    if (error instanceof MarkReadError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    console.error("[seller-notifications] mark read failed", error);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "Não foi possível limpar os avisos." },
      { status: 500 },
    );
  }
}

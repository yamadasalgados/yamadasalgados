import { createHash, timingSafeEqual } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class EventChatError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EventChatError";
    this.status = status;
  }
}

function cleanId(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized ||
    normalized.length > 160 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_.:-]+$/.test(normalized)
  ) {
    throw new EventChatError(`${label} inválido.`);
  }
  return normalized;
}

function cleanToken(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    throw new EventChatError("Acesso ao chat inválido.", 403);
  }
  return token;
}

function requestToken(request: NextRequest, fallback?: unknown): string {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return cleanToken(bearer ?? request.headers.get("x-order-chat-token") ?? fallback);
}

function cleanMessage(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new EventChatError("Digite uma mensagem.");
  if (text.length > 1500) {
    throw new EventChatError("A mensagem excede 1.500 caracteres.");
  }
  return text;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secureHashMatch(expected: unknown, token: string): boolean {
  const stored = typeof expected === "string" ? expected.trim() : "";
  const candidate = hashToken(token);
  if (!/^[a-f0-9]{64}$/.test(stored) || stored.length !== candidate.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(candidate, "hex"));
}

function timestampIso(value: unknown): string {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function resolveOrder(params: {
  sellerId: string;
  eventId: string;
  orderId: string;
  token: string;
}) {
  const db = getAdminDb();
  const orderRef = db
    .collection("sellers")
    .doc(params.sellerId)
    .collection("events")
    .doc(params.eventId)
    .collection("orders")
    .doc(params.orderId);
  const snapshot = await orderRef.get();

  if (!snapshot.exists) {
    throw new EventChatError("Pedido não encontrado.", 404);
  }

  const order = snapshot.data() ?? {};
  const chatAccess = asRecord(order.chatAccess);
  if (
    chatAccess.revokedAt ||
    !secureHashMatch(chatAccess.tokenHash, params.token)
  ) {
    throw new EventChatError("Acesso ao chat inválido ou expirado.", 403);
  }

  if (
    String(order.sellerId || "").trim() !== params.sellerId ||
    String(order.eventId || "").trim() !== params.eventId
  ) {
    throw new EventChatError("Pedido inconsistente.", 409);
  }

  return { db, orderRef, order };
}

function responseError(error: unknown) {
  const status = error instanceof EventChatError ? error.status : 500;
  const message = error instanceof Error
    ? error.message
    : "Não foi possível acessar o chat.";

  if (!(error instanceof EventChatError)) {
    console.error("[api/public/event-chat] Unexpected error:", error);
  }

  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = cleanId(request.nextUrl.searchParams.get("sellerId"), "Seller");
    const eventId = cleanId(request.nextUrl.searchParams.get("eventId"), "Evento");
    const orderId = cleanId(request.nextUrl.searchParams.get("orderId"), "Pedido");
    const token = requestToken(request);
    const { orderRef } = await resolveOrder({ sellerId, eventId, orderId, token });
    const snapshot = await orderRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(200)
      .get();

    return NextResponse.json(
      {
        ok: true,
        messages: snapshot.docs.map((document) => {
          const data = document.data() ?? {};
          return {
            id: document.id,
            text: typeof data.text === "string" ? data.text : "",
            senderId: typeof data.senderId === "string" ? data.senderId : "",
            senderRole: data.senderRole === "customer" ? "customer" : "seller",
            createdAt: timestampIso(data.createdAt),
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new EventChatError("O conteúdo deve ser JSON.", 415);
    }

    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input) throw new EventChatError("JSON inválido.");

    const sellerId = cleanId(input.sellerId, "Seller");
    const eventId = cleanId(input.eventId, "Evento");
    const orderId = cleanId(input.orderId, "Pedido");
    const token = requestToken(request, input.token);
    const text = cleanMessage(input.text);
    const { orderRef, order } = await resolveOrder({ sellerId, eventId, orderId, token });
    const now = admin.firestore.Timestamp.now();
    const senderId =
      String(order.customerUid || "").trim() ||
      String(order.customerClientId || "").trim() ||
      "guest";

    const messageRef = orderRef.collection("messages").doc();
    const batch = getAdminDb().batch();
    batch.create(messageRef, {
      schemaVersion: 1,
      text,
      senderId,
      senderRole: "customer",
      customerName: String(order.customerName || "").trim().slice(0, 120) || null,
      createdAt: now,
      createdBy: "public-event-chat-api",
    });
    batch.set(
      orderRef,
      {
        sellerUnread: true,
        lastMessageText: text.slice(0, 120),
        lastMessageAt: now,
        updatedAt: now,
        updatedBy: "public-event-chat-api",
      },
      { merge: true },
    );
    await batch.commit();

    return NextResponse.json(
      {
        ok: true,
        message: {
          id: messageRef.id,
          text,
          senderId,
          senderRole: "customer",
          createdAt: now.toDate().toISOString(),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}

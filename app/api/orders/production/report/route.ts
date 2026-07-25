import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MOVEMENTS = 5_000;
const MAX_RANGE_DAYS = 366;

type ReportLanguage = "pt" | "en" | "ja";
type OrderSource = "store" | "event";

type CleanRequest = {
  sellerId: string;
  startAt: Date;
  endAt: Date;
  language: ReportLanguage;
  timeZone: string;
};

type MovementRow = {
  id: string;
  productId: string;
  productName: string;
  orderId: string;
  orderSource: OrderSource;
  eventId: string;
  eventTitle: string;
  quantity: number;
  orderBecameReady: boolean;
  requestId: string;
  createdAt: string;
  createdAtMillis: number;
  createdBy: string;
  createdByUid: string;
  customerName: string;
  deliveryDate: string;
  issueCodes: string[];
};

class ReportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ReportError";
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

function parseDate(value: string, label: string): Date {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw new ReportError("INVALID_RANGE", `${label} inválida.`);
  }
  return date;
}

function cleanRequest(request: NextRequest): CleanRequest {
  const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
  const languageValue = request.nextUrl.searchParams.get("lang");
  const language: ReportLanguage =
    languageValue === "en" || languageValue === "ja" ? languageValue : "pt";
  const rawTimeZone = cleanString(request.nextUrl.searchParams.get("timeZone"), 80) || "UTC";
  let timeZone = rawTimeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    timeZone = "UTC";
  }
  const startAt = parseDate(
    cleanString(request.nextUrl.searchParams.get("startAt"), 80),
    "Data inicial",
  );
  const endAt = parseDate(
    cleanString(request.nextUrl.searchParams.get("endAt"), 80),
    "Data final",
  );

  if (!sellerId || sellerId.includes("/")) {
    throw new ReportError("INVALID_REQUEST", "Vendedor inválido.");
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw new ReportError("INVALID_RANGE", "O período informado é inválido.");
  }
  const rangeDays = (endAt.getTime() - startAt.getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new ReportError(
      "RANGE_TOO_LARGE",
      `O relatório permite no máximo ${MAX_RANGE_DAYS} dias por consulta.`,
    );
  }

  return { sellerId, startAt, endAt, language, timeZone };
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function authorizeSeller(params: { token: string; sellerId: string }) {
  const { token, sellerId } = params;
  if (!token) {
    throw new ReportError("AUTH_REQUIRED", "Entre novamente para abrir o relatório.", 401);
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new ReportError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
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
    throw new ReportError(
      "FORBIDDEN",
      "Você não pode consultar a produção deste vendedor.",
      403,
    );
  }
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
  return Number.isFinite(seconds) ? seconds * 1_000 : 0;
}

function localizedName(data: Record<string, unknown>, language: ReportLanguage): string {
  const legacyName = cleanString(data.name ?? data.title, 240);
  const content = record(data.content);
  const languageOrder: ReportLanguage[] = Array.from(
    new Set<ReportLanguage>([language, "pt", "en", "ja"]),
  );
  for (const key of languageOrder) {
    const localized = record(content[key]);
    const name = cleanString(localized.name, 240);
    if (name) return name;
  }
  return legacyName;
}

async function loadDocuments(
  refs: admin.firestore.DocumentReference[],
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < refs.length; index += 100) {
    const batch = refs.slice(index, index + 100);
    if (batch.length === 0) continue;
    const snapshots = await getAdminDb().getAll(...batch);
    for (const snapshot of snapshots) {
      if (snapshot.exists) result.set(snapshot.id, snapshot.data() ?? {});
    }
  }
  return result;
}

function sourceFrom(value: unknown): OrderSource {
  return value === "event" ? "event" : "store";
}

function dateKeyInTimeZone(millis: number, timeZone: string): string {
  if (!millis) return "unknown";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(millis));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year && month && day ? `${year}-${month}-${day}` : "unknown";
}

export async function GET(request: NextRequest) {
  try {
    const clean = cleanRequest(request);
    await authorizeSeller({ token: bearerToken(request), sellerId: clean.sellerId });

    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(clean.sellerId);
    const snapshot = await sellerRef
      .collection("productionMovements")
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(clean.startAt))
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(clean.endAt))
      .orderBy("createdAt", "desc")
      .limit(MAX_MOVEMENTS + 1)
      .get();

    const truncated = snapshot.size > MAX_MOVEMENTS;
    const documents = snapshot.docs.slice(0, MAX_MOVEMENTS);
    const productIds = Array.from(
      new Set(
        documents
          .map((document) => cleanString(document.data().productId, 160))
          .filter(Boolean),
      ),
    );
    const eventIds = Array.from(
      new Set(
        documents
          .map((document) => cleanString(document.data().eventId, 160))
          .filter(Boolean),
      ),
    );

    const [products, events] = await Promise.all([
      loadDocuments(productIds.map((id) => sellerRef.collection("products").doc(id))),
      loadDocuments(eventIds.map((id) => sellerRef.collection("events").doc(id))),
    ]);

    const movements: MovementRow[] = documents.map((document) => {
      const data = document.data();
      const productId = cleanString(data.productId, 160);
      const eventId = cleanString(data.eventId, 160);
      const quantity = nonNegativeInteger(data.quantity);
      const createdAtMillis = timestampMillis(data.createdAt);
      const productNameSnapshot = cleanString(data.productName, 240);
      const resolvedProductName =
        productNameSnapshot || localizedName(products.get(productId) ?? {}, clean.language);
      const eventTitleSnapshot = cleanString(data.eventTitle, 240);
      const resolvedEventTitle =
        eventTitleSnapshot || cleanString(events.get(eventId)?.title, 240);
      const createdBy = cleanString(data.createdBy, 240);
      const issueCodes: string[] = [];

      if (!productId) issueCodes.push("missing_product_id");
      if (!resolvedProductName) issueCodes.push("missing_product_name");
      if (quantity <= 0) issueCodes.push("invalid_quantity");
      if (!createdAtMillis) issueCodes.push("missing_timestamp");
      if (!createdBy) issueCodes.push("missing_actor");
      if (!cleanString(data.orderId, 160)) issueCodes.push("missing_order_id");

      return {
        id: document.id,
        productId,
        productName: resolvedProductName || productId || "—",
        orderId: cleanString(data.orderId, 160),
        orderSource: sourceFrom(data.orderSource),
        eventId,
        eventTitle: resolvedEventTitle,
        quantity,
        orderBecameReady: data.orderBecameReady === true,
        requestId: cleanString(data.requestId, 160),
        createdAt: createdAtMillis ? new Date(createdAtMillis).toISOString() : "",
        createdAtMillis,
        createdBy: createdBy || "—",
        createdByUid: cleanString(data.createdByUid, 160),
        customerName: cleanString(data.customerName, 240),
        deliveryDate: cleanString(data.deliveryDate, 40),
        issueCodes,
      };
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        quantity: number;
        movements: number;
        orders: Set<string>;
        readyOrders: Set<string>;
      }
    >();
    const actorMap = new Map<
      string,
      {
        actor: string;
        actorUid: string;
        quantity: number;
        movements: number;
        orders: Set<string>;
        lastAt: number;
      }
    >();
    const dayMap = new Map<
      string,
      { date: string; quantity: number; movements: number; orders: Set<string> }
    >();
    const orderKeys = new Set<string>();
    const readyOrderKeys = new Set<string>();
    const actors = new Set<string>();
    let totalQuantity = 0;
    let issueCount = 0;

    for (const movement of movements) {
      const orderKey = `${movement.orderSource}:${movement.eventId}:${movement.orderId}`;
      const actorKey = movement.createdByUid || movement.createdBy;
      const productKey = movement.productId || movement.productName;
      const dateKey = dateKeyInTimeZone(movement.createdAtMillis, clean.timeZone);

      totalQuantity += movement.quantity;
      issueCount += movement.issueCodes.length > 0 ? 1 : 0;
      if (movement.orderId) orderKeys.add(orderKey);
      if (movement.orderBecameReady && movement.orderId) readyOrderKeys.add(orderKey);
      if (actorKey && movement.createdBy !== "—") actors.add(actorKey);

      const product = productMap.get(productKey) ?? {
        productId: movement.productId,
        productName: movement.productName,
        quantity: 0,
        movements: 0,
        orders: new Set<string>(),
        readyOrders: new Set<string>(),
      };
      product.quantity += movement.quantity;
      product.movements += 1;
      if (movement.orderId) product.orders.add(orderKey);
      if (movement.orderBecameReady && movement.orderId) product.readyOrders.add(orderKey);
      productMap.set(productKey, product);

      const actor = actorMap.get(actorKey) ?? {
        actor: movement.createdBy,
        actorUid: movement.createdByUid,
        quantity: 0,
        movements: 0,
        orders: new Set<string>(),
        lastAt: 0,
      };
      actor.quantity += movement.quantity;
      actor.movements += 1;
      if (movement.orderId) actor.orders.add(orderKey);
      actor.lastAt = Math.max(actor.lastAt, movement.createdAtMillis);
      actorMap.set(actorKey, actor);

      const day = dayMap.get(dateKey) ?? {
        date: dateKey,
        quantity: 0,
        movements: 0,
        orders: new Set<string>(),
      };
      day.quantity += movement.quantity;
      day.movements += 1;
      if (movement.orderId) day.orders.add(orderKey);
      dayMap.set(dateKey, day);
    }

    const productSummaries = Array.from(productMap.values())
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        movements: item.movements,
        orders: item.orders.size,
        readyOrders: item.readyOrders.size,
      }))
      .sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName));
    const actorSummaries = Array.from(actorMap.values())
      .map((item) => ({
        actor: item.actor,
        actorUid: item.actorUid,
        quantity: item.quantity,
        movements: item.movements,
        orders: item.orders.size,
        lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : "",
      }))
      .sort((a, b) => b.quantity - a.quantity || a.actor.localeCompare(b.actor));
    const dailySummaries = Array.from(dayMap.values())
      .map((item) => ({
        date: item.date,
        quantity: item.quantity,
        movements: item.movements,
        orders: item.orders.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(
      {
        ok: true,
        range: {
          startAt: clean.startAt.toISOString(),
          endAt: clean.endAt.toISOString(),
        },
        summary: {
          totalQuantity,
          totalMovements: movements.length,
          uniqueProducts: productSummaries.length,
          uniqueOrders: orderKeys.size,
          readyOrders: readyOrderKeys.size,
          uniqueActors: actors.size,
          issueCount,
        },
        products: productSummaries,
        actors: actorSummaries,
        days: dailySummaries,
        movements,
        truncated,
        maxMovements: MAX_MOVEMENTS,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("[api/orders/production/report] Falha inesperada:", error);
    return NextResponse.json(
      {
        ok: false,
        code: "REPORT_LOAD_FAILED",
        error: "Não foi possível carregar o relatório de produção.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

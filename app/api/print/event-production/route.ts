import { createHash } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizeOrderStatus } from "@/app/lib/order-status";
import {
  PrintApiError,
  asRecord,
  authorizeSeller,
  cleanString,
  nonNegativeInteger,
  normalizePrintSettings,
  profileQueueKey,
  publicPrintProfile,
} from "@/app/lib/print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SummaryItem = {
  productId: string;
  name: string;
  quantity: number;
  category: string;
  orderIndex: number;
};

type ProductMeta = {
  id: string;
  name: string;
  category: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRequestId(value: unknown): string {
  const requestId = cleanString(value, 160);
  if (!requestId || !/^[A-Za-z0-9_.:-]{8,160}$/.test(requestId)) {
    throw new PrintApiError(
      "INVALID_REQUEST_ID",
      "Identificador da solicitação de impressão inválido.",
    );
  }
  return requestId;
}

function safeDeliveryDate(value: unknown): string {
  const date = cleanString(value, 40);
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new PrintApiError(
      "INVALID_FILTER_DATE",
      "A data do filtro de produção é inválida.",
    );
  }
  return date;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanString(entry, 180))
    .filter(Boolean);
}

function lineQuantity(value: unknown): number {
  return Math.min(100_000, nonNegativeInteger(value));
}

function catalogMeta(
  document: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot,
): ProductMeta {
  const data = asRecord(document.data());
  return {
    id: document.id,
    name: cleanString(data.name, 240) || document.id,
    category: cleanString(data.category, 160),
  };
}

function resolveQuantityLines(order: Record<string, unknown>) {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const fromItems = rawItems
    .map((entry) => {
      const item = asRecord(entry);
      const productId = cleanString(item.productId ?? item.id, 180);
      const name = cleanString(item.name, 240);
      const quantity = lineQuantity(item.quantity ?? item.qty);
      const category = cleanString(item.category, 160);
      if ((!productId && !name) || quantity <= 0) return null;
      return { productId, name, quantity, category };
    })
    .filter(
      (
        item,
      ): item is {
        productId: string;
        name: string;
        quantity: number;
        category: string;
      } => item !== null,
    );

  if (fromItems.length > 0) return fromItems;

  return Object.entries(asRecord(order.quantities))
    .map(([key, value]) => ({
      productId: cleanString(key, 180),
      name: "",
      quantity: lineQuantity(value),
      category: "",
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

async function loadProductMetadata(params: {
  sellerRef: admin.firestore.DocumentReference;
  eventRef: admin.firestore.DocumentReference;
}) {
  const { sellerRef, eventRef } = params;
  const [catalogSnapshot, eventItemsSnapshot, eventProductsSnapshot] =
    await Promise.all([
      sellerRef.collection("products").get(),
      eventRef.collection("items").get(),
      eventRef.collection("products").get(),
    ]);

  const map = new Map<string, ProductMeta>();
  for (const document of catalogSnapshot.docs) {
    map.set(document.id, catalogMeta(document));
  }
  for (const document of eventProductsSnapshot.docs) {
    const current = map.get(document.id);
    const next = catalogMeta(document);
    map.set(document.id, {
      id: document.id,
      name: current?.name || next.name,
      category: current?.category || next.category,
    });
  }
  for (const document of eventItemsSnapshot.docs) {
    const current = map.get(document.id);
    const next = catalogMeta(document);
    map.set(document.id, {
      id: document.id,
      name: current?.name || next.name,
      category: current?.category || next.category,
    });
  }
  return map;
}

async function buildProductionSummary(params: {
  sellerRef: admin.firestore.DocumentReference;
  eventRef: admin.firestore.DocumentReference;
  eventData: Record<string, unknown>;
  deliveryDate: string;
}) {
  const { sellerRef, eventRef, eventData, deliveryDate } = params;
  const [ordersSnapshot, metadata] = await Promise.all([
    eventRef.collection("orders").get(),
    loadProductMetadata({ sellerRef, eventRef }),
  ]);

  const configuredOrder = [
    ...stringArray(eventData.productIds),
    ...stringArray(eventData.productNames),
    ...stringArray(eventData.featuredProductIds),
    ...stringArray(eventData.featuredProductNames),
  ];
  const position = new Map<string, number>();
  configuredOrder.forEach((value, index) => {
    if (!position.has(value)) position.set(value, index);
    const meta = metadata.get(value);
    if (meta?.name && !position.has(meta.name)) position.set(meta.name, index);
  });

  const totals = new Map<string, SummaryItem>();
  let orderCount = 0;

  for (const orderDocument of ordersSnapshot.docs) {
    const order = asRecord(orderDocument.data());
    if (normalizeOrderStatus(order.fulfillmentStatus ?? order.status) === "cancelled") {
      continue;
    }
    const orderDate = cleanString(order.deliveryDate, 40);
    if (deliveryDate && orderDate !== deliveryDate) continue;

    const lines = resolveQuantityLines(order);
    if (lines.length === 0) continue;
    orderCount += 1;

    for (const line of lines) {
      const meta = line.productId ? metadata.get(line.productId) : undefined;
      const resolvedName = line.name || meta?.name || line.productId;
      if (!resolvedName) continue;
      const resolvedProductId = line.productId || resolvedName;
      const key = line.productId || `name:${resolvedName.toLocaleLowerCase("pt-BR")}`;
      const current = totals.get(key);
      const orderIndex =
        position.get(resolvedProductId) ??
        position.get(resolvedName) ??
        Number.MAX_SAFE_INTEGER;
      totals.set(key, {
        productId: resolvedProductId,
        name: resolvedName,
        quantity: (current?.quantity ?? 0) + line.quantity,
        category: line.category || meta?.category || current?.category || "",
        orderIndex: Math.min(current?.orderIndex ?? orderIndex, orderIndex),
      });
    }
  }

  const items = Array.from(totals.values())
    .filter((item) => item.quantity > 0)
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex;
      const categoryCompare = left.category.localeCompare(right.category, "pt-BR");
      if (categoryCompare !== 0) return categoryCompare;
      return left.name.localeCompare(right.name, "pt-BR");
    })
    .slice(0, 500)
    .map(({ orderIndex: _orderIndex, ...item }) => item);

  return {
    items,
    orderCount,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function handleError(error: unknown) {
  if (error instanceof PrintApiError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  console.error("[api/print/event-production]", error);
  return NextResponse.json(
    {
      ok: false,
      code: "EVENT_PRODUCTION_PRINT_FAILED",
      error: "Não foi possível preparar a impressão da produção do evento.",
    },
    {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json());
    const sellerId = cleanString(body.sellerId, 180);
    const eventId = cleanString(body.eventId, 180);
    const deliveryDate = safeDeliveryDate(body.deliveryDate);
    const requestId = safeRequestId(body.requestId);

    if (!sellerId || !eventId || sellerId.includes("/") || eventId.includes("/")) {
      throw new PrintApiError(
        "INVALID_EVENT",
        "Seller ou evento inválido para impressão.",
      );
    }

    const actor = await authorizeSeller(request, sellerId);
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const eventRef = sellerRef.collection("events").doc(eventId);
    const [eventSnapshot, printingSnapshot] = await Promise.all([
      eventRef.get(),
      sellerRef.collection("settings").doc("printing").get(),
    ]);

    if (!eventSnapshot.exists) {
      throw new PrintApiError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
    }

    const printSettings = normalizePrintSettings(printingSnapshot.data());
    const productionProfiles = printSettings.profiles.filter(
      (profile) =>
        profile.enabled &&
        Boolean(profile.tokenHash) &&
        profile.copies !== "customer",
    );

    if (!printSettings.enabled || productionProfiles.length === 0) {
      throw new PrintApiError(
        "PRODUCTION_PRINTER_NOT_CONFIGURED",
        "Nenhuma impressora de produção está ativa. Configure um perfil que imprima a via de produção.",
        409,
      );
    }

    const eventData = asRecord(eventSnapshot.data());
    const summary = await buildProductionSummary({
      sellerRef,
      eventRef,
      eventData,
      deliveryDate,
    });

    if (summary.items.length === 0 || summary.totalUnits <= 0) {
      throw new PrintApiError(
        "EMPTY_PRODUCTION_SUMMARY",
        deliveryDate
          ? "Não há itens de pedidos válidos para produzir nesta data."
          : "Ainda não há itens de pedidos válidos para imprimir neste evento.",
        409,
      );
    }

    const now = admin.firestore.Timestamp.now();
    const eventTitle =
      cleanString(eventData.title ?? eventData.name, 240) || "Evento";
    const jobs = productionProfiles.map((profile) => {
      const jobId = `event_production_${sha256(
        `${sellerId}|${eventId}|${deliveryDate || "all"}|${requestId}|${profile.id}`,
      ).slice(0, 40)}`;
      return {
        ref: sellerRef.collection("printJobs").doc(jobId),
        profile,
        jobId,
      };
    });

    await db.runTransaction(async (transaction) => {
      const existingSnapshots: admin.firestore.DocumentSnapshot[] = [];
      for (const job of jobs) {
        existingSnapshots.push(await transaction.get(job.ref));
      }
      jobs.forEach((job, index) => {
        if (existingSnapshots[index].exists) return;
        transaction.create(job.ref, {
          schemaVersion: 3,
          type: "event_production_summary",
          sellerId,
          eventId,
          profileId: job.profile.id,
          queueKey: profileQueueKey(job.profile.id, "pending"),
          status: "pending",
          copies: "production",
          attempts: 0,
          eventProductionPayload: {
            schemaVersion: 1,
            eventId,
            eventTitle,
            deliveryDate: deliveryDate || null,
            orderCount: summary.orderCount,
            totalUnits: summary.totalUnits,
            items: summary.items,
            generatedAt: now,
            generatedBy: actor.uid,
          },
          profileSnapshot: publicPrintProfile(job.profile),
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          requestId,
        });
      });
    });

    return NextResponse.json(
      {
        ok: true,
        eventId,
        eventTitle,
        deliveryDate: deliveryDate || null,
        orderCount: summary.orderCount,
        totalUnits: summary.totalUnits,
        itemCount: summary.items.length,
        jobs: jobs.map((job) => ({
          jobId: job.jobId,
          profileId: job.profile.id,
          profileName: job.profile.name,
          stationName: job.profile.stationName,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

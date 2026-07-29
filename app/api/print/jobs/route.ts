import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { DEFAULT_PUBLIC_STORE_NAME, PRINT_SERVICE_NAME } from "@/app/lib/platform-brand";
import {
  PrintApiError,
  asRecord,
  authorizePrintStation,
  cleanString,
  nonNegativeInteger,
  printCopies,
  profileQueueKey,
  publicPrintProfile,
  timestampMillis,
} from "@/app/lib/print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEASE_MILLIS = 120_000;
const MAX_ATTEMPTS = 8;

type PrintItem = {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  needsProduction: boolean;
  shortageQuantity: number;
  options: Array<{ name: string; quantity: number }>;
};

function sellerIdFrom(body: Record<string, unknown>): string {
  const sellerId = cleanString(body.sellerId, 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
  }
  return sellerId;
}

function orderPathAllowed(path: string, sellerId: string): boolean {
  if (path.startsWith(`sellers/${sellerId}/storeOrders/`)) return true;
  return new RegExp(`^sellers/${sellerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/events/[^/]+/orders/[^/]+$`).test(path);
}

function normalizeItems(value: unknown): PrintItem[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<PrintItem[]>((result, rawValue) => {
    const raw = asRecord(rawValue);
    const name = cleanString(raw.name ?? raw.productName, 240);
    const quantity = nonNegativeInteger(raw.quantity ?? raw.qty);
    if (!name || quantity <= 0) return result;

    const inventoryState = asRecord(raw.inventoryState);
    const availability = cleanString(
      raw.availabilityMode ?? raw.availabilityStatus ?? raw.productionMode,
      40,
    );
    const productionRequired = nonNegativeInteger(
      inventoryState.productionRequired ?? raw.productionRequired,
    );
    const shortageQuantity = nonNegativeInteger(
      inventoryState.shortageQuantity ?? raw.stockShortage,
    );
    const options = Array.isArray(raw.options)
      ? raw.options.reduce<Array<{ name: string; quantity: number }>>((items, optionValue) => {
          const option = asRecord(optionValue);
          const optionName = cleanString(option.name, 200);
          const optionQuantity = nonNegativeInteger(option.quantity ?? option.qty);
          if (optionName && optionQuantity > 0) {
            items.push({ name: optionName, quantity: optionQuantity });
          }
          return items;
        }, [])
      : [];

    result.push({
      name,
      quantity,
      unitPriceMinor: nonNegativeInteger(raw.unitPriceMinor ?? raw.priceMinor),
      subtotalMinor: nonNegativeInteger(raw.subtotalMinor),
      needsProduction: availability === "made_to_order" || productionRequired > 0,
      shortageQuantity,
      options,
    });
    return result;
  }, []);
}

function normalizeOrderPayload(params: {
  orderId: string;
  orderPath: string;
  order: Record<string, unknown>;
  storeName: string;
  eventTitle: string;
}) {
  const { orderId, orderPath, order, storeName, eventTitle } = params;
  const source = order.orderSource === "event" ? "event" : "store";
  const shipping = asRecord(order.shipping);
  const address = cleanString(order.address, 600) || [
    cleanString(shipping.postalCode, 40),
    cleanString(shipping.prefecture, 100),
    cleanString(shipping.city, 100),
    cleanString(shipping.addressLine1, 240),
    cleanString(shipping.addressLine2, 240),
  ].filter(Boolean).join(" ");

  return {
    orderId,
    orderPath,
    shortId: orderId.slice(-8).toUpperCase(),
    source,
    storeName,
    eventTitle: source === "event" ? eventTitle : "",
    customerName: cleanString(order.customerName, 200),
    customerPhone: cleanString(order.customerPhone, 100),
    deliveryMode: cleanString(order.deliveryMode, 40) || "pickup",
    deliveryDate: cleanString(order.deliveryDate, 80),
    deliveryTime: cleanString(order.deliveryTimeSlot, 80),
    address,
    note: cleanString(order.note, 1000),
    currency: cleanString(order.currency, 8) || "JPY",
    language: cleanString(order.language, 8) || "pt",
    subtotalMinor: nonNegativeInteger(order.subtotalMinor),
    discountMinor: nonNegativeInteger(order.discountMinor),
    shippingFeeMinor: nonNegativeInteger(order.shippingFeeMinor ?? order.deliveryFeeMinor),
    totalAmountMinor: nonNegativeInteger(order.totalAmountMinor),
    status: cleanString(order.fulfillmentStatus ?? order.status, 40) || "pending",
    createdAt: timestampMillis(order.createdAt)
      ? new Date(timestampMillis(order.createdAt)).toISOString()
      : null,
    items: normalizeItems(order.items),
  };
}

async function buildClaimPayload(params: {
  sellerId: string;
  jobId: string;
  job: Record<string, unknown>;
}) {
  const { sellerId, jobId, job } = params;
  const db = getAdminDb();
  const sellerRef = db.collection("sellers").doc(sellerId);
  const sellerSnapshot = await sellerRef.get();
  const sellerData = sellerSnapshot.data() ?? {};
  const storeName = cleanString(sellerData.storeName ?? sellerData.displayName, 160) || DEFAULT_PUBLIC_STORE_NAME;
  const copies = printCopies(job.copies);

  if (job.type === "test") {
    const testPayload = asRecord(job.testPayload);
    return {
      jobId,
      type: "test",
      copies,
      test: {
        storeName: cleanString(testPayload.storeName, 160) || storeName,
        message: cleanString(testPayload.message, 500) || PRINT_SERVICE_NAME,
      },
    };
  }

  const orderPath = cleanString(job.orderPath, 500);
  if (!orderPathAllowed(orderPath, sellerId)) {
    throw new PrintApiError("INVALID_ORDER_PATH", "Caminho do pedido inválido.", 409);
  }

  const orderRef = db.doc(orderPath);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) {
    throw new PrintApiError("ORDER_NOT_FOUND", "Pedido não encontrado para impressão.", 404);
  }

  const order = orderSnapshot.data() ?? {};
  let eventTitle = "";
  const eventId = cleanString(order.eventId, 160);
  if (eventId) {
    const eventSnapshot = await sellerRef.collection("events").doc(eventId).get();
    const eventData = eventSnapshot.data() ?? {};
    eventTitle = cleanString(eventData.title ?? eventData.name, 200);
  }

  return {
    jobId,
    type: "order",
    copies,
    order: normalizeOrderPayload({
      orderId: orderSnapshot.id,
      orderPath,
      order,
      storeName,
      eventTitle,
    }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json());
    const action = cleanString(body.action, 40);
    const sellerId = sellerIdFrom(body);
    const profileId = cleanString(body.profileId, 100);
    const stationName = cleanString(body.stationName, 120) || PRINT_SERVICE_NAME;
    const { stationRef, settings, profile } = await authorizePrintStation({ request, sellerId, profileId });
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const now = admin.firestore.Timestamp.now();
    const stationStatus = {
      lastSeenAt: now,
      stationName,
      stationVersion: cleanString(body.version, 40) || null,
      platform: cleanString(body.platform, 40) || null,
      arch: cleanString(body.arch, 40) || null,
      capabilities: Array.isArray(body.capabilities)
        ? body.capabilities.map((value) => cleanString(value, 40)).filter(Boolean).slice(0, 20)
        : [],
      updatedAt: now,
    };

    if (action === "heartbeat") {
      await stationRef.set(stationStatus, { merge: true });
      return NextResponse.json({ ok: true, printingEnabled: settings.enabled, profile: publicPrintProfile(profile) });
    }

    if (action === "claim") {
      await stationRef.set(stationStatus, { merge: true });

      if (!settings.enabled) {
        return NextResponse.json({
          ok: true,
          paused: true,
          job: null,
          profile: publicPrintProfile(profile),
        }, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      const printingSnapshot = await sellerRef
        .collection("printJobs")
        .where("queueKey", "==", profileQueueKey(profile.id, "printing"))
        .limit(25)
        .get();
      const expiredJobs = printingSnapshot.docs.filter(
        (document) => timestampMillis(document.data().leaseUntil) > 0 &&
          timestampMillis(document.data().leaseUntil) < Date.now(),
      );
      if (expiredJobs.length > 0) {
        const batch = db.batch();
        for (const document of expiredJobs) {
          batch.set(document.ref, {
            status: "pending",
            queueKey: profileQueueKey(profile.id, "pending"),
            leaseUntil: null,
            updatedAt: now,
            lastError: "A estação anterior não confirmou a impressão; trabalho reenfileirado.",
          }, { merge: true });
        }
        await batch.commit();
      }

      let pendingSnapshot = await sellerRef
        .collection("printJobs")
        .where("queueKey", "==", profileQueueKey(profile.id, "pending"))
        .limit(50)
        .get();

      // Migração de trabalhos criados pela fila única anterior à 06D5.
      if (pendingSnapshot.empty && profile.id === "legacy") {
        pendingSnapshot = await sellerRef
          .collection("printJobs")
          .where("status", "==", "pending")
          .limit(50)
          .get();
      }

      const candidates = [...pendingSnapshot.docs]
        .filter((document) => {
          const data = document.data();
          const targetProfileId = cleanString(data.profileId, 100) || "legacy";
          return targetProfileId === profile.id;
        })
        .sort(
          (left, right) => timestampMillis(left.data().createdAt) - timestampMillis(right.data().createdAt),
        );

      for (const candidate of candidates) {
        const claimed = await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(candidate.ref);
          if (!snapshot.exists) return null;
          const data = snapshot.data() ?? {};
          if (data.status !== "pending") return null;
          const targetProfileId = cleanString(data.profileId, 100) || "legacy";
          if (targetProfileId !== profile.id) return null;
          const attempts = nonNegativeInteger(data.attempts);
          if (attempts >= MAX_ATTEMPTS) {
            transaction.update(candidate.ref, {
              status: "failed",
              queueKey: profileQueueKey(profile.id, "failed"),
              updatedAt: now,
              lastError: "Limite de tentativas excedido.",
            });
            return null;
          }

          transaction.update(candidate.ref, {
            status: "printing",
            queueKey: profileQueueKey(profile.id, "printing"),
            attempts: attempts + 1,
            claimedAt: now,
            leaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_MILLIS),
            claimedBy: stationName,
            updatedAt: now,
          });
          return { id: snapshot.id, data };
        });

        if (!claimed) continue;

        try {
          const job = await buildClaimPayload({
            sellerId,
            jobId: claimed.id,
            job: claimed.data,
          });
          return NextResponse.json({
            ok: true,
            job,
            profile: publicPrintProfile(profile),
          }, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          await candidate.ref.set({
            status: "failed",
            queueKey: profileQueueKey(profile.id, "failed"),
            lastError: error instanceof Error ? error.message : "Falha ao montar impressão.",
            updatedAt: admin.firestore.Timestamp.now(),
          }, { merge: true });
          throw error;
        }
      }

      return NextResponse.json({
        ok: true,
        job: null,
        profile: publicPrintProfile(profile),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const jobId = cleanString(body.jobId, 160);
    if (!jobId || jobId.includes("/")) {
      throw new PrintApiError("INVALID_JOB", "Trabalho de impressão inválido.");
    }
    const jobRef = sellerRef.collection("printJobs").doc(jobId);
    const jobSnapshot = await jobRef.get();
    if (!jobSnapshot.exists) {
      throw new PrintApiError("INVALID_JOB", "Trabalho de impressão não encontrado.", 404);
    }
    const jobProfileId = cleanString(jobSnapshot.data()?.profileId, 100) || "legacy";
    if (jobProfileId !== profile.id) {
      throw new PrintApiError("STATION_FORBIDDEN", "Este trabalho pertence a outra impressora.", 403);
    }

    if (action === "complete") {
      await jobRef.set({
        status: "printed",
        queueKey: profileQueueKey(profile.id, "printed"),
        completedAt: now,
        updatedAt: now,
        completedBy: stationName,
        outputFiles: Array.isArray(body.outputFiles)
          ? body.outputFiles.map((value) => cleanString(value, 500)).filter(Boolean).slice(0, 10)
          : [],
        lastError: null,
      }, { merge: true });
      await stationRef.set({
        ...stationStatus,
        lastPrintedAt: now,
        lastError: null,
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "fail") {
      const attempts = nonNegativeInteger(jobSnapshot.data()?.attempts);
      const terminal = attempts >= MAX_ATTEMPTS;
      const message = cleanString(body.error, 1000) || "Falha de impressão.";
      await jobRef.set({
        status: terminal ? "failed" : "pending",
        queueKey: profileQueueKey(profile.id, terminal ? "failed" : "pending"),
        updatedAt: now,
        leaseUntil: null,
        lastError: message,
      }, { merge: true });
      await stationRef.set({
        ...stationStatus,
        lastError: message,
      }, { merge: true });
      return NextResponse.json({ ok: true, retrying: !terminal });
    }

    throw new PrintApiError("INVALID_ACTION", "Ação inválida.");
  } catch (error) {
    if (error instanceof PrintApiError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    console.error("[api/print/jobs]", error);
    return NextResponse.json({ ok: false, code: "PRINT_JOB_FAILED", error: "Falha no serviço de impressão." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

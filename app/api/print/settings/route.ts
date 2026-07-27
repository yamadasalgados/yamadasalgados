import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import {
  PrintApiError,
  asRecord,
  authorizeSeller,
  cleanString,
  createStationToken,
  normalizePrintSettings,
  printCopies,
  stationOnline,
} from "@/app/lib/print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sellerIdFrom(request: NextRequest): string {
  const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
  }
  return sellerId;
}

function responseSettings(value: unknown) {
  const settings = normalizePrintSettings(value);
  return {
    enabled: settings.enabled,
    autoPrint: settings.autoPrint,
    copies: settings.copies,
    configured: Boolean(settings.tokenHash),
    tokenPrefix: settings.tokenPrefix,
    online: stationOnline(settings),
    lastSeenAt: settings.lastSeenAtMillis ? new Date(settings.lastSeenAtMillis).toISOString() : null,
    lastPrintedAt: settings.lastPrintedAtMillis
      ? new Date(settings.lastPrintedAtMillis).toISOString()
      : null,
    lastError: settings.lastError || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = sellerIdFrom(request);
    await authorizeSeller(request, sellerId);
    const snapshot = await getAdminDb()
      .collection("sellers")
      .doc(sellerId)
      .collection("settings")
      .doc("printing")
      .get();

    return NextResponse.json({ ok: true, settings: responseSettings(snapshot.data()) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json());
    const sellerId = cleanString(body.sellerId, 160);
    const action = cleanString(body.action, 40);
    if (!sellerId || sellerId.includes("/")) {
      throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
    }

    const actor = await authorizeSeller(request, sellerId);
    const db = getAdminDb();
    const settingsRef = db.collection("sellers").doc(sellerId).collection("settings").doc("printing");
    const now = admin.firestore.Timestamp.now();

    if (action === "rotate_token") {
      const generated = createStationToken();
      await settingsRef.set({
        schemaVersion: 1,
        enabled: true,
        autoPrint: true,
        copies: "both",
        tokenHash: generated.hash,
        tokenPrefix: generated.prefix,
        tokenRotatedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      }, { merge: true });
      const snapshot = await settingsRef.get();
      return NextResponse.json({
        ok: true,
        token: generated.token,
        settings: responseSettings(snapshot.data()),
      });
    }

    if (action === "update") {
      await settingsRef.set({
        schemaVersion: 1,
        enabled: body.enabled === true,
        autoPrint: body.autoPrint !== false,
        copies: printCopies(body.copies),
        updatedAt: now,
        updatedBy: actor.uid,
      }, { merge: true });
      const snapshot = await settingsRef.get();
      return NextResponse.json({ ok: true, settings: responseSettings(snapshot.data()) });
    }

    if (action === "test") {
      const settingsSnapshot = await settingsRef.get();
      const settings = normalizePrintSettings(settingsSnapshot.data());
      if (!settings.enabled || !settings.tokenHash) {
        throw new PrintApiError(
          "PRINT_NOT_CONFIGURED",
          "Gere a chave da estação antes de enviar uma impressão de teste.",
          409,
        );
      }
      const jobRef = db.collection("sellers").doc(sellerId).collection("printJobs").doc();
      await jobRef.create({
        schemaVersion: 1,
        type: "test",
        sellerId,
        status: "pending",
        copies: settings.copies,
        attempts: 0,
        testPayload: {
          storeName: cleanString(actor.sellerData.storeName, 160) || "Yamada",
          message: "Yamada Print Service conectado com sucesso.",
        },
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
      });
      return NextResponse.json({ ok: true, jobId: jobRef.id });
    }

    throw new PrintApiError("INVALID_ACTION", "Ação inválida.");
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof PrintApiError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  console.error("[api/print/settings]", error);
  return NextResponse.json({ ok: false, code: "PRINT_SETTINGS_FAILED", error: "Falha ao configurar a impressão." }, {
    status: 500,
    headers: { "Cache-Control": "no-store" },
  });
}

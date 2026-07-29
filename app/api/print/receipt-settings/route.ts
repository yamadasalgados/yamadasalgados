import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { qrByteLength } from "@/app/lib/qr-code";
import {
  PrintApiError,
  asRecord,
  authorizeSeller,
  cleanString,
} from "@/app/lib/print-server";
import {
  isValidHttpUrl,
  normalizeReceiptSettings,
  type ReceiptSettings,
} from "@/app/lib/receipt-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sellerIdFromRequest(request: NextRequest): string {
  const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
  }
  return sellerId;
}

function sellerIdFromBody(body: Record<string, unknown>): string {
  const sellerId = cleanString(body.sellerId, 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
  }
  return sellerId;
}

function validate(settings: ReceiptSettings) {
  for (const [copyName, copy] of [
    ["produção", settings.production],
    ["cliente", settings.customer],
  ] as const) {
    if (
      copy.qrEnabled &&
      copy.qrDestination === "custom" &&
      !isValidHttpUrl(copy.qrCustomUrl)
    ) {
      throw new PrintApiError(
        "RECEIPT_QR_URL_INVALID",
        `Informe um link personalizado válido para a via de ${copyName}.`,
      );
    }
    if (
      copy.qrEnabled &&
      copy.qrDestination === "custom" &&
      qrByteLength(copy.qrCustomUrl) > 260
    ) {
      throw new PrintApiError(
        "RECEIPT_QR_URL_TOO_LONG",
        `O link personalizado da via de ${copyName} é longo demais para o QR Code do recibo.`,
      );
    }
  }
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

  console.error("[api/print/receipt-settings]", error);
  return NextResponse.json(
    {
      ok: false,
      code: "RECEIPT_SETTINGS_FAILED",
      error: "Falha ao salvar as configurações do recibo.",
    },
    {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = sellerIdFromRequest(request);
    await authorizeSeller(request, sellerId);

    const snapshot = await getAdminDb()
      .collection("sellers")
      .doc(sellerId)
      .collection("settings")
      .doc("receipt")
      .get();

    return NextResponse.json(
      {
        ok: true,
        settings: normalizeReceiptSettings(snapshot.data()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json());
    const sellerId = sellerIdFromBody(body);
    const actor = await authorizeSeller(request, sellerId);
    const settings = normalizeReceiptSettings(body.settings);
    validate(settings);

    const now = admin.firestore.Timestamp.now();
    await getAdminDb()
      .collection("sellers")
      .doc(sellerId)
      .collection("settings")
      .doc("receipt")
      .set(
        {
          ...settings,
          updatedAt: now,
          updatedBy: actor.uid,
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return handleError(error);
  }
}

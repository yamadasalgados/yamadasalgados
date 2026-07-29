import { NextResponse } from "next/server";

import {
  getAdminDb,
} from "@/app/lib/firebaseAdmin";
import {
  normalizePublicSellerProfile,
} from "@/app/lib/public-seller-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSellerId(value: string): string {
  const sellerId = decodeURIComponent(value || "").trim();
  if (
    !sellerId ||
    sellerId.length > 160 ||
    sellerId.includes("/") ||
    !/^[A-Za-z0-9_.:-]+$/.test(sellerId)
  ) {
    throw new Error("INVALID_SELLER_ID");
  }
  return sellerId;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sellerId: string }> },
) {
  try {
    const { sellerId: rawSellerId } = await context.params;
    const sellerId = validSellerId(rawSellerId);
    const snapshot = await getAdminDb()
      .collection("sellers")
      .doc(sellerId)
      .get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { ok: false, error: "Loja não encontrada." },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        seller: normalizePublicSellerProfile(
          sellerId,
          snapshot.data(),
        ),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const invalid =
      error instanceof Error &&
      error.message === "INVALID_SELLER_ID";

    if (!invalid) {
      console.error("[api/public/sellers] Unexpected error:", error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: invalid
          ? "Loja inválida."
          : "Não foi possível carregar a loja.",
      },
      {
        status: invalid ? 400 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

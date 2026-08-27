import { NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizePublicCategory } from "@/app/lib/public-category";
import { normalizePublicSellerProfile } from "@/app/lib/public-seller-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSellerId(value: string): string {
  const sellerId = decodeURIComponent(value || "").trim();
  if (!sellerId || sellerId.length > 160 || sellerId.includes("/") || !/^[A-Za-z0-9_.:-]+$/.test(sellerId)) {
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
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const sellerSnapshot = await sellerRef.get();

    if (!sellerSnapshot.exists) {
      return NextResponse.json({ ok: false, error: "Loja não encontrada." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const publicSeller = normalizePublicSellerProfile(sellerId, sellerSnapshot.data());
    if (!publicSeller.available) {
      return NextResponse.json({ ok: false, error: "Loja indisponível." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const categorySnapshot = await sellerRef.collection("categories").get();
    const categories = categorySnapshot.docs
      .map((document) => normalizePublicCategory(document.id, document.data()))
      .filter((category) => category.names.pt || category.names.en || category.names.ja)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

    return NextResponse.json(
      { ok: true, sellerId, categories },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_SELLER_ID";
    if (!invalid) console.error("[api/public/sellers/categories] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: invalid ? "Loja inválida." : "Não foi possível carregar as categorias." },
      { status: invalid ? 400 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

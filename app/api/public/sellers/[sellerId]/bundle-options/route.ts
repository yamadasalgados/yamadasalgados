import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizePublicSellerProfile } from "@/app/lib/public-seller-profile";
import {
  normalizeProductBundleConfig,
  normalizeProductMixedPackConfig,
  normalizeProductType,
} from "@/app/lib/product-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Data = Record<string, unknown>;
const record = (value: unknown): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Data)
    : {};
const clean = (value: unknown, max = 240): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function validId(value: unknown): string {
  const id = clean(value, 161);
  if (!id || id.length > 160 || id.includes("/") || /[\u0000-\u001F]/.test(id)) {
    throw new Error("INVALID_ID");
  }
  return id;
}

function localizedNames(value: unknown) {
  const translations = record(value);
  const pt = clean(record(translations.pt).name);
  const en = clean(record(translations.en).name);
  const ja = clean(record(translations.ja).name);
  const fallback = pt || en || ja;
  return {
    pt: { name: pt || fallback },
    en: { name: en || fallback },
    ja: { name: ja || fallback },
  };
}

/**
 * Publica SOMENTE os dados necessários para selecionar componentes ocultos
 * de um kit realmente publicado. Não dá acesso direto aos demais produtos
 * com status hidden nem altera as Firestore Security Rules.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sellerId: string }> },
) {
  try {
    const { sellerId: rawSellerId } = await context.params;
    const sellerId = validId(rawSellerId);
    const kitId = validId(new URL(request.url).searchParams.get("kitId"));
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const productCollection = sellerRef.collection("products");
    const [sellerSnapshot, kitSnapshot] = await Promise.all([
      sellerRef.get(),
      productCollection.doc(kitId).get(),
    ]);
    const seller = record(sellerSnapshot.data());
    const kit = record(kitSnapshot.data());
    if (
      !sellerSnapshot.exists || !kitSnapshot.exists ||
      seller.accountStatus !== "active" ||
      record(seller.onboarding).complete !== true ||
      !normalizePublicSellerProfile(sellerId, seller).available ||
      kit.active === false ||
      !["active", "made_to_order"].includes(clean(kit.status, 40))
    ) {
      return NextResponse.json({ ok: false, error: "Kit indisponível." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const isMixed = normalizeProductType(kit.productType, kit.mixedPackConfig) === "mixed_pack";
    const config = isMixed
      ? normalizeProductMixedPackConfig(kit.mixedPackConfig)
      : normalizeProductBundleConfig(kit.bundleConfig);
    if (!config.enabled || config.optionProductIds.length < 2) {
      return NextResponse.json({ ok: false, error: "Kit indisponível." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Limite defensivo: nenhuma API pública faz leitura ilimitada.
    const ids = config.optionProductIds.slice(0, 200);
    const refs = ids.map((id) => productCollection.doc(id));
    const snapshots = await db.getAll(...refs);
    const options = snapshots.flatMap((snapshot) => {
      if (!snapshot.exists) return [];
      const data = record(snapshot.data());
      if (data.status !== "hidden" || data.active === false) return [];
      if (normalizeProductType(data.productType, data.mixedPackConfig) === "mixed_pack") return [];
      if (normalizeProductBundleConfig(data.bundleConfig).enabled) return [];
      return [{
        id: snapshot.id,
        name: clean(data.name) || localizedNames(data.content).pt.name,
        content: localizedNames(data.content),
        category: clean(data.category, 160),
        imageUrl: clean(data.imageUrl ?? data.image, 1800),
        status: "hidden" as const,
      }];
    });

    return NextResponse.json({ ok: true, options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_ID";
    if (!invalid) console.error("[public/bundle-options]", error);
    return NextResponse.json(
      { ok: false, error: invalid ? "Identificador inválido." : "Não foi possível carregar as opções." },
      { status: invalid ? 400 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizePublicSellerProfile } from "@/app/lib/public-seller-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Primeira fase: busca somente em lojas publicadas. Ao superar este limite,
// substituir a varredura por um indice publico paginado por nome normalizado.
const SCAN_LIMIT = 300;
const RESULT_LIMIT = 12;

type PublicStoreMatch = {
  sellerId: string;
  storeName: string;
  regionName: string;
  logoUrl: string;
};

function searchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Busca server-side; NUNCA retorna documentos privados da coleção sellers. */
export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const query = searchText(rawQuery);
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (rawQuery.length > 80 || query.length < 2 || query.length > 70) {
    return NextResponse.json(
      { ok: false, error: "Digite pelo menos 2 letras do nome da loja (até 70 caracteres)." },
      { status: 400, headers },
    );
  }

  try {
    // Uma projeção mínima reduz as informações lidas. Os dados privados de
    // ownership, contato, planos ou assinatura nunca são enviados ao cliente.
    const documents = await getAdminDb().collection("sellers")
      .select(
        "storeName", "businessName", "publicName", "logoUrl", "photoUrl", "photoURL",
        "regionName", "accountStatus", "onboarding", "access", "subscriptionStatus",
        "currentPeriodEnd", "active", "suspended", "plan", "billingInterval", "discoverableInSearch",
      )
      .limit(SCAN_LIMIT)
      .get();

    const stores: PublicStoreMatch[] = [];
    for (const doc of documents.docs) {
      if (!/^[a-zA-Z0-9_-]{4,150}$/.test(doc.id)) continue;
      const data = doc.data();
      // Opt-in explícito: campo ausente ou falso NUNCA entra no diretório.
      if (data.discoverableInSearch !== true) continue;
      // Loja com status desconhecido, onboarding incompleto ou assinatura
      // inativa não deve aparecer no diretório.
      if (data.accountStatus !== "active" || data.onboarding?.complete !== true) continue;
      const publicSeller = normalizePublicSellerProfile(doc.id, data);
      if (!publicSeller.available || !publicSeller.storeName) continue;
      if (!searchText(publicSeller.storeName).includes(query)) continue;

      stores.push({
        sellerId: doc.id,
        storeName: publicSeller.storeName,
        regionName: publicSeller.regionName,
        logoUrl: publicSeller.logoUrl,
      });
    }

    stores.sort((a, b) => {
      const aExact = searchText(a.storeName) === query ? 0 : searchText(a.storeName).startsWith(query) ? 1 : 2;
      const bExact = searchText(b.storeName) === query ? 0 : searchText(b.storeName).startsWith(query) ? 1 : 2;
      return aExact - bExact || a.storeName.localeCompare(b.storeName, "pt-BR");
    });

    return NextResponse.json(
      { ok: true, stores: stores.slice(0, RESULT_LIMIT), limited: documents.size === SCAN_LIMIT },
      { headers },
    );
  } catch (error) {
    console.error("[public-store-search] Falha ao buscar lojas:", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível pesquisar lojas agora. Tente novamente." },
      { status: 500, headers },
    );
  }
}

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthorizedSeller = {
  ref: admin.firestore.DocumentReference;
  uid: string;
};

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

class AccessError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function validSellerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{4,150}$/.test(value)) {
    throw new AccessError("Identificador de loja inválido.", 400);
  }
  return value;
}

async function authorizeOwner(request: NextRequest, sellerId: string): Promise<AuthorizedSeller> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) throw new AccessError("Entre com sua conta de vendedor para alterar a visibilidade da loja.", 401);

  let identity: admin.auth.DecodedIdToken;
  try {
    // checkRevoked=true bloqueia sessões revogadas e usuários desativados.
    identity = await getAdminAuth().verifyIdToken(bearer, true);
  } catch {
    throw new AccessError("Sua sessão expirou. Entre novamente.", 401);
  }

  const db = getAdminDb();
  const sellerRef = db.collection("sellers").doc(sellerId);
  const [userSnap, sellerSnap] = await db.getAll(
    db.collection("users").doc(identity.uid),
    sellerRef,
  );
  if (!sellerSnap.exists) throw new AccessError("Loja não encontrada.", 404);

  const user = userSnap.data();
  const seller = sellerSnap.data();
  // Não confiar no sellerId fornecido no corpo/URL: verificação contra os
  // dois registros privados, independentemente das permissões de tela.
  if (
    !userSnap.exists || user?.role !== "seller" || user?.accountStatus !== "active" ||
    seller?.accountStatus !== "active" || seller?.ownerUid !== identity.uid
  ) {
    throw new AccessError("Somente o proprietário ativo pode alterar a busca desta loja.", 403);
  }
  return { ref: sellerRef, uid: identity.uid };
}

function handleError(error: unknown) {
  if (error instanceof AccessError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: HEADERS });
  }
  console.error("[seller/store-discovery] Falha inesperada:", error);
  return NextResponse.json(
    { ok: false, error: "Não foi possível salvar ou consultar esta configuração." },
    { status: 500, headers: HEADERS },
  );
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = validSellerId(request.nextUrl.searchParams.get("sellerId"));
    const actor = await authorizeOwner(request, sellerId);
    const snapshot = await actor.ref.get();
    // Sem valor salvo, PRIVACIDADE por padrão: a loja não é listada.
    return NextResponse.json(
      { ok: true, discoverableInSearch: snapshot.data()?.discoverableInSearch === true },
      { headers: HEADERS },
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.discoverableInSearch !== "boolean") {
      throw new AccessError("Escolha se deseja aparecer na busca de lojas.", 400);
    }
    const sellerId = validSellerId(body.sellerId);
    const actor = await authorizeOwner(request, sellerId);
    await actor.ref.update({
      discoverableInSearch: body.discoverableInSearch,
      discoverableInSearchUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      discoverableInSearchUpdatedBy: actor.uid,
    });
    // Leia do servidor para não informar sucesso antes da persistência.
    const after = await actor.ref.get();
    if (after.data()?.discoverableInSearch !== body.discoverableInSearch) {
      throw new Error("Falha na confirmação de persistência da visibilidade.");
    }
    return NextResponse.json(
      { ok: true, discoverableInSearch: after.data()?.discoverableInSearch === true },
      { headers: HEADERS },
    );
  } catch (error) {
    return handleError(error);
  }
}

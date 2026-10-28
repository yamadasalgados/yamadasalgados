import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenFrom(request: NextRequest): string {
  return (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  try {
    const token = tokenFrom(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Faça login como administrador." }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const userSnapshot = await db.collection("users").doc(decoded.uid).get();
    const user = userSnapshot.data();
    if (user?.role !== "admin" || user.accountStatus !== "active") {
      return NextResponse.json({ ok: false, error: "Somente administradores ativos podem listar eventos." }, { status: 403 });
    }

    // O SDK Admin executa a consulta server-side após checar a identidade;
    // evita collectionGroup('events') no navegador, não abrangido pelas regras atuais.
    const cap = 1000;
    const snapshot = await db.collectionGroup("events").limit(cap).get();
    const rows = snapshot.docs
      .filter((document) => /^sellers\/[^/]+\/events\/[^/]+$/.test(document.ref.path))
      .map((document) => {
        const data = document.data();
        const sellerId = document.ref.parent.parent?.id ?? "";
        return {
          eventId: document.id,
          sellerId,
          title: String(data.title ?? data.name ?? document.id),
          status: String(data.status ?? "unknown"),
          createdAtMillis: data.createdAt instanceof admin.firestore.Timestamp ? data.createdAt.toMillis() : 0,
        };
      })
      .sort((left, right) => right.createdAtMillis - left.createdAtMillis);

    return NextResponse.json({ ok: true, rows, truncated: snapshot.size === cap }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const status = code.startsWith("auth/") ? 401 : 500;
    console.error("[admin/events] Failed:", error);
    return NextResponse.json({
      ok: false,
      error: status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar eventos no servidor. Confira as credenciais do Firebase Admin.",
    }, { status });
  }
}

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

type Body = {
  idToken: string;
  sellerId: string;
  deleteUserAlso?: boolean;
};

// Otimização: Verificação via Firestore em vez de lista estática de emails
async function isAdmin(uid: string) {
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.exists && userDoc.data()?.role === "admin";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Partial<Body> | null;

    const idToken = String(body?.idToken || "").trim();
    const sellerId = String(body?.sellerId || "").trim();
    const deleteUserAlso = body?.deleteUserAlso !== false;

    if (!idToken || !sellerId) {
      return NextResponse.json({ ok: false, error: "ERR_MISSING_PARAMS" }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken, true);

    // ✅ Verifica se o usuário que solicita é Admin no próprio Firestore
    if (!(await isAdmin(decoded.uid))) {
      return NextResponse.json({ ok: false, error: "ERR_FORBIDDEN" }, { status: 403 });
    }

    if (decoded.uid === sellerId) {
      return NextResponse.json({ ok: false, error: "ERR_SELF_DELETE" }, { status: 400 });
    }

    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const userRef = db.collection("users").doc(sellerId);

    // Executa exclusão recursiva para limpar eventos, produtos e pedidos vinculados
    await Promise.all([
      db.recursiveDelete(sellerRef).catch(() => null),
      db.recursiveDelete(userRef).catch(() => null),
    ]);

    if (deleteUserAlso) {
      try {
        await adminAuth.deleteUser(sellerId);
      } catch (e) {
        console.warn("User already deleted from Auth", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Delete Seller Error:", e);
    return NextResponse.json({ ok: false, error: "ERR_INTERNAL_SERVER" }, { status: 500 });
  }
}
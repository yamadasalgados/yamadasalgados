import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const validId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{6,150}$/.test(s);
export async function GET(request: NextRequest) {
  const sellerId = request.nextUrl.searchParams.get("sellerId");
  if (!validId(sellerId)) return NextResponse.json({ error: "Loja inválida" }, { status: 400 });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Login obrigatório" }, { status: 401 });
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const [user, seller] = await db.getAll(db.collection("users").doc(decoded.uid), sellerRef);
    if (!seller.exists || !isAdminOrOperationalSellerOwnerRecord({ uid: decoded.uid, sellerId, userData: user.data() ?? {}, sellerData: seller.data() ?? {} })) {
      return NextResponse.json({ error: "Sem autorização" }, { status: 403 });
    }
    const counts = new Map<string, { waiting: number; optedIn: number }>();
    let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
    let scanned = 0;
    while (scanned < 2000) {
      let query = sellerRef.collection("wishlistCustomers").orderBy(admin.firestore.FieldPath.documentId()).limit(250);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const keys = new Set((Array.isArray(data.productIds) ? data.productIds : []).filter(validId).slice(0, 40) as string[]);
        for (const key of keys) {
          const next = counts.get(key) ?? { waiting: 0, optedIn: 0 };
          next.waiting++;
          if (data.notifyWhenAvailable === true) next.optedIn++;
          counts.set(key, next);
        }
      }
      scanned += snapshot.size;
      if (snapshot.empty || snapshot.size < 250) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    const top = Array.from(counts.entries()).sort((a,b) => b[1].waiting - a[1].waiting).slice(0, 60);
    const productDocs = top.length ? await db.getAll(...top.map(([id]) => sellerRef.collection("products").doc(id))) : [];
    return NextResponse.json({ ok: true, scanned, partial: scanned >= 2000, products: top.map(([id, counts], i) => ({ productId: id,
      name: String(productDocs[i]?.data()?.name || productDocs[i]?.data()?.title || "Produto não disponível").slice(0, 120),
      status: String(productDocs[i]?.data()?.status || "inactive"), ...counts })) }, { headers: { "Cache-Control": "private,no-store" } });
  } catch(e) {
    console.error("[seller/wishlist-demand]", e);
    return NextResponse.json({ error: "Não foi possível carregar a lista de espera." }, { status: 500 });
  }
}

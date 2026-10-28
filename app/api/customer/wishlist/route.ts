import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{6,150}$/.test(v);
const idsOf = (value: unknown) => Array.isArray(value) ? value.filter(validId).slice(0, 40) as string[] : [];

async function authorize(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const db = getAdminDb();
    const [customer, identity] = await db.getAll(db.collection("customers").doc(decoded.uid), db.collection("users").doc(decoded.uid));
    if (!customer.exists || customer.data()?.accountStatus !== "active" ||
      (identity.exists && (identity.data()?.role === "seller" || identity.data()?.role === "admin" || Boolean(identity.data()?.sellerId)))) return null;
    return { db, uid: decoded.uid };
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const sellerId = request.nextUrl.searchParams.get("sellerId");
  if (!validId(sellerId)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  const actor = await authorize(request);
  if (!actor) return NextResponse.json({ error: "Entre com uma conta de cliente." }, { status: 401 });
  const doc = await actor.db.collection("customers").doc(actor.uid).collection("wishlists").doc(sellerId).get();
  return NextResponse.json({ ok: true, productIds: idsOf(doc.data()?.productIds), notifyWhenAvailable: doc.data()?.notifyWhenAvailable === true }, { headers: { "Cache-Control": "private,no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await authorize(request);
  if (!actor) return NextResponse.json({ error: "Entre com uma conta de cliente." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const sellerId = body.sellerId;
  if (!validId(sellerId)) return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
  const modifyingList = typeof body.productId === "string" && typeof body.saved === "boolean";
  const modifyingAlerts = typeof body.notifyWhenAvailable === "boolean";
  if ((modifyingList === modifyingAlerts) || (modifyingList && !validId(body.productId))) {
    return NextResponse.json({ error: "Alteração inválida." }, { status: 400 });
  }
  const db = actor.db;
  const sellerRef = db.collection("sellers").doc(sellerId);
  const customerRef = db.collection("customers").doc(actor.uid);
  const sourceRef = customerRef.collection("wishlists").doc(sellerId);
  const mirrorRef = sellerRef.collection("wishlistCustomers").doc(actor.uid);
  const productRef = modifyingList && body.saved ? sellerRef.collection("products").doc(body.productId) : null;
  try {
    const result = await db.runTransaction(async tx => {
      const [customer, identity, seller, current, ...productSnapshots] = await tx.getAll(customerRef, db.collection("users").doc(actor.uid), sellerRef, sourceRef,
        ...(productRef ? [productRef] : []));
      const product = productSnapshots[0];
      if (customer.data()?.accountStatus !== "active" ||
        (identity.exists && (identity.data()?.role === "seller" || identity.data()?.role === "admin" || Boolean(identity.data()?.sellerId)))) throw new Error("AUTH");
      if (!seller.exists || seller.data()?.accountStatus !== "active") throw new Error("STORE");
      if (productRef) {
        const p = product?.data();
        if (!product?.exists || !["active", "made_to_order", "preorder"].includes(String(p?.status ?? "active")) || p?.active === false) throw new Error("PRODUCT");
      }
      const list = new Set(idsOf(current.data()?.productIds));
      if (modifyingList) {
        if (body.saved) {
          if (list.size >= 40 && !list.has(body.productId)) throw new Error("LIMIT");
          list.add(body.productId);
        } else list.delete(body.productId);
      }
      const notify = modifyingAlerts ? body.notifyWhenAvailable === true : current.data()?.notifyWhenAvailable === true;
      const now = admin.firestore.Timestamp.now();
      const data = { sellerId, productIds: Array.from(list), notifyWhenAvailable: notify, updatedAt: now };
      tx.set(sourceRef, data, { merge: true });
      // Private, minimal projection for aggregate demand & the opt-in restock trigger.
      tx.set(mirrorRef, { ...data, customerUid: actor.uid }, { merge: true });
      return { productIds: data.productIds, notifyWhenAvailable: notify };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const status = code === "AUTH" ? 403 : code === "STORE" || code === "PRODUCT" ? 404 : code === "LIMIT" ? 400 : 500;
    if (status === 500) console.error("[wishlist]", e);
    return NextResponse.json({ error: code === "LIMIT" ? "Limite de 40 favoritos por loja." : code === "PRODUCT" ? "Produto indisponível para favoritos." : code === "AUTH" ? "Conta de cliente necessária." : "Não foi possível salvar seus favoritos." }, { status });
  }
}

import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "ERR_INVALID_BODY" }, { status: 400 });

    const sellerId = String(body.sellerId || "").trim();
    const regionName = String(body.regionName || "").trim();

    if (!sellerId) return NextResponse.json({ ok: false, error: "ERR_MISSING_SELLER" }, { status: 400 });
    if (!regionName || regionName.length < 2) return NextResponse.json({ ok: false, error: "ERR_SHORT_NAME" }, { status: 400 });

    const regionSlug = slugify(regionName);
    const db = getAdminDb();
    
    // Caminho: sellers/{sellerId}/regionRegistry/{regionSlug}
    const regRef = db.collection("sellers").doc(sellerId).collection("regionRegistry").doc(regionSlug);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(regRef);

      if (snap.exists) {
        return { regionId: snap.data()?.regionId || regionSlug, regionSlug, reused: true };
      }

      const newDoc = {
        sellerId,
        regionId: regionSlug,
        regionName,
        regionSlug,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(regRef, newDoc);
      return { regionId: regionSlug, regionSlug, reused: false };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("RegionResolve Error:", e);
    return NextResponse.json({ ok: false, error: "ERR_INTERNAL" }, { status: 500 });
  }
}
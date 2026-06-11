import { NextResponse } from "next/server";
import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const MAX_BODY_BYTES = 50_000;

const cleanStr = (v: any, maxLen: number) => {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen) || "";
};

function hashEndpoint(endpoint: string) {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") || "0");
    if (len > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "ERR_PAYLOAD_TOO_LARGE" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "ERR_INVALID_JSON" }, { status: 400 });

    const subscription = body.subscription;
    const sellerId = cleanStr(body.sellerId, 120);
    const regionId = cleanStr(body.regionId, 120);
    const endpoint = cleanStr(subscription?.endpoint, 2000);
    const p256dh = cleanStr(subscription?.keys?.p256dh, 500);
    const auth = cleanStr(subscription?.keys?.auth, 200);

    if (!sellerId || !regionId) return NextResponse.json({ ok: false, error: "ERR_MISSING_IDS" }, { status: 400 });
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ ok: false, error: "ERR_INVALID_SUBSCRIPTION" }, { status: 400 });

    const db = getAdminDb();
    const docId = hashEndpoint(endpoint);
    const docRef = db.collection("pushSubscriptions").doc(docId);

    await docRef.set(
      {
        endpoint,
        keys: { p256dh, auth },
        expirationTime: subscription?.expirationTime ?? null,
        sellerId,
        regionId,
        userAgent: cleanStr(req.headers.get("user-agent"), 300),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: docId });
  } catch (err: any) {
    console.error("[PUSH_SUBSCRIBE_ERROR]:", err);
    return NextResponse.json({ ok: false, error: "ERR_INTERNAL" }, { status: 500 });
  }
}
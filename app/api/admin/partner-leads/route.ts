import * as admin from "firebase-admin";
import { NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadStatus = "new" | "reviewing" | "contacted" | "approved" | "rejected";
const STATUSES = new Set<LeadStatus>(["new", "reviewing", "contacted", "approved", "rejected"]);

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function timestampToIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      return (value as { toDate(): Date }).toDate().toISOString();
    } catch {}
  }
  return null;
}

async function requireAdmin(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("AUTH_REQUIRED");

  const decoded = await getAdminAuth().verifyIdToken(token, true);
  const snapshot = await getAdminDb().collection("users").doc(decoded.uid).get();
  const data = snapshot.data() ?? {};
  if (!snapshot.exists || data.role !== "admin" || data.accountStatus === "disabled" || data.accountStatus === "suspended") {
    throw new Error("FORBIDDEN");
  }
  return decoded;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snapshot = await getAdminDb()
      .collection("partnerLeads")
      .orderBy("createdAt", "desc")
      .limit(150)
      .get();

    const leads = snapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        fullName: String(data.fullName ?? ""),
        businessName: String(data.businessName ?? ""),
        email: String(data.email ?? ""),
        phone: typeof data.phone === "string" ? data.phone : "",
        businessType: typeof data.businessType === "string" ? data.businessType : "",
        region: typeof data.region === "string" ? data.region : "",
        usage: String(data.usage ?? "both"),
        notes: typeof data.notes === "string" ? data.notes : "",
        status: String(data.status ?? "new"),
        adminNote: typeof data.adminNote === "string" ? data.adminNote : "",
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, leads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FAILED";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[api/admin/partner-leads][GET]", error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const decoded = await requireAdmin(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = String(body?.id ?? "").trim();
    const status = String(body?.status ?? "").trim() as LeadStatus;
    const adminNote = String(body?.adminNote ?? "").trim().slice(0, 700);

    if (!id || !STATUSES.has(status)) {
      return NextResponse.json({ ok: false, error: "INVALID_REQUEST" }, { status: 400 });
    }

    const reference = getAdminDb().collection("partnerLeads").doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await reference.update({
      status,
      adminNote: adminNote || null,
      updatedAt: now,
      reviewedAt: now,
      reviewedBy: decoded.uid,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FAILED";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    if (status === 500) console.error("[api/admin/partner-leads][PATCH]", error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

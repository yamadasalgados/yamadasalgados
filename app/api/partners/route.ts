import * as admin from "firebase-admin";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Usage = "store" | "events" | "both";

function text(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    // Honeypot simples para robôs. Usuários reais nunca preenchem este campo.
    if (text(body.website, 120)) {
      return NextResponse.json({ ok: true });
    }

    const fullName = text(body.fullName, 100);
    const businessName = text(body.businessName, 120);
    const email = text(body.email, 160).toLowerCase();
    const phone = text(body.phone, 40);
    const businessType = text(body.businessType, 80);
    const region = text(body.region, 100);
    const notes = text(body.notes, 700);
    const rawUsage = text(body.usage, 20);
    const usage: Usage = rawUsage === "store" || rawUsage === "events" ? rawUsage : "both";

    if (!fullName || !businessName || !validEmail(email)) {
      return NextResponse.json({ ok: false, error: "REQUIRED_FIELDS" }, { status: 400 });
    }

    const db = getAdminDb();
    const reference = db.collection("partnerLeads").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await reference.set({
      schemaVersion: 1,
      fullName,
      businessName,
      email,
      phone: phone || null,
      businessType: businessType || null,
      region: region || null,
      usage,
      notes: notes || null,
      status: "new",
      adminNote: null,
      source: "partners_page",
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null,
    });

    return NextResponse.json(
      { ok: true, referenceId: reference.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/partners] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "REQUEST_FAILED" }, { status: 500 });
  }
}

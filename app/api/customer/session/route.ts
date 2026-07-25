import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizeCustomerAddress, type CustomerAddressProfile } from "@/app/lib/customer-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Language = "pt" | "en" | "ja";

class CustomerSessionError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerSessionError";
    this.status = status;
  }
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanLanguage(value: unknown): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function authenticate(request: NextRequest): Promise<admin.auth.DecodedIdToken> {
  const token = bearerToken(request);
  if (!token) throw new CustomerSessionError("Entre para acessar sua conta.", 401);

  try {
    return await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new CustomerSessionError("Sua sessão expirou. Entre novamente.", 401);
  }
}

function profileResponse(uid: string, data: Record<string, unknown>) {
  const rewards =
    data.rewards && typeof data.rewards === "object" && !Array.isArray(data.rewards)
      ? (data.rewards as Record<string, unknown>)
      : {};

  return {
    uid,
    name: cleanString(data.name ?? data.displayName, 120),
    phone: cleanString(data.phone, 50),
    email: cleanString(data.email, 200),
    photoURL: cleanString(data.photoURL, 2000),
    preferredLanguage: cleanLanguage(data.preferredLanguage),
    pointsBalance:
      typeof rewards.pointsBalance === "number" && Number.isFinite(rewards.pointsBalance)
        ? Math.max(0, Math.floor(rewards.pointsBalance))
        : 0,
    address: normalizeCustomerAddress(data.address),
  };
}

function mergeAddress(
  currentValue: unknown,
  inputValue: unknown,
  replace = false,
): CustomerAddressProfile {
  const current = normalizeCustomerAddress(currentValue);
  const input = normalizeCustomerAddress(inputValue);

  if (replace) return input;

  return {
    deliveryAddress: input.deliveryAddress || current.deliveryAddress,
    locationLink: input.locationLink || current.locationLink,
    recipientName: input.recipientName || current.recipientName,
    postalCode: input.postalCode || current.postalCode,
    prefecture: input.prefecture || current.prefecture,
    city: input.city || current.city,
    addressLine1: input.addressLine1 || current.addressLine1,
    addressLine2: input.addressLine2 || current.addressLine2,
  };
}

async function ensureCustomer(
  decoded: admin.auth.DecodedIdToken,
  input: Record<string, unknown> = {},
) {
  const db = getAdminDb();
  const reference = db.collection("customers").doc(decoded.uid);
  const now = admin.firestore.Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() ?? {};
    const name =
      cleanString(input.name, 120) ||
      cleanString(current.name ?? current.displayName, 120) ||
      cleanString(decoded.name, 120);
    const phone = cleanString(input.phone, 50) || cleanString(current.phone, 50);
    const email =
      cleanString(decoded.email, 200).toLowerCase() ||
      cleanString(current.email, 200).toLowerCase();
    const photoURL = cleanString(decoded.picture, 2000) || cleanString(current.photoURL, 2000);
    const preferredLanguage = cleanLanguage(
      input.preferredLanguage ?? current.preferredLanguage,
    );
    const address = mergeAddress(
      current.address,
      input.address,
      input.replaceAddress === true,
    );

    if (!snapshot.exists) {
      transaction.create(reference, {
        schemaVersion: 1,
        uid: decoded.uid,
        name: name || null,
        phone: phone || null,
        email: email || null,
        photoURL: photoURL || null,
        preferredLanguage,
        address,
        accountStatus: "active",
        rewards: {
          pointsBalance: 0,
          lifetimeEarned: 0,
          lifetimeRedeemed: 0,
          schemaVersion: 1,
        },
        orderCount: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      });

      return profileResponse(decoded.uid, {
        name,
        phone,
        email,
        photoURL,
        preferredLanguage,
        address,
        rewards: { pointsBalance: 0 },
      });
    }

    transaction.set(
      reference,
      {
        uid: decoded.uid,
        name: name || null,
        phone: phone || null,
        email: email || null,
        photoURL: photoURL || null,
        preferredLanguage,
        address,
        accountStatus: current.accountStatus === "disabled" ? "disabled" : "active",
        updatedAt: now,
        lastLoginAt: now,
      },
      { merge: true },
    );

    return profileResponse(decoded.uid, {
      ...current,
      name,
      phone,
      email,
      photoURL,
      preferredLanguage,
      address,
    });
  });
}

async function handle(request: NextRequest, allowBody: boolean) {
  try {
    const decoded = await authenticate(request);
    let input: Record<string, unknown> = {};

    if (allowBody) {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body === "object" && !Array.isArray(body)) {
        input = body as Record<string, unknown>;
      }
    }

    const profile = await ensureCustomer(decoded, input);
    return NextResponse.json(
      { ok: true, profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof CustomerSessionError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Não foi possível acessar a conta do cliente.";

    if (!(error instanceof CustomerSessionError)) {
      console.error("[api/customer/session] Unexpected error:", error);
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request, false);
}

export async function POST(request: NextRequest) {
  return handle(request, true);
}

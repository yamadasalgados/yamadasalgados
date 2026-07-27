import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";

export type PrintCopies = "both" | "production" | "customer";

export type PrintSettings = {
  enabled: boolean;
  autoPrint: boolean;
  copies: PrintCopies;
  tokenHash: string;
  tokenPrefix: string;
  lastSeenAtMillis: number;
  lastPrintedAtMillis: number;
  lastError: string;
};

export class PrintApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PrintApiError";
    this.code = code;
    this.status = status;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function cleanString(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function timestampMillis(value: unknown): number {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = asRecord(value);
  const seconds = Number(raw.seconds ?? raw._seconds);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

export function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function authorizeSeller(request: NextRequest, sellerId: string) {
  const token = bearerToken(request);
  if (!token) {
    throw new PrintApiError("AUTH_REQUIRED", "Entre novamente para configurar a impressão.", 401);
  }

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new PrintApiError("AUTH_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
  }

  const db = getAdminDb();
  const [userSnapshot, sellerSnapshot] = await db.getAll(
    db.collection("users").doc(decoded.uid),
    db.collection("sellers").doc(sellerId),
  );
  const userData = userSnapshot.data() ?? {};
  const sellerData = sellerSnapshot.data() ?? {};
  const adminUser = userData.role === "admin" && userData.accountStatus === "active";
  const owner =
    decoded.uid === sellerId ||
    userData.sellerId === sellerId ||
    sellerData.ownerUid === decoded.uid;

  if (!adminUser && !owner) {
    throw new PrintApiError("FORBIDDEN", "Você não pode configurar esta loja.", 403);
  }

  return {
    uid: decoded.uid,
    sellerData,
  };
}

export function hashStationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createStationToken(): { token: string; hash: string; prefix: string } {
  const token = `yp_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    hash: hashStationToken(token),
    prefix: token.slice(0, 12),
  };
}

export function safeTokenMatch(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashStationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizePrintSettings(value: unknown): PrintSettings {
  const raw = asRecord(value);
  const copies: PrintCopies =
    raw.copies === "production" || raw.copies === "customer" ? raw.copies : "both";

  return {
    enabled: raw.enabled === true,
    autoPrint: raw.autoPrint !== false,
    copies,
    tokenHash: cleanString(raw.tokenHash, 128),
    tokenPrefix: cleanString(raw.tokenPrefix, 32),
    lastSeenAtMillis: timestampMillis(raw.lastSeenAt),
    lastPrintedAtMillis: timestampMillis(raw.lastPrintedAt),
    lastError: cleanString(raw.lastError, 1000),
  };
}

export async function authorizePrintStation(params: {
  request: NextRequest;
  sellerId: string;
}): Promise<{ settingsRef: admin.firestore.DocumentReference; settings: PrintSettings }> {
  const { request, sellerId } = params;
  const token = bearerToken(request);
  if (!token) {
    throw new PrintApiError("STATION_AUTH_REQUIRED", "Chave da estação de impressão ausente.", 401);
  }

  const db = getAdminDb();
  const settingsRef = db.collection("sellers").doc(sellerId).collection("settings").doc("printing");
  const snapshot = await settingsRef.get();
  const settings = normalizePrintSettings(snapshot.data());

  if (!settings.enabled || !safeTokenMatch(token, settings.tokenHash)) {
    throw new PrintApiError("STATION_FORBIDDEN", "Estação de impressão não autorizada.", 403);
  }

  return { settingsRef, settings };
}

export function stationOnline(settings: PrintSettings): boolean {
  return settings.lastSeenAtMillis > 0 && Date.now() - settings.lastSeenAtMillis < 90_000;
}

export function printCopies(value: unknown): PrintCopies {
  return value === "production" || value === "customer" ? value : "both";
}

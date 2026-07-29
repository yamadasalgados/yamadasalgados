import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { isAdminOrOperationalSellerOwnerRecord } from "@/app/lib/seller-authorization";

export type PrintCopies = "both" | "production" | "customer";
export type PrintConnectionMode = "local" | "preview" | "windows" | "cups" | "tcp";

export type PrintProfile = {
  id: string;
  name: string;
  stationName: string;
  enabled: boolean;
  autoPrint: boolean;
  copies: PrintCopies;
  connectionMode: PrintConnectionMode;
  printerName: string;
  networkHost: string;
  networkPort: number;
  paperWidthMm: 58 | 80;
  dpi: number;
  dotsPerLine: number;
  intensity: number;
  useAdvancedThreshold: boolean;
  rasterThreshold: number;
  cutAfterPrint: boolean;
  feedLines: number;
  windowsPrintSettings: string;
  lpOptions: string;
  copyDelayMs: number;
  tokenHash: string;
  tokenPrefix: string;
};

export type PrintSettings = {
  schemaVersion: number;
  enabled: boolean;
  profiles: PrintProfile[];
};

export type PrintStationStatus = {
  lastSeenAtMillis: number;
  lastPrintedAtMillis: number;
  lastError: string;
  stationName: string;
  stationVersion: string;
  platform: string;
  arch: string;
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

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
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
  const authorized = isAdminOrOperationalSellerOwnerRecord({
    uid: decoded.uid,
    sellerId,
    userData,
    sellerData,
  });

  if (!authorized) {
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
  const token = `ps_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    hash: hashStationToken(token),
    prefix: token.slice(0, 12),
  };
}

export function createPrintProfileId(): string {
  return `printer_${randomBytes(7).toString("hex")}`;
}

function safeProfileId(value: unknown, fallbackId = ""): string {
  const raw = cleanString(value, 100);
  const safe = raw.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^\.+|\.+$/g, "");
  if (safe && safe !== "." && safe !== "..") return safe;

  const fallback = cleanString(fallbackId, 100)
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^\.+|\.+$/g, "");
  return fallback || createPrintProfileId();
}

export function safeTokenMatch(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashStationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function printCopies(value: unknown): PrintCopies {
  return value === "production" || value === "customer" ? value : "both";
}

export function printConnectionMode(value: unknown): PrintConnectionMode {
  return value === "preview" || value === "windows" || value === "cups" || value === "tcp" || value === "local"
    ? value
    : "preview";
}

export function normalizePrintProfile(value: unknown, fallbackId = ""): PrintProfile {
  const raw = asRecord(value);
  const paperWidthMm: 58 | 80 = Number(raw.paperWidthMm) === 58 ? 58 : 80;
  const dpi = boundedInteger(raw.dpi, 203, 180, 600);
  const defaultDots = paperWidthMm === 58 ? 384 : 576;

  return {
    id: safeProfileId(raw.id, fallbackId),
    name: cleanString(raw.name, 120) || "Impressora principal",
    stationName: cleanString(raw.stationName, 120) || cleanString(raw.name, 120) || "Estação de impressão",
    enabled: raw.enabled !== false,
    autoPrint: raw.autoPrint !== false,
    copies: printCopies(raw.copies),
    connectionMode: printConnectionMode(raw.connectionMode ?? raw.printMode),
    printerName: cleanString(raw.printerName, 240),
    networkHost: cleanString(raw.networkHost ?? raw.host, 255),
    networkPort: boundedInteger(raw.networkPort ?? raw.port, 9100, 1, 65535),
    paperWidthMm,
    dpi,
    dotsPerLine: boundedInteger(raw.dotsPerLine, defaultDots, 128, 2048),
    intensity: boundedInteger(raw.intensity, 55, 0, 100),
    useAdvancedThreshold: raw.useAdvancedThreshold === true,
    rasterThreshold: boundedInteger(raw.rasterThreshold, 168, 1, 254),
    cutAfterPrint: raw.cutAfterPrint !== false,
    feedLines: boundedInteger(raw.feedLines, 4, 0, 20),
    windowsPrintSettings: cleanString(raw.windowsPrintSettings, 300) || "fit",
    lpOptions: cleanString(raw.lpOptions, 500),
    copyDelayMs: boundedInteger(raw.copyDelayMs, 1000, 0, 30_000),
    tokenHash: cleanString(raw.tokenHash, 128),
    tokenPrefix: cleanString(raw.tokenPrefix, 32),
  };
}

export function normalizePrintSettings(value: unknown): PrintSettings {
  const raw = asRecord(value);
  const rawProfiles = Array.isArray(raw.profiles) ? raw.profiles.slice(0, 12) : [];
  const profiles = rawProfiles
    .map((profile, index) => normalizePrintProfile(profile, `printer_${index + 1}`))
    .filter((profile, index, all) => all.findIndex((candidate) => candidate.id === profile.id) === index);

  // Migração transparente da configuração única usada até a 06D4.
  if (profiles.length === 0 && cleanString(raw.tokenHash, 128)) {
    profiles.push(normalizePrintProfile({
      id: "legacy",
      name: cleanString(raw.stationName, 120) || "Impressora principal",
      stationName: cleanString(raw.stationName, 120) || "Estação de impressão",
      enabled: raw.enabled === true,
      autoPrint: raw.autoPrint !== false,
      copies: raw.copies,
      connectionMode: "local",
      tokenHash: raw.tokenHash,
      tokenPrefix: raw.tokenPrefix,
    }, "legacy"));
  }

  return {
    schemaVersion: Math.max(2, nonNegativeInteger(raw.schemaVersion)),
    enabled: raw.enabled !== false,
    profiles,
  };
}

export function normalizeStationStatus(value: unknown): PrintStationStatus {
  const raw = asRecord(value);
  return {
    lastSeenAtMillis: timestampMillis(raw.lastSeenAt),
    lastPrintedAtMillis: timestampMillis(raw.lastPrintedAt),
    lastError: cleanString(raw.lastError, 1000),
    stationName: cleanString(raw.stationName, 120),
    stationVersion: cleanString(raw.stationVersion, 40),
    platform: cleanString(raw.platform, 40),
    arch: cleanString(raw.arch, 40),
  };
}

export function stationOnline(status: PrintStationStatus): boolean {
  return status.lastSeenAtMillis > 0 && Date.now() - status.lastSeenAtMillis < 90_000;
}

export function publicPrintProfile(profile: PrintProfile) {
  return {
    id: profile.id,
    name: profile.name,
    stationName: profile.stationName,
    enabled: profile.enabled,
    autoPrint: profile.autoPrint,
    copies: profile.copies,
    connectionMode: profile.connectionMode,
    printerName: profile.printerName,
    networkHost: profile.networkHost,
    networkPort: profile.networkPort,
    paperWidthMm: profile.paperWidthMm,
    dpi: profile.dpi,
    dotsPerLine: profile.dotsPerLine,
    intensity: profile.intensity,
    useAdvancedThreshold: profile.useAdvancedThreshold,
    rasterThreshold: profile.rasterThreshold,
    cutAfterPrint: profile.cutAfterPrint,
    feedLines: profile.feedLines,
    windowsPrintSettings: profile.windowsPrintSettings,
    lpOptions: profile.lpOptions,
    copyDelayMs: profile.copyDelayMs,
    configured: Boolean(profile.tokenHash),
    tokenPrefix: profile.tokenPrefix,
  };
}

export function profileQueueKey(profileId: string, status: string): string {
  return `${profileId}:${status}`;
}

export async function authorizePrintStation(params: {
  request: NextRequest;
  sellerId: string;
  profileId?: string;
}): Promise<{
  settingsRef: admin.firestore.DocumentReference;
  stationRef: admin.firestore.DocumentReference;
  settings: PrintSettings;
  profile: PrintProfile;
}> {
  const { request, sellerId } = params;
  const token = bearerToken(request);
  if (!token) {
    throw new PrintApiError("STATION_AUTH_REQUIRED", "Chave da estação de impressão ausente.", 401);
  }

  const db = getAdminDb();
  const sellerRef = db.collection("sellers").doc(sellerId);
  const settingsRef = sellerRef.collection("settings").doc("printing");
  const snapshot = await settingsRef.get();
  const settings = normalizePrintSettings(snapshot.data());
  const requestedProfileId = cleanString(params.profileId, 100);
  const profile = requestedProfileId
    ? settings.profiles.find((candidate) => candidate.id === requestedProfileId)
    : settings.profiles.length === 1
      ? settings.profiles[0]
      : settings.profiles.find((candidate) => candidate.id === "legacy");

  if (!profile?.enabled || !safeTokenMatch(token, profile.tokenHash)) {
    throw new PrintApiError("STATION_FORBIDDEN", "Estação de impressão não autorizada.", 403);
  }

  return {
    settingsRef,
    stationRef: sellerRef.collection("printStations").doc(profile.id),
    settings,
    profile,
  };
}

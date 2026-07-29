import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { DEFAULT_PUBLIC_STORE_NAME, PRINT_SERVICE_NAME } from "@/app/lib/platform-brand";
import {
  PrintApiError,
  asRecord,
  authorizeSeller,
  cleanString,
  createPrintProfileId,
  createStationToken,
  normalizePrintProfile,
  normalizePrintSettings,
  normalizeStationStatus,
  profileQueueKey,
  publicPrintProfile,
  stationOnline,
  type PrintProfile,
} from "@/app/lib/print-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sellerIdFrom(request: NextRequest): string {
  const sellerId = cleanString(request.nextUrl.searchParams.get("sellerId"), 160);
  if (!sellerId || sellerId.includes("/")) {
    throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
  }
  return sellerId;
}

function findProfile(profiles: PrintProfile[], profileId: unknown): PrintProfile {
  const id = cleanString(profileId, 100);
  const profile = profiles.find((candidate) => candidate.id === id);
  if (!profile) throw new PrintApiError("PRINT_PROFILE_NOT_FOUND", "Perfil de impressora não encontrado.", 404);
  return profile;
}

function validateProfile(profile: PrintProfile) {
  if (!profile.enabled) return;
  if ((profile.connectionMode === "windows" || profile.connectionMode === "cups") && !profile.printerName) {
    throw new PrintApiError("PRINT_PROFILE_INVALID", "Informe o nome da impressora ou fila para este perfil.");
  }
  if (profile.connectionMode === "tcp" && !profile.networkHost) {
    throw new PrintApiError("PRINT_PROFILE_INVALID", "Informe o IP ou host da impressora TCP/IP.");
  }
}

async function responseSettings(sellerId: string, value: unknown) {
  const settings = normalizePrintSettings(value);
  const db = getAdminDb();
  const stationRefs = settings.profiles.map((profile) =>
    db.collection("sellers").doc(sellerId).collection("printStations").doc(profile.id),
  );
  const stationSnapshots = stationRefs.length ? await db.getAll(...stationRefs) : [];

  return {
    schemaVersion: settings.schemaVersion,
    enabled: settings.enabled,
    profiles: settings.profiles.map((profile, index) => {
      const status = normalizeStationStatus(stationSnapshots[index]?.data());
      return {
        ...publicPrintProfile(profile),
        online: stationOnline(status),
        lastSeenAt: status.lastSeenAtMillis ? new Date(status.lastSeenAtMillis).toISOString() : null,
        lastPrintedAt: status.lastPrintedAtMillis
          ? new Date(status.lastPrintedAtMillis).toISOString()
          : null,
        lastError: status.lastError || null,
        reportedStationName: status.stationName || null,
        stationVersion: status.stationVersion || null,
        platform: status.platform || null,
        arch: status.arch || null,
      };
    }),
  };
}

async function readSettings(sellerId: string) {
  const ref = getAdminDb().collection("sellers").doc(sellerId).collection("settings").doc("printing");
  const snapshot = await ref.get();
  return { ref, snapshot, settings: normalizePrintSettings(snapshot.data()) };
}

export async function GET(request: NextRequest) {
  try {
    const sellerId = sellerIdFrom(request);
    await authorizeSeller(request, sellerId);
    const { snapshot } = await readSettings(sellerId);

    return NextResponse.json({
      ok: true,
      settings: await responseSettings(sellerId, snapshot.data()),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json());
    const sellerId = cleanString(body.sellerId, 160);
    const action = cleanString(body.action, 40);
    if (!sellerId || sellerId.includes("/")) {
      throw new PrintApiError("INVALID_REQUEST", "Vendedor inválido.");
    }

    const actor = await authorizeSeller(request, sellerId);
    const db = getAdminDb();
    const sellerRef = db.collection("sellers").doc(sellerId);
    const settingsRef = sellerRef.collection("settings").doc("printing");
    const now = admin.firestore.Timestamp.now();

    if (action === "update_global" || action === "update") {
      const { settings } = await readSettings(sellerId);
      await settingsRef.set({
        schemaVersion: 2,
        enabled: body.enabled !== false,
        profiles: settings.profiles,
        updatedAt: now,
        updatedBy: actor.uid,
      }, { merge: true });
      const snapshot = await settingsRef.get();
      return NextResponse.json({ ok: true, settings: await responseSettings(sellerId, snapshot.data()) });
    }

    if (action === "create_profile") {
      const generated = createStationToken();
      const profileId = createPrintProfileId();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const settings = normalizePrintSettings(snapshot.data());
        if (settings.profiles.length >= 12) {
          throw new PrintApiError("PRINT_PROFILE_LIMIT", "Limite de 12 perfis de impressora atingido.", 409);
        }
        const profile = normalizePrintProfile({
          ...asRecord(body.profile),
          id: profileId,
          tokenHash: generated.hash,
          tokenPrefix: generated.prefix,
        }, profileId);
        validateProfile(profile);
        transaction.set(settingsRef, {
          schemaVersion: 2,
          enabled: settings.enabled,
          profiles: [...settings.profiles, profile],
          updatedAt: now,
          updatedBy: actor.uid,
        }, { merge: true });
      });
      const snapshot = await settingsRef.get();
      return NextResponse.json({
        ok: true,
        token: generated.token,
        profileId,
        settings: await responseSettings(sellerId, snapshot.data()),
      });
    }

    if (action === "update_profile") {
      const incoming = asRecord(body.profile);
      const profileId = cleanString(body.profileId ?? incoming.id, 100);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const settings = normalizePrintSettings(snapshot.data());
        const current = findProfile(settings.profiles, profileId);
        const updated = normalizePrintProfile({
          ...current,
          ...incoming,
          id: current.id,
          tokenHash: current.tokenHash,
          tokenPrefix: current.tokenPrefix,
        }, current.id);
        validateProfile(updated);
        transaction.set(settingsRef, {
          schemaVersion: 2,
          enabled: settings.enabled,
          profiles: settings.profiles.map((profile) => profile.id === current.id ? updated : profile),
          updatedAt: now,
          updatedBy: actor.uid,
        }, { merge: true });
      });
      const snapshot = await settingsRef.get();
      return NextResponse.json({ ok: true, settings: await responseSettings(sellerId, snapshot.data()) });
    }

    if (action === "rotate_token") {
      const generated = createStationToken();
      let rotatedProfileId = cleanString(body.profileId, 100);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const settings = normalizePrintSettings(snapshot.data());
        let profiles = settings.profiles;
        if (!profiles.length) {
          rotatedProfileId = createPrintProfileId();
          profiles = [normalizePrintProfile({
            id: rotatedProfileId,
            name: "Impressora principal",
            enabled: true,
            autoPrint: true,
            copies: "both",
            connectionMode: "preview",
          }, rotatedProfileId)];
        }
        const current = findProfile(profiles, rotatedProfileId || profiles[0].id);
        rotatedProfileId = current.id;
        transaction.set(settingsRef, {
          schemaVersion: 2,
          enabled: settings.enabled,
          profiles: profiles.map((profile) => profile.id === current.id ? {
            ...profile,
            enabled: true,
            tokenHash: generated.hash,
            tokenPrefix: generated.prefix,
          } : profile),
          updatedAt: now,
          updatedBy: actor.uid,
        }, { merge: true });
      });
      await sellerRef.collection("printStations").doc(rotatedProfileId).set({
        lastSeenAt: null,
        lastError: null,
        tokenRotatedAt: now,
        updatedAt: now,
      }, { merge: true });
      const snapshot = await settingsRef.get();
      return NextResponse.json({
        ok: true,
        token: generated.token,
        profileId: rotatedProfileId,
        settings: await responseSettings(sellerId, snapshot.data()),
      });
    }

    if (action === "delete_profile") {
      const profileId = cleanString(body.profileId, 100);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const settings = normalizePrintSettings(snapshot.data());
        findProfile(settings.profiles, profileId);
        transaction.set(settingsRef, {
          schemaVersion: 2,
          enabled: settings.enabled,
          profiles: settings.profiles.filter((profile) => profile.id !== profileId),
          updatedAt: now,
          updatedBy: actor.uid,
        }, { merge: true });
      });
      await sellerRef.collection("printStations").doc(profileId).delete().catch(() => undefined);
      const snapshot = await settingsRef.get();
      return NextResponse.json({ ok: true, settings: await responseSettings(sellerId, snapshot.data()) });
    }

    if (action === "test") {
      const { settings } = await readSettings(sellerId);
      const profile = findProfile(settings.profiles, body.profileId);
      validateProfile(profile);
      if (!settings.enabled || !profile.enabled || !profile.tokenHash) {
        throw new PrintApiError(
          "PRINT_NOT_CONFIGURED",
          "Ative o perfil e gere a chave da estação antes de enviar uma impressão de teste.",
          409,
        );
      }
      const jobRef = sellerRef.collection("printJobs").doc();
      await jobRef.create({
        schemaVersion: 2,
        type: "test",
        sellerId,
        profileId: profile.id,
        queueKey: profileQueueKey(profile.id, "pending"),
        status: "pending",
        copies: profile.copies,
        attempts: 0,
        testPayload: {
          storeName: cleanString(actor.sellerData.storeName, 160) || DEFAULT_PUBLIC_STORE_NAME,
          message: `${PRINT_SERVICE_NAME} conectado com sucesso. Perfil: ${profile.name}.`,
        },
        profileSnapshot: publicPrintProfile(profile),
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
      });
      return NextResponse.json({ ok: true, jobId: jobRef.id });
    }

    throw new PrintApiError("INVALID_ACTION", "Ação inválida.");
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof PrintApiError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  console.error("[api/print/settings]", error);
  return NextResponse.json({ ok: false, code: "PRINT_SETTINGS_FAILED", error: "Falha ao salvar impressão." }, {
    status: 500,
    headers: { "Cache-Control": "no-store" },
  });
}

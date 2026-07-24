import type {
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";
import {
  defaultSellerAccess,
  effectivePlanLimits,
  getEffectiveSellerAccess,
  normalizeAccountStatus,
} from "@/app/lib/access-control";
import {
  normalizeLanguage,
} from "@/app/lib/regional";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import type {
  SupportedLanguage,
} from "@/app/types/regional";

export type UserRole =
  | "admin"
  | "seller";

export type EnsureResult = {
  userDoc: DocumentData;
  sellerDoc: DocumentData | null;
};

function normalizedTextOrNull(
  value: unknown,
): string | null {
  const normalized =
    String(value ?? "").trim();

  return normalized || null;
}

function normalizeStoredRole(
  value: unknown,
): UserRole {
  return value === "admin"
    ? "admin"
    : "seller";
}

function storedLanguage(
  data: DocumentData,
  requestedLanguage: SupportedLanguage,
): SupportedLanguage {
  return normalizeLanguage(
    data.uiLanguage ??
      data.preferredLanguage ??
      data.locale,
    requestedLanguage,
  );
}

/**
 * Garante apenas os documentos mínimos.
 *
 * O login nunca altera role, plano, Lifetime, status da conta ou limites.
 * Essas decisões pertencem ao administrador/backend.
 */
export async function ensureUserProfile(
  user: User,
  requestedLanguage: string = "pt",
): Promise<EnsureResult> {
  if (!user?.uid) {
    throw new Error(
      "INVALID_USER_IDENTITY",
    );
  }

  const uid = user.uid;
  const requested =
    normalizeLanguage(
      requestedLanguage,
      "pt",
    );

  const email =
    normalizedTextOrNull(
      user.email,
    )?.toLowerCase() ?? null;

  const displayName =
    normalizedTextOrNull(
      user.displayName,
    );

  const photoURL =
    normalizedTextOrNull(
      user.photoURL,
    );

  const userReference =
    doc(db, "users", uid);

  const userSnapshot =
    await getDoc(userReference);

  if (!userSnapshot.exists()) {
    return createFirstProfile({
      uid,
      email,
      displayName,
      photoURL,
      language: requested,
    });
  }

  const storedUser =
    userSnapshot.data();

  const role =
    normalizeStoredRole(
      storedUser.role,
    );

  const language =
    storedLanguage(
      storedUser,
      requested,
    );

  const resolvedSellerId =
    normalizedTextOrNull(
      storedUser.sellerId,
    ) ??
    (
      role === "seller"
        ? uid
        : null
    );

  let sellerDoc:
    DocumentData | null = null;

  if (resolvedSellerId) {
    sellerDoc =
      await readOrCreateSellerDocument({
        sellerId: resolvedSellerId,
        ownerUid: uid,
        language,
      });
  }

  return {
    // Compatibilidade somente em memória para telas ainda não migradas.
    userDoc: buildCompatibilityUserView(
      storedUser,
      sellerDoc,
      {
        role,
        sellerId: resolvedSellerId,
        email,
        displayName,
        photoURL,
        language,
      },
    ),
    sellerDoc,
  };
}

function buildCompatibilityUserView(
  storedUser: DocumentData,
  sellerDoc: DocumentData | null,
  identity: {
    role: UserRole;
    sellerId: string | null;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    language: SupportedLanguage;
  },
): DocumentData {
  const regional =
    normalizeSellerRegionalProfile(
      sellerDoc,
      {
        fallbackSellerId:
          identity.sellerId ?? "",
        fallbackLanguage:
          identity.language,
      },
    );

  const access =
    getEffectiveSellerAccess(
      sellerDoc,
    );

  const limits =
    effectivePlanLimits(
      sellerDoc,
    );

  const accountStatus =
    normalizeAccountStatus(
      storedUser.accountStatus,
      {
        active: storedUser.active,
        suspended: storedUser.suspended,
      },
    );

  const sellerAccountStatus =
    normalizeAccountStatus(
      sellerDoc?.accountStatus,
      {
        active: sellerDoc?.active,
        suspended: sellerDoc?.suspended,
      },
    );

  return {
    ...storedUser,

    role: identity.role,
    sellerId: identity.sellerId,

    email:
      storedUser.email ??
      identity.email,
    displayName:
      storedUser.displayName ??
      identity.displayName,
    photoURL:
      storedUser.photoURL ??
      identity.photoURL,

    uiLanguage:
      identity.language,
    preferredLanguage:
      identity.language,
    locale:
      identity.language,

    accountStatus,
    active:
      accountStatus !== "disabled" &&
      sellerAccountStatus !== "disabled",
    suspended:
      accountStatus === "suspended" ||
      sellerAccountStatus === "suspended",

    plan: access.planId,
    subscriptionStatus:
      access.status === "revoked"
        ? "cancelled"
        : access.status,
    currentPeriodStart:
      access.currentPeriodStart,
    currentPeriodEnd:
      access.currentPeriodEnd,
    billingInterval:
      access.billingInterval,
    accessMode:
      access.mode,

    maxEvents: limits.maxEvents,
    maxProducts: limits.maxProducts,

    storeName: regional.storeName,
    onboardingComplete:
      regional.onboardingComplete,
    operatingCountry:
      regional.operatingCountry,
    currency:
      regional.currency,
    regionalLocale:
      regional.regionalLocale,
    timeZone:
      regional.timeZone,
    defaultLanguage:
      regional.defaultLanguage,

    regionId:
      sellerDoc?.regionId ??
      storedUser.regionId ??
      null,
  };
}

async function createFirstProfile({
  uid,
  email,
  displayName,
  photoURL,
  language,
}: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  language: SupportedLanguage;
}): Promise<EnsureResult> {
  const timestamp =
    serverTimestamp();

  const newUser = {
    schemaVersion: 2,
    role: "seller" as const,
    sellerId: uid,

    email,
    displayName,
    photoURL,
    uiLanguage: language,

    accountStatus:
      "active" as const,

    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  };

  const newSeller = {
    schemaVersion: 2,
    ownerUid: uid,

    storeName: null,
    storefrontLanguage: language,

    regional: {
      operatingCountry: null,
      currency: null,
      locale: null,
      timeZone: null,
    },

    onboarding: {
      complete: false,
      completedAt: null,
      schemaVersion: 2,
    },

    accountStatus:
      "active" as const,

    access:
      defaultSellerAccess(),

    limitsOverride: null,

    regionId: null,
    regionName: null,
    whatsapp: null,
    messengerId: null,
    pickupLink: null,
    pickupNote: null,

    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  };

  const batch = writeBatch(db);

  batch.set(
    doc(db, "users", uid),
    newUser,
  );

  batch.set(
    doc(db, "sellers", uid),
    newSeller,
  );

  await batch.commit();

  return {
    userDoc: buildCompatibilityUserView(
      newUser,
      newSeller,
      {
        role: "seller",
        sellerId: uid,
        email,
        displayName,
        photoURL,
        language,
      },
    ),
    sellerDoc: newSeller,
  };
}

async function readOrCreateSellerDocument({
  sellerId,
  ownerUid,
  language,
}: {
  sellerId: string;
  ownerUid: string;
  language: SupportedLanguage;
}): Promise<DocumentData> {
  const reference =
    doc(db, "sellers", sellerId);

  const snapshot =
    await getDoc(reference);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  const timestamp =
    serverTimestamp();

  const seller = {
    schemaVersion: 2,
    ownerUid,

    storeName: null,
    storefrontLanguage: language,

    regional: {
      operatingCountry: null,
      currency: null,
      locale: null,
      timeZone: null,
    },

    onboarding: {
      complete: false,
      completedAt: null,
      schemaVersion: 2,
    },

    accountStatus:
      "active" as const,

    access:
      defaultSellerAccess(),

    limitsOverride: null,

    regionId: null,
    regionName: null,
    whatsapp: null,
    messengerId: null,
    pickupLink: null,
    pickupNote: null,

    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: ownerUid,
    updatedBy: ownerUid,
  };

  await setDoc(
    reference,
    seller,
  );

  return seller;
}

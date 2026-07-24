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
  getPlanLimits,
  normalizePlanId,
} from "@/app/lib/plan-catalog";
import {
  normalizeLanguage,
} from "@/app/lib/regional";
import {
  hasCompleteSellerOnboarding,
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

type SellerOwnerFields = {
  ownerUid: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPhotoURL: string | null;
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
    data.preferredLanguage ??
      data.locale,
    requestedLanguage,
  );
}

function isStoredSubscriptionStatus(
  value: unknown,
): boolean {
  return value === "none" ||
    value === "pending" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled";
}

function finiteNumber(
  value: unknown,
): number | null {
  return Number.isFinite(value)
    ? Number(value)
    : null;
}

/**
 * Garante os documentos mínimos de identidade e comércio.
 *
 * Regras:
 * - nunca concede role admin no cliente;
 * - nunca redefine plano, assinatura ou suspensão existentes;
 * - respeita sellerId já vinculado ao usuário;
 * - mantém sellers antigos em onboarding pendente até escolherem país;
 * - `sellers/{sellerId}` é a fonte comercial canônica;
 * - campos comerciais em `users/{uid}` são apenas espelho temporário.
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

  const currentUserData =
    userSnapshot.data();

  const role =
    normalizeStoredRole(
      currentUserData.role,
    );

  const language =
    storedLanguage(
      currentUserData,
      requested,
    );

  const resolvedSellerId =
    role === "seller"
      ? normalizedTextOrNull(
          currentUserData.sellerId,
        ) ?? uid
      : null;

  let sellerDoc:
    DocumentData | null = null;

  if (
    role === "seller" &&
    resolvedSellerId
  ) {
    sellerDoc =
      await ensureSellerDocument(
        resolvedSellerId,
        {
          ownerUid: uid,
          ownerEmail: email,
          ownerName: displayName,
          ownerPhotoURL: photoURL,
        },
        language,
      );
  }

  const compatibilityView =
    role === "seller" &&
    sellerDoc
      ? buildCompatibilityView(
          currentUserData,
          sellerDoc,
        )
      : {};

  /*
   * Importante:
   * o login de uma conta existente não deve tentar "migrar" campos
   * administrativos em users/{uid}.
   *
   * Campos como role, active, plan, subscriptionStatus, suspended e limites
   * pertencem ao fluxo administrativo/backend. Além disso, locale e
   * onboardingComplete só podem ser persistidos juntos com o perfil regional
   * completo no onboarding.
   *
   * Mantemos os fallbacks abaixo apenas em memória. A gravação regional
   * definitiva acontece em /seller/onboarding.
   */
  const normalizedUserDoc:
    DocumentData = {
      ...currentUserData,
      ...compatibilityView,

      role,
      sellerId: resolvedSellerId,

      email:
        currentUserData.email ??
        email,
      displayName:
        currentUserData.displayName ??
        displayName,
      photoURL:
        currentUserData.photoURL ??
        photoURL,

      locale: language,
      preferredLanguage: language,

      active:
        typeof currentUserData.active ===
        "boolean"
          ? currentUserData.active
          : true,
    };

  return {
    userDoc: normalizedUserDoc,
    sellerDoc,
  };
}

function buildCompatibilityView(
  currentUserData: DocumentData,
  sellerDoc: DocumentData,
): Record<string, unknown> {
  const compatibility:
    Record<string, unknown> = {};

  const plan =
    normalizePlanId(
      currentUserData.plan ??
        sellerDoc.plan,
    );

  const limits =
    sellerDoc.limits &&
    typeof sellerDoc.limits === "object"
      ? sellerDoc.limits as Record<
          string,
          unknown
        >
      : {};

  const defaultLimits =
    getPlanLimits(plan);

  compatibility.plan = plan;

  compatibility.subscriptionStatus =
    isStoredSubscriptionStatus(
      currentUserData.subscriptionStatus,
    )
      ? currentUserData.subscriptionStatus
      : isStoredSubscriptionStatus(
          sellerDoc.subscriptionStatus,
        )
        ? sellerDoc.subscriptionStatus
        : "none";

  compatibility.maxEvents =
    finiteNumber(
      currentUserData.maxEvents,
    ) ??
    finiteNumber(limits.maxEvents) ??
    finiteNumber(sellerDoc.maxEvents) ??
    defaultLimits.maxEvents;

  compatibility.maxProducts =
    finiteNumber(
      currentUserData.maxProducts,
    ) ??
    finiteNumber(limits.maxProducts) ??
    finiteNumber(sellerDoc.maxProducts) ??
    defaultLimits.maxProducts;

  compatibility.suspended =
    typeof currentUserData.suspended ===
    "boolean"
      ? currentUserData.suspended
      : sellerDoc.suspended === true;

  compatibility.onboardingComplete =
    hasCompleteSellerOnboarding(
      sellerDoc,
    );

  for (const key of [
    "storeName",
    "operatingCountry",
    "currency",
    "regionalLocale",
    "timeZone",
  ] as const) {
    compatibility[key] =
      sellerDoc[key] ??
      currentUserData[key] ??
      null;
  }

  return compatibility;
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
  const createdAt =
    serverTimestamp();

  const plan = "starter" as const;
  const limits =
    getPlanLimits(plan);

  const newUser = {
    uid,
    email,
    displayName,
    photoURL,

    role: "seller" as const,
    active: true,
    sellerId: uid,
    regionId: null,

    locale: language,
    preferredLanguage: language,

    onboardingComplete: false,
    storeName: null,
    operatingCountry: null,
    currency: null,
    regionalLocale: null,
    timeZone: null,

    // Espelho temporário para páginas legadas.
    plan,
    subscriptionStatus:
      "none" as const,
    suspended: false,
    maxEvents: limits.maxEvents,
    maxProducts: limits.maxProducts,

    createdAt,
    updatedAt: createdAt,
    createdBy: uid,
    updatedBy: uid,
  };

  const newSeller = {
    sellerId: uid,

    ownerUid: uid,
    ownerEmail: email,
    ownerName: displayName,
    ownerPhotoURL: photoURL,

    storeName: null,
    defaultLanguage: language,

    onboardingComplete: false,
    regionalVersion: 0,
    operatingCountry: null,
    currency: null,
    regionalLocale: null,
    timeZone: null,

    active: true,
    deletedAt: null,

    plan,
    subscriptionStatus:
      "none" as const,
    suspended: false,
    limits,

    regionId: null,
    regionName: null,

    createdAt,
    updatedAt: createdAt,
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
    userDoc: newUser,
    sellerDoc: newSeller,
  };
}

async function ensureSellerDocument(
  sellerId: string,
  owner: SellerOwnerFields,
  language: SupportedLanguage,
): Promise<DocumentData> {
  const sellerReference =
    doc(db, "sellers", sellerId);

  const sellerSnapshot =
    await getDoc(sellerReference);

  if (!sellerSnapshot.exists()) {
    const createdAt =
      serverTimestamp();

    const plan = "starter" as const;

    const newSeller = {
      sellerId,
      ...owner,

      storeName: null,
      defaultLanguage: language,

      onboardingComplete: false,
      regionalVersion: 0,
      operatingCountry: null,
      currency: null,
      regionalLocale: null,
      timeZone: null,

      active: true,
      deletedAt: null,

      plan,
      subscriptionStatus:
        "none" as const,
      suspended: false,
      limits: getPlanLimits(plan),

      regionId: null,
      regionName: null,

      createdAt,
      updatedAt: createdAt,
      createdBy: owner.ownerUid,
      updatedBy: owner.ownerUid,
    };

    await setDoc(
      sellerReference,
      newSeller,
    );

    return newSeller;
  }

  const currentSellerData =
    sellerSnapshot.data();

  const sellerPatch:
    Record<string, unknown> = {};

  for (
    const [key, value]
    of Object.entries(owner)
  ) {
    if (
      currentSellerData[key] !== value
    ) {
      sellerPatch[key] = value;
    }
  }

  if (
    currentSellerData.sellerId !==
    sellerId
  ) {
    sellerPatch.sellerId = sellerId;
  }

  if (
    typeof currentSellerData.onboardingComplete !==
    "boolean"
  ) {
    sellerPatch.onboardingComplete =
      false;
  }

  if (
    !Number.isFinite(
      currentSellerData.regionalVersion,
    )
  ) {
    sellerPatch.regionalVersion = 0;
  }

  if (
    !currentSellerData.defaultLanguage
  ) {
    sellerPatch.defaultLanguage =
      language;
  }

  if (
    Object.keys(sellerPatch).length >
    0
  ) {
    sellerPatch.updatedAt =
      serverTimestamp();

    sellerPatch.updatedBy =
      owner.ownerUid;

    await setDoc(
      sellerReference,
      sellerPatch,
      {
        merge: true,
      },
    );
  }

  return {
    ...currentSellerData,
    ...sellerPatch,
    sellerId,
  };
}

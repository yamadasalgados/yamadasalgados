import type {
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  type DocumentData,
} from "firebase/firestore";

import {
  db,
} from "@/app/lib/firebase";
import {
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
    // Contas seller precisam ser provisionadas previamente pelo fluxo
    // administrativo. Um usuário autenticado não pode transformar a própria
    // conta em seller apenas acessando uma rota protegida.
    throw new Error("SELLER_PROFILE_NOT_PROVISIONED");
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

async function readOrCreateSellerDocument({
  sellerId,
}: {
  sellerId: string;
  ownerUid: string;
  language: SupportedLanguage;
}): Promise<DocumentData> {
  const reference =
    doc(db, "sellers", sellerId);

  const snapshot =
    await getDoc(reference);

  if (!snapshot.exists()) {
    // O documento do seller também precisa ser provisionado pelo backend/admin.
    // Isso impede que uma conta autenticada incompleta crie um tenant por conta própria.
    throw new Error("SELLER_DOCUMENT_NOT_PROVISIONED");
  }

  return snapshot.data();
}

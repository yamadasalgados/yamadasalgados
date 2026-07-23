import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type {
  User,
} from "firebase/auth";

import {
  db,
} from "@/app/lib/firebase";
import {
  normalizeLanguage,
} from "@/app/lib/regional";
import type {
  SupportedLanguage,
} from "@/app/types/regional";

export type UserRole =
  | "admin"
  | "seller";

type EnsureResult = {
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
    data.locale,
    requestedLanguage,
  );
}

/**
 * Garante os documentos mínimos de identidade.
 *
 * Regras desta versão:
 * - nunca concede role admin no cliente;
 * - nunca redefine plano, assinatura ou limites;
 * - respeita sellerId já vinculado ao usuário;
 * - preserva o idioma válido já salvo;
 * - mantém o schema atual até as regras serem
 *   versionadas na próxima etapa.
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

  const userPatch:
    Record<string, unknown> = {};

  if (
    currentUserData.email !== email
  ) {
    userPatch.email = email;
  }

  if (
    currentUserData.displayName !==
    displayName
  ) {
    userPatch.displayName =
      displayName;
  }

  if (
    currentUserData.photoURL !==
    photoURL
  ) {
    userPatch.photoURL = photoURL;
  }

  if (
    currentUserData.locale !==
    language
  ) {
    userPatch.locale = language;
  }

  if (
    role === "seller" &&
    currentUserData.sellerId !==
      resolvedSellerId
  ) {
    userPatch.sellerId =
      resolvedSellerId;
  }

  if (
    typeof currentUserData.active !==
    "boolean"
  ) {
    userPatch.active = true;
  }

  if (
    Object.keys(userPatch).length > 0
  ) {
    userPatch.updatedAt =
      serverTimestamp();

    await setDoc(
      userReference,
      userPatch,
      {
        merge: true,
      },
    );
  }

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
      );
  }

  return {
    userDoc: {
      ...currentUserData,
      ...userPatch,
      role,
      sellerId:
        resolvedSellerId,
      locale: language,
    },
    sellerDoc,
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
  const createdAt =
    serverTimestamp();

  const newUser = {
    uid,
    email,
    displayName,
    photoURL,

    // Privilégio administrativo nunca é
    // concedido pelo navegador.
    role: "seller" as const,

    active: true,
    sellerId: uid,
    regionId: null,

    locale: language,

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

    active: true,
    deletedAt: null,

    plan: "starter" as const,
    subscriptionStatus:
      "none" as const,
    suspended: false,

    limits: {
      maxEvents: 1,
      maxProducts: 20,
    },

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
): Promise<DocumentData> {
  const sellerReference =
    doc(db, "sellers", sellerId);

  const sellerSnapshot =
    await getDoc(sellerReference);

  if (!sellerSnapshot.exists()) {
    const createdAt =
      serverTimestamp();

    const newSeller = {
      sellerId,

      ...owner,

      active: true,
      deletedAt: null,

      plan: "starter" as const,
      subscriptionStatus:
        "none" as const,
      suspended: false,

      limits: {
        maxEvents: 1,
        maxProducts: 20,
      },

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
    sellerPatch.sellerId =
      sellerId;
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

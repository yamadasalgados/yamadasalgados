import { db } from "@/app/lib/firebase";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import type { User } from "firebase/auth";

export type UserRole = "admin" | "seller";

/**
 * 🔒 Lista de administradores com permissões irrestritas no ecossistema
 */
const ADMIN_EMAILS: string[] = [
  "seu-email@exemplo.com", // 👈 Substitua pelo seu email real de administrador
];

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const sanitizedEmail = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((admin) => admin.trim().toLowerCase() === sanitizedEmail);
}

type EnsureResult = {
  userDoc: DocumentData;
  sellerDoc: DocumentData | null;
};

/**
 * Garante a integridade e sincronia do perfil do usuário e do nó de vendas (Tenant) no Firestore.
 */
export async function ensureUserProfile(user: User, initialLang: string = "pt"): Promise<EnsureResult> {
  if (!user?.uid) throw new Error("Identificação de usuário inválida.");

  const uid = user.uid;
  const normalizedEmail = (user.email ?? "").trim().toLowerCase() || null;
  // Sincroniza com a normalização de idioma corrigida para 'ja'
  const targetLang = initialLang === "jp" ? "ja" : initialLang || "pt";

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  const syncFields = {
    email: normalizedEmail,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    locale: targetLang,
    updatedAt: serverTimestamp(),
  };

  // -------------------------------------------------------------
  // 1) Caso o usuário já possua registro: Valida e atualiza delta (Economiza escrita)
  // -------------------------------------------------------------
  if (userSnap.exists()) {
    const data = userSnap.data();

    const hasChanged =
      data.email !== syncFields.email ||
      data.displayName !== syncFields.displayName ||
      data.photoURL !== syncFields.photoURL ||
      data.locale !== syncFields.locale;

    if (hasChanged) {
      await updateDocSafe(userRef, syncFields);
    }

    const role: UserRole = (data.role as UserRole) || "seller";
    let sellerDoc: DocumentData | null = null;

    if (role === "seller") {
      sellerDoc = await ensureSellerDoc(uid, {
        ownerUid: uid,
        ownerEmail: normalizedEmail,
        ownerName: syncFields.displayName,
        ownerPhotoURL: syncFields.photoURL,
      });
    }

    return { userDoc: { ...data, ...syncFields }, sellerDoc };
  }

  // -------------------------------------------------------------
  // 2) Primeiro acesso: Instancia perfil raíz com regras de privilégio estritas
  // -------------------------------------------------------------
  const role: UserRole = isAdminEmail(normalizedEmail) ? "admin" : "seller";

  const newUser = {
    uid,
    email: syncFields.email,
    displayName: syncFields.displayName,
    photoURL: syncFields.photoURL,
    role,
    active: true,
    sellerId: role === "seller" ? uid : null,
    regionId: null as string | null,
    locale: syncFields.locale,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  };

  await setDoc(userRef, newUser);

  let sellerDoc: DocumentData | null = null;
  if (role === "seller") {
    sellerDoc = await ensureSellerDoc(uid, {
      ownerUid: uid,
      ownerEmail: normalizedEmail,
      ownerName: syncFields.displayName,
      ownerPhotoURL: syncFields.photoURL,
    });
  }

  return { userDoc: newUser, sellerDoc };
}

/**
 * Garante e isola o documento do Seller (Tenant root de vendas)
 */
async function ensureSellerDoc(
  sellerId: string,
  owner: {
    ownerUid: string;
    ownerEmail: string | null;
    ownerName: string | null;
    ownerPhotoURL: string | null;
  }
) {
  const sellerRef = doc(db, "sellers", sellerId);
  const sellerSnap = await getDoc(sellerRef);

  const baseConfig = {
    ownerUid: owner.ownerUid,
    ownerEmail: owner.ownerEmail,
    ownerName: owner.ownerName,
    ownerPhotoURL: owner.ownerPhotoURL,
    active: true,
    deletedAt: null,
    plan: "starter",
    subscriptionStatus: "none",
    suspended: false,
    limits: {
      maxEvents: 1,
      maxProducts: 20,
    },
    regionId: null as string | null,
    regionName: null as string | null,
    updatedAt: serverTimestamp(),
  };

  if (sellerSnap.exists()) {
    const data = sellerSnap.data();

    const hasChanged =
      data.ownerEmail !== baseConfig.ownerEmail ||
      data.ownerName !== baseConfig.ownerName ||
      data.ownerPhotoURL !== baseConfig.ownerPhotoURL;

    if (hasChanged) {
      await updateDocSafe(sellerRef, baseConfig);
    }

    return { ...data, ...baseConfig };
  }

  const newSeller = {
    sellerId,
    ...baseConfig,
    createdAt: serverTimestamp(),
    createdBy: owner.ownerUid,
    updatedBy: owner.ownerUid,
  };

  await setDoc(sellerRef, newSeller);
  return newSeller;
}

/**
 * Helper resiliente para mitigar falhas de concorrência ou deleções durante a mutação
 */
async function updateDocSafe(ref: any, data: any) {
  try {
    await updateDoc(ref, data);
  } catch (err) {
    console.warn("[Firestore Safe Mutation] Falha silenciosa ao atualizar documento:", err);
  }
}
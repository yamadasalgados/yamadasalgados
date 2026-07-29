import { accessIsActive } from "@/app/lib/access-control";

export type AuthorizationRecord = Record<string, unknown>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function accountIsActive(data: AuthorizationRecord): boolean {
  if (data.accountStatus === "active") return true;
  if (data.accountStatus !== undefined && data.accountStatus !== null) {
    return false;
  }

  // Compatibilidade apenas com documentos legados explicitamente ativos.
  return data.active === true && data.suspended !== true;
}

export function isActiveAdminRecord(userData: AuthorizationRecord): boolean {
  return userData.role === "admin" && accountIsActive(userData);
}

export function isActiveSellerOwnerRecord(params: {
  uid: string;
  sellerId: string;
  userData: AuthorizationRecord;
  sellerData: AuthorizationRecord;
}): boolean {
  const { uid, sellerId, userData, sellerData } = params;
  if (!uid || !sellerId) return false;
  if (userData.role !== "seller" || !accountIsActive(userData)) return false;
  if (!accountIsActive(sellerData)) return false;

  const userSellerId = cleanText(userData.sellerId);
  const ownerUid = cleanText(sellerData.ownerUid);

  return (
    userSellerId === sellerId ||
    ownerUid === uid ||
    (uid === sellerId && (!ownerUid || ownerUid === uid))
  );
}

export function isOperationalSellerOwnerRecord(params: {
  uid: string;
  sellerId: string;
  userData: AuthorizationRecord;
  sellerData: AuthorizationRecord;
}): boolean {
  if (!isActiveSellerOwnerRecord(params)) return false;
  const onboarding = params.sellerData.onboarding;
  if (
    !onboarding ||
    typeof onboarding !== "object" ||
    Array.isArray(onboarding) ||
    (onboarding as AuthorizationRecord).complete !== true
  ) {
    return false;
  }
  return accessIsActive(params.sellerData, params.userData);
}

export function isAdminOrOperationalSellerOwnerRecord(params: {
  uid: string;
  sellerId: string;
  userData: AuthorizationRecord;
  sellerData: AuthorizationRecord;
}): boolean {
  return isActiveAdminRecord(params.userData) ||
    isOperationalSellerOwnerRecord(params);
}

export function isAdminOrActiveSellerOwnerRecord(params: {
  uid: string;
  sellerId: string;
  userData: AuthorizationRecord;
  sellerData: AuthorizationRecord;
}): boolean {
  return isActiveAdminRecord(params.userData) ||
    isActiveSellerOwnerRecord(params);
}

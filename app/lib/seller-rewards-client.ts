import { auth } from "@/app/lib/firebase";

export type SellerRewardAccount = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  photoURL?: string;
  accountStatus?: "active" | "disabled";
  sellerId?: string;
  pointsBalance: number;
  lifetimeEarned?: number;
  lifetimeGifted?: number;
  lifetimeRedeemed?: number;
};

export type SellerRewardGiftHistory = {
  id: string;
  type: "gift";
  customerUid: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  createdBy: string;
  createdByUid: string;
  createdAt: string;
};

type RewardsApiPayload = {
  ok?: boolean;
  error?: string;
  code?: string;
  account?: SellerRewardAccount | null;
  history?: SellerRewardGiftHistory[];
  replayed?: boolean;
  movementId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
};

async function sellerToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Entre novamente para gerenciar os pontos.");
  return currentUser.getIdToken();
}

async function parseResponse(response: Response): Promise<RewardsApiPayload> {
  const payload = (await response.json().catch(() => null)) as RewardsApiPayload | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Não foi possível concluir a operação de pontos.");
  }
  return payload;
}

export async function lookupSellerRewardAccount(params: {
  sellerId: string;
  identifier: string;
}): Promise<SellerRewardAccount> {
  const token = await sellerToken();
  const query = new URLSearchParams({
    sellerId: params.sellerId,
    identifier: params.identifier,
    limit: "1",
  });
  const response = await fetch(`/api/seller/rewards?${query.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  if (!payload.account) throw new Error("Conta não encontrada.");
  return payload.account;
}

export async function loadSellerRewardGiftHistory(
  sellerId: string,
  limit = 50,
): Promise<SellerRewardGiftHistory[]> {
  const token = await sellerToken();
  const query = new URLSearchParams({
    sellerId,
    limit: String(limit),
  });
  const response = await fetch(`/api/seller/rewards?${query.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  return Array.isArray(payload.history) ? payload.history : [];
}

export async function giftSellerRewardPoints(params: {
  sellerId: string;
  customerUid: string;
  points: number;
  reason: string;
  clientRequestId: string;
}): Promise<{
  account: SellerRewardAccount;
  replayed: boolean;
  movementId: string;
  balanceBefore: number;
  balanceAfter: number;
}> {
  const token = await sellerToken();
  const response = await fetch("/api/seller/rewards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const payload = await parseResponse(response);
  if (!payload.account) throw new Error("A conta não foi retornada pelo servidor.");
  return {
    account: payload.account,
    replayed: Boolean(payload.replayed),
    movementId: payload.movementId || "",
    balanceBefore: Math.max(0, Math.floor(Number(payload.balanceBefore) || 0)),
    balanceAfter: Math.max(0, Math.floor(Number(payload.balanceAfter) || 0)),
  };
}

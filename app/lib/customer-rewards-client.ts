import { auth } from "@/app/lib/firebase";

export type CustomerRewardTransaction = {
  id: string;
  type: "earn" | "event_earn" | "gift" | "redeem" | "refund" | "adjustment";
  points: number;
  balanceAfter: number;
  orderId: string;
  orderSource: "store" | "event" | "";
  eventId: string;
  label: string;
  createdAt: string;
};

export type CustomerRewardWallet = {
  sellerId: string;
  storeName: string;
  currency: "JPY" | "BRL" | "USD";
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeGifted: number;
  lifetimeRedeemed: number;
  lifetimeRefunded: number;
  transactions: CustomerRewardTransaction[];
};

export async function loadCustomerRewards(
  sellerId: string,
): Promise<CustomerRewardWallet> {
  const user = auth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");

  const token = await user.getIdToken();
  const response = await fetch(
    `/api/customer/rewards?sellerId=${encodeURIComponent(sellerId)}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok?: true; wallet?: unknown }
    | { ok?: false; error?: unknown }
    | null;

  if (!response.ok || !payload || payload.ok !== true || !payload.wallet) {
    throw new Error(
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Não foi possível carregar seus pontos.",
    );
  }

  return payload.wallet as CustomerRewardWallet;
}

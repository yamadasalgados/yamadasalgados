import type { User } from "firebase/auth";

export type ResolvedAccountRole = "admin" | "seller" | "customer" | "unknown";

export type ResolvedAccount = {
  role: ResolvedAccountRole;
  destination: string;
  sellerId?: string;
  issue?: "ADMIN_INACTIVE" | "SELLER_INACTIVE" | "SELLER_NOT_PROVISIONED" | "SELLER_STORE_INACTIVE";
};

export async function resolveAuthenticatedAccount(
  user: User,
  next = "/customer/orders",
): Promise<ResolvedAccount> {
  const token = await user.getIdToken();
  const response = await fetch("/api/auth/resolve-role", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ next }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        role?: ResolvedAccountRole;
        destination?: string;
        sellerId?: string;
        issue?: ResolvedAccount["issue"];
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.ok || !payload.role) {
    throw new Error(payload?.error || "AUTH_RESOLUTION_FAILED");
  }

  return {
    role: payload.role,
    destination: payload.destination || "",
    sellerId: payload.sellerId,
    issue: payload.issue,
  };
}

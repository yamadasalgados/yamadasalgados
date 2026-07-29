import type {
  PublicSellerProfile,
} from "@/app/lib/public-seller-profile";

export class PublicSellerProfileError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "PublicSellerProfileError";
    this.status = status;
  }
}

export async function fetchPublicSellerProfile(
  sellerId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PublicSellerProfile> {
  const normalizedSellerId = String(sellerId || "").trim();
  if (!normalizedSellerId || normalizedSellerId.includes("/")) {
    throw new PublicSellerProfileError("Loja inválida.", 400);
  }

  const response = await fetch(
    `/api/public/sellers/${encodeURIComponent(normalizedSellerId)}`,
    {
      method: "GET",
      cache: "no-store",
      signal: options.signal,
    },
  );
  const payload = await response.json().catch(() => null) as
    | { ok?: boolean; seller?: PublicSellerProfile; error?: unknown }
    | null;

  if (!response.ok || !payload?.ok || !payload.seller) {
    throw new PublicSellerProfileError(
      typeof payload?.error === "string"
        ? payload.error
        : "Não foi possível carregar a loja.",
      response.status,
    );
  }

  return payload.seller;
}

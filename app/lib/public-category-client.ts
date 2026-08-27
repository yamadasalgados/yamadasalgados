import type { PublicCategory } from "@/app/lib/public-category";

export async function fetchPublicCategories(
  sellerId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PublicCategory[]> {
  const normalizedSellerId = String(sellerId || "").trim();
  if (!normalizedSellerId || normalizedSellerId.includes("/")) return [];

  const response = await fetch(
    `/api/public/sellers/${encodeURIComponent(normalizedSellerId)}/categories`,
    { method: "GET", cache: "no-store", signal: options.signal },
  );
  const payload = await response.json().catch(() => null) as
    | { ok?: boolean; categories?: PublicCategory[] }
    | null;

  if (!response.ok || !payload?.ok || !Array.isArray(payload.categories)) return [];
  return payload.categories;
}

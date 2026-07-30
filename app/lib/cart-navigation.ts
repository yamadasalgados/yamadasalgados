export const PUBLIC_CART_SUMMARY_EVENT = "orderapp:public-cart-summary";
export const PUBLIC_CART_OPEN_EVENT = "orderapp:public-cart-open";

export type PublicCartSummaryDetail = {
  sellerId: string;
  totalItems: number;
};

export type PublicCartOpenDetail = {
  sellerId: string;
};

export function publicCartSummaryStorageKey(sellerId: string): string {
  return `orderapp_public_cart_summary_v1:${sellerId.trim()}`;
}

function safeCartCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.floor(parsed))
    : 0;
}

export function readPublicCartCount(sellerId: string): number {
  if (typeof window === "undefined" || !sellerId.trim()) return 0;

  try {
    const raw = window.localStorage.getItem(publicCartSummaryStorageKey(sellerId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { totalItems?: unknown } | null;
    return safeCartCount(parsed?.totalItems);
  } catch {
    return 0;
  }
}

export function publishPublicCartSummary(
  sellerId: string,
  totalItems: number,
): void {
  if (typeof window === "undefined" || !sellerId.trim()) return;

  const detail: PublicCartSummaryDetail = {
    sellerId: sellerId.trim(),
    totalItems: safeCartCount(totalItems),
  };

  try {
    window.localStorage.setItem(
      publicCartSummaryStorageKey(detail.sellerId),
      JSON.stringify({ ...detail, updatedAt: Date.now() }),
    );
  } catch {
    // O badge continua funcionando na aba atual pelo CustomEvent.
  }

  window.dispatchEvent(
    new CustomEvent<PublicCartSummaryDetail>(PUBLIC_CART_SUMMARY_EVENT, {
      detail,
    }),
  );
}

export function requestPublicCartOpen(sellerId: string): void {
  if (typeof window === "undefined" || !sellerId.trim()) return;

  window.dispatchEvent(
    new CustomEvent<PublicCartOpenDetail>(PUBLIC_CART_OPEN_EVENT, {
      detail: { sellerId: sellerId.trim() },
    }),
  );
}

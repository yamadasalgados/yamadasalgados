export type StockOrderPolicy = "block" | "accept_pending";

export type SellerOrderSettings = {
  schemaVersion: 1;
  stockOrderPolicy: StockOrderPolicy;
  acceptOrdersWithoutStock: boolean;
};

export const DEFAULT_SELLER_ORDER_SETTINGS: SellerOrderSettings = {
  schemaVersion: 1,
  stockOrderPolicy: "accept_pending",
  acceptOrdersWithoutStock: true,
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeSellerOrderSettings(
  value: unknown,
  legacyAcceptOrdersWithoutStock?: unknown,
): SellerOrderSettings {
  const raw = asRecord(value);
  const rawPolicy =
    typeof raw.stockOrderPolicy === "string"
      ? raw.stockOrderPolicy.trim().toLowerCase()
      : "";

  const acceptOrdersWithoutStock =
    rawPolicy === "accept_pending" ||
    raw.acceptOrdersWithoutStock === true ||
    legacyAcceptOrdersWithoutStock === true ||
    (rawPolicy !== "block" &&
      raw.acceptOrdersWithoutStock !== false &&
      legacyAcceptOrdersWithoutStock !== false);

  return {
    schemaVersion: 1,
    stockOrderPolicy: acceptOrdersWithoutStock ? "accept_pending" : "block",
    acceptOrdersWithoutStock,
  };
}

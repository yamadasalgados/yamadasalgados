import type { SupportedCurrency } from "@/app/types/regional";

export type PostalPricingMode = "collect" | "arrange" | "weight_table";

export type ShippingWeightBand = {
  maxWeightGrams: number;
  priceMinor: number;
};

export type SellerShippingSettings = {
  schemaVersion: 2;
  postalEnabled: boolean;
  pricingMode: PostalPricingMode;
  weightBands: ShippingWeightBand[];
  instructions: string;
};

export type ProductShipping = {
  postalEligible: boolean;
  weightGrams: number | null;
};

export type PostalShippingEvaluation = {
  available: boolean;
  reason:
    | "disabled"
    | "product_not_eligible"
    | "weight_missing"
    | "weight_limit_exceeded"
    | null;
  pricingMode: PostalPricingMode;
  totalWeightGrams: number | null;
  shippingFeeMinor: number | null;
  quoteStatus: "collect" | "pending" | "calculated" | "unavailable";
  appliedBand: ShippingWeightBand | null;
};

export const DEFAULT_SELLER_SHIPPING_SETTINGS: SellerShippingSettings = {
  schemaVersion: 2,
  postalEnabled: false,
  pricingMode: "arrange",
  weightBands: [],
  instructions: "",
};

export const DEFAULT_PRODUCT_SHIPPING: ProductShipping = {
  postalEligible: false,
  weightGrams: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeProductShipping(
  value: unknown,
  legacyPostalEligible?: unknown,
  legacyWeightGrams?: unknown,
): ProductShipping {
  const raw = record(value);
  const weightCandidate =
    finiteNumber(raw.weightGrams) ?? finiteNumber(legacyWeightGrams);

  return {
    postalEligible:
      raw.postalEligible === true || legacyPostalEligible === true,
    weightGrams:
      weightCandidate !== null && weightCandidate > 0
        ? Math.max(1, Math.round(weightCandidate))
        : null,
  };
}

export function normalizeSellerShippingSettings(
  value: unknown,
): SellerShippingSettings {
  const raw = record(value);
  const pricingMode: PostalPricingMode =
    raw.pricingMode === "collect" || raw.pricingMode === "weight_table"
      ? raw.pricingMode
      : "arrange";

  const bands = Array.isArray(raw.weightBands)
    ? raw.weightBands
        .map((entry): ShippingWeightBand | null => {
          const band = record(entry);
          const maxWeightGrams = finiteNumber(band.maxWeightGrams);
          const priceMinor = finiteNumber(band.priceMinor);

          if (
            maxWeightGrams === null ||
            maxWeightGrams <= 0 ||
            priceMinor === null ||
            priceMinor < 0
          ) {
            return null;
          }

          return {
            maxWeightGrams: Math.max(1, Math.round(maxWeightGrams)),
            priceMinor: Math.max(0, Math.round(priceMinor)),
          };
        })
        .filter((entry): entry is ShippingWeightBand => entry !== null)
        .sort((left, right) => left.maxWeightGrams - right.maxWeightGrams)
    : [];

  const dedupedBands = Array.from(
    new Map(bands.map((band) => [band.maxWeightGrams, band])).values(),
  );

  return {
    schemaVersion: 2,
    postalEnabled: raw.postalEnabled === true,
    pricingMode,
    weightBands: dedupedBands,
    instructions:
      typeof raw.instructions === "string"
        ? raw.instructions.trim().slice(0, 1500)
        : "",
  };
}

export function evaluatePostalShipping(params: {
  settings: SellerShippingSettings;
  products: Array<{
    quantity: number;
    shipping: ProductShipping;
  }>;
}): PostalShippingEvaluation {
  const { settings, products } = params;

  if (!settings.postalEnabled) {
    return {
      available: false,
      reason: "disabled",
      pricingMode: settings.pricingMode,
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
    };
  }

  if (products.some((entry) => !entry.shipping.postalEligible)) {
    return {
      available: false,
      reason: "product_not_eligible",
      pricingMode: settings.pricingMode,
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
    };
  }

  const hasMissingWeight = products.some(
    (entry) => entry.shipping.weightGrams === null,
  );
  const totalWeightGrams = hasMissingWeight
    ? null
    : products.reduce(
        (sum, entry) =>
          sum + (entry.shipping.weightGrams ?? 0) * Math.max(0, entry.quantity),
        0,
      );

  if (settings.pricingMode === "collect") {
    return {
      available: true,
      reason: null,
      pricingMode: settings.pricingMode,
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "collect",
      appliedBand: null,
    };
  }

  if (settings.pricingMode === "arrange") {
    return {
      available: true,
      reason: null,
      pricingMode: settings.pricingMode,
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "pending",
      appliedBand: null,
    };
  }

  if (totalWeightGrams === null || totalWeightGrams <= 0) {
    return {
      available: false,
      reason: "weight_missing",
      pricingMode: settings.pricingMode,
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
    };
  }

  const appliedBand = settings.weightBands.find(
    (band) => totalWeightGrams <= band.maxWeightGrams,
  );

  if (!appliedBand) {
    return {
      available: false,
      reason: "weight_limit_exceeded",
      pricingMode: settings.pricingMode,
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
    };
  }

  return {
    available: true,
    reason: null,
    pricingMode: settings.pricingMode,
    totalWeightGrams,
    shippingFeeMinor: appliedBand.priceMinor,
    quoteStatus: "calculated",
    appliedBand,
  };
}

export function formatWeightGrams(weightGrams: number | null): string {
  if (weightGrams === null) return "—";
  if (weightGrams >= 1000) {
    return `${(weightGrams / 1000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })} kg`;
  }
  return `${weightGrams} g`;
}

export function currencyFractionDigits(currency: SupportedCurrency): number {
  return currency === "JPY" ? 0 : 2;
}

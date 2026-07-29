import type { SupportedCurrency } from "@/app/types/regional";

export type FulfillmentMethod = "pickup" | "delivery" | "postal";
export type PostalPricingMode = "collect" | "arrange" | "weight_table";

export type ProductFulfillmentOptions = {
  pickup: boolean;
  localDelivery: boolean;
  postal: boolean;
};

export type ShippingWeightBand = {
  maxWeightGrams: number;
  priceMinor: number;
};

export type FulfillmentMethodConfig = {
  enabled: boolean;
  label: string;
  description: string;
  instructions: string;
  feeMinor: number;
  minimumOrderMinor: number | null;
  freeAboveMinor: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
};

export type LocalDeliveryRegionRule = {
  id: string;
  name: string;
  enabled: boolean;
  feeMinor: number;
  minimumOrderMinor: number | null;
  freeAboveMinor: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  instructions: string;
};

export type LocalDeliveryMethodConfig = FulfillmentMethodConfig & {
  regions: LocalDeliveryRegionRule[];
};

export type PostalMethodConfig = Omit<FulfillmentMethodConfig, "feeMinor"> & {
  pricingMode: PostalPricingMode;
  weightBands: ShippingWeightBand[];
};

export type SellerShippingSettings = {
  schemaVersion: 3;
  pickup: FulfillmentMethodConfig;
  localDelivery: LocalDeliveryMethodConfig;
  postal: PostalMethodConfig;

  /** Backward-compatible aliases used by older clients. */
  postalEnabled: boolean;
  pricingMode: PostalPricingMode;
  weightBands: ShippingWeightBand[];
  instructions: string;
};

export type ProductShipping = {
  fulfillment: ProductFulfillmentOptions;
  postalEligible: boolean;
  weightGrams: number | null;
};

export type FixedFulfillmentEvaluation = {
  available: boolean;
  reason:
    | "disabled"
    | "product_not_eligible"
    | "minimum_order"
    | "region_unavailable"
    | null;
  method: "pickup" | "delivery";
  feeMinor: number;
  quoteStatus: "calculated" | "region_required" | "unavailable";
  appliedRegion: LocalDeliveryRegionRule | null;
  minimumOrderMinor: number | null;
  freeAboveMinor: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  label: string;
  description: string;
  instructions: string;
};

export type PostalShippingEvaluation = {
  available: boolean;
  reason:
    | "disabled"
    | "product_not_eligible"
    | "minimum_order"
    | "weight_missing"
    | "weight_limit_exceeded"
    | null;
  pricingMode: PostalPricingMode;
  totalWeightGrams: number | null;
  shippingFeeMinor: number | null;
  quoteStatus: "collect" | "pending" | "calculated" | "unavailable";
  appliedBand: ShippingWeightBand | null;
  minimumOrderMinor: number | null;
  freeAboveMinor: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  label: string;
  description: string;
  instructions: string;
};

export const DEFAULT_PRODUCT_FULFILLMENT: ProductFulfillmentOptions = {
  pickup: true,
  localDelivery: true,
  postal: false,
};

const DEFAULT_PICKUP_CONFIG: FulfillmentMethodConfig = {
  enabled: true,
  label: "",
  description: "",
  instructions: "",
  feeMinor: 0,
  minimumOrderMinor: null,
  freeAboveMinor: null,
  estimatedDaysMin: null,
  estimatedDaysMax: null,
};

const DEFAULT_LOCAL_DELIVERY_CONFIG: LocalDeliveryMethodConfig = {
  enabled: true,
  label: "",
  description: "",
  instructions: "",
  feeMinor: 0,
  minimumOrderMinor: null,
  freeAboveMinor: null,
  estimatedDaysMin: null,
  estimatedDaysMax: null,
  regions: [],
};

const DEFAULT_POSTAL_CONFIG: PostalMethodConfig = {
  enabled: false,
  label: "",
  description: "",
  instructions: "",
  minimumOrderMinor: null,
  freeAboveMinor: null,
  estimatedDaysMin: null,
  estimatedDaysMax: null,
  pricingMode: "arrange",
  weightBands: [],
};

export const DEFAULT_SELLER_SHIPPING_SETTINGS: SellerShippingSettings = {
  schemaVersion: 3,
  pickup: { ...DEFAULT_PICKUP_CONFIG },
  localDelivery: { ...DEFAULT_LOCAL_DELIVERY_CONFIG, regions: [] },
  postal: { ...DEFAULT_POSTAL_CONFIG, weightBands: [] },
  postalEnabled: false,
  pricingMode: "arrange",
  weightBands: [],
  instructions: "",
};

export const DEFAULT_PRODUCT_SHIPPING: ProductShipping = {
  fulfillment: { ...DEFAULT_PRODUCT_FULFILLMENT },
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
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nonNegativeMinor(value: unknown, fallback = 0): number {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : Math.max(0, Math.round(parsed));
}

function optionalNonNegativeMinor(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null || parsed < 0 ? null : Math.round(parsed);
}

function optionalDay(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null || parsed < 0
    ? null
    : Math.min(365, Math.max(0, Math.round(parsed)));
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function slug(value: unknown, fallback: string): string {
  const normalized = boundedText(value, 80)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || fallback;
}

function normalizeEstimatedRange(
  raw: Record<string, unknown>,
): Pick<FulfillmentMethodConfig, "estimatedDaysMin" | "estimatedDaysMax"> {
  const minimum = optionalDay(raw.estimatedDaysMin ?? raw.estimatedMinDays);
  const maximum = optionalDay(raw.estimatedDaysMax ?? raw.estimatedMaxDays);

  if (minimum === null && maximum === null) {
    return { estimatedDaysMin: null, estimatedDaysMax: null };
  }

  const normalizedMinimum = minimum ?? maximum ?? 0;
  const normalizedMaximum = Math.max(normalizedMinimum, maximum ?? normalizedMinimum);
  return {
    estimatedDaysMin: normalizedMinimum,
    estimatedDaysMax: normalizedMaximum,
  };
}

function normalizeMethodConfig(
  value: unknown,
  defaults: FulfillmentMethodConfig,
): FulfillmentMethodConfig {
  const raw = record(value);
  const estimated = normalizeEstimatedRange(raw);

  return {
    enabled:
      typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    label: boundedText(raw.label ?? raw.name, 100),
    description: boundedText(raw.description, 500),
    instructions: boundedText(raw.instructions, 1500),
    feeMinor: nonNegativeMinor(raw.feeMinor ?? raw.priceMinor, defaults.feeMinor),
    minimumOrderMinor: optionalNonNegativeMinor(
      raw.minimumOrderMinor ?? raw.minOrderMinor,
    ),
    freeAboveMinor: optionalNonNegativeMinor(
      raw.freeAboveMinor ?? raw.freeShippingThresholdMinor,
    ),
    estimatedDaysMin: estimated.estimatedDaysMin,
    estimatedDaysMax: estimated.estimatedDaysMax,
  };
}

function normalizeWeightBands(value: unknown): ShippingWeightBand[] {
  const bands = Array.isArray(value)
    ? value
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

  return Array.from(
    new Map(bands.map((band) => [band.maxWeightGrams, band])).values(),
  );
}

function normalizeRegions(value: unknown): LocalDeliveryRegionRule[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry, index): LocalDeliveryRegionRule | null => {
      const raw = record(entry);
      const name = boundedText(raw.name ?? raw.label, 100);
      if (!name) return null;
      const estimated = normalizeEstimatedRange(raw);
      return {
        id: slug(raw.id ?? name, `region-${index + 1}`),
        name,
        enabled: raw.enabled !== false,
        feeMinor: nonNegativeMinor(raw.feeMinor ?? raw.priceMinor, 0),
        minimumOrderMinor: optionalNonNegativeMinor(
          raw.minimumOrderMinor ?? raw.minOrderMinor,
        ),
        freeAboveMinor: optionalNonNegativeMinor(
          raw.freeAboveMinor ?? raw.freeShippingThresholdMinor,
        ),
        estimatedDaysMin: estimated.estimatedDaysMin,
        estimatedDaysMax: estimated.estimatedDaysMax,
        instructions: boundedText(raw.instructions, 1000),
      };
    })
    .filter((entry): entry is LocalDeliveryRegionRule => entry !== null);

  return Array.from(new Map(normalized.map((region) => [region.id, region])).values());
}

export function normalizeProductFulfillment(
  value: unknown,
  legacyPostalEligible?: unknown,
): ProductFulfillmentOptions {
  const raw = record(value);
  const hasExplicitFields =
    typeof raw.pickup === "boolean" ||
    typeof raw.localDelivery === "boolean" ||
    typeof raw.delivery === "boolean" ||
    typeof raw.postal === "boolean";

  if (!hasExplicitFields) {
    return {
      pickup: true,
      localDelivery: true,
      postal: legacyPostalEligible === true,
    };
  }

  return {
    pickup: raw.pickup !== false,
    localDelivery:
      typeof raw.localDelivery === "boolean"
        ? raw.localDelivery
        : raw.delivery !== false,
    postal:
      typeof raw.postal === "boolean"
        ? raw.postal
        : legacyPostalEligible === true,
  };
}

export function normalizeProductShipping(
  value: unknown,
  legacyPostalEligible?: unknown,
  legacyWeightGrams?: unknown,
  legacyFulfillment?: unknown,
): ProductShipping {
  const raw = record(value);
  const explicitPostal =
    raw.postalEligible === true || legacyPostalEligible === true;
  const fulfillment = normalizeProductFulfillment(
    raw.fulfillment ?? raw.fulfillmentOptions ?? legacyFulfillment,
    explicitPostal,
  );
  const weightCandidate =
    finiteNumber(raw.weightGrams) ?? finiteNumber(legacyWeightGrams);

  return {
    fulfillment,
    postalEligible: fulfillment.postal,
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
  const rawMethods = record(raw.methods ?? raw.fulfillmentMethods);
  const rawPickup = raw.pickup ?? rawMethods.pickup;
  const rawLocalDelivery =
    raw.localDelivery ?? raw.delivery ?? rawMethods.localDelivery ?? rawMethods.delivery;
  const legacyPostal = {
    enabled: raw.postalEnabled,
    label: raw.postalLabel,
    description: raw.postalDescription,
    instructions: raw.instructions,
    minimumOrderMinor: raw.minimumOrderMinor,
    freeAboveMinor: raw.freeAboveMinor,
    estimatedDaysMin: raw.estimatedDaysMin,
    estimatedDaysMax: raw.estimatedDaysMax,
    pricingMode: raw.pricingMode,
    weightBands: raw.weightBands,
  };
  const rawPostal = record(raw.postal ?? rawMethods.postal);
  const mergedPostal = {
    ...legacyPostal,
    ...rawPostal,
  };

  const pickup = normalizeMethodConfig(rawPickup, DEFAULT_PICKUP_CONFIG);
  const localBase = normalizeMethodConfig(
    rawLocalDelivery,
    DEFAULT_LOCAL_DELIVERY_CONFIG,
  );
  const localRaw = record(rawLocalDelivery);
  const localDelivery: LocalDeliveryMethodConfig = {
    ...localBase,
    regions: normalizeRegions(localRaw.regions ?? raw.deliveryRegions),
  };
  const postalBase = normalizeMethodConfig(mergedPostal, {
    ...DEFAULT_POSTAL_CONFIG,
    feeMinor: 0,
  });
  const pricingMode: PostalPricingMode =
    mergedPostal.pricingMode === "collect" ||
    mergedPostal.pricingMode === "weight_table"
      ? mergedPostal.pricingMode
      : "arrange";
  const postal: PostalMethodConfig = {
    enabled: postalBase.enabled,
    label: postalBase.label,
    description: postalBase.description,
    instructions: postalBase.instructions,
    minimumOrderMinor: postalBase.minimumOrderMinor,
    freeAboveMinor: postalBase.freeAboveMinor,
    estimatedDaysMin: postalBase.estimatedDaysMin,
    estimatedDaysMax: postalBase.estimatedDaysMax,
    pricingMode,
    weightBands: normalizeWeightBands(mergedPostal.weightBands),
  };

  return {
    schemaVersion: 3,
    pickup,
    localDelivery,
    postal,
    postalEnabled: postal.enabled,
    pricingMode: postal.pricingMode,
    weightBands: postal.weightBands,
    instructions: postal.instructions,
  };
}

function productAllowsMethod(
  method: FulfillmentMethod,
  products: Array<{ shipping: ProductShipping }>,
): boolean {
  return products.every((entry) => {
    if (method === "pickup") return entry.shipping.fulfillment.pickup;
    if (method === "delivery") return entry.shipping.fulfillment.localDelivery;
    return entry.shipping.fulfillment.postal;
  });
}

function resolvedFee(params: {
  feeMinor: number;
  freeAboveMinor: number | null;
  subtotalMinor: number;
}): number {
  return params.freeAboveMinor !== null &&
    params.subtotalMinor >= params.freeAboveMinor
    ? 0
    : Math.max(0, params.feeMinor);
}

export function evaluatePickup(params: {
  settings: SellerShippingSettings;
  products: Array<{ shipping: ProductShipping }>;
  subtotalMinor: number;
}): FixedFulfillmentEvaluation {
  const config = params.settings.pickup;
  if (!config.enabled) {
    return unavailableFixed("pickup", "disabled", config);
  }
  if (!productAllowsMethod("pickup", params.products)) {
    return unavailableFixed("pickup", "product_not_eligible", config);
  }
  if (
    config.minimumOrderMinor !== null &&
    params.subtotalMinor < config.minimumOrderMinor
  ) {
    return unavailableFixed("pickup", "minimum_order", config);
  }

  return {
    available: true,
    reason: null,
    method: "pickup",
    feeMinor: resolvedFee({
      feeMinor: config.feeMinor,
      freeAboveMinor: config.freeAboveMinor,
      subtotalMinor: params.subtotalMinor,
    }),
    quoteStatus: "calculated",
    appliedRegion: null,
    minimumOrderMinor: config.minimumOrderMinor,
    freeAboveMinor: config.freeAboveMinor,
    estimatedDaysMin: config.estimatedDaysMin,
    estimatedDaysMax: config.estimatedDaysMax,
    label: config.label,
    description: config.description,
    instructions: config.instructions,
  };
}

function unavailableFixed(
  method: "pickup" | "delivery",
  reason: FixedFulfillmentEvaluation["reason"],
  config: FulfillmentMethodConfig,
): FixedFulfillmentEvaluation {
  return {
    available: false,
    reason,
    method,
    feeMinor: 0,
    quoteStatus: "unavailable",
    appliedRegion: null,
    minimumOrderMinor: config.minimumOrderMinor,
    freeAboveMinor: config.freeAboveMinor,
    estimatedDaysMin: config.estimatedDaysMin,
    estimatedDaysMax: config.estimatedDaysMax,
    label: config.label,
    description: config.description,
    instructions: config.instructions,
  };
}

export function evaluateLocalDelivery(params: {
  settings: SellerShippingSettings;
  products: Array<{ shipping: ProductShipping }>;
  subtotalMinor: number;
  regionId?: string | null;
}): FixedFulfillmentEvaluation {
  const config = params.settings.localDelivery;
  if (!config.enabled) {
    return unavailableFixed("delivery", "disabled", config);
  }
  if (!productAllowsMethod("delivery", params.products)) {
    return unavailableFixed("delivery", "product_not_eligible", config);
  }
  if (
    config.minimumOrderMinor !== null &&
    params.subtotalMinor < config.minimumOrderMinor
  ) {
    return unavailableFixed("delivery", "minimum_order", config);
  }

  const activeRegions = config.regions.filter((region) => region.enabled);
  if (activeRegions.length > 0 && !params.regionId) {
    return {
      available: true,
      reason: null,
      method: "delivery",
      feeMinor: 0,
      quoteStatus: "region_required",
      appliedRegion: null,
      minimumOrderMinor: config.minimumOrderMinor,
      freeAboveMinor: config.freeAboveMinor,
      estimatedDaysMin: config.estimatedDaysMin,
      estimatedDaysMax: config.estimatedDaysMax,
      label: config.label,
      description: config.description,
      instructions: config.instructions,
    };
  }

  const region = params.regionId
    ? activeRegions.find((entry) => entry.id === params.regionId) ?? null
    : null;
  if (params.regionId && !region) {
    return unavailableFixed("delivery", "region_unavailable", config);
  }

  const minimumOrderMinor = region?.minimumOrderMinor ?? config.minimumOrderMinor;
  if (
    minimumOrderMinor !== null &&
    params.subtotalMinor < minimumOrderMinor
  ) {
    return unavailableFixed("delivery", "minimum_order", {
      ...config,
      minimumOrderMinor,
    });
  }

  const freeAboveMinor = region?.freeAboveMinor ?? config.freeAboveMinor;
  const feeMinor = resolvedFee({
    feeMinor: region?.feeMinor ?? config.feeMinor,
    freeAboveMinor,
    subtotalMinor: params.subtotalMinor,
  });

  return {
    available: true,
    reason: null,
    method: "delivery",
    feeMinor,
    quoteStatus: "calculated",
    appliedRegion: region,
    minimumOrderMinor,
    freeAboveMinor,
    estimatedDaysMin: region?.estimatedDaysMin ?? config.estimatedDaysMin,
    estimatedDaysMax: region?.estimatedDaysMax ?? config.estimatedDaysMax,
    label: config.label,
    description: config.description,
    instructions: [config.instructions, region?.instructions]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function evaluatePostalShipping(params: {
  settings: SellerShippingSettings;
  products: Array<{
    quantity: number;
    shipping: ProductShipping;
  }>;
  subtotalMinor?: number;
}): PostalShippingEvaluation {
  const { settings, products } = params;
  const config = settings.postal;
  const subtotalMinor = Math.max(0, Math.round(params.subtotalMinor ?? 0));

  const base = {
    pricingMode: config.pricingMode,
    minimumOrderMinor: config.minimumOrderMinor,
    freeAboveMinor: config.freeAboveMinor,
    estimatedDaysMin: config.estimatedDaysMin,
    estimatedDaysMax: config.estimatedDaysMax,
    label: config.label,
    description: config.description,
    instructions: config.instructions,
  };

  if (!config.enabled) {
    return {
      available: false,
      reason: "disabled",
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
      ...base,
    };
  }

  if (!productAllowsMethod("postal", products)) {
    return {
      available: false,
      reason: "product_not_eligible",
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
      ...base,
    };
  }

  if (
    config.minimumOrderMinor !== null &&
    subtotalMinor < config.minimumOrderMinor
  ) {
    return {
      available: false,
      reason: "minimum_order",
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
      ...base,
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

  if (config.pricingMode === "collect") {
    return {
      available: true,
      reason: null,
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "collect",
      appliedBand: null,
      ...base,
    };
  }

  if (config.pricingMode === "arrange") {
    return {
      available: true,
      reason: null,
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "pending",
      appliedBand: null,
      ...base,
    };
  }

  if (totalWeightGrams === null || totalWeightGrams <= 0) {
    return {
      available: false,
      reason: "weight_missing",
      totalWeightGrams: null,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
      ...base,
    };
  }

  const appliedBand = config.weightBands.find(
    (band) => totalWeightGrams <= band.maxWeightGrams,
  );

  if (!appliedBand) {
    return {
      available: false,
      reason: "weight_limit_exceeded",
      totalWeightGrams,
      shippingFeeMinor: null,
      quoteStatus: "unavailable",
      appliedBand: null,
      ...base,
    };
  }

  const shippingFeeMinor =
    config.freeAboveMinor !== null && subtotalMinor >= config.freeAboveMinor
      ? 0
      : appliedBand.priceMinor;

  return {
    available: true,
    reason: null,
    totalWeightGrams,
    shippingFeeMinor,
    quoteStatus: "calculated",
    appliedBand,
    ...base,
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

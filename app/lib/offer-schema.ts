import type {
  SupportedCurrency,
} from "@/app/types/regional";

import {
  legacyMajorValueToMinor,
  minorToMajor,
} from "@/app/lib/money";

export type OfferLanguage =
  | "pt"
  | "en"
  | "ja";

export type OfferStatus =
  | "active"
  | "inactive";

export type OfferPricingMode =
  | "fixed_total"
  | "fixed_discount"
  | "percentage_discount";

export type OfferLocalizedText = {
  name: string;
  description: string;
};

export type OfferContent = Record<
  OfferLanguage,
  OfferLocalizedText
>;

export type OfferPricing = {
  mode: OfferPricingMode;
  regularTotalMinor: number | null;
  promotionalTotalMinor: number | null;
  discountMinor: number | null;
  percentage: number | null;
};

export type OfferDoc = {
  id: string;
  schemaVersion: 2;
  content: OfferContent;
  status: OfferStatus;
  eligibleProductIds: string[];
  requiredQuantity: number;
  pricing: OfferPricing;
  startsAt: unknown | null;
  endsAt: unknown | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  updatedBy?: string;
};

export type OfferCartLine = {
  productId: string;
  quantity: number;
  priceMinor: number;
};

export type OfferSelectedItemSnapshot = {
  productId: string;
  quantity: number;
  priceMinor: number;
};

export type AppliedOfferSnapshot = {
  offerId: string;
  name: string;
  pricingMode: OfferPricingMode;
  requiredQuantity: number;
  bundleCount: number;
  configuredRegularTotalMinor: number | null;
  configuredPromotionalTotalMinor: number | null;
  configuredDiscountMinor: number | null;
  configuredPercentage: number | null;
  regularAmountMinor: number;
  discountAmountMinor: number;
  finalAmountMinor: number;
  selectedItems: OfferSelectedItemSnapshot[];
};

export type OfferEvaluation = {
  offer: OfferDoc;
  eligibleQuantity: number;
  bundleCount: number;
  nextBundleRemaining: number;
  regularAmountMinor: number;
  discountAmountMinor: number;
  finalAmountMinor: number;
  selectedItems: OfferSelectedItemSnapshot[];
  applicable: boolean;
};

const EMPTY_LOCALIZED_OFFER_TEXT:
  OfferLocalizedText = {
    name: "",
    description: "",
  };

export function emptyOfferContent(): OfferContent {
  return {
    pt: {
      ...EMPTY_LOCALIZED_OFFER_TEXT,
    },
    en: {
      ...EMPTY_LOCALIZED_OFFER_TEXT,
    },
    ja: {
      ...EMPTY_LOCALIZED_OFFER_TEXT,
    },
  };
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function asFiniteInteger(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? Math.max(
        0,
        Math.round(parsed),
      )
    : fallback;
}

function asOptionalFiniteInteger(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? Math.max(
        0,
        Math.round(parsed),
      )
    : null;
}

function uniqueStrings(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(asText)
        .filter(Boolean),
    ),
  );
}

export function normalizeOfferContent(
  rawValue: unknown,
  legacyName = "",
  legacyDescription = "",
): OfferContent {
  const raw = asRecord(rawValue);
  const result = emptyOfferContent();

  for (
    const language
    of ["pt", "en", "ja"] as const
  ) {
    const localized = asRecord(
      raw[language],
    );

    result[language] = {
      name: asText(localized.name),
      description: asText(
        localized.description,
      ),
    };
  }

  if (!result.pt.name && legacyName) {
    result.pt.name = legacyName;
  }

  if (
    !result.pt.description &&
    legacyDescription
  ) {
    result.pt.description =
      legacyDescription;
  }

  return result;
}

export function resolveLocalizedOfferText(
  contentValue: unknown,
  language: OfferLanguage,
  defaultLanguage: OfferLanguage,
  legacyName = "",
  legacyDescription = "",
): OfferLocalizedText {
  const content = normalizeOfferContent(
    contentValue,
    legacyName,
    legacyDescription,
  );

  const order = Array.from(
    new Set<OfferLanguage>([
      language,
      defaultLanguage,
      "pt",
      "en",
      "ja",
    ]),
  );

  const sourceLanguage =
    order.find(
      (candidate) =>
        Boolean(
          content[candidate].name,
        ),
    ) ?? "pt";

  const source = content[sourceLanguage];

  return {
    name:
      source.name ||
      legacyName,
    description:
      source.description ||
      legacyDescription,
  };
}

export function normalizeOfferPricing(
  value: unknown,
  currency: SupportedCurrency,
): OfferPricing {
  const raw = asRecord(value);

  const mode: OfferPricingMode =
    raw.mode === "fixed_discount" ||
    raw.mode === "percentage_discount"
      ? raw.mode
      : "fixed_total";

  const normalizeMinor = (
    minorValue: unknown,
    legacyValue: unknown,
  ) => {
    const explicit =
      asOptionalFiniteInteger(
        minorValue,
      );

    return explicit ??
      (
        legacyValue === null ||
        legacyValue === undefined ||
        legacyValue === ""
          ? null
          : legacyMajorValueToMinor(
              legacyValue,
              currency,
            )
      );
  };

  return {
    mode,
    regularTotalMinor:
      normalizeMinor(
        raw.regularTotalMinor,
        raw.regularTotal,
      ),
    promotionalTotalMinor:
      normalizeMinor(
        raw.promotionalTotalMinor,
        raw.promotionalTotal,
      ),
    discountMinor:
      normalizeMinor(
        raw.discountMinor,
        raw.discount,
      ),
    percentage:
      raw.percentage === null ||
      raw.percentage === undefined
        ? null
        : Math.min(
            100,
            Math.max(
              0,
              Number(raw.percentage) || 0,
            ),
          ),
  };
}

export function normalizeOffer(
  id: string,
  rawValue: unknown,
  currency: SupportedCurrency,
): OfferDoc | null {
  const raw = asRecord(rawValue);
  const eligibleProductIds =
    uniqueStrings(
      raw.eligibleProductIds,
    );
  const requiredQuantity =
    asFiniteInteger(
      raw.requiredQuantity,
      0,
    );
  const content =
    normalizeOfferContent(
      raw.content,
      asText(raw.name),
      asText(raw.description),
    );

  if (
    eligibleProductIds.length === 0 ||
    requiredQuantity < 1 ||
    !Object.values(content).some(
      (entry) => entry.name,
    )
  ) {
    return null;
  }

  return {
    id,
    schemaVersion: 2,
    content,
    status:
      raw.status === "inactive"
        ? "inactive"
        : "active",
    eligibleProductIds,
    requiredQuantity,
    pricing: normalizeOfferPricing(
      raw.pricing,
      currency,
    ),
    startsAt:
      raw.startsAt ?? null,
    endsAt:
      raw.endsAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    createdBy: asText(
      raw.createdBy,
    ) || undefined,
    updatedBy: asText(
      raw.updatedBy,
    ) || undefined,
  };
}

export function firestoreValueToDate(
  value: unknown,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime(),
    )
      ? null
      : value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    const date = (
      value as {
        toDate: () => Date;
      }
    ).toDate();

    return date instanceof Date &&
      !Number.isNaN(date.getTime())
        ? date
        : null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const date = new Date(value);

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date;
  }

  return null;
}

export function offerIsCurrentlyActive(
  offer: OfferDoc,
  now = new Date(),
): boolean {
  if (offer.status !== "active") {
    return false;
  }

  const startsAt =
    firestoreValueToDate(
      offer.startsAt,
    );
  const endsAt =
    firestoreValueToDate(
      offer.endsAt,
    );

  if (
    startsAt &&
    startsAt.getTime() > now.getTime()
  ) {
    return false;
  }

  if (
    endsAt &&
    endsAt.getTime() < now.getTime()
  ) {
    return false;
  }

  return true;
}

function selectOfferItems(
  offer: OfferDoc,
  lines: OfferCartLine[],
  bundleCount: number,
): OfferSelectedItemSnapshot[] {
  const eligible = new Set(
    offer.eligibleProductIds,
  );
  let remaining =
    bundleCount *
    offer.requiredQuantity;

  const sorted = lines
    .filter(
      (line) =>
        eligible.has(
          line.productId,
        ) &&
        line.quantity > 0 &&
        line.priceMinor >= 0,
    )
    .sort(
      (left, right) =>
        right.priceMinor -
        left.priceMinor ||
        left.productId.localeCompare(
          right.productId,
        ),
    );

  const selected:
    OfferSelectedItemSnapshot[] = [];

  for (const line of sorted) {
    if (remaining <= 0) break;

    const quantity = Math.min(
      remaining,
      Math.max(
        0,
        Math.floor(line.quantity),
      ),
    );

    if (quantity <= 0) {
      continue;
    }

    selected.push({
      productId: line.productId,
      quantity,
      priceMinor: Math.max(
        0,
        Math.round(line.priceMinor),
      ),
    });

    remaining -= quantity;
  }

  return selected;
}

export function evaluateOfferForCart(
  offer: OfferDoc,
  lines: OfferCartLine[],
): OfferEvaluation {
  const eligible = new Set(
    offer.eligibleProductIds,
  );

  const eligibleQuantity =
    lines.reduce(
      (sum, line) =>
        eligible.has(line.productId)
          ? sum +
            Math.max(
              0,
              Math.floor(line.quantity),
            )
          : sum,
      0,
    );

  const bundleCount = Math.floor(
    eligibleQuantity /
      offer.requiredQuantity,
  );

  const remainder =
    eligibleQuantity %
    offer.requiredQuantity;

  const nextBundleRemaining =
    remainder === 0 &&
    bundleCount > 0
      ? 0
      : Math.max(
          0,
          offer.requiredQuantity -
            remainder,
        );

  const selectedItems =
    selectOfferItems(
      offer,
      lines,
      bundleCount,
    );

  const regularAmountMinor =
    selectedItems.reduce(
      (sum, item) =>
        sum +
        item.quantity *
          item.priceMinor,
      0,
    );

  let discountAmountMinor = 0;

  if (bundleCount > 0) {
    if (
      offer.pricing.mode ===
      "fixed_total"
    ) {
      const promotional =
        offer.pricing
          .promotionalTotalMinor ?? 0;
      discountAmountMinor =
        Math.max(
          0,
          regularAmountMinor -
            promotional *
              bundleCount,
        );
    } else if (
      offer.pricing.mode ===
      "fixed_discount"
    ) {
      discountAmountMinor =
        Math.min(
          regularAmountMinor,
          Math.max(
            0,
            offer.pricing
              .discountMinor ?? 0,
          ) * bundleCount,
        );
    } else {
      discountAmountMinor =
        Math.min(
          regularAmountMinor,
          Math.round(
            regularAmountMinor *
              Math.max(
                0,
                Math.min(
                  100,
                  offer.pricing
                    .percentage ?? 0,
                ),
              ) /
              100,
          ),
        );
    }
  }

  const finalAmountMinor =
    Math.max(
      0,
      regularAmountMinor -
        discountAmountMinor,
    );

  return {
    offer,
    eligibleQuantity,
    bundleCount,
    nextBundleRemaining,
    regularAmountMinor,
    discountAmountMinor,
    finalAmountMinor,
    selectedItems,
    applicable:
      bundleCount > 0 &&
      discountAmountMinor > 0,
  };
}

export function createAppliedOfferSnapshot(
  evaluation: OfferEvaluation,
  language: OfferLanguage,
  defaultLanguage: OfferLanguage,
): AppliedOfferSnapshot | null {
  if (!evaluation.applicable) {
    return null;
  }

  const localized =
    resolveLocalizedOfferText(
      evaluation.offer.content,
      language,
      defaultLanguage,
    );

  return {
    offerId: evaluation.offer.id,
    name: localized.name,
    pricingMode:
      evaluation.offer.pricing.mode,
    requiredQuantity:
      evaluation.offer.requiredQuantity,
    bundleCount:
      evaluation.bundleCount,
    configuredRegularTotalMinor:
      evaluation.offer.pricing
        .regularTotalMinor,
    configuredPromotionalTotalMinor:
      evaluation.offer.pricing
        .promotionalTotalMinor,
    configuredDiscountMinor:
      evaluation.offer.pricing
        .discountMinor,
    configuredPercentage:
      evaluation.offer.pricing
        .percentage,
    regularAmountMinor:
      evaluation.regularAmountMinor,
    discountAmountMinor:
      evaluation.discountAmountMinor,
    finalAmountMinor:
      evaluation.finalAmountMinor,
    selectedItems:
      evaluation.selectedItems,
  };
}

export function offerPricingSummaryMajor(
  offer: OfferDoc,
  currency: SupportedCurrency,
): {
  regularTotal: number | null;
  promotionalTotal: number | null;
  discount: number | null;
  percentage: number | null;
} {
  return {
    regularTotal:
      offer.pricing
        .regularTotalMinor === null
        ? null
        : minorToMajor(
            offer.pricing
              .regularTotalMinor,
            currency,
          ),
    promotionalTotal:
      offer.pricing
        .promotionalTotalMinor === null
        ? null
        : minorToMajor(
            offer.pricing
              .promotionalTotalMinor,
            currency,
          ),
    discount:
      offer.pricing
        .discountMinor === null
        ? null
        : minorToMajor(
            offer.pricing
              .discountMinor,
            currency,
          ),
    percentage:
      offer.pricing.percentage,
  };
}

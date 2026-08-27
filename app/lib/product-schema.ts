import type { SupportedCurrency } from "@/app/types/regional";
import { legacyMajorValueToMinor, minorToMajor } from "@/app/lib/money";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";

export type ProductLanguage = "pt" | "en" | "ja";
export type LocalizedProductText = {
  name: string;
  shortDescription: string;
  details: string;
  ingredients: string;
  allergens: string;
};
export type ProductContent = Record<ProductLanguage, LocalizedProductText>;

export type ProductBundleConfig = {
  enabled: boolean;
  totalUnits: number;
  optionProductIds: string[];
};


export type ProductType = "standard" | "mixed_pack";

export type ProductMixedPackConfig = {
  enabled: boolean;
  unitsPerPack: number;
  optionProductIds: string[];
  allowRepeats: boolean;
  minDistinct: number;
  maxPerProduct: number | null;
};

export const EMPTY_PRODUCT_MIXED_PACK_CONFIG: ProductMixedPackConfig = {
  enabled: false,
  unitsPerPack: 3,
  optionProductIds: [],
  allowRepeats: false,
  minDistinct: 3,
  maxPerProduct: 1,
};

export function normalizeProductType(value: unknown, mixedPackValue?: unknown): ProductType {
  if (value === "mixed_pack") return "mixed_pack";
  const mixed = record(mixedPackValue);
  if (mixed.enabled === true) return "mixed_pack";
  return "standard";
}

export function normalizeProductMixedPackConfig(value: unknown): ProductMixedPackConfig {
  const raw = record(value);
  const enabled = raw.enabled === true;
  const unitsParsed = Number(raw.unitsPerPack ?? raw.totalUnits ?? raw.units);
  const unitsPerPack = Number.isFinite(unitsParsed)
    ? Math.min(1000, Math.max(1, Math.floor(unitsParsed)))
    : 3;
  const optionProductIds = Array.isArray(raw.optionProductIds)
    ? Array.from(new Set(raw.optionProductIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item && !item.includes("/"))))
    : [];
  const allowRepeats = raw.allowRepeats === true;
  const minDistinctParsed = Number(raw.minDistinct);
  const minDistinct = Number.isFinite(minDistinctParsed)
    ? Math.min(unitsPerPack, Math.max(1, Math.floor(minDistinctParsed)))
    : Math.min(unitsPerPack, allowRepeats ? 1 : unitsPerPack);
  const maxParsed = Number(raw.maxPerProduct);
  const maxPerProduct = raw.maxPerProduct === null || raw.maxPerProduct === "" || raw.maxPerProduct === undefined
    ? (allowRepeats ? null : 1)
    : Number.isFinite(maxParsed)
      ? Math.min(unitsPerPack, Math.max(1, Math.floor(maxParsed)))
      : (allowRepeats ? null : 1);

  return { enabled, unitsPerPack, optionProductIds, allowRepeats, minDistinct, maxPerProduct };
}

export type ProductStorefrontConfig = {
  subgroup: string;
  subgroupOrder: number | null;
  productOrder: number | null;
};

export const EMPTY_PRODUCT_STOREFRONT_CONFIG: ProductStorefrontConfig = {
  subgroup: "",
  subgroupOrder: null,
  productOrder: null,
};

function optionalOrder(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(-9999, Math.min(9999, Math.trunc(parsed))) : null;
}

export function normalizeProductStorefrontConfig(
  value: unknown,
  legacySubgroup?: unknown,
  legacySubgroupOrder?: unknown,
  legacyProductOrder?: unknown,
): ProductStorefrontConfig {
  const raw = record(value);
  return {
    subgroup: text(raw.subgroup ?? raw.group ?? legacySubgroup),
    subgroupOrder: optionalOrder(raw.subgroupOrder ?? raw.groupOrder ?? legacySubgroupOrder),
    productOrder: optionalOrder(raw.productOrder ?? raw.order ?? legacyProductOrder),
  };
}

export const EMPTY_PRODUCT_BUNDLE_CONFIG: ProductBundleConfig = {
  enabled: false,
  totalUnits: 100,
  optionProductIds: [],
};

export function normalizeProductBundleConfig(value: unknown): ProductBundleConfig {
  const raw = record(value);
  const enabled = raw.enabled === true;
  const parsedTotal = Number(raw.totalUnits);
  const totalUnits = Number.isFinite(parsedTotal)
    ? Math.min(10_000, Math.max(1, Math.floor(parsedTotal)))
    : 100;
  const optionProductIds = Array.isArray(raw.optionProductIds)
    ? Array.from(new Set(raw.optionProductIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item && !item.includes("/"))))
    : [];

  return { enabled, totalUnits, optionProductIds };
}

export const EMPTY_LOCALIZED_PRODUCT_TEXT: LocalizedProductText = {
  name: "",
  shortDescription: "",
  details: "",
  ingredients: "",
  allergens: "",
};

export function emptyProductContent(): ProductContent {
  return {
    pt: { ...EMPTY_LOCALIZED_PRODUCT_TEXT },
    en: { ...EMPTY_LOCALIZED_PRODUCT_TEXT },
    ja: { ...EMPTY_LOCALIZED_PRODUCT_TEXT },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProductContent(rawValue: unknown, legacyName = "", legacyDescription = ""): ProductContent {
  const raw = record(rawValue);
  const result = emptyProductContent();
  for (const language of ["pt", "en", "ja"] as const) {
    const localized = record(raw[language]);
    result[language] = {
      name: text(localized.name),
      shortDescription: text(localized.shortDescription),
      details: text(localized.details),
      ingredients: text(localized.ingredients),
      allergens: text(localized.allergens),
    };
  }
  if (!result.pt.name && legacyName) result.pt.name = legacyName;
  if (!result.pt.shortDescription && legacyDescription) result.pt.shortDescription = legacyDescription;
  return result;
}

export function resolveLocalizedProductText(
  contentValue: unknown,
  language: ProductLanguage,
  defaultLanguage: ProductLanguage,
  legacyName = "",
  legacyDescription = "",
): LocalizedProductText {
  const content = normalizeProductContent(contentValue, legacyName, legacyDescription);
  const order = Array.from(new Set([language, defaultLanguage, "pt", "en", "ja"] as ProductLanguage[]));
  const selectedName = order.find((key) => content[key].name)?.toString();
  const source = selectedName ? content[selectedName as ProductLanguage] : content.pt;
  return {
    name: source.name || legacyName,
    shortDescription: source.shortDescription || legacyDescription,
    details: source.details,
    ingredients: source.ingredients,
    allergens: source.allergens,
  };
}

export function normalizeProductPriceMinor(raw: Record<string, unknown>, currency: SupportedCurrency): number {
  return typeof raw.priceMinor === "number" && Number.isFinite(raw.priceMinor)
    ? Math.max(0, Math.round(raw.priceMinor))
    : legacyMajorValueToMinor(raw.sellPrice ?? raw.price ?? raw.shadowSell, currency);
}

export function normalizeProductPriceMajor(raw: Record<string, unknown>, currency: SupportedCurrency): number {
  return minorToMajor(normalizeProductPriceMinor(raw, currency), currency);
}

export function normalizeInventory(rawValue: unknown, legacyStock: unknown, legacyThreshold: unknown) {
  return normalizeProductInventory(rawValue, legacyStock, legacyThreshold);
}

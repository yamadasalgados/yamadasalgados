import type { SupportedCurrency } from "@/app/types/regional";
import { legacyMajorValueToMinor, minorToMajor } from "@/app/lib/money";

export type ProductLanguage = "pt" | "en" | "ja";
export type LocalizedProductText = {
  name: string;
  shortDescription: string;
  details: string;
  ingredients: string;
  allergens: string;
};
export type ProductContent = Record<ProductLanguage, LocalizedProductText>;

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
  const raw = record(rawValue);
  const tracked = typeof raw.tracked === "boolean" ? raw.tracked : true;
  const quantityCandidate = typeof raw.quantity === "number" ? raw.quantity : Number(legacyStock ?? 0);
  const thresholdCandidate = typeof raw.lowStockThreshold === "number" ? raw.lowStockThreshold : Number(legacyThreshold ?? 5);
  return {
    tracked,
    quantity: Number.isFinite(quantityCandidate) ? Math.max(0, Math.floor(quantityCandidate)) : 0,
    lowStockThreshold: Number.isFinite(thresholdCandidate) ? Math.max(0, Math.floor(thresholdCandidate)) : 5,
  };
}

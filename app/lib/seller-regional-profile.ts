import {
  getRegionalSettings,
  isAllowedTimeZone,
  normalizeLanguage,
} from "@/app/lib/regional";
import {
  isOperatingCountry,
  isSupportedCurrency,
  type OperatingCountry,
  type RegionalLocale,
  type SupportedCurrency,
  type SupportedLanguage,
} from "@/app/types/regional";

export type SellerRegionalProfile = {
  sellerId: string;
  storeName: string;
  operatingCountry: OperatingCountry | null;
  currency: SupportedCurrency | null;
  regionalLocale: RegionalLocale | null;
  timeZone: string;
  defaultLanguage: SupportedLanguage;
  onboardingComplete: boolean;
  regionalVersion: number;
};

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(
  value: unknown,
): string {
  return String(value ?? "").trim();
}

function normalizeLocale(
  value: unknown,
): RegionalLocale | null {
  return value === "ja-JP" ||
    value === "pt-BR" ||
    value === "en-US"
    ? value
    : null;
}

export function normalizeSellerRegionalProfile(
  value: unknown,
  options?: {
    fallbackSellerId?: string;
    fallbackLanguage?: SupportedLanguage;
  },
): SellerRegionalProfile {
  const data = asRecord(value);
  const fallbackLanguage =
    options?.fallbackLanguage ?? "pt";

  const sellerId =
    text(data.sellerId) ||
    text(options?.fallbackSellerId);

  const operatingCountry =
    isOperatingCountry(data.operatingCountry)
      ? data.operatingCountry
      : null;

  const derivedRegional =
    operatingCountry
      ? getRegionalSettings(
          operatingCountry,
          text(data.timeZone),
        )
      : null;

  const storedCurrency =
    isSupportedCurrency(data.currency)
      ? data.currency
      : null;

  const currency =
    derivedRegional &&
    storedCurrency === derivedRegional.currency
      ? storedCurrency
      : derivedRegional?.currency ?? null;

  const storedLocale =
    normalizeLocale(data.regionalLocale);

  const regionalLocale =
    derivedRegional &&
    storedLocale === derivedRegional.regionalLocale
      ? storedLocale
      : derivedRegional?.regionalLocale ?? null;

  const requestedTimeZone =
    text(data.timeZone);

  const timeZone =
    operatingCountry &&
    requestedTimeZone &&
    isAllowedTimeZone(
      operatingCountry,
      requestedTimeZone,
    )
      ? requestedTimeZone
      : derivedRegional?.timeZone ?? "";

  const storeName =
    text(data.storeName) ||
    text(data.businessName) ||
    text(data.publicName);

  const defaultLanguage =
    normalizeLanguage(
      data.defaultLanguage ??
        data.preferredLanguage ??
        data.locale,
      fallbackLanguage,
    );

  const complete = Boolean(
    data.onboardingComplete === true &&
      storeName &&
      operatingCountry &&
      currency &&
      regionalLocale &&
      timeZone,
  );

  return {
    sellerId,
    storeName,
    operatingCountry,
    currency,
    regionalLocale,
    timeZone,
    defaultLanguage,
    onboardingComplete: complete,
    regionalVersion:
      Number.isFinite(data.regionalVersion)
        ? Number(data.regionalVersion)
        : 0,
  };
}

export function hasCompleteSellerOnboarding(
  value: unknown,
): boolean {
  return normalizeSellerRegionalProfile(
    value,
  ).onboardingComplete;
}

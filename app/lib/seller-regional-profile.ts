import {
  normalizeSellerIdentity,
  type SellerContactIdentity,
  type SellerReceiptIdentity,
} from "@/app/lib/seller-identity";
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
  storeDescription: string;
  logoUrl: string;
  bannerUrl: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  contact: SellerContactIdentity;
  receiptIdentity: SellerReceiptIdentity;
  operatingCountry: OperatingCountry | null;
  currency: SupportedCurrency | null;
  regionalLocale: RegionalLocale | null;
  timeZone: string;
  defaultLanguage: SupportedLanguage;
  onboardingComplete: boolean;
  schemaVersion: number;
};

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
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
  const regional = asRecord(data.regional);
  const onboarding = asRecord(data.onboarding);

  const fallbackLanguage =
    options?.fallbackLanguage ?? "pt";

  const sellerId =
    text(data.sellerId) ||
    text(options?.fallbackSellerId);

  const operatingCountryCandidate =
    regional.operatingCountry ??
    data.operatingCountry;

  const operatingCountry =
    isOperatingCountry(
      operatingCountryCandidate,
    )
      ? operatingCountryCandidate
      : null;

  const requestedTimeZone =
    text(
      regional.timeZone ??
      data.timeZone,
    );

  const derivedRegional =
    operatingCountry
      ? getRegionalSettings(
          operatingCountry,
          requestedTimeZone,
        )
      : null;

  const storedCurrencyCandidate =
    regional.currency ??
    data.currency;

  const storedCurrency =
    isSupportedCurrency(
      storedCurrencyCandidate,
    )
      ? storedCurrencyCandidate
      : null;

  const currency =
    derivedRegional &&
    storedCurrency ===
      derivedRegional.currency
      ? storedCurrency
      : derivedRegional?.currency ?? null;

  const storedLocale =
    normalizeLocale(
      regional.locale ??
      data.regionalLocale,
    );

  const regionalLocale =
    derivedRegional &&
    storedLocale ===
      derivedRegional.regionalLocale
      ? storedLocale
      : derivedRegional?.regionalLocale ??
        null;

  const timeZone =
    operatingCountry &&
    requestedTimeZone &&
    isAllowedTimeZone(
      operatingCountry,
      requestedTimeZone,
    )
      ? requestedTimeZone
      : derivedRegional?.timeZone ?? "";

  const identity = normalizeSellerIdentity(data);
  const storeName = identity.storeName;

  const defaultLanguage =
    normalizeLanguage(
      data.storefrontLanguage ??
      data.defaultLanguage ??
      data.preferredLanguage ??
      data.locale,
      fallbackLanguage,
    );

  const completeFlag =
    onboarding.complete === true ||
    data.onboardingComplete === true;

  const complete = Boolean(
    completeFlag &&
      storeName &&
      operatingCountry &&
      currency &&
      regionalLocale &&
      timeZone,
  );

  return {
    sellerId,
    storeName,
    storeDescription: identity.storeDescription,
    logoUrl: identity.logoUrl,
    bannerUrl: identity.bannerUrl,
    brandPrimaryColor: identity.primaryColor,
    brandAccentColor: identity.accentColor,
    contact: identity.contact,
    receiptIdentity: identity.receipt,
    operatingCountry,
    currency,
    regionalLocale,
    timeZone,
    defaultLanguage,
    onboardingComplete: complete,
    schemaVersion:
      Number.isFinite(data.schemaVersion)
        ? Number(data.schemaVersion)
        : Number.isFinite(
            onboarding.schemaVersion,
          )
          ? Number(
              onboarding.schemaVersion,
            )
          : Number.isFinite(
              data.regionalVersion,
            )
            ? Number(
                data.regionalVersion,
              )
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

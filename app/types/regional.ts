export const SUPPORTED_OPERATING_COUNTRIES = [
  "JP",
  "BR",
  "US",
] as const;

export type OperatingCountry =
  (typeof SUPPORTED_OPERATING_COUNTRIES)[number];

export const SUPPORTED_CURRENCIES = [
  "JPY",
  "BRL",
  "USD",
] as const;

export type SupportedCurrency =
  (typeof SUPPORTED_CURRENCIES)[number];

export const SUPPORTED_LANGUAGES = [
  "pt",
  "en",
  "ja",
] as const;

export type SupportedLanguage =
  (typeof SUPPORTED_LANGUAGES)[number];

export type RegionalLocale =
  | "ja-JP"
  | "pt-BR"
  | "en-US";

export type RegionalSettings = {
  operatingCountry: OperatingCountry;
  currency: SupportedCurrency;
  regionalLocale: RegionalLocale;
  timeZone: string;
};

export function isOperatingCountry(
  value: unknown,
): value is OperatingCountry {
  return (
    typeof value === "string" &&
    SUPPORTED_OPERATING_COUNTRIES.includes(
      value as OperatingCountry,
    )
  );
}

export function isSupportedCurrency(
  value: unknown,
): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    SUPPORTED_CURRENCIES.includes(
      value as SupportedCurrency,
    )
  );
}

export function isSupportedLanguage(
  value: unknown,
): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    SUPPORTED_LANGUAGES.includes(
      value as SupportedLanguage,
    )
  );
}

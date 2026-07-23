import {
  isOperatingCountry,
  isSupportedLanguage,
  type OperatingCountry,
  type RegionalLocale,
  type RegionalSettings,
  type SupportedCurrency,
  type SupportedLanguage,
} from "@/app/types/regional";

export type CountryDefinition = {
  country: OperatingCountry;
  label: Record<SupportedLanguage, string>;
  currency: SupportedCurrency;
  regionalLocale: RegionalLocale;
  defaultTimeZone: string;
  allowedTimeZones: readonly string[];
};

export const COUNTRY_DEFINITIONS: Record<
  OperatingCountry,
  CountryDefinition
> = {
  JP: {
    country: "JP",
    label: {
      pt: "Japão",
      en: "Japan",
      ja: "日本",
    },
    currency: "JPY",
    regionalLocale: "ja-JP",
    defaultTimeZone: "Asia/Tokyo",
    allowedTimeZones: [
      "Asia/Tokyo",
    ],
  },

  BR: {
    country: "BR",
    label: {
      pt: "Brasil",
      en: "Brazil",
      ja: "ブラジル",
    },
    currency: "BRL",
    regionalLocale: "pt-BR",
    defaultTimeZone: "America/Sao_Paulo",
    allowedTimeZones: [
      "America/Sao_Paulo",
      "America/Manaus",
      "America/Cuiaba",
      "America/Rio_Branco",
      "America/Noronha",
    ],
  },

  US: {
    country: "US",
    label: {
      pt: "Estados Unidos",
      en: "United States",
      ja: "アメリカ合衆国",
    },
    currency: "USD",
    regionalLocale: "en-US",
    defaultTimeZone: "America/New_York",
    allowedTimeZones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
    ],
  },
};

export function normalizeLanguage(
  value: unknown,
  fallback: SupportedLanguage = "pt",
): SupportedLanguage {
  if (value === "jp") return "ja";

  return isSupportedLanguage(value)
    ? value
    : fallback;
}

export function normalizeOperatingCountry(
  value: unknown,
  fallback: OperatingCountry = "JP",
): OperatingCountry {
  return isOperatingCountry(value)
    ? value
    : fallback;
}

export function getCountryDefinition(
  country: OperatingCountry,
): CountryDefinition {
  return COUNTRY_DEFINITIONS[country];
}

export function getRegionalSettings(
  country: OperatingCountry,
  requestedTimeZone?: string | null,
): RegionalSettings {
  const definition =
    getCountryDefinition(country);

  const requested =
    String(requestedTimeZone ?? "").trim();

  const timeZone =
    definition.allowedTimeZones.includes(requested)
      ? requested
      : definition.defaultTimeZone;

  return {
    operatingCountry: country,
    currency: definition.currency,
    regionalLocale:
      definition.regionalLocale,
    timeZone,
  };
}

export function languageToHtmlLang(
  language: SupportedLanguage,
): string {
  switch (language) {
    case "ja":
      return "ja";

    case "en":
      return "en";

    default:
      return "pt-BR";
  }
}

export function detectBrowserTimeZone(): string {
  if (typeof Intl === "undefined") {
    return "";
  }

  try {
    return (
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone || ""
    );
  } catch {
    return "";
  }
}

export function countryForCurrency(
  currency: SupportedCurrency,
): OperatingCountry {
  switch (currency) {
    case "BRL":
      return "BR";

    case "USD":
      return "US";

    default:
      return "JP";
  }
}

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
export const TIME_ZONE_LABELS: Record<
  string,
  Record<SupportedLanguage, string>
> = {
  "Asia/Tokyo": {
    pt: "Japão (Tóquio)",
    en: "Japan (Tokyo)",
    ja: "日本（東京）",
  },
  "America/Sao_Paulo": {
    pt: "Brasília / São Paulo",
    en: "Brasília / São Paulo",
    ja: "ブラジリア／サンパウロ",
  },
  "America/Manaus": {
    pt: "Manaus",
    en: "Manaus",
    ja: "マナウス",
  },
  "America/Cuiaba": {
    pt: "Cuiabá",
    en: "Cuiabá",
    ja: "クイアバ",
  },
  "America/Rio_Branco": {
    pt: "Rio Branco",
    en: "Rio Branco",
    ja: "リオブランコ",
  },
  "America/Noronha": {
    pt: "Fernando de Noronha",
    en: "Fernando de Noronha",
    ja: "フェルナンド・デ・ノローニャ",
  },
  "America/New_York": {
    pt: "Leste (Nova York)",
    en: "Eastern (New York)",
    ja: "東部（ニューヨーク）",
  },
  "America/Chicago": {
    pt: "Central (Chicago)",
    en: "Central (Chicago)",
    ja: "中部（シカゴ）",
  },
  "America/Denver": {
    pt: "Montanha (Denver)",
    en: "Mountain (Denver)",
    ja: "山岳部（デンバー）",
  },
  "America/Los_Angeles": {
    pt: "Pacífico (Los Angeles)",
    en: "Pacific (Los Angeles)",
    ja: "太平洋（ロサンゼルス）",
  },
  "America/Anchorage": {
    pt: "Alasca (Anchorage)",
    en: "Alaska (Anchorage)",
    ja: "アラスカ（アンカレッジ）",
  },
  "Pacific/Honolulu": {
    pt: "Havaí (Honolulu)",
    en: "Hawaii (Honolulu)",
    ja: "ハワイ（ホノルル）",
  },
};

export function isAllowedTimeZone(
  country: OperatingCountry,
  timeZone: string,
): boolean {
  return getCountryDefinition(country)
    .allowedTimeZones.includes(timeZone);
}

export function countryFromTimeZone(
  timeZone: string,
): OperatingCountry | null {
  const normalized =
    String(timeZone || "").trim();

  for (const country of [
    "JP",
    "BR",
    "US",
  ] as const) {
    if (
      isAllowedTimeZone(
        country,
        normalized,
      )
    ) {
      return country;
    }
  }

  return null;
}

export function getTimeZoneLabel(
  timeZone: string,
  language: SupportedLanguage,
): string {
  return (
    TIME_ZONE_LABELS[timeZone]?.[language] ||
    timeZone
  );
}


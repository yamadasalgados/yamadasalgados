import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

const MINOR_UNIT_DIGITS: Record<
  SupportedCurrency,
  number
> = {
  JPY: 0,
  BRL: 2,
  USD: 2,
};

const DEFAULT_LOCALE: Record<
  SupportedCurrency,
  RegionalLocale
> = {
  JPY: "ja-JP",
  BRL: "pt-BR",
  USD: "en-US",
};

export function getMinorUnitDigits(
  currency: SupportedCurrency,
): number {
  return MINOR_UNIT_DIGITS[currency];
}

export function majorToMinor(
  amountMajor: number,
  currency: SupportedCurrency,
): number {
  if (!Number.isFinite(amountMajor)) {
    throw new Error(
      "INVALID_MONEY_AMOUNT",
    );
  }

  const factor =
    10 ** getMinorUnitDigits(currency);

  return Math.round(amountMajor * factor);
}

export function minorToMajor(
  amountMinor: number,
  currency: SupportedCurrency,
): number {
  if (!Number.isFinite(amountMinor)) {
    return 0;
  }

  const factor =
    10 ** getMinorUnitDigits(currency);

  return amountMinor / factor;
}

export function formatMoneyMajor(
  amountMajor: number,
  currency: SupportedCurrency,
  locale?: string,
): string {
  const normalizedMajor =
    Number.isFinite(amountMajor)
      ? amountMajor
      : 0;

  return new Intl.NumberFormat(
    locale || DEFAULT_LOCALE[currency],
    {
      style: "currency",
      currency,
      minimumFractionDigits:
        getMinorUnitDigits(currency),
      maximumFractionDigits:
        getMinorUnitDigits(currency),
    },
  ).format(normalizedMajor);
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: SupportedCurrency,
  locale?: string,
): string {
  const normalizedMinor =
    Number.isFinite(amountMinor)
      ? Math.round(amountMinor)
      : 0;

  return new Intl.NumberFormat(
    locale || DEFAULT_LOCALE[currency],
    {
      style: "currency",
      currency,
      minimumFractionDigits:
        getMinorUnitDigits(currency),
      maximumFractionDigits:
        getMinorUnitDigits(currency),
    },
  ).format(
    minorToMajor(
      normalizedMinor,
      currency,
    ),
  );
}

/**
 * Compatibilidade temporária com documentos antigos,
 * cujos valores estão na unidade principal.
 *
 * Exemplos:
 * - JPY 700  -> 700 minor
 * - BRL 30   -> 3000 minor
 * - USD 30   -> 3000 minor
 */
export function legacyMajorValueToMinor(
  legacyValue: unknown,
  currency: SupportedCurrency,
): number {
  const numeric =
    typeof legacyValue === "number"
      ? legacyValue
      : Number(
          String(legacyValue ?? "")
            .trim()
            .replace(",", "."),
        );

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return majorToMinor(
    numeric,
    currency,
  );
}

export function parseMoneyInputToMinor(
  input: string,
  currency: SupportedCurrency,
): number | null {
  const raw = input.trim();

  if (!raw) return null;

  let normalized = raw.replace(
    /[^\d,.-]/g,
    "",
  );

  const commaIndex =
    normalized.lastIndexOf(",");
  const dotIndex =
    normalized.lastIndexOf(".");

  if (
    commaIndex >= 0 &&
    dotIndex >= 0
  ) {
    if (commaIndex > dotIndex) {
      normalized = normalized
        .replace(/\./g, "")
        .replace(",", ".");
    } else {
      normalized =
        normalized.replace(/,/g, "");
    }
  } else if (commaIndex >= 0) {
    normalized =
      normalized.replace(",", ".");
  }

  const numeric = Number(normalized);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0
  ) {
    return null;
  }

  return majorToMinor(
    numeric,
    currency,
  );
}

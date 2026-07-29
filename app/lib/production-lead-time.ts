export const MAX_PRODUCTION_LEAD_TIME_DAYS = 365;
export const PRODUCTION_LEAD_TIME_UNIT = "calendar_days" as const;

export type ProductProductionLeadTime = {
  days: number;
  unit: typeof PRODUCTION_LEAD_TIME_UNIT;
};

export type ProductionScheduleSnapshot = {
  timeZone: string;
  maxLeadTimeDays: number;
  earliestFulfillmentDate: string;
  productIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeProductionLeadTimeDays(
  value: unknown,
  options?: { madeToOrder?: boolean; fallbackDays?: number },
): number {
  const record = asRecord(value);
  const candidates = [
    record.days,
    record.leadTimeDays,
    record.productionLeadTimeDays,
    value,
    options?.fallbackDays,
  ];

  let parsed: number | null = null;
  for (const candidate of candidates) {
    parsed = finiteNumber(candidate);
    if (parsed !== null) break;
  }

  const minimum = options?.madeToOrder ? 1 : 0;
  const normalized = parsed === null ? minimum : Math.floor(parsed);
  return Math.min(
    MAX_PRODUCTION_LEAD_TIME_DAYS,
    Math.max(minimum, normalized),
  );
}

export function normalizeProductProductionLeadTime(
  value: unknown,
  legacyDays?: unknown,
  options?: { madeToOrder?: boolean },
): ProductProductionLeadTime {
  return {
    days: normalizeProductionLeadTimeDays(value, {
      madeToOrder: options?.madeToOrder,
      fallbackDays: finiteNumber(legacyDays) ?? undefined,
    }),
    unit: PRODUCTION_LEAD_TIME_UNIT,
  };
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function defaultTimeZoneForRegional(
  locale: unknown,
  currency: unknown,
  operatingCountry?: unknown,
): string {
  if (
    operatingCountry === "BR" ||
    locale === "pt-BR" ||
    currency === "BRL"
  ) {
    return "America/Sao_Paulo";
  }

  if (
    operatingCountry === "US" ||
    locale === "en-US" ||
    currency === "USD"
  ) {
    return "America/New_York";
  }

  return "Asia/Tokyo";
}

export function normalizeTimeZone(value: unknown, fallback = "UTC"): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

export function dateKeyInTimeZone(
  input: Date | number,
  timeZone: string,
): string {
  const date = input instanceof Date ? input : new Date(input);
  const safeTimeZone = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDaysToDateKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey)) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor(days)));
  return date.toISOString().slice(0, 10);
}

export function earliestFulfillmentDate(params: {
  now?: Date | number;
  timeZone: string;
  leadTimeDays: number;
}): string {
  const now = params.now ?? Date.now();
  const today = dateKeyInTimeZone(now, params.timeZone);
  return addCalendarDaysToDateKey(today, params.leadTimeDays);
}

export function compareDateKeys(left: string, right: string): number {
  if (!isValidDateKey(left) || !isValidDateKey(right)) return 0;
  return left.localeCompare(right);
}

export function formatDateKey(
  dateKey: string,
  locale: string,
): string {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(locale || "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function formatLeadTimeDays(
  days: number,
  language: "pt" | "en" | "ja" | string,
): string {
  const normalized = Math.max(0, Math.floor(days));
  if (language === "ja") {
    return normalized === 0 ? "当日" : `${normalized}日`;
  }
  if (language === "en") {
    return normalized === 0
      ? "same day"
      : `${normalized} calendar ${normalized === 1 ? "day" : "days"}`;
  }
  return normalized === 0
    ? "no mesmo dia"
    : `${normalized} ${normalized === 1 ? "dia corrido" : "dias corridos"}`;
}

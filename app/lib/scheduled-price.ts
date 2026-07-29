import { majorToMinor } from "@/app/lib/money";
import type { SupportedCurrency } from "@/app/types/regional";

export const MAX_SCHEDULED_PRICE_MESSAGE_LENGTH = 240;
export const DEFAULT_PRICE_NOTICE_DAYS = 7;
export const DEFAULT_PRICE_COUNTDOWN_MINUTES = 24 * 60;
export const DEFAULT_PRICE_APPLIED_NOTICE_DAYS = 3;
export const MIN_PRICE_NOTICE_DAYS = 1;
export const MAX_PRICE_NOTICE_DAYS = 365;

export type ScheduledPriceStatus = "none" | "upcoming" | "active" | "invalid";

export type ScheduledPriceNoticePhase =
  | "hidden"
  | "notice"
  | "urgent"
  | "countdown"
  | "last_hour"
  | "active_recent"
  | "active";

export type ProductScheduledPriceChange = {
  schemaVersion: 2;
  enabled: boolean;
  nextPriceMinor: number | null;
  startsAtMillis: number | null;
  message: string;
  showCountdown: boolean;
  noticeStartsBeforeDays: number;
  countdownStartsBeforeMinutes: number;
  showInLastChance: boolean;
  appliedNoticeDurationDays: number;
};

export type ProductPriceEvaluation = {
  basePriceMinor: number;
  effectivePriceMinor: number;
  previousPriceMinor: number | null;
  scheduledPriceChange: ProductScheduledPriceChange;
  status: ScheduledPriceStatus;
  noticePhase: ScheduledPriceNoticePhase;
  shouldShowNotice: boolean;
  shouldShowCountdown: boolean;
  shouldShowInLastChance: boolean;
  isScheduledIncrease: boolean;
  priceChanged: boolean;
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

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function timestampToMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Accept milliseconds and legacy Unix seconds.
    return value > 0 && value < 10_000_000_000
      ? Math.round(value * 1000)
      : Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = finiteNumber(value);
    if (numeric !== null && /^\d+(?:\.\d+)?$/.test(value.trim())) {
      return timestampToMillis(numeric);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const raw = asRecord(value);
  const toMillis = raw.toMillis;
  if (typeof toMillis === "function") {
    try {
      const parsed = Number((toMillis as () => unknown).call(value));
      return Number.isFinite(parsed) ? Math.round(parsed) : null;
    } catch {
      // Continue through the serialized Timestamp fallbacks below.
    }
  }

  const seconds = finiteNumber(raw.seconds ?? raw._seconds);
  const nanoseconds = finiteNumber(raw.nanoseconds ?? raw._nanoseconds) ?? 0;
  if (seconds !== null) {
    return Math.round(seconds * 1000 + nanoseconds / 1_000_000);
  }

  return null;
}

function firstValidTimestamp(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = timestampToMillis(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function firstValidPositiveMinor(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null && parsed > 0) return Math.round(parsed);
  }
  return null;
}

/**
 * Normalizes the nested schedule object. Numeric `startsAtMillis` is checked
 * before Timestamp-like objects because some JSON/React transformations can
 * strip prototype methods from a Firestore Timestamp while preserving the
 * redundant millisecond field.
 */
export function normalizeProductScheduledPriceChange(
  value: unknown,
  currency: SupportedCurrency,
): ProductScheduledPriceChange {
  const raw = asRecord(value);
  const nextPriceMinorRaw = firstValidPositiveMinor(
    raw.nextPriceMinor,
    raw.futurePriceMinor,
    raw.scheduledPriceMinor,
  );
  const legacyMajor =
    nextPriceMinorRaw === null
      ? finiteNumber(raw.nextPrice ?? raw.futurePrice ?? raw.scheduledPrice)
      : null;
  const nextPriceMinor =
    nextPriceMinorRaw !== null
      ? Math.max(0, Math.round(nextPriceMinorRaw))
      : legacyMajor !== null
        ? Math.max(0, majorToMinor(legacyMajor, currency))
        : null;

  const startsAtMillis = firstValidTimestamp(
    raw.startsAtMillis,
    raw.effectiveAtMillis,
    raw.changeAtMillis,
    raw.startsAt,
    raw.effectiveAt,
    raw.changeAt,
  );

  return {
    schemaVersion: 2,
    enabled: raw.enabled === true,
    nextPriceMinor:
      nextPriceMinor !== null && nextPriceMinor > 0 ? nextPriceMinor : null,
    startsAtMillis:
      startsAtMillis !== null && startsAtMillis > 0 ? startsAtMillis : null,
    message:
      typeof raw.message === "string"
        ? raw.message.trim().slice(0, MAX_SCHEDULED_PRICE_MESSAGE_LENGTH)
        : "",
    showCountdown: raw.showCountdown !== false,
    noticeStartsBeforeDays: clampInteger(
      raw.noticeStartsBeforeDays ?? raw.noticeDays ?? raw.warningDays,
      DEFAULT_PRICE_NOTICE_DAYS,
      MIN_PRICE_NOTICE_DAYS,
      MAX_PRICE_NOTICE_DAYS,
    ),
    countdownStartsBeforeMinutes: clampInteger(
      raw.countdownStartsBeforeMinutes ?? raw.countdownMinutes,
      DEFAULT_PRICE_COUNTDOWN_MINUTES,
      1,
      30 * 24 * 60,
    ),
    showInLastChance: raw.showInLastChance !== false,
    appliedNoticeDurationDays: clampInteger(
      raw.appliedNoticeDurationDays,
      DEFAULT_PRICE_APPLIED_NOTICE_DAYS,
      0,
      30,
    ),
  };
}

/**
 * Resolves a schedule from a complete product document. This accepts both the
 * current nested object and old/top-level field names, making existing products
 * recoverable without a migration when the numeric timestamp was already saved.
 */
export function resolveProductScheduledPriceChange(
  productValue: unknown,
  currency: SupportedCurrency,
): ProductScheduledPriceChange {
  const product = asRecord(productValue);
  const nested = asRecord(
    product.scheduledPriceChange ??
      product.priceSchedule ??
      product.scheduledPrice ??
      product.futurePriceChange,
  );

  const merged: Record<string, unknown> = {
    ...nested,
    enabled:
      nested.enabled ??
      product.scheduledPriceEnabled ??
      product.priceScheduleEnabled,
    nextPriceMinor:
      nested.nextPriceMinor ??
      product.scheduledPriceNextMinor ??
      product.futurePriceMinor,
    nextPrice:
      nested.nextPrice ??
      product.scheduledPriceNext ??
      product.futurePrice,
    startsAtMillis:
      nested.startsAtMillis ??
      product.scheduledPriceStartsAtMillis ??
      product.priceChangeStartsAtMillis,
    startsAt:
      nested.startsAt ??
      product.scheduledPriceStartsAt ??
      product.priceChangeStartsAt,
    message:
      nested.message ??
      product.scheduledPriceMessage,
    showCountdown:
      nested.showCountdown ??
      product.scheduledPriceShowCountdown,
    noticeStartsBeforeDays:
      nested.noticeStartsBeforeDays ??
      product.scheduledPriceNoticeDays,
    countdownStartsBeforeMinutes:
      nested.countdownStartsBeforeMinutes ??
      product.scheduledPriceCountdownMinutes,
    showInLastChance:
      nested.showInLastChance ??
      product.scheduledPriceShowInLastChance,
    appliedNoticeDurationDays:
      nested.appliedNoticeDurationDays ??
      product.scheduledPriceAppliedNoticeDays,
  };

  return normalizeProductScheduledPriceChange(merged, currency);
}

export function scheduledPriceNoticePhase(
  scheduleValue: unknown,
  currency: SupportedCurrency,
  now = Date.now(),
): ScheduledPriceNoticePhase {
  const schedule = normalizeProductScheduledPriceChange(scheduleValue, currency);
  if (!schedule.enabled || schedule.startsAtMillis === null) return "hidden";

  const remaining = schedule.startsAtMillis - now;
  if (remaining <= 0) {
    const age = Math.abs(remaining);
    return age <= schedule.appliedNoticeDurationDays * 86_400_000
      ? "active_recent"
      : "active";
  }

  if (remaining > schedule.noticeStartsBeforeDays * 86_400_000) return "hidden";
  if (remaining <= 60 * 60_000) return "last_hour";
  if (remaining <= schedule.countdownStartsBeforeMinutes * 60_000) return "countdown";
  if (remaining <= 3 * 86_400_000) return "urgent";
  return "notice";
}

export function evaluateProductPrice(params: {
  basePriceMinor: number;
  scheduledPriceChange: unknown;
  currency: SupportedCurrency;
  now?: number | Date;
}): ProductPriceEvaluation {
  const basePriceMinor = Math.max(0, Math.round(params.basePriceMinor || 0));
  const schedule = normalizeProductScheduledPriceChange(
    params.scheduledPriceChange,
    params.currency,
  );
  const nowMillis =
    params.now instanceof Date
      ? params.now.getTime()
      : typeof params.now === "number"
        ? params.now
        : Date.now();

  if (!schedule.enabled) {
    return {
      basePriceMinor,
      effectivePriceMinor: basePriceMinor,
      previousPriceMinor: null,
      scheduledPriceChange: schedule,
      status: "none",
      noticePhase: "hidden",
      shouldShowNotice: false,
      shouldShowCountdown: false,
      shouldShowInLastChance: false,
      isScheduledIncrease: false,
      priceChanged: false,
    };
  }

  const valid =
    schedule.nextPriceMinor !== null &&
    schedule.startsAtMillis !== null &&
    schedule.nextPriceMinor > basePriceMinor;

  if (!valid) {
    return {
      basePriceMinor,
      effectivePriceMinor: basePriceMinor,
      previousPriceMinor: null,
      scheduledPriceChange: schedule,
      status: "invalid",
      noticePhase: "hidden",
      shouldShowNotice: false,
      shouldShowCountdown: false,
      shouldShowInLastChance: false,
      isScheduledIncrease: false,
      priceChanged: false,
    };
  }

  const active = nowMillis >= schedule.startsAtMillis!;
  const noticePhase = scheduledPriceNoticePhase(schedule, params.currency, nowMillis);
  const shouldShowNotice =
    noticePhase === "notice" ||
    noticePhase === "urgent" ||
    noticePhase === "countdown" ||
    noticePhase === "last_hour" ||
    noticePhase === "active_recent";
  const shouldShowCountdown =
    schedule.showCountdown &&
    (noticePhase === "countdown" || noticePhase === "last_hour");

  return {
    basePriceMinor,
    effectivePriceMinor: active ? schedule.nextPriceMinor! : basePriceMinor,
    previousPriceMinor: active ? basePriceMinor : null,
    scheduledPriceChange: schedule,
    status: active ? "active" : "upcoming",
    noticePhase,
    shouldShowNotice,
    shouldShowCountdown,
    shouldShowInLastChance:
      !active && shouldShowNotice && schedule.showInLastChance,
    isScheduledIncrease: true,
    priceChanged: active,
  };
}

function zonedParts(input: number | Date, timeZone: string) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function validTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

export function dateTimeLocalToUtcMillis(
  value: string,
  timeZone: string,
): number | null {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?$/);
  if (!match) return null;

  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };

  const naive = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  const checkDate = new Date(naive);
  if (
    checkDate.getUTCFullYear() !== desired.year ||
    checkDate.getUTCMonth() !== desired.month - 1 ||
    checkDate.getUTCDate() !== desired.day ||
    checkDate.getUTCHours() !== desired.hour ||
    checkDate.getUTCMinutes() !== desired.minute
  ) {
    return null;
  }

  const safeTimeZone = validTimeZone(timeZone);
  let candidate = naive;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = zonedParts(candidate, safeTimeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = naive - actualAsUtc;
    candidate += difference;
    if (difference === 0) break;
  }

  const finalParts = zonedParts(candidate, safeTimeZone);
  return finalParts.year === desired.year &&
    finalParts.month === desired.month &&
    finalParts.day === desired.day &&
    finalParts.hour === desired.hour &&
    finalParts.minute === desired.minute
    ? candidate
    : null;
}

export function utcMillisToDateTimeLocal(
  millis: number | null,
  timeZone: string,
): string {
  if (millis === null || !Number.isFinite(millis)) return "";
  const parts = zonedParts(millis, validTimeZone(timeZone));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatScheduledPriceDate(
  millis: number | null,
  locale: string,
  timeZone: string,
): string {
  if (millis === null || !Number.isFinite(millis)) return "";
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: validTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(millis));
}

export function scheduledPriceCountdown(
  startsAtMillis: number | null,
  now = Date.now(),
): { days: number; hours: number; minutes: number; expired: boolean } | null {
  if (startsAtMillis === null || !Number.isFinite(startsAtMillis)) return null;
  const remaining = startsAtMillis - now;
  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, expired: true };
  }
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60_000));
  return {
    days: Math.floor(totalMinutes / 1_440),
    hours: Math.floor((totalMinutes % 1_440) / 60),
    minutes: totalMinutes % 60,
    expired: false,
  };
}

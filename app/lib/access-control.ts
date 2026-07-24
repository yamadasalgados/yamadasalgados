import type {
  DocumentData,
} from "firebase/firestore";

import {
  getPlanLimits,
  normalizeBillingInterval,
  normalizePlanId,
  type BillingInterval,
  type PlanId,
  type PlanLimits,
} from "@/app/lib/plan-catalog";

export type AccountStatus =
  | "active"
  | "suspended"
  | "disabled";

export type AccessMode =
  | "subscription"
  | "lifetime";

export type AccessStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled"
  | "revoked";

export type AccessSource =
  | "purchase"
  | "admin_grant"
  | "gift";

export type SellerAccess = {
  planId: PlanId;
  mode: AccessMode;
  billingInterval:
    | BillingInterval
    | null;
  status: AccessStatus;
  source: AccessSource;
  currentPeriodStart: unknown | null;
  currentPeriodEnd: unknown | null;
  grantedAt: unknown | null;
  grantedBy: string | null;
  note: string | null;
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

function textOrNull(
  value: unknown,
): string | null {
  const normalized =
    String(value ?? "").trim();

  return normalized || null;
}

export function normalizeAccountStatus(
  value: unknown,
  legacy?: {
    active?: unknown;
    suspended?: unknown;
  },
): AccountStatus {
  if (
    value === "active" ||
    value === "suspended" ||
    value === "disabled"
  ) {
    return value;
  }

  if (legacy?.suspended === true) {
    return "suspended";
  }

  if (legacy?.active === false) {
    return "disabled";
  }

  return "active";
}

export function normalizeAccessStatus(
  value: unknown,
): AccessStatus {
  switch (value) {
    case "pending":
    case "active":
    case "past_due":
    case "cancelled":
    case "revoked":
    case "none":
      return value;

    default:
      return "none";
  }
}

export function normalizeAccessMode(
  value: unknown,
): AccessMode {
  return value === "lifetime"
    ? "lifetime"
    : "subscription";
}

export function normalizeAccessSource(
  value: unknown,
): AccessSource {
  return value === "gift" ||
    value === "admin_grant"
    ? value
    : "purchase";
}

export function defaultSellerAccess(
  planId: PlanId = "starter",
): SellerAccess {
  return {
    planId,
    mode: "subscription",
    billingInterval: "monthly",
    status: "none",
    source: "purchase",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    grantedAt: null,
    grantedBy: null,
    note: null,
  };
}

export function getEffectiveSellerAccess(
  seller: DocumentData | null | undefined,
): SellerAccess {
  const data = asRecord(seller);
  const access = asRecord(data.access);

  const planId = normalizePlanId(
    access.planId ?? data.plan,
  );

  const mode = normalizeAccessMode(
    access.mode,
  );

  const billingInterval =
    mode === "lifetime"
      ? null
      : normalizeBillingInterval(
          access.billingInterval ??
            data.billingInterval,
        );

  const currentPeriodStart =
    access.currentPeriodStart ??
    data.currentPeriodStart ??
    null;
  const currentPeriodEnd =
    access.currentPeriodEnd ??
    data.currentPeriodEnd ??
    null;
  const storedStatus =
    normalizeAccessStatus(
      access.status ??
      data.subscriptionStatus,
    );
  const periodEnd =
    firestoreDateToDate(
      currentPeriodEnd,
    );
  const status: AccessStatus =
    mode === "subscription" &&
    storedStatus === "active" &&
    (
      !periodEnd ||
      periodEnd.getTime() <= Date.now()
    )
      ? "past_due"
      : storedStatus;

  return {
    planId,
    mode,
    billingInterval,
    status,
    source: normalizeAccessSource(
      access.source,
    ),
    currentPeriodStart,
    currentPeriodEnd,
    grantedAt:
      access.grantedAt ?? null,
    grantedBy:
      textOrNull(access.grantedBy),
    note:
      textOrNull(access.note),
  };
}

export function firestoreDateToDate(
  value: unknown,
): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (
    typeof value === "number" ||
    typeof value === "string"
  ) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const record =
      value as Record<string, unknown>;

    if (
      typeof record.toDate ===
      "function"
    ) {
      const date = (
        record.toDate as () => unknown
      )();

      return date instanceof Date &&
        !Number.isNaN(date.getTime())
        ? date
        : null;
    }

    if (
      typeof record.seconds ===
      "number"
    ) {
      const date = new Date(
        record.seconds * 1000,
      );

      return Number.isNaN(date.getTime())
        ? null
        : date;
    }
  }

  return null;
}

export function accessIsActive(
  seller: DocumentData | null | undefined,
  user?: DocumentData | null,
): boolean {
  const sellerData = asRecord(seller);
  const userData = asRecord(user);

  const userAccountStatus =
    normalizeAccountStatus(
      userData.accountStatus,
      {
        active: userData.active,
        suspended: userData.suspended,
      },
    );

  const sellerAccountStatus =
    normalizeAccountStatus(
      sellerData.accountStatus,
      {
        active: sellerData.active,
        suspended: sellerData.suspended,
      },
    );

  if (
    userAccountStatus !== "active" ||
    sellerAccountStatus !== "active"
  ) {
    return false;
  }

  const access =
    getEffectiveSellerAccess(seller);

  if (access.status !== "active") {
    return false;
  }

  if (access.mode === "lifetime") {
    return true;
  }

  const periodEnd =
    firestoreDateToDate(
      access.currentPeriodEnd,
    );

  return Boolean(
    periodEnd &&
    periodEnd.getTime() > Date.now(),
  );
}

function finitePositiveInteger(
  value: unknown,
): number | null {
  return Number.isInteger(value) &&
    Number(value) >= 0
    ? Number(value)
    : null;
}

export function effectivePlanLimits(
  seller: DocumentData | null | undefined,
): PlanLimits {
  const data = asRecord(seller);
  const access =
    getEffectiveSellerAccess(seller);
  const defaults =
    getPlanLimits(access.planId);
  const override =
    asRecord(data.limitsOverride);

  return {
    maxEvents:
      finitePositiveInteger(
        override.maxEvents,
      ) ?? defaults.maxEvents,
    maxProducts:
      finitePositiveInteger(
        override.maxProducts,
      ) ?? defaults.maxProducts,
  };
}

export function addBillingPeriod(
  interval: BillingInterval,
  from: Date = new Date(),
): Date {
  const source = new Date(from);
  const day = source.getUTCDate();
  const targetYear =
    source.getUTCFullYear() +
    (interval === "annual" ? 1 : 0);
  const targetMonth =
    source.getUTCMonth() +
    (interval === "monthly" ? 1 : 0);

  // Começa no primeiro dia para evitar que 31/01 salte para março.
  const result = new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      1,
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  );

  const lastDay = new Date(
    Date.UTC(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  result.setUTCDate(
    Math.min(day, lastDay),
  );

  return result;
}

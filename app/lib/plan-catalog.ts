import type {
  OperatingCountry,
  SupportedCurrency,
} from "@/app/types/regional";

export const PLAN_IDS = [
  "starter",
  "pro",
  "business",
] as const;

export type PlanId =
  (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = [
  "monthly",
  "annual",
] as const;

export type BillingInterval =
  (typeof BILLING_INTERVALS)[number];

export type PlanLimits = {
  maxEvents: number;
  maxProducts: number;
};

export type RegionalPlanPrice = {
  country: OperatingCountry;
  currency: SupportedCurrency;
  amountMinor: number;
  billingInterval: BillingInterval;
};

type RegionalPriceTable = Record<
  OperatingCountry,
  {
    country: OperatingCountry;
    currency: SupportedCurrency;
    monthlyAmountMinor: number;
    annualAmountMinor: number;
  }
>;

export type PlanDefinition = {
  id: PlanId;
  limits: PlanLimits;
  prices: RegionalPriceTable;
};

function price(
  country: OperatingCountry,
  currency: SupportedCurrency,
  monthlyAmountMinor: number,
) {
  return {
    country,
    currency,
    monthlyAmountMinor,
    // Dois meses gratuitos: 12 meses pelo valor de 10.
    annualAmountMinor:
      monthlyAmountMinor * 10,
  };
}

export const PLAN_CATALOG: Record<
  PlanId,
  PlanDefinition
> = {
  starter: {
    id: "starter",
    limits: {
      maxEvents: 1,
      maxProducts: 20,
    },
    prices: {
      JP: price("JP", "JPY", 2980),
      BR: price("BR", "BRL", 6900),
      US: price("US", "USD", 1900),
    },
  },

  pro: {
    id: "pro",
    limits: {
      maxEvents: 3,
      maxProducts: 60,
    },
    prices: {
      JP: price("JP", "JPY", 5980),
      BR: price("BR", "BRL", 13900),
      US: price("US", "USD", 3900),
    },
  },

  business: {
    id: "business",
    limits: {
      maxEvents: 10,
      maxProducts: 200,
    },
    prices: {
      JP: price("JP", "JPY", 9980),
      BR: price("BR", "BRL", 22900),
      US: price("US", "USD", 6900),
    },
  },
};

export function getPlanDefinition(
  planId: PlanId,
): PlanDefinition {
  return PLAN_CATALOG[planId];
}

export function getPlanLimits(
  planId: PlanId,
): PlanLimits {
  return getPlanDefinition(planId).limits;
}

export function getPlanPrice(
  planId: PlanId,
  country: OperatingCountry,
  billingInterval: BillingInterval = "monthly",
): RegionalPlanPrice {
  const regional =
    getPlanDefinition(planId).prices[country];

  return {
    country,
    currency: regional.currency,
    amountMinor:
      billingInterval === "annual"
        ? regional.annualAmountMinor
        : regional.monthlyAmountMinor,
    billingInterval,
  };
}

export function normalizePlanId(
  value: unknown,
): PlanId {
  return value === "pro" ||
    value === "business"
    ? value
    : "starter";
}

export function normalizeBillingInterval(
  value: unknown,
): BillingInterval {
  return value === "annual"
    ? "annual"
    : "monthly";
}

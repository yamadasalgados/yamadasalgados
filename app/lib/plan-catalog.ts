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

export type PlanLimits = {
  maxEvents: number;
  maxProducts: number;
};

export type RegionalPlanPrice = {
  country: OperatingCountry;
  currency: SupportedCurrency;
  amountMinor: number;
};

export type PlanDefinition = {
  id: PlanId;
  limits: PlanLimits;
  prices: Record<
    OperatingCountry,
    RegionalPlanPrice
  >;
};

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
      JP: {
        country: "JP",
        currency: "JPY",
        amountMinor: 2980,
      },
      BR: {
        country: "BR",
        currency: "BRL",
        amountMinor: 6900,
      },
      US: {
        country: "US",
        currency: "USD",
        amountMinor: 1900,
      },
    },
  },

  pro: {
    id: "pro",
    limits: {
      maxEvents: 3,
      maxProducts: 60,
    },
    prices: {
      JP: {
        country: "JP",
        currency: "JPY",
        amountMinor: 5980,
      },
      BR: {
        country: "BR",
        currency: "BRL",
        amountMinor: 13900,
      },
      US: {
        country: "US",
        currency: "USD",
        amountMinor: 3900,
      },
    },
  },

  business: {
    id: "business",
    limits: {
      maxEvents: 10,
      maxProducts: 200,
    },
    prices: {
      JP: {
        country: "JP",
        currency: "JPY",
        amountMinor: 9980,
      },
      BR: {
        country: "BR",
        currency: "BRL",
        amountMinor: 22900,
      },
      US: {
        country: "US",
        currency: "USD",
        amountMinor: 6900,
      },
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
): RegionalPlanPrice {
  return getPlanDefinition(planId)
    .prices[country];
}

export function normalizePlanId(
  value: unknown,
): PlanId {
  return value === "pro" ||
    value === "business"
    ? value
    : "starter";
}

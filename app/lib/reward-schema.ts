import { getMinorUnitDigits } from "@/app/lib/money";
import type { SupportedCurrency } from "@/app/types/regional";

export type RewardRedemptionMode = "none" | "discount" | "product";

export type RewardRedemptionSelection = {
  mode: RewardRedemptionMode;
  points: number;
  productId: string;
};

export type RewardCartLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
};

export type RewardEvaluation = {
  mode: RewardRedemptionMode;
  pointsRedeemed: number;
  discountMinor: number;
  rewardProductId: string;
  rewardProductName: string;
  rewardProductPoints: number;
  maximumDiscountPoints: number;
  pointsToEarn: number;
};

export const EMPTY_REWARD_SELECTION: RewardRedemptionSelection = {
  mode: "none",
  points: 0,
  productId: "",
};

export function rewardMinorFactor(currency: SupportedCurrency): number {
  return 10 ** getMinorUnitDigits(currency);
}

export function rewardPointsToMinor(
  points: number,
  currency: SupportedCurrency,
): number {
  const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  return safePoints * rewardMinorFactor(currency);
}

export function rewardMinorToPointsFloor(
  amountMinor: number,
  currency: SupportedCurrency,
): number {
  const safeMinor = Number.isFinite(amountMinor) ? Math.max(0, Math.floor(amountMinor)) : 0;
  return Math.floor(safeMinor / rewardMinorFactor(currency));
}

export function rewardProductPointCost(
  unitPriceMinor: number,
  currency: SupportedCurrency,
): number {
  const safeMinor = Number.isFinite(unitPriceMinor)
    ? Math.max(0, Math.floor(unitPriceMinor))
    : 0;
  if (safeMinor <= 0) return 0;
  return Math.max(1, Math.ceil(safeMinor / rewardMinorFactor(currency)));
}

export function calculateRewardPointsEarned(
  merchandisePaidMinor: number,
  currency: SupportedCurrency,
): number {
  const safeMinor = Number.isFinite(merchandisePaidMinor)
    ? Math.max(0, Math.floor(merchandisePaidMinor))
    : 0;
  return Math.floor(safeMinor / (rewardMinorFactor(currency) * 100));
}

export function evaluateRewardSelection(params: {
  selection: RewardRedemptionSelection;
  walletBalance: number;
  merchandisePayableMinor: number;
  currency: SupportedCurrency;
  cartLines: RewardCartLine[];
  offerApplied: boolean;
}): RewardEvaluation {
  const {
    selection,
    walletBalance,
    merchandisePayableMinor,
    currency,
    cartLines,
    offerApplied,
  } = params;

  const safeWallet = Number.isFinite(walletBalance)
    ? Math.max(0, Math.floor(walletBalance))
    : 0;
  const safeMerchandise = Number.isFinite(merchandisePayableMinor)
    ? Math.max(0, Math.floor(merchandisePayableMinor))
    : 0;
  const maximumDiscountPoints = Math.min(
    safeWallet,
    rewardMinorToPointsFloor(safeMerchandise, currency),
  );

  let mode: RewardRedemptionMode = selection.mode;
  let pointsRedeemed = 0;
  let discountMinor = 0;
  let rewardProductId = "";
  let rewardProductName = "";
  let rewardProductPoints = 0;

  if (mode === "discount") {
    pointsRedeemed = Math.min(
      maximumDiscountPoints,
      Math.max(0, Math.floor(selection.points || 0)),
    );
    discountMinor = Math.min(
      safeMerchandise,
      rewardPointsToMinor(pointsRedeemed, currency),
    );
    if (pointsRedeemed <= 0 || discountMinor <= 0) mode = "none";
  } else if (mode === "product") {
    if (offerApplied) {
      mode = "none";
    } else {
      const line = cartLines.find(
        (item) => item.productId === selection.productId && item.quantity > 0,
      );
      const pointCost = line
        ? rewardProductPointCost(line.unitPriceMinor, currency)
        : 0;

      if (
        line &&
        pointCost > 0 &&
        pointCost <= safeWallet &&
        line.unitPriceMinor <= safeMerchandise
      ) {
        pointsRedeemed = pointCost;
        discountMinor = line.unitPriceMinor;
        rewardProductId = line.productId;
        rewardProductName = line.name;
        rewardProductPoints = pointCost;
      } else {
        mode = "none";
      }
    }
  } else {
    mode = "none";
  }

  const merchandisePaidMinor = Math.max(0, safeMerchandise - discountMinor);

  return {
    mode,
    pointsRedeemed,
    discountMinor,
    rewardProductId,
    rewardProductName,
    rewardProductPoints,
    maximumDiscountPoints,
    pointsToEarn: calculateRewardPointsEarned(merchandisePaidMinor, currency),
  };
}

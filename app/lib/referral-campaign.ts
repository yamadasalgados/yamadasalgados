/** Campanha de indicação 2026 — relógio único no servidor (JST). */
export const REFERRAL_CAMPAIGN = {
  id: "indique-2026",
  startsAtMs: Date.parse("2026-10-27T00:00:00+09:00"),
  endsAtMs: Date.parse("2027-01-01T00:00:00+09:00"), // fim EXCLUSIVO: inclui 31/12
  pointsPerPerson: 100,
  maxJoinAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export function referralCampaignActive(atMs: number): boolean {
  return atMs >= REFERRAL_CAMPAIGN.startsAtMs && atMs < REFERRAL_CAMPAIGN.endsAtMs;
}

export function validReferralSellerId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return id.length > 0 && id.length <= 160 && !id.includes("/") ? id : "";
}

export function validReferralCode(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{20,48}$/.test(value)
    ? value
    : "";
}

/** Seller can stop new invitations early; existing valid enrollments keep the original deadline. */
export const REFERRAL_DEFAULT_MAX_INVITES = 10;
export const REFERRAL_MAX_INVITES_HARD_LIMIT = 1000;

export type SellerReferralSettings = {
  enabled: boolean;
  registrationEndsAtMs: number;
  maxRewardsPerInviter: number;
};

export function sellerReferralSettings(raw: Record<string, unknown> | undefined): SellerReferralSettings {
  const end = raw?.registrationEndsAtMs;
  const max = raw?.maxRewardsPerInviter;
  return {
    enabled: raw?.campaignId === REFERRAL_CAMPAIGN.id && raw?.enabled === true,
    registrationEndsAtMs: typeof end === "number" && Number.isSafeInteger(end) &&
      end >= REFERRAL_CAMPAIGN.startsAtMs && end <= REFERRAL_CAMPAIGN.endsAtMs
      ? end : REFERRAL_CAMPAIGN.endsAtMs,
    maxRewardsPerInviter: typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= REFERRAL_MAX_INVITES_HARD_LIMIT
      ? max : REFERRAL_DEFAULT_MAX_INVITES,
  };
}

export function sellerReferralAccepting(raw: Record<string, unknown> | undefined, atMs: number): boolean {
  const config = sellerReferralSettings(raw);
  return config.enabled && referralCampaignActive(atMs) && atMs < config.registrationEndsAtMs;
}

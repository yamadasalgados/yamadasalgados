import {
  accessIsActive,
} from "@/app/lib/access-control";
import {
  normalizeSellerOrderSettings,
} from "@/app/lib/order-settings-schema";
import {
  normalizeSellerIdentity,
} from "@/app/lib/seller-identity";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";

export type PublicSellerProfile = {
  schemaVersion: 1;
  sellerId: string;
  storeName: string;
  storeDescription: string;
  logoUrl: string;
  bannerUrl: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  contact: {
    phone: string;
    email: string;
    whatsapp: string;
    instagram: string;
    website: string;
  };
  storefrontLanguage: "pt" | "en" | "ja";
  regional: {
    operatingCountry: "JP" | "BR" | "US" | null;
    currency: "JPY" | "BRL" | "USD" | null;
    locale: "ja-JP" | "pt-BR" | "en-US" | null;
    timeZone: string | null;
  };
  regionId: string;
  regionName: string;
  whatsapp: string;
  messengerId: string;
  pickupLink: string;
  pickupNote: string;
  orderSettings: {
    schemaVersion: 1;
    stockOrderPolicy: "block" | "accept_pending";
    acceptOrdersWithoutStock: boolean;
  };
  available: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export function normalizePublicSellerProfile(
  sellerId: string,
  value: unknown,
): PublicSellerProfile {
  const raw = asRecord(value);
  const identity = normalizeSellerIdentity(raw);
  const regional = normalizeSellerRegionalProfile(raw, {
    fallbackSellerId: sellerId,
  });
  const orderSettings = normalizeSellerOrderSettings(
    raw.orderSettings,
    raw.acceptOrdersWithoutStock,
  );
  const storefrontLanguage =
    raw.storefrontLanguage === "en" || raw.storefrontLanguage === "ja"
      ? raw.storefrontLanguage
      : "pt";

  return {
    schemaVersion: 1,
    sellerId,
    storeName: identity.storeName,
    storeDescription: identity.storeDescription,
    logoUrl: identity.logoUrl,
    bannerUrl: identity.bannerUrl,
    brandPrimaryColor: identity.primaryColor,
    brandAccentColor: identity.accentColor,
    contact: { ...identity.contact },
    storefrontLanguage,
    regional: {
      operatingCountry: regional.operatingCountry,
      currency: regional.currency,
      locale: regional.regionalLocale,
      timeZone: regional.timeZone,
    },
    regionId: cleanText(raw.regionId, 160),
    regionName: cleanText(raw.regionName, 240),
    whatsapp:
      identity.contact.whatsapp ||
      cleanText(raw.whatsapp, 80),
    messengerId: cleanText(raw.messengerId, 240),
    pickupLink: cleanText(raw.pickupLink, 1500),
    pickupNote: cleanText(raw.pickupNote, 1500),
    orderSettings,
    available: accessIsActive(raw),
  };
}
